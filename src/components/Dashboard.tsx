import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, Search, Settings, Bell, ChevronRight, TrendingUp, TrendingDown } from 'lucide-react';
import { BarChart, Bar, AreaChart, Area, ResponsiveContainer } from 'recharts';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { supabase } from '../lib/supabaseClient';
import { getUsdPrices, getCoinLogos } from '../lib/prices';
import { Analytics } from './Analytics';
import { Transactions } from './Transactions';
import { Invoices } from './Invoices';
import { ButtonsWidgets } from './ButtonsWidgets';

// Mock data for charts (used in other sections)

const profitableData = [
  {
    crypto: 'BTC',
    name: 'Bitcoin',
    change: '-7%',
    amount: '$9.23',
    positive: false,
    chartData: Array.from({ length: 30 }, () => Math.random() * 60 + 20),
  },
  {
    crypto: 'ETH',
    name: 'Ethereum',
    change: '-12%',
    amount: '+$24.59',
    positive: false,
    chartData: Array.from({ length: 30 }, () => Math.random() * 60 + 20),
  },
  {
    crypto: 'USDT',
    name: 'Tether',
    change: '-12%',
    amount: '+$24.59',
    positive: false,
    chartData: Array.from({ length: 30 }, () => Math.random() * 60 + 20),
  },
  {
    crypto: 'SOL',
    name: 'Solana',
    change: '0%',
    amount: '-$0',
    positive: null,
    chartData: Array.from({ length: 30 }, () => Math.random() * 60 + 20),
  },
];

const recentActivities = [
  {
    crypto: 'DOGE',
    name: 'Dogecoin',
    change: '+7%',
    positive: true,
    chartData: Array.from({ length: 40 }, (_, i) => ({
      value: Math.sin(i / 5) * 30 + 50 + Math.random() * 10,
    })),
    profit: '12.20 USD',
    date: '20 Feb 2025',
  },
  {
    crypto: 'ADA',
    name: 'Cardano',
    change: '-7%',
    positive: false,
    chartData: Array.from({ length: 40 }, (_, i) => ({
      value: Math.cos(i / 5) * 30 + 50 + Math.random() * 10,
    })),
    profit: '71.32 USD',
    date: '17 Feb 2025',
  },
];

const transactions = [
  { company: 'Amazon', type: 'Buy', amount: '-$160.00', date: '17 Feb, 09:00 AM', positive: false },
  { company: 'Apple', type: 'Sell', amount: '+$234.99', date: '13 Feb, 11:34 AM', positive: true },
  { company: 'Starbucks', type: 'Buy', amount: '-$98.36', date: '12 Feb, 09:56 AM', positive: false },
  { company: 'eBay Inc', type: 'Sell', amount: '+$112.99', date: '12 Feb, 07:11 AM', positive: true },
  { company: 'Bayerische...', type: 'Sell', amount: '+$25.00', date: '11 Feb, 11:09 AM', positive: true },
  { company: 'Dell Inc', type: 'Buy', amount: '-$45.00', date: '08 Feb, 07:44 AM', positive: false },
];

const HOLDING_COLORS = ['#b1ff0a', '#225aeb', '#a54df1', '#ff6b6b', '#ffd93d'];

interface DashboardProps {
  onNavigateHome?: () => void;
  onLogout?: () => void;
}

export function Dashboard({ onNavigateHome, onLogout }: DashboardProps) {
  const [activeNav, setActiveNav] = useState('Dashboard');
  const SUPPORTED_CURRENCIES = ['SOL', 'USDC', 'USDT'];
  const [wallets, setWallets] = useState<Record<string, string>>(
    Object.fromEntries(SUPPORTED_CURRENCIES.map((c) => [c, ''])) as Record<string, string>,
  );
  const [invoiceAmount, setInvoiceAmount] = useState('');
  const [invoiceCurrency, setInvoiceCurrency] = useState<string>('BTC');
  const [invoiceNetwork, setInvoiceNetwork] = useState<string>('bitcoin');
  const [invoiceRef, setInvoiceRef] = useState('');
  const [statusText, setStatusText] = useState('');
  const [savingWallets, setSavingWallets] = useState(false);
  const [usdMap, setUsdMap] = useState<Record<string, number>>({});
  const [showInvoiceEditor, setShowInvoiceEditor] = useState(false);
  const [customerEmail, setCustomerEmail] = useState('');
  const [expiresMinutes, setExpiresMinutes] = useState('');
  const [visibleWallets, setVisibleWallets] = useState<string[]>([]);
  const [selectingCoin, setSelectingCoin] = useState(false);
  const [selectedCoinToAdd, setSelectedCoinToAdd] = useState<string>('BTC');
  const [editingWallet, setEditingWallet] = useState<string | null>(null);
  const [logoMap, setLogoMap] = useState<Record<string, string>>({});
  const DEFAULT_NETWORK_BY_SYMBOL: Record<string, string> = {
    SOL: 'solana',
    USDC: 'solana',
    USDT: 'solana',
  };
  const [invoices, setInvoices] = useState<Array<{
    id: string;
    amount: number;
    currency: string;
    to_address: string;
    status: string;
    created_at: string;
    network: string | null;
    reference: string | null;
    detected_tx_hash: string | null;
    public_token?: string;
  }>>([]);

  useEffect(() => {
    async function loadWallets() {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) return;
      const { data, error } = await supabase
        .from('wallets')
        .select('currency,address')
        .eq('user_id', userId);
      if (error) return;
      const next = Object.fromEntries(SUPPORTED_CURRENCIES.map((c) => [c, ''])) as Record<string, string>;
      for (const row of data ?? []) {
        const cur = String(row.currency).toUpperCase();
        if (cur in next) next[cur] = String(row.address ?? '');
      }
      setWallets(next);
      const preset = Object.keys(next).filter((k) => String((next as any)[k] || '').length > 0);
      setVisibleWallets(preset);
    }
    loadWallets();
  }, []);

  useEffect(() => {
    async function loadInvoices() {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) return;
      const { data } = await supabase
        .from('invoices')
        .select('id,amount,currency,to_address,status,created_at,network,reference,detected_tx_hash,detected_at,public_token')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(15);
      if (data) setInvoices(data as any);
    }
    loadInvoices();
    const channel = supabase
      .channel('dashboard-invoices-rt')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'invoices',
        },
        (payload) => {
          const row: any = (payload as any).new || (payload as any).old;
          setInvoices((prev) => {
            const next = [...prev];
            const idx = next.findIndex((i) => i.id === row.id);
            if (idx >= 0) next[idx] = { ...(next[idx] as any), ...(row as any) };
            else next.unshift(row as any);
            return next.slice(0, 15);
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Fetch USD prices for symbols present in the invoice list (30s cache)
  useEffect(() => {
    const symbols = Array.from(new Set(invoices.map((i) => (i.currency || '').toUpperCase()))) as string[];
    if (symbols.length === 0) return;
    let mounted = true;
    async function run() {
      const [prices, logos] = await Promise.all([getUsdPrices(symbols), getCoinLogos(symbols)]);
      if (mounted) {
        setUsdMap(prices);
        setLogoMap((prev) => ({ ...prev, ...logos }));
      }
    }
    run();
    const id = setInterval(run, 30_000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [invoices.map((i) => ((i as any).currency ? String((i as any).currency) : '')).join(',')]);

  // Compute merchant's top crypto holdings based on paid/confirmed invoices
  const holdingsData = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const inv of invoices) {
      if (inv.status === 'paid' || inv.status === 'confirmed') {
        const symbol = (inv.currency || '').toUpperCase();
        const price = usdMap[symbol.toLowerCase()] || 0;
        const usd = Number(inv.amount) * price;
        totals[symbol] = (totals[symbol] || 0) + usd;
      }
    }
    const list = Object.entries(totals).map(([currency, usd]) => ({ currency, usd }));
    list.sort((a, b) => b.usd - a.usd);
    return list;
  }, [invoices, usdMap]);

  const topHoldings = useMemo(() => holdingsData.slice(0, 3), [holdingsData]);
  const totalHoldingsUsd = useMemo(() => holdingsData.reduce((acc, h) => acc + h.usd, 0), [holdingsData]);

  // Totals per currency for wallet cards
  const currencyTotals = useMemo(() => {
    const totals: Record<string, { crypto: number; usd: number }> = {};
    for (const inv of invoices) {
      if (inv.status === 'paid' || inv.status === 'confirmed') {
        const sym = (inv.currency || '').toUpperCase();
        const crypto = Number(inv.amount) || 0;
        const usd = crypto * (usdMap[sym.toLowerCase()] || 0);
        if (!totals[sym]) totals[sym] = { crypto: 0, usd: 0 };
        totals[sym].crypto += crypto;
        totals[sym].usd += usd;
      }
    }
    return totals;
  }, [invoices, usdMap]);

  async function handleSaveWallets() {
    setSavingWallets(true);
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) {
      setStatusText('Please sign in to save addresses');
      setSavingWallets(false);
      return;
    }
    const rows = SUPPORTED_CURRENCIES
      .map((c) => ({ c, address: (wallets[c] || '').trim() }))
      .filter((r) => r.address)
      .map((r) => ({ user_id: userId, currency: r.c, address: r.address })) as Array<{
      user_id: string;
      currency: string;
      address: string;
    }>;
    if (rows.length === 0) {
      setStatusText('Enter at least one wallet address');
      setSavingWallets(false);
      return;
    }
    const { error } = await supabase.from('wallets').upsert(rows, { onConflict: 'user_id,currency' });
    if (error) {
      alert(error.message);
      setSavingWallets(false);
      return;
    }
    setStatusText('Wallet addresses saved');
    setTimeout(() => setStatusText(''), 2000);
    setSavingWallets(false);
  }

  async function handleGenerateInvoice() {
    const amountNum = Number(invoiceAmount);
    if (!invoiceAmount || amountNum <= 0 || isNaN(amountNum)) {
      setStatusText('Enter an amount');
      setTimeout(() => setStatusText(''), 2000);
      return;
    }
    const currenciesToUse = Object.entries(wallets)
      .filter(([sym, addr]) => !!addr && (visibleWallets.length === 0 || visibleWallets.includes(sym)))
      .map(([sym]) => sym as string);
    if (currenciesToUse.length === 0) {
      setStatusText('Add at least one wallet first');
      setTimeout(() => setStatusText(''), 2500);
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
      reference: invoiceRef || null,
      status: 'pending',
      network: DEFAULT_NETWORK_BY_SYMBOL[sym] || null,
      expires_at: expiresAt,
      customer_email: customerEmail || null,
    }));

    const { data, error } = await supabase
      .from('invoices')
      .insert(rows)
      .select('id,amount,currency,to_address,status,created_at,network,reference,detected_tx_hash,public_token');
    if (error) {
      alert(error.message);
      return;
    }
    if (data && Array.isArray(data)) setInvoices((prev) => [...data as any[], ...prev].slice(0, 15));
    setStatusText(`Created ${rows.length} invoice${rows.length > 1 ? 's' : ''}`);
    setTimeout(() => setStatusText(''), 3000);
    setInvoiceAmount('');
    setInvoiceRef('');
    setCustomerEmail('');
    setExpiresMinutes('');
  }

  return (
    <div className="min-h-screen bg-[#1a1a1a] flex p-6">
      {/* Left Sidebar */}
      <div className="w-[200px] bg-[#f5f5f5] rounded-3xl p-6 flex flex-col">
        <div className="flex items-center gap-2 mb-8 cursor-pointer" onClick={onNavigateHome}>
          <BarChart3 className="w-6 h-6" />
          <span className="font-semibold">SwiftSpace</span>
        </div>

        <nav className="flex-1 space-y-2">
          {['Dashboard', 'Invoices', 'Analytics', 'Transactions', 'Buttons & Widgets'].map((item) => (
            <button
              key={item}
              onClick={() => setActiveNav(item)}
              className={`w-full text-left px-4 py-2.5 rounded-xl transition-colors ${
                activeNav === item
                  ? 'bg-black text-white'
                  : 'text-gray-700 hover:bg-gray-200'
              }`}
            >
              {item}
            </button>
          ))}
        </nav>

        <button className="text-gray-700 text-left px-4 py-2.5 rounded-xl hover:bg-gray-200 transition-colors" onClick={onLogout}>
          Logout
        </button>

        {/* Premium Card */}
        <div className="mt-6 bg-[#b1ff0a] rounded-2xl p-5">
          <div className="mb-3">
            <div>SwiftSpace</div>
            <div>Premium</div>
          </div>
          <p className="text-xs mb-4 text-gray-800">
            Unlocking the secrets to successful investing
          </p>
          <button className="w-full bg-white text-black px-4 py-2 rounded-full hover:bg-gray-100 transition-colors">
            Get Now
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 mx-6 space-y-6">
        {activeNav === 'Analytics' && (
          <div className="space-y-6">
            <Analytics embedded onNavigateHome={onNavigateHome} onLogout={onLogout} />
          </div>
        )}
        {activeNav === 'Transactions' && (
          <div className="space-y-6">
            <Transactions embedded onNavigateHome={onNavigateHome} onLogout={onLogout} />
          </div>
        )}
        {activeNav === 'Invoices' && (
          <div className="space-y-6">
            <Invoices onBack={() => setActiveNav('Dashboard')} />
          </div>
        )}
        {activeNav === 'Buttons & Widgets' && (
          <div className="space-y-6">
            <ButtonsWidgets />
          </div>
        )}
        {activeNav === 'Dashboard' && (
        <>
        {/* Wallet Management */}
        <div className="bg-[#f5f5f5] rounded-3xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold">Wallet Management</h2>
            <Button 
              className="bg-[#b1ff0a] text-black hover:bg-[#a0ef00] px-4 py-2" 
              onClick={() => setSelectingCoin(true)}
            >
              + Add Wallet
            </Button>
          </div>

          {visibleWallets.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
                <Settings className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-700 mb-2">No wallets configured</h3>
              <p className="text-gray-500 mb-6">Add your first wallet to start receiving crypto payments</p>
              <Button 
                className="bg-[#b1ff0a] text-black hover:bg-[#a0ef00] px-6 py-3" 
                onClick={() => setSelectingCoin(true)}
              >
                Add Your First Wallet
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {visibleWallets.map((sym, idx) => {
                const address = wallets[sym] || '';
                const totals = currencyTotals[sym] || { crypto: 0, usd: 0 };
                return (
                  <div key={sym} className="bg-white rounded-2xl p-5 border border-gray-100 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        {logoMap[sym] ? (
                          <img 
                            src={logoMap[sym]} 
                            alt={sym} 
                            className="w-12 h-12 rounded-full bg-white border-2 border-gray-100" 
                          />
                        ) : (
                          <div 
                            className="w-12 h-12 rounded-full border-2 border-gray-100 flex items-center justify-center text-white font-semibold text-sm" 
                            style={{ backgroundColor: HOLDING_COLORS[idx % HOLDING_COLORS.length] }}
                          >
                            {sym.slice(0, 2)}
                          </div>
                        )}
                        <div>
                          <h3 className="font-semibold text-gray-900">{sym}</h3>
                          <p className="text-xs text-gray-500">Cryptocurrency</p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-gray-400 hover:text-gray-600"
                        onClick={() => { setEditingWallet(sym); setSelectingCoin(false); }}
                      >
                        <Settings className="w-4 h-4" />
                      </Button>
                    </div>
                    
                    <div className="space-y-3">
                      <div className="bg-gray-50 rounded-lg p-3">
                        <div className="text-sm text-gray-600 mb-1">Total Value</div>
                        <div className="text-lg font-semibold text-gray-900">${totals.usd.toFixed(2)}</div>
                        <div className="text-xs text-gray-500">{totals.crypto.toFixed(6)} {sym}</div>
                      </div>
                      
                      {address && (
                        <div className="bg-gray-50 rounded-lg p-3">
                          <div className="text-sm text-gray-600 mb-1">Address</div>
                          <div className="text-xs text-gray-800 font-mono break-all">{address}</div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Add Wallet Modal */}
          {selectingCoin && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="bg-white rounded-2xl p-6 w-full max-w-md mx-4">
                <h3 className="text-lg font-semibold mb-4">Add New Wallet</h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Cryptocurrency</label>
                    <select
                      value={selectedCoinToAdd}
                      onChange={(e) => setSelectedCoinToAdd(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-[#b1ff0a] focus:border-transparent"
                    >
                      {SUPPORTED_CURRENCIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Wallet Address</label>
                    <Input
                      placeholder={selectedCoinToAdd === 'ETH' || selectedCoinToAdd === 'MATIC' || selectedCoinToAdd === 'BNB' ? '0x...' : selectedCoinToAdd === 'BTC' ? 'bc1...' : 'Enter wallet address'}
                      value={wallets[selectedCoinToAdd]}
                      onChange={(e) => setWallets({ ...wallets, [selectedCoinToAdd]: e.target.value })}
                      className="w-full"
                    />
                  </div>
                </div>
                
                <div className="flex gap-3 mt-6">
                  <Button
                    className="flex-1 bg-[#b1ff0a] text-black hover:bg-[#a0ef00]"
                    onClick={async () => {
                      const coin = selectedCoinToAdd;
                      if (!wallets[coin]) return;
                      await handleSaveWallets();
                      if (!visibleWallets.includes(coin)) setVisibleWallets((prev) => [...prev, coin]);
                      setSelectingCoin(false);
                    }}
                  >
                    Add Wallet
                  </Button>
                  <Button 
                    variant="outline" 
                    className="flex-1"
                    onClick={() => setSelectingCoin(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Edit Wallet Modal */}
          {editingWallet && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="bg-white rounded-2xl p-6 w-full max-w-md mx-4">
                <h3 className="text-lg font-semibold mb-4">Edit {editingWallet} Wallet</h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Wallet Address</label>
                    <Input
                      placeholder={editingWallet === 'ETH' || editingWallet === 'MATIC' || editingWallet === 'BNB' ? '0x...' : editingWallet === 'BTC' ? 'bc1...' : 'Enter wallet address'}
                      value={wallets[editingWallet]}
                      onChange={(e) => setWallets({ ...wallets, [editingWallet]: e.target.value })}
                      className="w-full"
                    />
                  </div>
                </div>
                
                <div className="flex gap-3 mt-6">
                  <Button
                    className="flex-1 bg-[#b1ff0a] text-black hover:bg-[#a0ef00]"
                    onClick={async () => {
                      await handleSaveWallets();
                      if (!visibleWallets.includes(editingWallet)) setVisibleWallets((prev) => [...prev, editingWallet]);
                      setEditingWallet(null);
                    }}
                  >
                    Save Changes
                  </Button>
                  <Button 
                    variant="outline" 
                    className="flex-1"
                    onClick={() => setEditingWallet(null)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Invoice creation moved to Invoices page */}

        {/* Recent Invoices */}
        <div className="bg-[#f5f5f5] rounded-3xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl">Recent invoices</h2>
          </div>
          <div className="space-y-3">
            {invoices.length === 0 && (
              <div className="text-sm text-gray-600">No invoices yet.</div>
            )}
            {invoices.map((inv) => (
              <div key={inv.id} className="grid grid-cols-1 md:grid-cols-5 gap-3 items-center bg-white rounded-2xl p-4">
                <div>
                  <div className="text-sm font-medium">{inv.amount} {inv.currency}</div>
                  <div className="text-xs text-gray-500">{inv.network || 'n/a'}</div>
                </div>
                <div className="md:col-span-2">
                  <div className="text-xs text-gray-500">To</div>
                  <div className="flex items-center gap-2 truncate">
                    <span className="truncate">{inv.to_address}</span>
                    <Button size="sm" className="bg-black text-white hover:bg-gray-800" onClick={() => navigator.clipboard.writeText(inv.to_address)}>Copy</Button>
                  </div>
                </div>
                <div>
                  <Badge className={`${inv.status === 'confirmed' ? 'bg-[#b1ff0a] text-black' : inv.status === 'paid' ? 'bg-[#225aeb] text-white' : 'bg-[#a54df1] text-white'} px-3 py-1 rounded-full`}>{inv.status}</Badge>
                </div>
                <div className="text-xs text-gray-500 flex items-center gap-2">
                  <span>{new Date(inv.created_at).toLocaleString()}</span>
                  {usdMap[inv.currency?.toUpperCase() || ''] && (
                    <span>≈ ${((usdMap[inv.currency!.toUpperCase()] || 0) * Number(inv.amount)).toFixed(2)}</span>
                  )}
                  {inv.public_token && (
                    <Button size="sm" className="bg-black text-white hover:bg-gray-800" onClick={() => navigator.clipboard.writeText(`${window.location.origin}/?t=${inv.public_token}`)}>Copy link</Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Most Profitable */}
        <div className="bg-[#f5f5f5] rounded-3xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl">Most profitable</h2>
            <button className="p-2 hover:bg-gray-200 rounded-full transition-colors">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-4 gap-4">
            {profitableData.map((item, idx) => (
              <div key={idx} className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-black rounded-full flex items-center justify-center text-white text-xs">
                    {item.crypto[0]}
                  </div>
                  <div>
                    <div className="text-sm">{item.crypto}</div>
                    <div className="text-xs text-gray-500">{item.name}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    className={`${
                      item.positive === false
                        ? 'bg-[#a54df1]'
                        : item.positive === true
                        ? 'bg-[#b1ff0a] text-black'
                        : 'bg-[#225aeb]'
                    } text-white px-2 py-1 rounded-full text-xs hover:opacity-90`}
                  >
                    {item.positive === false && <TrendingDown className="w-3 h-3 mr-1" />}
                    {item.positive === true && <TrendingUp className="w-3 h-3 mr-1" />}
                    {item.change}
                  </Badge>
                  <span className="text-xs">{item.amount}</span>
                </div>
                <div className="h-24">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={item.chartData.map((v) => ({ value: v }))}>
                      <Bar dataKey="value" fill="#e5e5e5" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Activities */}
        <div className="bg-[#f5f5f5] rounded-3xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl">Recent activities</h2>
            <button className="p-2 hover:bg-gray-200 rounded-full transition-colors">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-6">
            {recentActivities.map((item, idx) => (
              <div key={idx} className="space-y-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-black rounded-full flex items-center justify-center text-white text-xs">
                    {item.crypto[0]}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm">{item.crypto}</div>
                    <div className="text-xs text-gray-500">{item.name}</div>
                  </div>
                  <Badge
                    className={`${
                      item.positive ? 'bg-[#b1ff0a] text-black' : 'bg-[#a54df1] text-white'
                    } px-2 py-1 rounded-full text-xs hover:opacity-90`}
                  >
                    {item.positive ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                    {item.change}
                  </Badge>
                </div>

                <div className="h-32 relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={item.chartData}>
                      <defs>
                        <linearGradient id={`gradient-${idx}`} x1="0" y1="0" x2="0" y2="1">
                          <stop
                            offset="0%"
                            stopColor={item.positive ? '#b1ff0a' : '#a54df1'}
                            stopOpacity={0.3}
                          />
                          <stop
                            offset="100%"
                            stopColor={item.positive ? '#b1ff0a' : '#a54df1'}
                            stopOpacity={0}
                          />
                        </linearGradient>
                        <pattern
                          id={`pattern-${idx}`}
                          patternUnits="userSpaceOnUse"
                          width="4"
                          height="4"
                          patternTransform="rotate(45)"
                        >
                          <line
                            x1="0"
                            y="0"
                            x2="0"
                            y2="4"
                            stroke={item.positive ? '#b1ff0a' : '#a54df1'}
                            strokeWidth="1"
                          />
                        </pattern>
                      </defs>
                      <Area
                        type="monotone"
                        dataKey="value"
                        stroke={item.positive ? '#b1ff0a' : '#a54df1'}
                        fill={`url(#gradient-${idx})`}
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                  <div
                    className="absolute inset-0 opacity-20 pointer-events-none"
                    style={{
                      background: `url(#pattern-${idx})`,
                      maskImage: 'linear-gradient(to bottom, transparent 50%, black 100%)',
                    }}
                  />
                </div>

                <div className="flex items-end justify-between">
                  <div>
                    <div className="text-xs text-gray-500">Profit</div>
                    <div>{item.profit}</div>
                  </div>
                  <div className="text-xs text-gray-500">{item.date}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        </>
        )}
      </div>

      {/* Right Sidebar */}
      {activeNav === 'Dashboard' && (
      <div className="w-[320px] bg-[#f5f5f5] rounded-3xl p-6 space-y-6">
        {/* Latest Incoming Payments */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3>Latest incoming payments</h3>
            <button className="p-1 hover:bg-gray-200 rounded-full transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-3">
            {invoices
              .filter((i) => i.status === 'paid' || i.status === 'confirmed')
              .slice(0, 6)
              .map((inv) => (
                <div key={inv.id} className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-black rounded-full flex items-center justify-center text-white text-xs">
                    {(inv.currency || '?').slice(0, 1)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{inv.currency} payment</div>
                    <div className="text-xs text-gray-500">
                      {inv.network || 'network'} • {new Date(inv.created_at).toLocaleString()}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-[#b1ff0a]">+{Number(inv.amount)} {inv.currency}</div>
                  </div>
                </div>
              ))}
          </div>
        </div>

        {/* Merchant Top Crypto Holdings */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3>Top crypto holdings</h3>
            <button className="p-1 hover:bg-gray-200 rounded-full transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="mb-4">
            <div className="text-2xl">${totalHoldingsUsd.toFixed(0)}</div>
            <div className="text-xs text-gray-500">Total (USD)</div>
          </div>

          <div className="relative h-48">
            <div className="absolute inset-0 flex items-end justify-between px-4 pb-4">
              {topHoldings.length === 0 ? (
                <div className="text-sm text-gray-500">No paid or confirmed invoices yet</div>
              ) : (
                topHoldings.map((item, idx) => {
                  const height = totalHoldingsUsd > 0 ? (item.usd / totalHoldingsUsd) * 120 : 0;
                  return (
                    <div key={item.currency} className="flex flex-col items-center" style={{ width: '30%' }}>
                      <div className="text-xs mb-1">${(item.usd / 1000).toFixed(1)}k</div>
                      <div
                        className="w-full rounded-t-lg relative overflow-hidden"
                        style={{
                          height: `${height}px`,
                          backgroundColor: HOLDING_COLORS[idx % HOLDING_COLORS.length],
                        }}
                      >
                        <div
                          className="absolute inset-0 opacity-30"
                          style={{
                            backgroundImage: `repeating-linear-gradient(
                              45deg,
                              transparent,
                              transparent 3px,
                              rgba(0,0,0,0.1) 3px,
                              rgba(0,0,0,0.1) 6px
                            )`,
                          }}
                        />
                      </div>
                      <div className="text-xs mt-2 text-gray-500">{item.currency}</div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}

