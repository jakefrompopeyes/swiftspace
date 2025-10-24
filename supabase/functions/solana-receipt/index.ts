// Supabase Edge Function: solana-receipt
// Purpose: receive a Solana transaction signature from client and mark invoice as 'paid'
// Body: { t: public_token (uuid), signature: string }
// Validates that the signature is a plausible base58 string and updates invoice if pending

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function cors(headers: Record<string, string> = {}) {
  return { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', ...headers };
}
function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: cors({ 'content-type': 'application/json' }) });
}
function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}
function isBase58(v: string) {
  return /^[1-9A-HJ-NP-Za-km-z]{32,100}$/.test(v);
}

const SUPABASE_URL = Deno.env.get('PROJECT_URL') || Deno.env.get('SUPABASE_URL') || '';
const SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors() });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });
  try {
    const body = await req.json();
    const t = String(body?.t || '').trim();
    const signature = String(body?.signature || '').trim();
    if (!isUuid(t)) return json(400, { error: 'Invalid token' });
    if (!isBase58(signature)) return json(400, { error: 'Invalid signature' });

    const { data: inv, error: qerr } = await supabase
      .from('invoices')
      .select('id,status,public_token')
      .eq('public_token', t)
      .maybeSingle();
    if (qerr) return json(500, { error: qerr.message });
    if (!inv) return json(404, { error: 'Invoice not found' });
    if (inv.status !== 'pending') return json(200, { ok: true });

    const { error: uerr } = await supabase
      .from('invoices')
      .update({ status: 'paid', detected_tx_hash: signature })
      .eq('public_token', t);
    if (uerr) return json(500, { error: uerr.message });

    return json(200, { ok: true });
  } catch (e) {
    return json(500, { error: e?.message || 'Internal error' });
  }
});


