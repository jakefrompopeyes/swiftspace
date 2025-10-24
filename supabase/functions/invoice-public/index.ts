// Supabase Edge Function: invoice-public
// Read-only endpoint to fetch an invoice by public token
// Secrets used: PROJECT_URL, SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('PROJECT_URL')!,
  Deno.env.get('SERVICE_ROLE_KEY')!,
);

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
    },
  });
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': '*',
      },
    });
  }
  let token = '';
  if (req.method === 'GET') {
    const url = new URL(req.url);
    token = url.searchParams.get('t') ?? '';
  } else if (req.method === 'POST') {
    try {
      const body: any = await req.json();
      token = (body?.t ?? '').toString();
    } catch (_) {}
  } else {
    return json(405, { error: 'Method not allowed' });
  }
  if (!token || !isUuid(token)) return json(400, { error: 'Invalid token' });

  const { data, error } = await supabase
    .from('invoices')
    .select(
      'id, user_id, amount, currency, to_address, status, network, reference, created_at, expires_at, detected_tx_hash, public_token'
    )
    .eq('public_token', token)
    .maybeSingle();

  if (error) return json(500, { error: error.message });
  if (!data) return json(404, { error: 'Not found' });

  // Also return sibling invoices (other currencies for same invoice intent)
  let siblings: Array<{ currency: string; public_token: string }> = [];
  if (data) {
    let q = supabase
      .from('invoices')
      .select('currency, public_token')
      .eq('user_id', (data as any).user_id)
      .eq('amount', data.amount)
      .in('status', ['pending', 'paid', 'confirmed']);
    if (data.reference == null) q = q.is('reference', null);
    else q = q.eq('reference', data.reference);
    const { data: sibData } = await q.order('created_at', { ascending: false });
    siblings = (sibData || []).map((r: any) => ({ currency: String(r.currency), public_token: String(r.public_token) }));
  }

  return json(200, { invoice: data, siblings });
});


