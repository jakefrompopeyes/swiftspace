// Supabase Edge Function: billing-webhook
// Handles Stripe webhooks to keep merchant subscription state in sync

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.1';
import Stripe from 'npm:stripe@14.25.0';

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const SUPABASE_URL = Deno.env.get('PROJECT_URL') || Deno.env.get('SUPABASE_URL') || '';
const SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') || '';
const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') || '';
const PRICE_BASIC_50 = Deno.env.get('PRICE_BASIC_50') || '';
const PRICE_PRO_100 = Deno.env.get('PRICE_PRO_100') || '';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });

function tierMatchesEnv(
  envValue: string,
  priceId?: string | null,
  productId?: string | null,
): boolean {
  if (!envValue) return false;
  if (envValue.startsWith('price_')) return priceId === envValue;
  if (envValue.startsWith('prod_')) return productId === envValue;
  return priceId === envValue || productId === envValue;
}

function priceToTier(priceId?: string | null, productId?: string | null): 'basic_50' | 'pro_100' | null {
  if (tierMatchesEnv(PRICE_PRO_100, priceId, productId)) return 'pro_100';
  if (tierMatchesEnv(PRICE_BASIC_50, priceId, productId)) return 'basic_50';
  return null;
}

async function upsertMerchantState(params: {
  merchantId?: string | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  planTier?: string | null;
  trialEndsAt?: number | null; // epoch seconds
  periodStart?: number | null;
  periodEnd?: number | null;
  status?: string | null;
}) {
  const {
    merchantId,
    stripeCustomerId,
    stripeSubscriptionId,
    planTier,
    trialEndsAt,
    periodStart,
    periodEnd,
    status,
  } = params;

  // Resolve merchantId by stripe customer if needed
  let id = merchantId || null;
  if (!id && stripeCustomerId) {
    const { data } = await supabase
      .from('merchants')
      .select('id')
      .eq('stripe_customer_id', stripeCustomerId)
      .maybeSingle();
    id = (data as any)?.id || null;
  }
  if (!id && stripeCustomerId) {
    // Create a placeholder merchant row if missing
    id = crypto.randomUUID();
  }

  const row: Record<string, any> = {};
  if (id) row.id = id;
  if (stripeCustomerId) row.stripe_customer_id = stripeCustomerId;
  if (stripeSubscriptionId) row.stripe_subscription_id = stripeSubscriptionId;
  if (typeof planTier === 'string') row.plan_tier = planTier;
  if (trialEndsAt != null) row.trial_ends_at = new Date(trialEndsAt * 1000).toISOString();
  if (periodStart != null) row.current_period_start = new Date(periodStart * 1000).toISOString();
  if (periodEnd != null) row.current_period_end = new Date(periodEnd * 1000).toISOString();
  if (!row.id) return;

  await supabase.from('merchants').upsert(row, { onConflict: 'id' });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });
  if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) return json(500, { error: 'Stripe not configured' });
  let event: Stripe.Event;
  try {
    const payload = await req.text();
    const sig = req.headers.get('stripe-signature') || '';
    event = await stripe.webhooks.constructEventAsync(payload, sig, STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    return json(400, { error: 'Invalid signature', detail: e?.message || String(e) });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const customerId = String(session.customer || '');
        const subscriptionId = String(session.subscription || '');
        const merchantId = (session.metadata as any)?.merchant_id || null;
        await upsertMerchantState({
          merchantId,
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
        });
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = String(sub.customer || '');
        const subscriptionId = String(sub.id);
        const status = String(sub.status || '');
        const item = sub.items?.data?.[0];
        const priceId = item?.price?.id || null;
        const productId = typeof item?.price?.product === 'string' ? String(item?.price?.product) : (item?.price?.product as any)?.id || null;
        let planTier: string | null = priceToTier(priceId, productId);
        if (status === 'trialing') planTier = planTier || 'basic_50';
        if (status === 'active') planTier = planTier || 'basic_50';
        if (status === 'past_due' || status === 'unpaid') planTier = 'past_due';
        if (status === 'canceled' || status === 'incomplete_expired') planTier = 'canceled';

        await upsertMerchantState({
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
          planTier,
          trialEndsAt: sub.trial_end || null,
          periodStart: sub.current_period_start || null,
          periodEnd: sub.current_period_end || null,
          status,
        });
        break;
      }
      case 'invoice.paid': {
        const inv = event.data.object as Stripe.Invoice;
        const subId = String(inv.subscription || '');
        const customerId = String(inv.customer || '');
        await upsertMerchantState({
          stripeCustomerId: customerId,
          stripeSubscriptionId: subId,
        });
        break;
      }
      case 'invoice.payment_failed': {
        const inv = event.data.object as Stripe.Invoice;
        const subId = String(inv.subscription || '');
        const customerId = String(inv.customer || '');
        await upsertMerchantState({
          stripeCustomerId: customerId,
          stripeSubscriptionId: subId,
          planTier: 'past_due',
        });
        break;
      }
      default:
        break;
    }
  } catch (e) {
    console.error('Webhook handling error', e);
    return json(500, { error: 'Webhook handler failed' });
  }

  return json(200, { received: true });
});


