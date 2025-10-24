import React, { useEffect, useState } from 'react';
import { BarChart3, TrendingUp, DollarSign, Activity, CreditCard } from 'lucide-react';
import { AreaChart, Area, BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, PieChart, Pie, Cell } from 'recharts';
import { supabase } from '../lib/supabaseClient';
import { getUsdPrices } from '../lib/prices';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, subMonths } from 'date-fns';

interface Invoice {
  id: string;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
  network: string | null;
}

interface Payment {
  id: string;
  invoice_id: string;
  amount: number;
  chain: string | null;
  received_at: string;
}

interface AnalyticsProps {
  onNavigateHome?: () => void;
  onLogout?: () => void;
  embedded?: boolean;
}

export function Analytics({ onNavigateHome, onLogout, embedded = false }: AnalyticsProps) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [usdMap, setUsdMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  // Derived metrics
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalInvoices, setTotalInvoices] = useState(0);
  const [paidInvoices, setPaidInvoices] = useState(0);
  const [conversionRate, setConversionRate] = useState(0);
  const [revenueByDay, setRevenueByDay] = useState<{ date: string; usd: number }[]>([]);
  const [invoicesByCurrency, setInvoicesByCurrency] = useState<{ currency: string; count: number; usd: number }[]>([]);
  const [invoicesByStatus, setInvoicesByStatus] = useState<{ status: string; count: number }[]>([]);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) {
        setLoading(false);
        return;
      }

      // Fetch all invoices
      const { data: invoicesData } = await supabase
        .from('invoices')
        .select('id,amount,currency,status,created_at,network')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (invoicesData) {
        setInvoices(invoicesData as Invoice[]);
      }

      // Fetch all payments
      const { data: paymentsData } = await supabase
        .from('payments')
        .select('id,invoice_id,amount,chain,received_at')
        .in('invoice_id', (invoicesData || []).map((inv) => inv.id));

      if (paymentsData) {
        setPayments(paymentsData as Payment[]);
      }

      setLoading(false);
    }

    loadData();
  }, []);

  // Fetch USD prices for all currencies in invoices
  useEffect(() => {
    const symbols = Array.from(new Set(invoices.map((i) => i.currency.toUpperCase())));
    if (symbols.length === 0) return;

    let mounted = true;
    async function run() {
      const prices = await getUsdPrices(symbols);
      if (mounted) setUsdMap(prices);
    }
    run();
    const id = setInterval(run, 60_000); // Update every 60s
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [invoices.map((i) => i.currency).join(',')]);

  // Calculate metrics whenever invoices or USD prices change
  useEffect(() => {
    if (invoices.length === 0) return;

    const total = invoices.length;
    const paid = invoices.filter((inv) => inv.status === 'paid' || inv.status === 'confirmed').length;
    const conversion = total > 0 ? (paid / total) * 100 : 0;

    setTotalInvoices(total);
    setPaidInvoices(paid);
    setConversionRate(conversion);

    // Calculate total revenue in USD
    let revenue = 0;
    invoices.forEach((inv) => {
      if (inv.status === 'paid' || inv.status === 'confirmed') {
        const usdPrice = usdMap[inv.currency.toLowerCase()] || 0;
        revenue += inv.amount * usdPrice;
      }
    });
    setTotalRevenue(revenue);

    // Revenue by day (last 30 days)
    const now = new Date();
    const thirtyDaysAgo = subMonths(now, 1);
    const days = eachDayOfInterval({ start: thirtyDaysAgo, end: now });

    const revenueMap: Record<string, number> = {};
    days.forEach((day) => {
      revenueMap[format(day, 'yyyy-MM-dd')] = 0;
    });

    invoices.forEach((inv) => {
      if (inv.status === 'paid' || inv.status === 'confirmed') {
        const dayKey = format(new Date(inv.created_at), 'yyyy-MM-dd');
        if (revenueMap[dayKey] !== undefined) {
          const usdPrice = usdMap[inv.currency.toLowerCase()] || 0;
          revenueMap[dayKey] += inv.amount * usdPrice;
        }
      }
    });

    setRevenueByDay(
      Object.entries(revenueMap).map(([date, usd]) => ({
        date: format(new Date(date), 'MMM dd'),
        usd,
      })),
    );

    // Invoices by currency
    const currencyMap: Record<string, { count: number; usd: number }> = {};
    invoices.forEach((inv) => {
      if (!currencyMap[inv.currency]) {
        currencyMap[inv.currency] = { count: 0, usd: 0 };
      }
      currencyMap[inv.currency].count += 1;
      if (inv.status === 'paid' || inv.status === 'confirmed') {
        const usdPrice = usdMap[inv.currency.toLowerCase()] || 0;
        currencyMap[inv.currency].usd += inv.amount * usdPrice;
      }
    });

    setInvoicesByCurrency(
      Object.entries(currencyMap)
        .map(([currency, data]) => ({ currency, ...data }))
        .sort((a, b) => b.usd - a.usd),
    );

    // Invoices by status
    const statusMap: Record<string, number> = {};
    invoices.forEach((inv) => {
      statusMap[inv.status] = (statusMap[inv.status] || 0) + 1;
    });

    setInvoicesByStatus(
      Object.entries(statusMap).map(([status, count]) => ({ status, count })),
    );
  }, [invoices, usdMap]);

  const COLORS = ['#b1ff0a', '#225aeb', '#a54df1', '#ff6b6b', '#ffd93d', '#6bcf7f'];

  if (loading) {
    return embedded ? (
      <div className="text-gray-700">Loading analytics...</div>
    ) : (
      <div className="min-h-screen bg-[#1a1a1a] flex items-center justify-center">
        <div className="text-white">Loading analytics...</div>
      </div>
    );
  }

  const content = (
    <>
      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-[#f5f5f5] rounded-3xl p-6">
            <div className="flex items-center gap-3 mb-2">
              <DollarSign className="w-5 h-5 text-gray-600" />
              <span className="text-sm text-gray-600">Total Revenue</span>
            </div>
            <div className="text-3xl font-semibold">${totalRevenue.toFixed(2)}</div>
            <div className="text-xs text-gray-500 mt-1">USD equivalent</div>
          </div>

          <div className="bg-[#f5f5f5] rounded-3xl p-6">
            <div className="flex items-center gap-3 mb-2">
              <CreditCard className="w-5 h-5 text-gray-600" />
              <span className="text-sm text-gray-600">Total Invoices</span>
            </div>
            <div className="text-3xl font-semibold">{totalInvoices}</div>
            <div className="text-xs text-gray-500 mt-1">All time</div>
          </div>

          <div className="bg-[#f5f5f5] rounded-3xl p-6">
            <div className="flex items-center gap-3 mb-2">
              <Activity className="w-5 h-5 text-gray-600" />
              <span className="text-sm text-gray-600">Paid Invoices</span>
            </div>
            <div className="text-3xl font-semibold">{paidInvoices}</div>
            <div className="text-xs text-gray-500 mt-1">Confirmed payments</div>
          </div>

          <div className="bg-[#f5f5f5] rounded-3xl p-6">
            <div className="flex items-center gap-3 mb-2">
              <TrendingUp className="w-5 h-5 text-gray-600" />
              <span className="text-sm text-gray-600">Conversion Rate</span>
            </div>
            <div className="text-3xl font-semibold">{conversionRate.toFixed(1)}%</div>
            <div className="text-xs text-gray-500 mt-1">Paid vs total</div>
          </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Revenue Over Time */}
          <div className="bg-[#f5f5f5] rounded-3xl p-6">
            <h2 className="text-xl mb-4">Revenue Over Time (Last 30 Days)</h2>
            {revenueByDay.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={revenueByDay}>
                  <defs>
                    <linearGradient id="colorUsd" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#b1ff0a" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#b1ff0a" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Area type="monotone" dataKey="usd" stroke="#b1ff0a" fillOpacity={1} fill="url(#colorUsd)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-gray-500">
                No revenue data yet
              </div>
            )}
          </div>

          {/* Invoices by Currency */}
          <div className="bg-[#f5f5f5] rounded-3xl p-6">
            <h2 className="text-xl mb-4">Revenue by Currency</h2>
            {invoicesByCurrency.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={invoicesByCurrency}>
                  <XAxis dataKey="currency" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="usd" fill="#225aeb" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-gray-500">
                No currency data yet
              </div>
            )}
          </div>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Invoices by Status */}
          <div className="bg-[#f5f5f5] rounded-3xl p-6">
            <h2 className="text-xl mb-4">Invoices by Status</h2>
            {invoicesByStatus.length > 0 ? (
              <div className="flex items-center justify-center">
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={invoicesByStatus}
                      dataKey="count"
                      nameKey="status"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={(entry) => `${entry.status}: ${entry.count}`}
                    >
                      {invoicesByStatus.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-gray-500">
                No status data yet
              </div>
            )}
          </div>

          {/* Currency Breakdown Table */}
          <div className="bg-[#f5f5f5] rounded-3xl p-6">
            <h2 className="text-xl mb-4">Currency Breakdown</h2>
            {invoicesByCurrency.length > 0 ? (
              <div className="space-y-3">
                {invoicesByCurrency.map((item) => (
                  <div key={item.currency} className="flex items-center justify-between p-3 bg-white rounded-xl">
                    <div>
                      <div className="font-medium">{item.currency}</div>
                      <div className="text-sm text-gray-500">{item.count} invoices</div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">${item.usd.toFixed(2)}</div>
                      <div className="text-xs text-gray-500">USD</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-gray-500">
                No currency data yet
              </div>
            )}
          </div>
      </div>
    </>
  );

  if (embedded) {
    return <div className="space-y-6">{content}</div>;
  }

  return (
    <div className="min-h-screen bg-[#1a1a1a] p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3 cursor-pointer" onClick={onNavigateHome}>
            <BarChart3 className="w-8 h-8 text-white" />
            <h1 className="text-3xl text-white font-semibold">Analytics</h1>
          </div>
          <button
            onClick={onLogout}
            className="px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors"
          >
            Logout
          </button>
        </div>
        {content}
      </div>
    </div>
  );
}

