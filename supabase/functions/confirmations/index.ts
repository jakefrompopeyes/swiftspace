// Supabase Edge Function: confirmations
// Periodically checks confirmations for 'paid' invoices and marks them 'confirmed'.
// Secrets required:
// - PROJECT_URL
// - SERVICE_ROLE_KEY
// - ALCHEMY_HTTP (or QUICKNODE_HTTP) for EVM JSON-RPC

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('PROJECT_URL')!,
  Deno.env.get('SERVICE_ROLE_KEY')!,
);

const RPC_URL = Deno.env.get('ALCHEMY_HTTP') || Deno.env.get('QUICKNODE_HTTP');
const SOLANA_RPC_URL = Deno.env.get('SOLANA_RPC_URL') || 'https://api.mainnet-beta.solana.com';

async function eth_getTransactionReceipt(hash: string) {
  if (!RPC_URL) throw new Error('Missing RPC URL');
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionReceipt', params: [hash] }),
  });
  const json = await res.json();
  return json.result;
}

async function eth_blockNumber() {
  if (!RPC_URL) throw new Error('Missing RPC URL');
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
  });
  const json = await res.json();
  return parseInt(json.result, 16);
}

Deno.serve(async (_req: Request) => {
  // Find recently paid invoices that still require confirmations
  const { data: invoices, error } = await supabase
    .from('invoices')
    .select('id, user_id, amount, currency, detected_tx_hash, confirmations_required, status, network')
    .eq('status', 'paid')
    .not('detected_tx_hash', 'is', null)
    .limit(50);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  if (!invoices || invoices.length === 0) {
    return new Response(JSON.stringify({ ok: true, checked: 0 }), { status: 200 });
  }

  const tip = RPC_URL ? await eth_blockNumber() : 0;

  for (const inv of invoices) {
    if (inv.network === 'solana') {
      try {
        const res = await fetch(`${SOLANA_RPC_URL}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getSignatureStatuses', params: [[inv.detected_tx_hash], { searchTransactionHistory: true }] }),
        });
        const json = await res.json();
        const status = json?.result?.value?.[0];
        if (status && status.confirmationStatus === 'finalized') {
          await supabase
            .from('invoices')
            .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
            .eq('id', inv.id);
          await recordUsage(inv as any);
        }
      } catch {}
      continue;
    }

    if (inv.network === 'ethereum' || inv.network === 'polygon' || inv.network === 'bsc') {
      if (!RPC_URL) continue;
      const receipt = await eth_getTransactionReceipt(inv.detected_tx_hash as string);
      if (!receipt || !receipt.blockNumber) continue;
      const txBlock = parseInt(receipt.blockNumber, 16);
      const confirmations = Math.max(0, tip - txBlock + 1);

      if (confirmations >= (inv.confirmations_required ?? 1)) {
        await supabase
          .from('invoices')
          .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
          .eq('id', inv.id);
        await supabase
          .from('payments')
          .update({ confirmations })
          .eq('invoice_id', inv.id);
        await recordUsage(inv as any);
      } else {
        await supabase
          .from('payments')
          .update({ confirmations })
          .eq('invoice_id', inv.id);
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, checked: invoices.length }), { status: 200 });
});

// --- Usage tracking helpers ---
type PaidInvoice = {
  id: string;
  user_id: string | null;
  amount: number | string;
  currency: string | null;
};

const SYMBOL_TO_ID: Record<string, string> = {
  SOL: 'solana',
  USDC: 'usd-coin',
  USDT: 'tether',
};

async function getUsdPrice(symbol: string): Promise<number | null> {
  const sym = (symbol || '').toUpperCase();
  if (sym === 'USDC' || sym === 'USDT') return 1;
  const id = SYMBOL_TO_ID[sym];
  if (!id) return null;
  try {
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=usd`);
    const json = await res.json();
    const v = Number(json?.[id]?.usd);
    return isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

async function recordUsage(inv: PaidInvoice) {
  try {
    const merchantId = String(inv.user_id || '');
    if (!merchantId) return;
    const amountCrypto = Number(inv.amount || 0);
    const currency = String(inv.currency || '').toUpperCase();
    if (!amountCrypto || !currency) return;
    const price = await getUsdPrice(currency);
    if (!price) return;
    const usd = amountCrypto * price;
    const usdCents = Math.round(usd * 100);

    // Ensure merchant row exists
    await supabase.from('merchants').upsert({ id: merchantId }, { onConflict: 'id' });

    // Upsert monthly usage
    const now = new Date();
    const firstOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const yyyy = firstOfMonth.getUTCFullYear();
    const mm = String(firstOfMonth.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(firstOfMonth.getUTCDate()).padStart(2, '0');
    const monthStr = `${yyyy}-${mm}-${dd}`;

    // Fetch existing usage
    const { data: usage } = await supabase
      .from('merchant_usage_monthly')
      .select('gmv_cents')
      .eq('merchant_id', merchantId)
      .eq('month', monthStr)
      .maybeSingle();
    const prev = Number((usage as any)?.gmv_cents || 0);
    const next = prev + usdCents;

    await supabase
      .from('merchant_usage_monthly')
      .upsert({ merchant_id: merchantId, month: monthStr as any, gmv_cents: next }, { onConflict: 'merchant_id,month' });

    // Insert ledger row
    await supabase
      .from('payments_ledger')
      .insert({ merchant_id: merchantId, invoice_id: inv.id, currency, amount_crypto: amountCrypto, amount_usd_cents: usdCents });
  } catch (_) {
    // best-effort; ignore failures
  }
}


