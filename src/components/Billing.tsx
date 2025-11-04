import React, { useEffect, useMemo, useState } from 'react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { supabase } from '../lib/supabaseClient';
import { Check, Crown, ArrowUpRight, Zap, TrendingUp } from 'lucide-react';

type MerchantRow = {
  id: string;
  plan_tier: string | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
};

export function Billing() {
  const [merchant, setMerchant] = useState<MerchantRow | null>(null);
  const [gmvCents, setGmvCents] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: user } = await supabase.auth.getUser();
      const id = user.user?.id;
      if (!id) {
        setLoading(false);
        return;
      }
      const { data: m } = await supabase
        .from('merchants')
        .select('id, plan_tier, trial_ends_at, current_period_end')
        .eq('id', id)
        .maybeSingle();
      setMerchant(m as any);

      const now = new Date();
      const firstOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const yyyy = firstOfMonth.getUTCFullYear();
      const mm = String(firstOfMonth.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(firstOfMonth.getUTCDate()).padStart(2, '0');
      const monthStr = `${yyyy}-${mm}-${dd}`;
      const { data: u } = await supabase
        .from('merchant_usage_monthly')
        .select('gmv_cents')
        .eq('merchant_id', id)
        .eq('month', monthStr)
        .maybeSingle();
      setGmvCents(Number((u as any)?.gmv_cents || 0));
      setLoading(false);
    })();
  }, []);

  const plan = (merchant?.plan_tier || 'trial') as 'trial' | 'basic_50' | 'pro_100' | 'past_due' | 'canceled' | string;
  const gmvProgress = Math.min(100, Math.round((gmvCents / 1_000_000) * 100));
  const gmvUsd = (gmvCents / 100).toFixed(2);

  async function openPortal() {
    try {
      setStatus('Opening billing portal…');
      const { data: user } = await supabase.auth.getUser();
      const id = user.user?.id;
      if (!id) return;
      const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL as string;
      const projectRef = new URL(supabaseUrl).host.split('.')[0];
      const res = await fetch(`https://${projectRef}.functions.supabase.co/billing-portal`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ merchant_id: id, return_url: window.location.origin }),
      });
      const json = await res.json();
      if (json?.url) window.location.assign(json.url);
      setStatus('');
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Failed to open portal');
    }
  }

  async function startSubscription(tier: 'basic' | 'pro' = 'basic') {
    try {
      setStatus('Creating subscription…');
      const { data: user } = await supabase.auth.getUser();
      const id = user.user?.id;
      const email = user.user?.email || '';
      if (!id) return;
      const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL as string;
      const projectRef = new URL(supabaseUrl).host.split('.')[0];
      const res = await fetch(`https://${projectRef}.functions.supabase.co/create-subscription`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ merchant_id: id, email, plan: tier }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Subscription failed');
      setStatus('Subscription created');
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Subscription error');
    }
  }

  if (loading) {
    return (
      <div className="bg-[#f5f5f5] rounded-3xl p-8">Loading…</div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header card */}
      <div className="bg-[#f5f5f5] rounded-3xl p-8 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-9 h-9 rounded-xl bg-black text-white flex items-center justify-center"><Crown className="w-5 h-5" /></div>
            <h2 className="text-xl font-semibold">Billing & Plan</h2>
          </div>
          <div className="text-sm text-gray-600">
            {plan === 'trial' && merchant?.trial_ends_at ? (
              <>Trial ends {new Date(merchant.trial_ends_at).toLocaleString()}</>
            ) : (
              <>Manage your subscription and monitor usage</>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge className={
            plan === 'pro_100' ? 'bg-[#b1ff0a] text-black' :
            plan === 'basic_50' ? 'bg-[#225aeb] text-white' :
            plan === 'trial' ? 'bg-[#a54df1] text-white' : 'bg-gray-500'
          }>
            {plan}
          </Badge>
          <Button variant="outline" onClick={openPortal}>
            Manage Billing <ArrowUpRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </div>

      {/* Usage + Quick actions */}
      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 bg-[#f5f5f5] rounded-3xl p-8">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-gray-600">Monthly GMV</div>
            <div className="flex items-center gap-2 text-xs text-gray-500"><TrendingUp className="w-4 h-4" /> ${gmvUsd}</div>
          </div>
          <div className="w-full h-4 bg-white rounded-full">
            <div className="h-4 rounded-full bg-black" style={{ width: `${gmvProgress}%` }} />
          </div>
          <div className="text-xs text-gray-500 mt-2">{gmvProgress}% to $10,000 threshold</div>
        </div>
        <div className="bg-[#f5f5f5] rounded-3xl p-8">
          <div className="text-sm text-gray-600 mb-3">Quick actions</div>
          <div className="space-y-3">
            {(plan === 'trial' || plan === 'basic_50' || plan === 'past_due' || plan === 'canceled') && (
              <Button className="w-full bg-black text-white hover:bg-gray-800" onClick={() => startSubscription('basic')}>
                Start/Refresh Basic ($50)
              </Button>
            )}
            <Button className="w-full bg-[#b1ff0a] text-black hover:bg-[#a0ef00]" onClick={() => startSubscription('pro')}>
              Upgrade to Pro ($100)
            </Button>
            <Button className="w-full" variant="outline" onClick={openPortal}>
              Manage Billing
            </Button>
          </div>
          {status && <div className="mt-4 text-xs text-gray-600">{status}</div>}
        </div>
      </div>

      {/* Plan comparison */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-[#f5f5f5] rounded-3xl p-8">
          <div className="flex items-center justify-between mb-2">
            <div className="text-lg font-semibold">Basic</div>
            <Badge className="bg-[#225aeb] text-white">$50/mo</Badge>
          </div>
          <ul className="space-y-3 text-sm text-gray-700">
            {[
              'First month free',
              'Accept crypto on supported chains',
              'Dashboard & analytics',
              'Email support',
            ].map((t) => (
              <li key={t} className="flex items-center gap-2"><Check className="w-4 h-4" /> {t}</li>
            ))}
          </ul>
        </div>
        <div className="bg-[#b1ff0a] rounded-3xl p-8 relative overflow-hidden">
          <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/40 rounded-full blur-2xl" />
          <div className="flex items-center justify-between mb-2">
            <div className="text-lg font-semibold">Pro</div>
            <Badge className="bg-black text-white">$100/mo</Badge>
          </div>
          <ul className="space-y-3 text-sm text-black">
            {[
              'No $10k cap (never blocked)',
              'Priority support',
              'Advanced analytics',
              'Billing portal & invoicing tools',
            ].map((t) => (
              <li key={t} className="flex items-center gap-2"><Check className="w-4 h-4" /> {t}</li>
            ))}
          </ul>
          <Button className="mt-6 bg-black text-white hover:bg-gray-800" onClick={() => startSubscription('pro')}>
            Upgrade to Pro <ArrowUpRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}



