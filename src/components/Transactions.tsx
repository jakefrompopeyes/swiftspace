import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { getUsdPrices } from '../lib/prices';
import { format } from 'date-fns';
import { BarChart3, ArrowRight, Copy } from 'lucide-react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';

interface Invoice {
  id: string;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
  network: string | null;
  reference: string | null;
  customer_email: string | null;
  public_token: string;
}

interface TransactionsProps {
  onNavigateHome?: () => void;
  onLogout?: () => void;
  embedded?: boolean;
}

export function Transactions({ onNavigateHome, onLogout, embedded = false }: TransactionsProps) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [usdMap, setUsdMap] = useState<Record<string, number>>({});
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const PAGE_SIZE = 20;

  async function loadInvoices(pageNum: number) {
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) {
      setLoading(false);
      return;
    }

    const from = pageNum * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data, error } = await supabase
      .from('invoices')
      .select('id,amount,currency,status,created_at,network,reference,customer_email,public_token')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (data) {
      if (pageNum === 0) {
        setInvoices(data as Invoice[]);
      } else {
        setInvoices((prev) => [...prev, ...(data as Invoice[])]);
      }
      if (data.length < PAGE_SIZE) {
        setHasMore(false);
      }
    }
    if (error) {
      console.error('Error fetching invoices:', error);
      setHasMore(false);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadInvoices(0);
  }, []);

  useEffect(() => {
    if (page > 0) {
      loadInvoices(page);
    }
  }, [page]);

  useEffect(() => {
    const symbols = Array.from(new Set(invoices.map((i) => i.currency.toUpperCase())));
    if (symbols.length === 0) return;

    let mounted = true;
    async function run() {
      const prices = await getUsdPrices(symbols);
      if (mounted) setUsdMap(prices);
    }
    run();
    const id = setInterval(run, 60_000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [invoices.map((i) => i.currency).join(',')]);

  const table = (
    <div className="bg-[#f5f5f5] rounded-3xl p-6">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-300">
                  <th className="p-4 text-sm text-gray-600">Date</th>
                  <th className="p-4 text-sm text-gray-600">Currency</th>
                  <th className="p-4 text-sm text-gray-600">Amount</th>
                  <th className="p-4 text-sm text-gray-600">Amount (USD)</th>
                  <th className="p-4 text-sm text-gray-600">Status</th>
                  <th className="p-4 text-sm text-gray-600">Reference</th>
                  <th className="p-4 text-sm text-gray-600">Customer</th>
                  <th className="p-4 text-sm text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => {
                  const usdPrice = usdMap[inv.currency.toLowerCase()];
                  const usdAmount = usdPrice ? (inv.amount * usdPrice) : null;
                  const invoiceLink = `${window.location.origin}/?t=${inv.public_token}`;

                  return (
                    <tr key={inv.id} className="border-b border-gray-200 hover:bg-gray-100">
                      <td className="p-4 text-sm">{format(new Date(inv.created_at), 'MMM dd, yyyy')}</td>
                      <td className="p-4 text-sm">{inv.currency}</td>
                      <td className="p-4 text-sm">{inv.amount}</td>
                      <td className="p-4 text-sm">{usdAmount ? `$${usdAmount.toFixed(2)}` : '...'}</td>
                      <td className="p-4 text-sm">
                        <Badge
                          className={`${
                            inv.status === 'pending'
                              ? 'bg-yellow-500/20 text-yellow-700'
                              : inv.status === 'paid'
                              ? 'bg-green-500/20 text-green-700'
                              : inv.status === 'confirmed'
                              ? 'bg-blue-500/20 text-blue-700'
                              : 'bg-gray-500/20 text-gray-700'
                          } px-2 py-1 rounded-full text-xs`}
                        >
                          {inv.status}
                        </Badge>
                      </td>
                      <td className="p-4 text-sm">{inv.reference || '-'}</td>
                      <td className="p-4 text-sm">{inv.customer_email || '-'}</td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigator.clipboard.writeText(invoiceLink)}
                            title="Copy invoice link"
                          >
                            <Copy className="w-4 h-4" />
                          </Button>
                          <a href={invoiceLink} target="_blank" rel="noopener noreferrer" title="View public invoice">
                            <ArrowRight className="w-4 h-4" />
                          </a>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {invoices.length === 0 && !loading && (
            <div className="text-center py-8 text-gray-500">No transactions found.</div>
          )}
          
          {hasMore && (
            <div className="mt-6 text-center">
              <Button onClick={() => setPage(p => p + 1)} disabled={loading}>
                {loading ? 'Loading...' : 'Load More'}
              </Button>
            </div>
          )}
    </div>
  );

  if (embedded) {
    return table;
  }

  return (
    <div className="min-h-screen bg-[#1a1a1a] p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3 cursor-pointer" onClick={onNavigateHome}>
            <BarChart3 className="w-8 h-8 text-white" />
            <h1 className="text-3xl text-white font-semibold">Transactions</h1>
          </div>
          <button
            onClick={onLogout}
            className="px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors"
          >
            Logout
          </button>
        </div>
        {table}
      </div>
    </div>
  );
}
