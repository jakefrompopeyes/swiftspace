-- Subscription billing schema for Stripe-based plans
-- merchants: subscription state per merchant (user)
create table if not exists public.merchants (
  id uuid primary key,
  stripe_customer_id text,
  stripe_subscription_id text,
  plan_tier text not null default 'trial', -- trial | basic_50 | pro_100 | past_due | canceled
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists merchants_plan_tier_idx on public.merchants(plan_tier);

-- Monthly usage aggregation (GMV in USD cents)
create table if not exists public.merchant_usage_monthly (
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  month date not null, -- first day of month
  gmv_cents bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint merchant_usage_monthly_pk primary key (merchant_id, month)
);

create index if not exists merchant_usage_monthly_merchant_idx on public.merchant_usage_monthly(merchant_id);

-- Payments ledger (append-only)
create table if not exists public.payments_ledger (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  invoice_id uuid,
  chain text,
  tx_id text,
  currency text,
  amount_crypto numeric,
  amount_usd_cents bigint,
  created_at timestamptz not null default now()
);

create index if not exists payments_ledger_merchant_created_idx on public.payments_ledger(merchant_id, created_at desc);

-- Updated at triggers (optional, requires pgcrypto and plpgsql)
do $$ begin
  create extension if not exists pgcrypto;
exception when others then null; end $$;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

drop trigger if exists merchants_set_updated_at on public.merchants;
create trigger merchants_set_updated_at before update on public.merchants
for each row execute function public.set_updated_at();

drop trigger if exists merchant_usage_set_updated_at on public.merchant_usage_monthly;
create trigger merchant_usage_set_updated_at before update on public.merchant_usage_monthly
for each row execute function public.set_updated_at();



