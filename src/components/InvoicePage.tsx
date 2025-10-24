import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { VersionedTransaction } from '@solana/web3.js';
import { Button } from './ui/button';
import { getUsdPrice, getUsdPrices, getCoinLogos } from '../lib/prices';
import { supabase } from '../lib/supabaseClient';
import { Toaster, toast } from 'sonner';

type InvoiceDto = {
  id: string;
  user_id?: string;
  amount: number;
  currency: string;
  to_address: string;
  status: 'pending' | 'paid' | 'confirmed' | string;
  network: string | null;
  reference: string | null;
  created_at: string;
  expires_at: string | null;
  detected_tx_hash: string | null;
  public_token: string;
};

async function fetchInvoice(token: string): Promise<{ invoice: InvoiceDto | null, siblings: Array<{ currency: string; public_token: string }> }> {
  // Call the Edge Function directly via GET to avoid method mismatch
  const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL as string;
  const projectRef = new URL(supabaseUrl).host.split('.')[0];
  const url = `https://${projectRef}.functions.supabase.co/invoice-public?t=${encodeURIComponent(token)}`;
  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) return { invoice: null, siblings: [] };
  const json = await res.json();
  return { invoice: (json?.invoice ?? null) as InvoiceDto | null, siblings: (json?.siblings ?? []) as Array<{ currency: string; public_token: string }> };
}

function explorerUrl(network: string | null, txHash: string | null) {
  if (!network || !txHash) return '';
  const n = network.toLowerCase();
  if (n === 'ethereum') return `https://etherscan.io/tx/${txHash}`;
  if (n === 'polygon') return `https://polygonscan.com/tx/${txHash}`;
  if (n === 'bsc') return `https://bscscan.com/tx/${txHash}`;
  return '';
}

function buildSolanaTxRequestLink(invoice: InvoiceDto): string | null {
  // Per Solana Pay spec: Transaction Request is a solana:https URL pointing to an HTTPS endpoint
  const n = (invoice.network || '').toLowerCase();
  if (n !== 'solana') return null;
  const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL as string;
  let projectRef = '';
  try { projectRef = new URL(supabaseUrl).host.split('.')[0]; } catch {}
  if (!projectRef) return null;
  const httpsUrl = `https://${projectRef}.functions.supabase.co/solana-pay?t=${encodeURIComponent(invoice.public_token)}`;
  return `solana:${httpsUrl}`;
}

// Circular Timer Component
function CircularTimer({ seconds, totalSeconds }: { seconds: number; totalSeconds: number }) {
  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  const strokeDasharray = circumference;
  const strokeDashoffset = circumference - (seconds / totalSeconds) * circumference;

  return (
    <div className="relative w-12 h-12">
      <svg className="w-12 h-12 transform -rotate-90" viewBox="0 0 44 44">
        {/* Background circle */}
        <circle
          cx="22"
          cy="22"
          r={radius}
          stroke="#e5e7eb"
          strokeWidth="3"
          fill="none"
        />
        {/* Progress circle */}
        <circle
          cx="22"
          cy="22"
          r={radius}
          stroke="#b1ff0a"
          strokeWidth="3"
          fill="none"
          strokeDasharray={strokeDasharray}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className="transition-all duration-1000 ease-linear"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xs font-medium text-gray-600">{seconds}</span>
      </div>
    </div>
  );
}

export function InvoicePage() {
  const [token, setToken] = useState<string>('');
  const [invoice, setInvoice] = useState<InvoiceDto | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usdApprox, setUsdApprox] = useState<number | null>(null);
  const [refreshTimer, setRefreshTimer] = useState(5);
  const [siblingInvoices, setSiblingInvoices] = useState<Array<{ currency: string; public_token: string }>>([]);
  const [siblingUsd, setSiblingUsd] = useState<Record<string, number>>({});
  const [siblingLogos, setSiblingLogos] = useState<Record<string, string>>({});
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    const t = (url.searchParams.get('t') || '').trim();
    const usdFlag = url.searchParams.get('usd');
    const usdValueParam = url.searchParams.get('v');
    const usdValueTotal = url.searchParams.get('vt');
    setToken(t);
    if (usdFlag === '1' && usdValueParam) {
      const v = parseFloat(usdValueParam);
      if (!isNaN(v)) setUsdApprox(v);
    }
    if (usdFlag === '1' && usdValueTotal) {
      const vt = parseFloat(usdValueTotal);
      if (!isNaN(vt)) setUsdApprox(vt);
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    let mounted = true;
    let stop = false;

    async function initialLoad() {
      setLoading(true);
      const { invoice: inv, siblings } = await fetchInvoice(token);
      if (!mounted) return;
      if (!inv) {
        setError('Invoice not found');
        setLoading(false);
        return;
      }
      setInvoice(inv);
      setSiblingInvoices(siblings);
      setLoading(false);
      if (inv.status === 'confirmed' || (inv.expires_at && new Date(inv.expires_at) < new Date())) {
        stop = true;
      }
    }

    async function poll() {
      if (stop) return;
      const { invoice: inv, siblings } = await fetchInvoice(token);
      if (!mounted || !inv) return;
      // Only update if something meaningful changed to avoid flicker
      setInvoice((prev) => {
        if (!prev) return inv;
        const changed =
          prev.status !== inv.status ||
          prev.detected_tx_hash !== inv.detected_tx_hash ||
          prev.expires_at !== inv.expires_at;
        return changed ? inv : prev;
      });
      setSiblingInvoices(siblings);
      if (inv.status === 'confirmed' || (inv.expires_at && new Date(inv.expires_at) < new Date())) {
        stop = true;
      }
    }

    initialLoad();
    const id = setInterval(poll, 5000);

    // Realtime channel: listen for invoice row updates by public_token
    const channel = supabase
      .channel('invoice-public-rt')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'invoices',
          filter: `public_token=eq.${token}`,
        },
        (payload: any) => {
          const newRow: any = payload.new || (payload as any).record;
          if (!newRow) return;
          setInvoice((prev) => ({ ...(prev || {} as any), ...(newRow as any) } as any));
          if (newRow.status === 'confirmed') stop = true;
        },
      )
      .subscribe();

    return () => {
      mounted = false;
      clearInterval(id);
      supabase.removeChannel(channel);
    };
  }, [token]);

  // Timer effect for refresh countdown
  useEffect(() => {
    if (invoice?.status === 'confirmed') return; // Stop timer when confirmed
    
    const timer = setInterval(() => {
      setRefreshTimer((prev) => {
        if (prev <= 1) {
          return 5; // Reset to 5 seconds
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [invoice?.status]);

  const qrText = useMemo(() => {
    if (!invoice) return '';
    // Prefer Solana Transaction Request QR for Solana invoices
    if ((invoice.network || '').toLowerCase() === 'solana') {
      const link = buildSolanaTxRequestLink(invoice);
      if (link) return link;
    }
    const eip = eip681(invoice);
    return eip ?? invoice.to_address;
  }, [invoice]);

  const solanaLink = useMemo(() => {
    if (!invoice) return '';
    if ((invoice.network || '').toLowerCase() !== 'solana') return '';
    return buildSolanaTxRequestLink(invoice) || '';
  }, [invoice]);
  const solanaHttps = useMemo(() => {
    if (!solanaLink) return '';
    return solanaLink.replace(/^solana:/, '');
  }, [solanaLink]);

  useEffect(() => {
    if (!qrText) return;
    QRCode.toDataURL(qrText, { width: 256, margin: 1 }).then(setQrDataUrl).catch(() => {});
  }, [qrText]);

  // Fetch USD conversion (approx) using cached CoinGecko utility
  useEffect(() => {
    async function fetchUsd() {
      if (!invoice) return;
      const symbol = (invoice.currency || '').toUpperCase();
      const price = await getUsdPrice(symbol);
      if (price != null) setUsdApprox(Number(invoice.amount) * price);
      else setUsdApprox(null);
    }
    fetchUsd();
  }, [invoice?.currency, invoice?.amount]);

  // Load USD prices and logos for sibling currencies
  useEffect(() => {
    const symbols = Array.from(new Set(siblingInvoices.map((s) => String(s.currency || '').toUpperCase()).filter((v) => !!v))) as string[];
    if (symbols.length === 0) {
      setSiblingUsd({});
      setSiblingLogos({});
      return;
    }
    let mounted = true;
    (async () => {
      try {
        const [prices, logos] = await Promise.all([getUsdPrices(symbols as string[]), getCoinLogos(symbols as string[])]);
        if (!mounted) return;
        setSiblingUsd(prices || {});
        setSiblingLogos(logos || {});
      } catch {}
    })();
    return () => {
      mounted = false;
    };
  }, [siblingInvoices.map((s) => s.currency).join(','), invoice?.amount]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#1a1a1a] flex items-center justify-center px-6">
        <div className="text-white">Loading invoice…</div>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="min-h-screen bg-[#1a1a1a] flex items-center justify-center px-6">
        <div className="text-white">{error || 'Invoice not found'}</div>
      </div>
    );
  }

  const explorer = explorerUrl(invoice.network, invoice.detected_tx_hash);

  return (
    <div className="min-h-screen bg-[#1a1a1a] flex items-center justify-center px-6">
      <div className="w-full max-w-md bg-[#f5f5f5] rounded-3xl p-8">
        <Toaster richColors position="top-center" />
        <div className="mb-6">
          <div className="text-sm text-gray-600">Invoice</div>
          {usdApprox != null ? (
            <>
              <div className="text-2xl">${usdApprox.toFixed(2)} USD</div>
              <div className="text-sm text-gray-600">≈ {invoice.amount} {invoice.currency}</div>
            </>
          ) : (
            <>
              <div className="text-2xl">{invoice.amount} {invoice.currency}</div>
              <div className="text-sm text-gray-600">≈ ${usdApprox != null ? Number(usdApprox).toFixed(2) : '—'} USD</div>
            </>
          )}
          <div className="text-sm text-gray-600">{invoice.network || 'network'}</div>
          {(invoice.network || '').toLowerCase() === 'solana' && (
            <div className="text-xs text-gray-500 mt-1">Merchant 99% • Platform 1%</div>
          )}
        </div>

        <div className="flex items-start gap-6">
          <div className="w-64 h-64 bg-white rounded-2xl flex items-center justify-center overflow-hidden">
            {qrDataUrl ? <img src={qrDataUrl} alt="QR" className="w-64 h-64" /> : <div className="text-gray-500">QR</div>}
          </div>
          <div className="flex-1 space-y-3">
            <div>
              <div className="text-xs text-gray-600">Pay to</div>
              <div className="text-sm break-all">{invoice.to_address}</div>
              <div className="flex gap-2 mt-2">
                <Button className="bg-black text-white hover:bg-gray-800" onClick={() => navigator.clipboard.writeText(invoice.to_address)}>Copy address</Button>
                <Button className="bg-black text-white hover:bg-gray-800" onClick={() => navigator.clipboard.writeText(String(invoice.amount))}>Copy amount</Button>
              </div>
            </div>
            <div className="text-xs text-gray-600">Tip: scan with your wallet's built‑in scanner for best results.</div>
            {/* Wallet integration quick-links */}
            <div className="pt-2 border-t border-gray-200">
              <div className="text-xs text-gray-600 mb-2">Pay with wallet</div>
              <div className="flex flex-wrap gap-2">
                {/* Solana Pay Transaction Request */}
                {((invoice.network || '').toLowerCase() === 'solana' && solanaLink) && (
                  <button
                    className={`px-3 py-1 rounded-full text-sm text-black hover:opacity-90 ${paying ? 'bg-[#9beac9] cursor-not-allowed' : 'bg-[#14F195]'}`}
                    disabled={paying}
                    onClick={async () => {
                      if (paying) return;
                      setPaying(true);
                      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
                      const provider = (window as any).phantom?.solana || (window as any).solana;
                      const hasPhantom = !!(provider && (provider.isPhantom || provider.isBackpack || provider.isSolflare));

                      // Desktop Phantom extension flow
                      if (!isMobile && hasPhantom && solanaHttps && invoice) {
                        try {
                          toast.loading('Connecting wallet…', { id: 'sol-pay' });
                          await provider.connect();
                          const account = provider.publicKey?.toBase58();
                          if (!account) throw new Error('No account');
                          const url = new URL(solanaHttps);
                          url.searchParams.set('account', account);
                          const res = await fetch(url.toString());
                          if (!res.ok) throw new Error(`Failed to fetch transaction (${res.status})`);
                          const json = await res.json();
                          const b64 = String(json?.transaction || '');
                          if (!b64) throw new Error('No transaction');
                          const tx = VersionedTransaction.deserialize(Buffer.from(b64, 'base64'));
                          toast.loading('Awaiting approval…', { id: 'sol-pay' });
                          const sig = await provider.signAndSendTransaction(tx);
                          try {
                            const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL as string;
                            const projectRef = new URL(supabaseUrl).host.split('.')[0];
                            await fetch(`https://${projectRef}.functions.supabase.co/solana-receipt`, {
                              method: 'POST',
                              headers: { 'content-type': 'application/json' },
                              body: JSON.stringify({ t: invoice.public_token, signature: String(sig?.signature || sig) }),
                            });
                          } catch {}
                          toast.success('Transaction sent', { id: 'sol-pay' });
                          return;
                        } catch (e) {
                          console.error('Phantom flow failed, falling back:', e);
                          toast.error(e instanceof Error ? e.message : 'Wallet error', { id: 'sol-pay' });
                        }
                      }

                      // Deeplink first; if not handled, show HTML fallback
                      const deeplink = solanaLink;
                      const httpsUrl = solanaHttps;
                      const htmlView = httpsUrl ? (httpsUrl + (httpsUrl.includes('?') ? '&' : '?') + 'view=1') : '';
                      try {
                        toast.message('Opening wallet…');
                        if (deeplink) window.location.assign(deeplink);
                        setTimeout(() => {
                          if (document.visibilityState === 'visible' && htmlView) {
                            window.location.assign(htmlView);
                          }
                        }, 1000);
                      } catch {}
                      finally {
                        setPaying(false);
                      }
                    }}
                  >
                    {paying ? 'Processing…' : 'Pay with Solana Pay'}
                  </button>
                )}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-600">Status</div>
              <div className="text-sm">
                {invoice.status}
                {explorer && (
                  <a href={explorer} target="_blank" rel="noreferrer" className="ml-3 text-[#225aeb] underline">
                    View tx
                  </a>
                )}
              </div>
            </div>
            {invoice.reference && (
              <div>
                <div className="text-xs text-gray-600">Reference</div>
                <div className="text-sm">{invoice.reference}</div>
              </div>
            )}
            {invoice.expires_at && (
              <div className="text-xs text-gray-600">Expires: {new Date(invoice.expires_at).toLocaleString()}</div>
            )}
            
            {/* Refresh Timer */}
            {invoice.status !== 'confirmed' && (
              <div className="flex items-center gap-2 pt-2 border-t border-gray-200">
                <CircularTimer seconds={refreshTimer} totalSeconds={5} />
                <div className="text-xs text-gray-500">
                  Refreshing in {refreshTimer}s
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Offer alternative currencies if available */}
        {siblingInvoices.length > 1 && (
          <div className="mt-6 p-4 bg-white rounded-2xl border border-gray-200">
            <div className="text-sm font-medium text-gray-900 mb-2">Prefer a different currency?</div>
            <div className="flex flex-wrap gap-2">
              {siblingInvoices
                .filter((s) => s.public_token !== token)
                .map((s) => {
                  const sym = (s.currency || '').toUpperCase();
                  const price = siblingUsd[sym.toLowerCase()] ?? siblingUsd[sym] ?? 0;
                  const usd = price && invoice ? invoice.amount * price : null;
                  const logo = siblingLogos[sym];
                  return (
                    <a
                      key={s.public_token}
                      href={`/?t=${s.public_token}`}
                      className="px-3 py-1 rounded-full text-sm bg-gray-100 hover:bg-gray-200 border border-gray-200 flex items-center gap-2"
                    >
                      {logo ? (
                        <img src={logo} alt={sym} className="w-4 h-4 rounded-full" />
                      ) : (
                        <span className="w-4 h-4 rounded-full bg-gray-300 inline-block" />
                      )}
                      <span>{sym}</span>
                      {usd != null && usd > 0 && (
                        <span className="text-xs text-gray-600">• ≈ ${usd.toFixed(2)}</span>
                      )}
                    </a>
                  );
                })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


