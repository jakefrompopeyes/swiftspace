import React, { useEffect, useMemo, useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { supabase } from '../lib/supabaseClient';

interface InvoicesProps {
  onBack?: () => void;
}

export function Invoices({ onBack }: InvoicesProps) {
  const [wallets, setWallets] = useState<Record<string, string>>({});
  const [visibleWallets, setVisibleWallets] = useState<string[]>([]);
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [expiresMinutes, setExpiresMinutes] = useState('');
  const [statusText, setStatusText] = useState('');
  const SUPPORTED_CURRENCIES = ['BTC', 'ETH', 'USDT', 'SOL', 'MATIC', 'BNB', 'LTC'];

  const DEFAULT_NETWORK_BY_SYMBOL: Record<string, string> = {
    BTC: 'bitcoin',
    ETH: 'ethereum',
    MATIC: 'polygon',
    BNB: 'bsc',
    SOL: 'solana',
    LTC: 'litecoin',
    USDT: 'ethereum',
  };

  useEffect(() => {
    async function load() {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) return;
      const { data } = await supabase
        .from('wallets')
        .select('currency,address')
        .eq('user_id', userId);
      const next = Object.fromEntries(SUPPORTED_CURRENCIES.map((c) => [c, ''])) as Record<string, string>;
      for (const row of data ?? []) {
        const cur = String(row.currency).toUpperCase();
        if (cur in next) next[cur] = String((row as any).address || '');
      }
      setWallets(next);
      setVisibleWallets(Object.entries(next).filter(([_, v]) => !!v).map(([k]) => k));
    }
    load();
  }, []);

  const selectableWallets = useMemo(() => SUPPORTED_CURRENCIES.filter((c) => wallets[c]), [wallets]);

  async function generateInvoices() {
    const amountNum = Number(amount);
    if (!amount || amountNum <= 0 || isNaN(amountNum)) {
      setStatusText('Enter an amount');
      setTimeout(() => setStatusText(''), 2000);
      return;
    }
    const currenciesToUse = selectableWallets;
    if (currenciesToUse.length === 0) {
      setStatusText('Add at least one wallet first');
      setTimeout(() => setStatusText(''), 2000);
      return;
    }
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return;
    const expiresAt = expiresMinutes ? new Date(Date.now() + Number(expiresMinutes) * 60_000).toISOString() : null;

    const rows = currenciesToUse.map((sym) => ({
      user_id: userId,
      amount: amountNum,
      currency: sym,
      to_address: wallets[sym],
      reference: reference || null,
      status: 'pending',
      network: DEFAULT_NETWORK_BY_SYMBOL[sym] || null,
      expires_at: expiresAt,
      customer_email: customerEmail || null,
    }));

    const { data, error } = await supabase
      .from('invoices')
      .insert(rows)
      .select('id,public_token');

    if (error) {
      setStatusText(error.message);
      return;
    }

    setStatusText(`Created ${rows.length} invoice${rows.length > 1 ? 's' : ''}`);
    setAmount('');
    setReference('');
    setCustomerEmail('');
    setExpiresMinutes('');
  }

  return (
    <div className="min-h-screen bg-[#1a1a1a] p-6">
      <div className="max-w-3xl mx-auto bg-[#f5f5f5] rounded-3xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl">Create Invoices</h1>
          {onBack && (
            <Button variant="outline" onClick={onBack}>Back</Button>
          )}
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <div>
            <label className="text-sm text-gray-700 mb-2 inline-block">Amount</label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="bg-white" />
          </div>
          <div>
            <label className="text-sm text-gray-700 mb-2 inline-block">Reference (optional)</label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="#order-1234" className="bg-white" />
          </div>
          <div>
            <label className="text-sm text-gray-700 mb-2 inline-block">Customer email (optional)</label>
            <Input type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="customer@example.com" className="bg-white" />
          </div>
          <div>
            <label className="text-sm text-gray-700 mb-2 inline-block">Expires in (minutes)</label>
            <Input type="number" value={expiresMinutes} onChange={(e) => setExpiresMinutes(e.target.value)} placeholder="60" className="bg-white" />
          </div>
        </div>

        <div className="mt-6">
          <Button className="bg-[#b1ff0a] text-black hover:bg-[#a0ef00]" onClick={generateInvoices}>Generate invoices for all wallets</Button>
          {statusText && <span className="ml-3 text-gray-700 text-sm">{statusText}</span>}
        </div>

        <div className="mt-8">
          <h2 className="text-lg mb-2">Active wallets</h2>
          {selectableWallets.length === 0 ? (
            <div className="text-sm text-gray-600">No wallets configured yet.</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {selectableWallets.map((sym) => (
                <span key={sym} className="px-3 py-1 text-xs rounded-full bg-white border border-gray-200">{sym}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
