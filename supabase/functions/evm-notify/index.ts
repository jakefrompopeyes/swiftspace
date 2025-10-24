// Supabase Edge Function: evm-notify
// Receives provider webhooks (e.g., Alchemy/QuickNode) and marks invoices as paid.
// Set the following secrets in Supabase:
// - PROJECT_URL
// - SERVICE_ROLE_KEY
// - WEBHOOK_SECRET (shared with your provider or use their signature verification)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('PROJECT_URL')!,
  Deno.env.get('SERVICE_ROLE_KEY')!,
);

function jsonResponse(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function normalizeAmount(value: unknown, decimals?: number) {
  if (value == null) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    // If it's an integer-like string and decimals provided, treat as base units (e.g., wei)
    if (/^\d+$/.test(value) && typeof decimals === 'number') {
      return Number(value) / Math.pow(10, decimals);
    }
    const n = Number(value);
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

function extractEvents(body: any): any[] {
  if (Array.isArray(body)) return body;
  return (
    body?.events ||
    body?.activity ||
    body?.transfers ||
    (body ? [body] : [])
  );
}

function extractFields(e: any) {
  const to = (e?.to ?? e?.toAddress ?? e?.to_address ?? '').toString().toLowerCase();
  const txHash = (e?.hash ?? e?.txHash ?? e?.tx_hash ?? '').toString();
  const decimals = Number(e?.decimals ?? e?.tokenDecimals ?? 18);
  const amount = normalizeAmount(e?.value ?? e?.amount ?? e?.tokenValue, decimals);
  const currencyRaw = (e?.asset ?? e?.currency ?? e?.symbol ?? '').toString();
  const contract = (e?.contractAddress ?? e?.contract ?? '').toString();
  const network = (e?.network ?? e?.chain ?? 'ethereum').toString().toLowerCase();
  const currency = currencyRaw ? currencyRaw.toUpperCase() : (contract ? 'USDT' : 'ETH');
  const confirmations = Number(e?.confirmations ?? 0);
  return { to, txHash, amount, currency, network, confirmations };
}

async function processEvent(evt: any) {
  const { to, txHash, amount, currency, network } = extractFields(evt);
  if (!to || !amount || !currency) return;

  // Find the most recent pending/draft invoice matching address+currency+network
  const { data: invoice, error } = await supabase
    .from('invoices')
    .select('id, amount, currency, network, status, to_address')
    .eq('to_address', to)
    .eq('currency', currency)
    .eq('network', network)
    .in('status', ['pending', 'draft'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !invoice) return;

  // Basic match: amount paid >= invoice amount (allow small tolerance)
  const expected = Number(invoice.amount);
  const tolerance = expected * 0.005; // 0.5%
  if (amount + tolerance < expected) return;

  // Insert payment (ignore unique constraint on tx_hash)
  await supabase
    .from('payments')
    .upsert({
      invoice_id: invoice.id,
      chain: network,
      tx_hash: txHash || crypto.randomUUID(),
      amount,
      confirmations: 0,
    }, { onConflict: 'tx_hash' });

  // Mark invoice as paid and store tx hash
  await supabase
    .from('invoices')
    .update({
      status: 'paid',
      detected_tx_hash: txHash || null,
      detected_at: new Date().toISOString(),
    })
    .eq('id', invoice.id);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
  }
  if (req.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed' });

  // Simple shared-secret check (provider header name may differ; adjust as needed)
  const provided = req.headers.get('x-webhook-secret') ?? '';
  const expected = Deno.env.get('WEBHOOK_SECRET') ?? '';
  if (!expected || provided !== expected) return jsonResponse(401, { error: 'Unauthorized' });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON' });
  }

  const events = extractEvents(body);
  for (const e of events) {
    try { await processEvent(e); } catch (_) {}
  }

  return jsonResponse(200, { ok: true, processed: events.length });
});


