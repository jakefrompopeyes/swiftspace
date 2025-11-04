// Supabase Edge Function: solana-pay
// Builds a single transaction transferring full amount to the merchant (no platform fee)
//
// Request (Transaction Request per Solana Pay):
//   GET /solana-pay?t=<public_token>&account=<buyer_pubkey>
// Response: { transaction: base64, message?: string }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  Connection,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
  SystemProgram,
} from 'npm:@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getAccount,
  createTransferInstruction,
  getMint,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from 'npm:@solana/spl-token';

type InvoiceRow = {
  id: string;
  user_id: string | null;
  amount: number;
  currency: string;
  to_address: string; // merchant owner pubkey (base58)
  status: string;
  network: string | null;
  reference: string | null;
  public_token: string;
};

function cors(headers: Record<string, string> = {}) {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    ...headers,
  };
}

function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: cors({ 'content-type': 'application/json; charset=utf-8', ...headers }),
  });
}

function html(status: number, bodyHtml: string) {
  const htmlDoc = `<!doctype html><html><head><meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Solana Pay</title>
  <style>body{font-family:ui-sans-serif,system-ui,Arial;margin:24px;color:#111} .card{max-width:720px;margin:0 auto;border:1px solid #e5e7eb;border-radius:12px;padding:20px;background:#fff} .btn{display:inline-block;background:#14F195;color:#111;padding:10px 14px;border-radius:8px;text-decoration:none;font-weight:600;margin-right:8px} .mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-all;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:8px} .muted{color:#6b7280;font-size:12px;margin-top:8px}</style>
  </head><body><div class="card">${bodyHtml}</div></body></html>`;
  return new Response(htmlDoc, { status, headers: cors({ 'content-type': 'text/html; charset=utf-8' }) });
}

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function toMinorUnits(amount: number, decimals: number): bigint {
  const s = String(amount);
  const [i, f = ''] = s.split('.');
  const frac = (f + '0'.repeat(decimals)).slice(0, decimals);
  const big = BigInt((i || '0') + (frac || ''));
  return big;
}

function bigToNumberSafe(v: bigint): number {
  const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
  if (v > maxSafe) throw new Error('Amount too large');
  return Number(v);
}

function b64encode(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  // btoa is available in Deno runtime
  // eslint-disable-next-line no-undef
  return btoa(bin);
}

const SUPABASE_URL = Deno.env.get('PROJECT_URL') || Deno.env.get('SUPABASE_URL') || '';
const SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const SOLANA_RPC_URL = Deno.env.get('SOLANA_RPC_URL') || 'https://api.mainnet-beta.solana.com';
const USDC_MINT = Deno.env.get('USDC_MINT') || '';
const USDT_MINT = Deno.env.get('USDT_MINT') || '';

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.warn('Missing PROJECT_URL/SUPABASE_URL or SERVICE_ROLE_KEY/SUPABASE_SERVICE_ROLE_KEY');
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: cors() });
  }
  if (req.method !== 'GET') return json(405, { error: 'Method not allowed' });

  try {
    const url = new URL(req.url);
    const t = (url.searchParams.get('t') || '').trim(); // public_token
    const buyerParam = (url.searchParams.get('account') || url.searchParams.get('payer') || '').trim();
    const view = url.searchParams.has('view');
    if (!t || !isUuid(t)) return json(400, { error: 'Invalid token' });
  if (!buyerParam) {
      if (view) {
        const params = new URLSearchParams(url.search);
        params.delete('view');
        const httpsUrl = `https://${url.host}${url.pathname}${params.toString() ? `?${params.toString()}` : ''}`;
        const selfLink = `solana:${httpsUrl}`;
        return html(200, `
          <h1>Open in your Solana wallet</h1>
          <p>Tap the button below to launch your wallet app and approve the payment.</p>
          <p><a class="btn" href="${selfLink}">Open in wallet</a></p>
          <div class="muted">If the button does nothing, copy and paste this link into your wallet:</div>
          <div class="mono">${selfLink}</div>
        `);
      }
      return json(400, { error: 'Missing buyer account (account=)' });
    }
    // No platform address needed (no fee transfers)

    const { data: inv, error } = await supabase
      .from('invoices')
      .select('id, user_id, amount, currency, to_address, status, network, reference, public_token')
      .eq('public_token', t)
      .maybeSingle<InvoiceRow>();
    if (error) return json(500, { error: error.message });
    if (!inv) return json(404, { error: 'Invoice not found' });
    if ((inv.network || '').toLowerCase() !== 'solana') return json(400, { error: 'Invoice is not on Solana' });

    const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
    const buyer = new PublicKey(buyerParam);
    const merchantOwner = new PublicKey(inv.to_address);

    const currency = (inv.currency || '').toUpperCase();
    const ix: any[] = [];

    if (currency === 'SOL') {
      // Native SOL: single lamport transfer to merchant
      const totalLamports = toMinorUnits(Number(inv.amount), 9);
      if (totalLamports <= 0n) return json(400, { error: 'Amount too small' });

      ix.push(
        SystemProgram.transfer({ fromPubkey: buyer, toPubkey: merchantOwner, lamports: bigToNumberSafe(totalLamports) }),
      );
    } else if (currency === 'USDC' || currency === 'USDT') {
      const mintStr = currency === 'USDC' ? USDC_MINT : USDT_MINT;
      if (!mintStr) return json(500, { error: `${currency}_MINT is not configured` });
      const mintPk = new PublicKey(mintStr);
      const mintInfo = await getMint(connection, mintPk);
      const decimals = mintInfo.decimals;

      const totalMinor = toMinorUnits(Number(inv.amount), decimals);
      if (totalMinor <= 0n) return json(400, { error: 'Amount too small' });

      const buyerAta = await getAssociatedTokenAddress(mintPk, buyer, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
      const merchantAta = await getAssociatedTokenAddress(mintPk, merchantOwner, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);

      const [merchantAtaInfo] = await Promise.all([
        connection.getAccountInfo(merchantAta),
      ]);
      if (!merchantAtaInfo) {
        ix.push(
          createAssociatedTokenAccountInstruction(
            buyer, // fee payer
            merchantAta,
            merchantOwner,
            mintPk,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID,
          ),
        );
      }

      ix.push(
        createTransferInstruction(
          buyerAta,
          merchantAta,
          buyer,
          bigToNumberSafe(totalMinor),
          [],
          TOKEN_PROGRAM_ID,
        ),
      );
    } else {
      return json(400, { error: 'Unsupported currency on Solana. Use SOL, USDC, or USDT.' });
    }

    const { blockhash } = await connection.getLatestBlockhash('finalized');
    const message = new TransactionMessage({
      payerKey: buyer,
      recentBlockhash: blockhash,
      instructions: ix,
    }).compileToV0Message();
    const tx = new VersionedTransaction(message);

    const b64 = b64encode(tx.serialize());
    return json(200, {
      transaction: b64,
      message: inv.reference ? `Invoice ${inv.reference}` : 'Payment',
    });
  } catch (e) {
    console.error('solana-pay error', e);
    return json(500, { error: 'Internal error' });
  }
});


