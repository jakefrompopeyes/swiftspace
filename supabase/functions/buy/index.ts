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

    // Apply 1% processing fee to the crypto amount
    const dec = SYMBOL_DECIMALS[c] ?? 6;
    let amountWithFee = amountCrypto * 1.01; // +1%
    amountWithFee = parseFloat(amountWithFee.toFixed(dec));

    // Create invoice (amount is the total including fee)
    const payload: any = {
      user_id: m,
      amount: amountWithFee,
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
      const totalUsd = aIsUsd ? a * 1.01 : undefined;
      const extra = aIsUsd
        ? `&usd=1&v=${encodeURIComponent(String(a))}&vt=${encodeURIComponent(String(totalUsd?.toFixed(2)))}`
        : '';
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
