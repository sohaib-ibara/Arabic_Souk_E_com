-- ---------------------------------------------------------------------------
-- Demand capture (checkout intent log)
--
-- Records EVERY checkout attempt — the shopper's contact details and the items
-- they wanted — even when those items are out of stock. During the zero-stock
-- pre-launch this turns the "sorry, out of stock" moment into useful data: you
-- can see who wants which product and how strong demand is per item.
--
-- Written server-side ONLY, with the service-role key (see the checkout route).
-- RLS is enabled with NO policies, so the public anon key can neither read nor
-- write these tables — customer PII is never exposed to the browser.
--
-- To read the demand afterwards, run in the Supabase SQL editor:
--     select * from public.demand_by_product;              -- ranked by demand
--     select * from public.demand_signals order by created_at desc;  -- raw log
-- ---------------------------------------------------------------------------

create table if not exists public.demand_signals (
  id               uuid primary key default gen_random_uuid(),
  full_name        text,
  email            text,
  phone            text,
  shipping_address jsonb,
  subtotal         numeric(10,3) not null default 0,
  currency         text not null default 'BHD',
  -- false when at least one wanted item was unavailable (the usual case now).
  all_in_stock     boolean not null default false,
  created_at       timestamptz not null default now()
);

create table if not exists public.demand_signal_items (
  id           uuid primary key default gen_random_uuid(),
  signal_id    uuid not null references public.demand_signals(id) on delete cascade,
  -- The catalogue id is source-specific (uuid in Supabase, "noon-…" in the demo
  -- catalogue), so it's kept as free text for reference only — slug is the
  -- stable key used for analytics.
  product_id   text,
  product_slug text,
  product_name text not null,
  unit_price   numeric(10,3) not null default 0,
  quantity     integer not null check (quantity > 0),
  created_at   timestamptz not null default now()
);

create index if not exists demand_signal_items_signal_idx on public.demand_signal_items (signal_id);
create index if not exists demand_signal_items_slug_idx   on public.demand_signal_items (product_slug);

-- RLS: enabled with NO policies → only the service role (which bypasses RLS,
-- used server-side in /api/checkout) can insert or read these rows.
alter table public.demand_signals      enable row level security;
alter table public.demand_signal_items enable row level security;

-- Analytics: how many distinct shoppers wanted each product and the total
-- quantity requested, most-wanted first. security_invoker makes the view honour
-- the underlying tables' RLS, so the anon key still sees nothing through it.
create or replace view public.demand_by_product
  with (security_invoker = true) as
select
  i.product_slug              as slug,
  max(i.product_name)         as name,
  count(distinct i.signal_id) as shoppers,
  sum(i.quantity)             as total_quantity,
  max(s.created_at)           as last_requested_at
from public.demand_signal_items i
join public.demand_signals s on s.id = i.signal_id
group by i.product_slug
order by total_quantity desc;
