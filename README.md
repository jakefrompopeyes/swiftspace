
  # Rebuild Crypto Payment Page

  This is a code bundle for Rebuild Crypto Payment Page. The original project is available at https://www.figma.com/design/GwgkIXF4AyFJ6gWYcUUZLG/Rebuild-Crypto-Payment-Page.

  ## Running the code

  Run `npm i` to install the dependencies.

  Run `npm run dev` to start the development server.

  ## Supabase setup (MVP backend)

  1) Create a Supabase project and get the URL and anon key.

  2) Add an `.env` file at project root:

  ```
  VITE_SUPABASE_URL=your-url
  VITE_SUPABASE_ANON_KEY=your-anon-key
  ```

  3) Run this SQL in Supabase SQL Editor:

  ```
  -- merchants are Supabase auth users; wallets and invoices are tied by user id
  create table if not exists wallets (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    currency text not null,
    address text not null,
    created_at timestamptz not null default now(),
    unique(user_id, currency)
  );

  create table if not exists invoices (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    amount numeric not null,
    currency text not null,
    to_address text not null,
    reference text,
    status text not null default 'draft' check (status in ('draft','pending','paid','confirmed','expired')),
    network text,
    confirmations_required int default 1,
    detected_tx_hash text,
    detected_at timestamptz,
    confirmed_at timestamptz,
    created_at timestamptz not null default now(),
    expires_at timestamptz
  );

  -- RLS
  alter table wallets enable row level security;
  alter table invoices enable row level security;

  create policy "Wallets are readable/writable by owner"
  on wallets for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

  create policy "Invoices are readable/writable by owner"
  on invoices for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
  ```

  ### Payments table (for webhooks)

  ```
  create table if not exists payments (
    id uuid primary key default gen_random_uuid(),
    invoice_id uuid not null references invoices(id) on delete cascade,
    chain text,
    tx_hash text unique,
    amount numeric,
    confirmations int default 0,
    received_at timestamptz default now()
  );

  alter table payments enable row level security;
  create policy "Payments readable by owner"
  on payments for select
  to authenticated
  using (exists(select 1 from invoices i where i.id = payments.invoice_id and i.user_id = auth.uid()));
  ```

  ## Edge Function: evm-notify (EVM webhooks)

  Files: `supabase/functions/evm-notify/index.ts`

  Deploy via Supabase CLI (install first):

  ```
  supabase functions deploy evm-notify --no-verify-jwt
  # set secrets (use these key names)
  # PROJECT_URL=https://<your-ref>.supabase.co
  # SERVICE_ROLE_KEY=<service-role-key>
  # WEBHOOK_SECRET=<your-shared-secret>
  # Example:
  # supabase secrets set PROJECT_URL=... SERVICE_ROLE_KEY=... WEBHOOK_SECRET=...
  ```

  Configure your provider (Alchemy/QuickNode) webhook URL:

  ```
  https://<your-project-ref>.functions.supabase.co/evm-notify
  Header: x-webhook-secret: your-shared-secret
  ```

  ## Edge Function: confirmations (EVM confirmations worker)
  ## Edge Function: invoice-public (public invoice fetch)

  Files: `supabase/functions/invoice-public/index.ts`

  SQL (once):

  ```
  alter table invoices add column if not exists public_token uuid default gen_random_uuid();
  create index if not exists invoices_public_token_idx on invoices(public_token);
  notify pgrst, 'reload schema';
  ```

  Deploy:

  ```
  supabase functions deploy invoice-public --no-verify-jwt
  ```

  Files: `supabase/functions/confirmations/index.ts`

  Deploy and schedule:

  ```
  # Set RPC and reuse existing secrets
  supabase secrets set ALCHEMY_HTTP=https://eth-mainnet.g.alchemy.com/v2/<key>
  # or QUICKNODE_HTTP=https://<endpoint>

  supabase functions deploy confirmations --no-verify-jwt

  # Schedule every minute (Supabase Cron in Dashboard → Edge Functions → Schedules)
  # e.g., */1 * * * *  -> confirmations
  ```

  4) Install deps and run the app:

  ```
  npm install
  npm run dev
  ```

  5) Next steps: wire Supabase Auth UI, save wallets/invoices via Supabase client.
  
## Buy Button (Create-and-Redirect)

This feature lets you drop a simple "Buy with Crypto" link/button on any website. When clicked, it creates an invoice for a specific merchant and currency, then redirects the buyer to the public invoice page.

### Deploy the Edge Function

Files: `supabase/functions/buy/index.ts`

1) Set required secrets (reuse existing values):

```
supabase secrets set PROJECT_URL=https://<your-ref>.supabase.co SERVICE_ROLE_KEY=<service-role-key>
```

2) Deploy the function:

```
supabase functions deploy buy --no-verify-jwt
```

### HTML Snippets (example)

```
<a href="https://<your-ref>.functions.supabase.co/buy?m=<merchant_user_id>&a=19.99&c=ETH&r=order-1234" target="_blank" rel="noopener">Buy with Crypto</a>
```

```
<button onclick="window.location.href='https://<your-ref>.functions.supabase.co/buy?m=<merchant_user_id>&a=19.99&c=ETH&r=order-1234'">Buy with Crypto</button>
```

Query params:
- m: Supabase `auth.users.id` (merchant id)
- a: amount in crypto (e.g., 0.05 for BTC, 20 for USDT)
- c: currency symbol (BTC, ETH, USDT, SOL, MATIC, BNB, LTC)
- r: reference (optional)

The function will:
- Look up the merchant wallet for that currency in `wallets`.
- Insert a pending `invoices` row.
- Issue a 302 redirect to the public invoice path `/?t=<public_token>`.

If you're hosting the web app at a custom domain, ensure that path `/?t=...` serves your app so the `InvoicePage` can load the invoice.

### Using the in-app Generator

Inside the app, go to Dashboard → Buy Button. Configure amount, currency, and reference, and copy the generated snippet link or button HTML.  