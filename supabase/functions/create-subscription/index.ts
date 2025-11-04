// Supabase Edge Function: create-subscription
// Starts a Stripe subscription for a merchant, defaulting to Basic ($50) with 30-day trial

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
const PRICE_BASIC_50 = Deno.env.get('PRICE_BASIC_50') || '';
const PRICE_PRO_100 = Deno.env.get('PRICE_PRO_100') || '';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });

Deno.cron?.('noop', '* * * * *', () => {}); // keep deno deploy quiet about unused Deno

async function resolveMonthlyPriceId(input: string, fallbackOther?: string): Promise<string> {
  if (!input && fallbackOther) input = fallbackOther;
  if (!input) throw new Error('Missing price/product id');
  if (input.startsWith('price_')) return input;
  if (input.startsWith('prod_')) {
    const list = await stripe.prices.list({
      product: input,
      active: true,
      limit: 20,
    });
    const monthly = list.data.find((p) => p.recurring && p.recurring.interval === 'month');
    if (!monthly) throw new Error('No monthly price found for product');
    return monthly.id;
  }
  // assume it's a price id
  return input;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors() });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });
  if (!STRIPE_SECRET_KEY || !PRICE_BASIC_50) return json(500, { error: 'Stripe not configured' });
  try {
    const body = await req.json();
    const merchantId = String(body?.merchant_id || '').trim();
    const plan = String(body?.plan || 'basic').trim(); // 'basic' | 'pro'
    const email = String(body?.email || '').trim();
    if (!merchantId) return json(400, { error: 'Missing merchant_id' });

    // Ensure merchant row exists
    await supabase.from('merchants').upsert({ id: merchantId }, { onConflict: 'id' });

    // Check if customer already exists
    const { data: merchant } = await supabase
      .from('merchants')
      .select('stripe_customer_id, stripe_subscription_id')
      .eq('id', merchantId)
      .maybeSingle();

    let customerId = (merchant as any)?.stripe_customer_id || '';
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: email || undefined,
        metadata: { merchant_id: merchantId },
      });
      customerId = customer.id;
    }

    const priceIdRaw = plan === 'pro' ? (PRICE_PRO_100 || PRICE_BASIC_50) : PRICE_BASIC_50;
    const priceId = await resolveMonthlyPriceId(priceIdRaw, PRICE_BASIC_50);
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      trial_period_days: 30,
      payment_behavior: 'default_incomplete',
      expand: ['latest_invoice.payment_intent'],
      metadata: { merchant_id: merchantId },
    });

    await supabase.from('merchants').upsert({
      id: merchantId,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      plan_tier: 'trial',
      trial_ends_at: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
      current_period_start: subscription.current_period_start ? new Date(subscription.current_period_start * 1000).toISOString() : null,
      current_period_end: subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null,
    }, { onConflict: 'id' });

    return json(200, {
      subscription_id: subscription.id,
      client_secret: (subscription.latest_invoice as any)?.payment_intent?.client_secret || null,
      status: subscription.status,
    });
  } catch (e) {
    return json(500, { error: e?.message || 'Internal error' });
  }
});


