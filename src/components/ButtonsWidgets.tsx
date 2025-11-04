import React, { useEffect, useMemo, useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Copy, ExternalLink, Code, Palette, Zap } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

const SUPPORTED = ['SOL', 'USDC', 'USDT'];

export function ButtonsWidgets() {
  const [userId, setUserId] = useState<string>('');
  const [amount, setAmount] = useState('10');
  const [currency, setCurrency] = useState('SOL');
  const [reference, setReference] = useState('order-1234');
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [configuredSymbols, setConfiguredSymbols] = useState<string[]>([]);
  const [allowedSymbols, setAllowedSymbols] = useState<string[]>(SUPPORTED);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.id) setUserId(data.user.id);
    });
  }, []);

  // Keep single-mode default currency in sync with allowed selection
  useEffect(() => {
    if (allowedSymbols.length === 1) {
      setCurrency(allowedSymbols[0]);
    }
  }, [allowedSymbols]);

  // Load configured wallets to set defaults for allowedSymbols
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) return;
      const { data } = await supabase
        .from('wallets')
        .select('currency,address')
        .eq('user_id', uid);
      const present = (data || [])
        .map((r: any) => String(r.currency || '').toUpperCase())
        .filter((s) => !!s);
      // Restrict to supported set only (SOL/USDC/USDT)
      const filtered = present.filter((s) => SUPPORTED.includes(s));
      if (!cancelled) {
        setConfiguredSymbols(filtered);
        if (filtered.length > 0) setAllowedSymbols(filtered);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const projectRef = useMemo(() => {
    try {
      const url = import.meta.env.VITE_SUPABASE_URL as string;
      return new URL(url).host.split('.')[0];
    } catch {
      return '';
    }
  }, []);

  const functionUrl = useMemo(() => {
    const base = `https://${projectRef}.functions.supabase.co/buy`;
    const appUrl = window.location.origin;
    const params = new URLSearchParams({ m: userId, a: amount, c: currency, r: reference, u: appUrl });
    params.set('usd', '1');
    return `${base}?${params}`;
  }, [userId, amount, currency, reference, projectRef]);

  const snippets = useMemo(() => {
    const base = `https://${projectRef}.functions.supabase.co/buy`;
    const appUrl = window.location.origin;
    const common = `m=${userId}&a=${amount}&r=${reference}&u=${encodeURIComponent(appUrl)}&usd=1`;

    if (allowedSymbols.length <= 1) {
      const c = (allowedSymbols[0] || currency);
      const url = `${base}?${common}&c=${encodeURIComponent(c)}`;
      return {
        mode: 'single' as const,
        anchor: `<a href="${url}" target="_blank" rel="noopener" class="crypto-buy-btn">Buy with Crypto</a>`,
        button: `<button onclick="window.location.href='${url}'" class="crypto-buy-btn">Buy with Crypto</button>`,
        react: `const handleBuy = () => window.open('${url}', '_blank');\n<button onClick={handleBuy} className=\"crypto-buy-btn\">Buy with Crypto</button>`,
        styled: `<a href="${url}" target="_blank" rel="noopener" style="display: inline-block; padding: 12px 24px; background: linear-gradient(135deg, #b1ff0a, #a0ef00); color: #000; text-decoration: none; border-radius: 8px; font-weight: 600; transition: all 0.2s;">Buy with Crypto</a>`
      };
    }

    const opts = allowedSymbols.map((s) => `<option value=\"${s}\">${s}</option>`).join('');
    const dropdown = `<!-- Crypto selector widget -->\n<select id=\"crypto-select\" style=\"padding:8px;border-radius:6px;border:1px solid #ddd\">${opts}</select>\n<button style=\"margin-left:8px;padding:10px 16px;border-radius:8px;background:#b1ff0a;color:#000;font-weight:600;border:none\" onclick=\"(function(){var c=document.getElementById('crypto-select').value; window.location.href='${base}?${common}&c='+encodeURIComponent(c);})()\">Buy with Crypto</button>`;

    const buttons = allowedSymbols.map((s) => `<a href=\"${base}?${common}&c=${encodeURIComponent(s)}\" target=\"_blank\" rel=\"noopener\" style=\"display:inline-block;margin-right:8px;margin-bottom:8px;padding:10px 14px;border-radius:8px;background:#f5f5f5;border:1px solid #e5e7eb;color:#111;font-weight:600\">${s}</a>`).join(' ');

    return {
      mode: 'multi' as const,
      dropdown,
      multiButtons: buttons,
    };
  }, [projectRef, userId, amount, reference, allowedSymbols, currency]);

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedText(label);
      setTimeout(() => setCopiedText(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="min-h-screen bg-[#1a1a1a] p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-[#b1ff0a] rounded-xl flex items-center justify-center">
              <Zap className="w-6 h-6 text-black" />
            </div>
            <h1 className="text-3xl font-bold text-white">Buttons & Widgets</h1>
          </div>
          <p className="text-gray-400 text-lg">Generate embeddable crypto payment buttons for your website</p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Configuration Panel */}
          <div className="space-y-6">
            <div className="bg-[#f5f5f5] rounded-3xl p-8">
              <div className="flex items-center gap-3 mb-6">
                <Palette className="w-6 h-6 text-gray-700" />
                <h2 className="text-xl font-semibold text-gray-900">Configure Button</h2>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">Amount (USD)</label>
                  <Input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="10.00"
                    className="bg-white border-gray-300 focus:border-[#b1ff0a] focus:ring-[#b1ff0a]"
                  />
                </div>
                {/* Unit selector removed; USD-only */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-3">Reference (optional)</label>
                  <Input
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="order-1234"
                    className="bg-white border-gray-300 focus:border-[#b1ff0a] focus:ring-[#b1ff0a]"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-3">Available currencies in checkout</label>
                  <div className="flex flex-wrap gap-2">
                    {(configuredSymbols.length > 0 ? SUPPORTED : SUPPORTED).map((sym) => {
                      const checked = allowedSymbols.includes(sym);
                      const disabled = configuredSymbols.length > 0 && !configuredSymbols.includes(sym);
                      return (
                        <button
                          key={sym}
                          type="button"
                          onClick={() => {
                            if (disabled) return;
                            setAllowedSymbols((prev) => prev.includes(sym) ? prev.filter((s) => s !== sym) : [...prev, sym]);
                          }}
                          className={`px-3 py-1 rounded-full text-sm border ${checked ? 'bg-black text-white border-black' : 'bg-white text-gray-800 border-gray-300'} ${disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-gray-100'}`}
                          title={disabled ? 'No wallet configured for this currency' : ''}
                        >
                          {sym}
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setAllowedSymbols(configuredSymbols.length > 0 ? configuredSymbols : SUPPORTED)}>Select all</Button>
                    <Button size="sm" variant="outline" onClick={() => setAllowedSymbols([])}>Clear</Button>
                  </div>
                </div>
              </div>

              <div className="mt-6 p-4 bg-blue-50 rounded-xl border border-blue-200">
                <div className="flex items-start gap-3">
                  <ExternalLink className="w-5 h-5 text-blue-600 mt-0.5" />
                  <div>
                    <h3 className="font-medium text-blue-900 mb-1">Generated Link</h3>
                    <p className="text-sm text-blue-700 mb-3">This link will create an invoice and redirect customers to the payment page.</p>
                    <div className="bg-white rounded-lg p-3 border border-blue-200">
                      <code className="block text-xs text-gray-800 whitespace-pre-wrap break-words break-all max-w-full">{functionUrl}</code>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Preview */}
            <div className="bg-[#f5f5f5] rounded-3xl p-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-6">Live Preview</h2>
              <div className="space-y-4">
                {allowedSymbols.length <= 1 ? (
                  <>
                    <div className="bg-white rounded-xl p-6 border border-gray-200">
                      <h3 className="font-medium text-gray-900 mb-3">Basic Button</h3>
                      <a
                        href={functionUrl}
                        target="_blank"
                        rel="noopener"
                        className="inline-block px-6 py-3 bg-[#b1ff0a] text-black font-semibold rounded-lg hover:bg-[#a0ef00] transition-colors"
                      >
                        Buy with Crypto
                      </a>
                    </div>
                    <div className="bg-white rounded-xl p-6 border border-gray-200">
                      <h3 className="font-medium text-gray-900 mb-3">Styled Button</h3>
                      <a
                        href={functionUrl}
                        target="_blank"
                        rel="noopener"
                        className="inline-block px-6 py-3 bg-gradient-to-r from-[#b1ff0a] to-[#a0ef00] text-black font-semibold rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105"
                      >
                        Buy with Crypto
                      </a>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="bg-white rounded-xl p-6 border border-gray-200">
                      <h3 className="font-medium text-gray-900 mb-3">Currency Selector Widget</h3>
                      <div dangerouslySetInnerHTML={{ __html: (snippets as any).dropdown }} />
                    </div>
                    <div className="bg-white rounded-xl p-6 border border-gray-200">
                      <h3 className="font-medium text-gray-900 mb-3">Multiple Buttons</h3>
                      <div dangerouslySetInnerHTML={{ __html: (snippets as any).multiButtons }} />
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Code Snippets */}
          <div className="space-y-6">
            <div className="bg-[#f5f5f5] rounded-3xl p-8">
              <div className="flex items-center gap-3 mb-6">
                <Code className="w-6 h-6 text-gray-700" />
                <h2 className="text-xl font-semibold text-gray-900">Code Snippets</h2>
              </div>

              <div className="space-y-6">
                {snippets.mode === 'single' ? (
                  <>
                    {/* HTML Anchor */}
                    <div className="bg-white rounded-xl p-6 border border-gray-200">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-medium text-gray-900">HTML Anchor</h3>
                        <Button size="sm" variant="outline" onClick={() => copyToClipboard((snippets as any).anchor, 'HTML Anchor')} className="text-xs">
                          <Copy className="w-3 h-3 mr-1" />
                          {copiedText === 'HTML Anchor' ? 'Copied!' : 'Copy'}
                        </Button>
                      </div>
                      <pre className="text-xs bg-gray-50 rounded-lg p-3 text-gray-800 overflow-hidden">
                        <code className="block whitespace-pre-wrap break-all overflow-wrap-anywhere">{(snippets as any).anchor}</code>
                      </pre>
                    </div>

                    {/* HTML Button */}
                    <div className="bg-white rounded-xl p-6 border border-gray-200">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-medium text-gray-900">HTML Button</h3>
                        <Button size="sm" variant="outline" onClick={() => copyToClipboard((snippets as any).button, 'HTML Button')} className="text-xs">
                          <Copy className="w-3 h-3 mr-1" />
                          {copiedText === 'HTML Button' ? 'Copied!' : 'Copy'}
                        </Button>
                      </div>
                      <pre className="text-xs bg-gray-50 rounded-lg p-3 text-gray-800 overflow-hidden">
                        <code className="block whitespace-pre-wrap break-all overflow-wrap-anywhere">{(snippets as any).button}</code>
                      </pre>
                    </div>

                    {/* React Component */}
                    <div className="bg-white rounded-xl p-6 border border-gray-200">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-medium text-gray-900">React Component</h3>
                        <Button size="sm" variant="outline" onClick={() => copyToClipboard((snippets as any).react, 'React Component')} className="text-xs">
                          <Copy className="w-3 h-3 mr-1" />
                          {copiedText === 'React Component' ? 'Copied!' : 'Copy'}
                        </Button>
                      </div>
                      <pre className="text-xs bg-gray-50 rounded-lg p-3 text-gray-800 overflow-hidden">
                        <code className="block whitespace-pre-wrap break-all overflow-wrap-anywhere">{(snippets as any).react}</code>
                      </pre>
                    </div>

                    {/* Styled Button */}
                    <div className="bg-white rounded-xl p-6 border border-gray-200">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-medium text-gray-900">Styled Button</h3>
                        <Button size="sm" variant="outline" onClick={() => copyToClipboard((snippets as any).styled, 'Styled Button')} className="text-xs">
                          <Copy className="w-3 h-3 mr-1" />
                          {copiedText === 'Styled Button' ? 'Copied!' : 'Copy'}
                        </Button>
                      </div>
                      <pre className="text-xs bg-gray-50 rounded-lg p-3 text-gray-800 overflow-hidden">
                        <code className="block whitespace-pre-wrap break-all overflow-wrap-anywhere">{(snippets as any).styled}</code>
                      </pre>
                    </div>
                  </>
                ) : (
                  <>
                    {/* Dropdown Widget */}
                    <div className="bg-white rounded-xl p-6 border border-gray-200">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-medium text-gray-900">Selector Widget (Dropdown)</h3>
                        <Button size="sm" variant="outline" onClick={() => copyToClipboard((snippets as any).dropdown, 'Selector Widget')} className="text-xs">
                          <Copy className="w-3 h-3 mr-1" />
                          {copiedText === 'Selector Widget' ? 'Copied!' : 'Copy'}
                        </Button>
                      </div>
                      <pre className="text-xs bg-gray-50 rounded-lg p-3 text-gray-800 overflow-hidden">
                        <code className="block whitespace-pre-wrap break-all overflow-wrap-anywhere">{(snippets as any).dropdown}</code>
                      </pre>
                    </div>

                    {/* Multi Buttons */}
                    <div className="bg-white rounded-xl p-6 border border-gray-200">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-medium text-gray-900">Multiple Currency Buttons</h3>
                        <Button size="sm" variant="outline" onClick={() => copyToClipboard((snippets as any).multiButtons, 'Multi Buttons')} className="text-xs">
                          <Copy className="w-3 h-3 mr-1" />
                          {copiedText === 'Multi Buttons' ? 'Copied!' : 'Copy'}
                        </Button>
                      </div>
                      <pre className="text-xs bg-gray-50 rounded-lg p-3 text-gray-800 overflow-hidden">
                        <code className="block whitespace-pre-wrap break-all overflow-wrap-anywhere">{(snippets as any).multiButtons}</code>
                      </pre>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Implementation Guide */}
            <div className="bg-[#f5f5f5] rounded-3xl p-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-6">Implementation Guide</h2>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <Badge className="bg-[#b1ff0a] text-black px-3 py-1">1</Badge>
                  <div>
                    <h3 className="font-medium text-gray-900 mb-1">Deploy Backend</h3>
                    <p className="text-sm text-gray-600">Deploy the `buy` Edge Function and set required secrets.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Badge className="bg-[#b1ff0a] text-black px-3 py-1">2</Badge>
                  <div>
                    <h3 className="font-medium text-gray-900 mb-1">Copy Snippet</h3>
                    <p className="text-sm text-gray-600">Choose your preferred snippet and copy it to your website.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Badge className="bg-[#b1ff0a] text-black px-3 py-1">3</Badge>
                  <div>
                    <h3 className="font-medium text-gray-900 mb-1">Customize</h3>
                    <p className="text-sm text-gray-600">Replace amount, currency, and reference with dynamic values from your product/cart.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Badge className="bg-[#b1ff0a] text-black px-3 py-1">4</Badge>
                  <div>
                    <h3 className="font-medium text-gray-900 mb-1">Test</h3>
                    <p className="text-sm text-gray-600">Click the button to verify it creates an invoice and redirects to the payment page.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
