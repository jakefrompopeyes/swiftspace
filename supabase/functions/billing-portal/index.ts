// Supabase Edge Function: billing-portal
// Creates a Stripe Billing Portal session for a merchant

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.1';
import Stripe from 'npm:stripe@14.25.0';

function cors(headers: Record<string, string> = {}) {
  return { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', ...headers };
}
function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: cors({ 'content-type': 'application/json' }) });
}

const SUPABASE_URL = Deno.env.get('PROJECT_URL') || Deno.env.get('SUPABASE_URL') || '';
const SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') || '';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors() });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });
  if (!STRIPE_SECRET_KEY) return json(500, { error: 'Stripe not configured' });
  try {
    const body = await req.json();
    const merchantId = String(body?.merchant_id || '').trim();
    const returnUrl = String(body?.return_url || '').trim();
    if (!merchantId) return json(400, { error: 'Missing merchant_id' });
    const { data: merchant, error } = await supabase
      .from('merchants')
      .select('stripe_customer_id')
      .eq('id', merchantId)
      .maybeSingle();
    if (error) return json(500, { error: error.message });
    const customerId = (merchant as any)?.stripe_customer_id || '';
    if (!customerId) return json(400, { error: 'Merchant has no Stripe customer' });

    const baseReturn = returnUrl || (SUPABASE_URL ? new URL(SUPABASE_URL).origin : 'https://example.com');
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: baseReturn,
    });
    return json(200, { url: session.url });
  } catch (e) {
    return json(500, { error: e?.message || 'Internal error' });
  }
});



