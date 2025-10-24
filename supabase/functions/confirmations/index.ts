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
    .select('id, detected_tx_hash, confirmations_required, status, network')
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


