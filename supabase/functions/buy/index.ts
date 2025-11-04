// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.1';

const DEFAULT_NETWORK: Record<string, string> = {
  SOL: 'solana',
  USDC: 'solana',
  USDT: 'solana',
};

const SYMBOL_TO_COINGECKO_ID: Record<string, string> = {
  SOL: 'solana',
  USDC: 'usd-coin',
  USDT: 'tether',
};

const SYMBOL_DECIMALS: Record<string, number> = {
  SOL: 6,
  USDC: 6,
  USDT: 6,
};

function badRequest(msg: string): Response {
  return new Response(JSON.stringify({ error: msg }), {
    status: 400,
    headers: { 'content-type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const m = (url.searchParams.get('m') || '').trim(); // merchant user id
    const a = parseFloat(url.searchParams.get('a') || ''); // amount (crypto units or USD if usd=1)
    const c = (url.searchParams.get('c') || '').trim().toUpperCase(); // currency
    const r = (url.searchParams.get('r') || '').trim(); // reference
    const u = (url.searchParams.get('u') || '').trim(); // optional app base URL for redirect
    const aIsUsd = url.searchParams.has('usd');

    if (!m) return badRequest('Missing merchant id (m)');
    if (!a || isNaN(a) || a <= 0) return badRequest('Invalid amount (a)');
    if (!c) return badRequest('Missing currency (c)');
    if (!['SOL', 'USDC', 'USDT'].includes(c)) return badRequest('Unsupported currency');

    // Support both our preferred secret names and Supabase's default ones
    const projectUrl = (Deno.env.get('PROJECT_URL') || Deno.env.get('SUPABASE_URL')) as string;
    const serviceKey = (Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) as string;
    if (!projectUrl || !serviceKey) {
      return new Response('Missing PROJECT_URL or SERVICE_ROLE_KEY', { status: 500 });
    }

    const supabase = createClient(projectUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    // Subscription entitlement gating (optional via feature flag)
    async function assertMerchantEntitled(merchantId: string): Promise<Response | null> {
      try {
        const enabled = (Deno.env.get('SUBSCRIPTIONS_ENABLED') || '').trim() === '1';
        if (!enabled) return null;
        if (!merchantId) return null;

        // Fetch merchant subscription state
        const { data: merchant, error: merr } = await supabase
          .from('merchants')
          .select('id, plan_tier, trial_ends_at')
          .eq('id', merchantId)
          .maybeSingle();
        if (merr) return new Response(merr.message, { status: 500 });
        const now = new Date();
        if (!merchant) {
          // No record; allow (treated as trial) to avoid blocking onboarding
          return null;
        }
        const tier = String((merchant as any).plan_tier || 'trial');
        const trialEnds = (merchant as any).trial_ends_at ? new Date(String((merchant as any).trial_ends_at)) : null;
        if (trialEnds && trialEnds > now) return null;
        if (tier === 'pro_100') return null;
        if (tier === 'canceled' || tier === 'past_due') {
          return new Response(JSON.stringify({
            error: 'Subscription inactive. Please renew to continue creating invoices.',
            code: 'entitlement_blocked',
          }), { status: 402, headers: { 'content-type': 'application/json' } });
        }

        if (tier === 'basic_50' || tier === 'trial') {
          // Check current calendar month GMV
          const firstOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
          const yyyy = firstOfMonth.getUTCFullYear();
          const mm = String(firstOfMonth.getUTCMonth() + 1).padStart(2, '0');
          const dd = String(firstOfMonth.getUTCDate()).padStart(2, '0');
          const monthStr = `${yyyy}-${mm}-${dd}`; // ISO date
          const { data: usage, error: uerr } = await supabase
            .from('merchant_usage_monthly')
            .select('gmv_cents')
            .eq('merchant_id', merchantId)
            .eq('month', monthStr)
            .maybeSingle();
          if (uerr) return new Response(uerr.message, { status: 500 });
          const gmvCents = Number((usage as any)?.gmv_cents || 0);
          if (gmvCents >= 1_000_000) {
            // Over threshold for Basic; require upgrade to Pro
            const supabaseUrl = Deno.env.get('PROJECT_URL') || Deno.env.get('SUPABASE_URL') || '';
            const projectRef = supabaseUrl ? new URL(supabaseUrl).host.split('.')[0] : '';
            const portalUrl = projectRef ? `https://${projectRef}.functions.supabase.co/billing-portal` : '';
            return new Response(JSON.stringify({
              error: 'Monthly GMV reached $10,000. Upgrade to Pro to continue.',
              code: 'upgrade_required',
              upgrade_url: portalUrl || undefined,
            }), { status: 402, headers: { 'content-type': 'application/json' } });
          }
        }
        return null;
      } catch (e) {
        return new Response(`Entitlement check failed: ${e?.message || e}`, { status: 500 });
      }
    }

    const entitlement = await assertMerchantEntitled(m);
    if (entitlement) {
      if (entitlement.status === 402 && u) {
        const base = u.endsWith('/') ? u.slice(0, -1) : u;
        const dest = `${base}/?billing=upgrade_required`;
        return new Response(null, { status: 302, headers: { Location: dest } });
      }
      return entitlement;
    }

    // Find merchant wallet for requested currency
    const { data: wallets, error: werr } = await supabase
      .from('wallets')
      .select('address')
      .eq('user_id', m)
      .eq('currency', c)
      .limit(1);
    if (werr) return new Response(werr.message, { status: 500 });
    if (!wallets || wallets.length === 0) return badRequest('Merchant has no wallet for currency');

    const toAddress = String(wallets[0].address);

    // If client passes USD, convert to crypto using CoinGecko
    let amountCrypto = a;
    if (aIsUsd) {
      const id = SYMBOL_TO_COINGECKO_ID[c];
      if (!id) return badRequest('Unsupported currency for USD conversion');
      try {
        const priceRes = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=usd`);
        const priceJson = await priceRes.json();
        const usdPrice = Number(priceJson?.[id]?.usd);
        if (!usdPrice || !isFinite(usdPrice)) return new Response('Failed to fetch price', { status: 502 });
        amountCrypto = a / usdPrice;
        const dec = SYMBOL_DECIMALS[c] ?? 6;
        amountCrypto = parseFloat(amountCrypto.toFixed(dec));
      } catch (e) {
        return new Response(`Price fetch failed: ${e}`, { status: 502 });
      }
    }

    // Create invoice (amount is the exact crypto amount without platform fee)
    const payload: any = {
      user_id: m,
      amount: amountCrypto,
      currency: c,
      to_address: toAddress,
      reference: r || null,
      status: 'pending',
      network: DEFAULT_NETWORK[c] || null,
    };

    const { data: inserted, error: ierr } = await supabase
      .from('invoices')
      .insert(payload)
      .select('public_token')
      .single();
    if (ierr) return new Response(ierr.message, { status: 500 });

    const token = inserted?.public_token;
    if (!token) return new Response('No public token created', { status: 500 });

    // Prefer redirecting to provided app base URL (e.g., http://localhost:5173 or https://yourapp.com)
    if (u) {
      const base = u.endsWith('/') ? u.slice(0, -1) : u;
      const extra = aIsUsd ? `&usd=1&v=${encodeURIComponent(String(a))}` : '';
      const dest = `${base}/?t=${token}${extra}`;
      return new Response(null, {
        status: 302,
        headers: { Location: dest },
      });
    }

    // Fallback: return JSON with token so callers can redirect manually
    return new Response(JSON.stringify({ public_token: token }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (e) {
    return new Response(`Internal error: ${e?.message || e}`, { status: 500 });
  }
});
