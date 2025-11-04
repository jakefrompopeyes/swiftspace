import React, { useEffect, useMemo, useState } from 'react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { supabase } from '../lib/supabaseClient';

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
      <div className="bg-[#f5f5f5] rounded-3xl p-6">Loading…</div>
    );
  }

  return (
    <div className="bg-[#f5f5f5] rounded-3xl p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">Billing</h2>
        <Badge className={
          plan === 'pro_100' ? 'bg-[#b1ff0a] text-black' :
          plan === 'basic_50' ? 'bg-[#225aeb] text-white' :
          plan === 'trial' ? 'bg-[#a54df1] text-white' : 'bg-gray-500'
        }>
          {plan}
        </Badge>
      </div>

      {plan === 'trial' && merchant?.trial_ends_at && (
        <div className="mb-4 text-sm text-gray-600">Trial ends {new Date(merchant.trial_ends_at).toLocaleString()}</div>
      )}

      <div className="mb-6">
        <div className="text-sm text-gray-600 mb-1">Monthly GMV</div>
        <div className="text-2xl">${gmvUsd}</div>
        <div className="w-full h-3 bg-white rounded-full mt-3">
          <div className="h-3 rounded-full bg-black" style={{ width: `${gmvProgress}%` }} />
        </div>
        <div className="text-xs text-gray-500 mt-1">Progress to $10,000</div>
      </div>

      <div className="flex gap-3">
        {(plan === 'trial' || plan === 'basic_50' || plan === 'past_due' || plan === 'canceled') && (
          <Button className="bg-black text-white hover:bg-gray-800" onClick={() => startSubscription('basic')}>Start/Refresh Basic ($50)</Button>
        )}
        <Button className="bg-[#b1ff0a] text-black hover:bg-[#a0ef00]" onClick={() => startSubscription('pro')}>Upgrade to Pro ($100)</Button>
        <Button variant="outline" onClick={openPortal}>Manage Billing</Button>
      </div>

      {status && <div className="mt-4 text-sm text-gray-600">{status}</div>}
    </div>
  );
}


