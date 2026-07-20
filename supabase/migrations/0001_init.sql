-- ============================================================================
-- Arabic Souk beauty store — initial schema
-- Run this in the Supabase SQL editor, or `supabase db push` with the CLI.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------- Catalogue ----------
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  description text,
  image_url   text,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.brands (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text not null unique,
  logo_url   text,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  slug              text not null unique,
  description       text,
  short_description text,
  price             numeric(10,3) not null check (price >= 0),   -- BHD uses 3 decimals (fils)
  compare_at_price  numeric(10,3) check (compare_at_price >= 0),
  currency          text not null default 'BHD',
  images            jsonb not null default '[]'::jsonb,
  category_id       uuid references public.categories(id) on delete set null,
  brand_id          uuid references public.brands(id) on delete set null,
  rating            numeric(2,1) not null default 0 check (rating >= 0 and rating <= 5),
  review_count      integer not null default 0,
  stock_quantity    integer not null default 0 check (stock_quantity >= 0),  -- real inventory
  in_stock          boolean not null default true,   -- merchandising flag (listed for sale)
  is_featured       boolean not null default false,
  is_new            boolean not null default false,
  tags              text[] not null default '{}',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists products_category_idx on public.products (category_id);
create index if not exists products_brand_idx    on public.products (brand_id);
create index if not exists products_featured_idx on public.products (is_featured);
create index if not exists products_new_idx       on public.products (is_new);

-- Keep updated_at current on edits.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

-- ---------- Orders (ready for the next phase; unused during the demo) ----------
create table if not exists public.orders (
  id               uuid primary key default gen_random_uuid(),
  order_number     text not null unique
                     default ('AS-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  status           text not null default 'pending'
                     check (status in ('pending', 'paid', 'fulfilled', 'cancelled')),
  email            text,
  full_name        text,
  phone            text,
  shipping_address jsonb,
  subtotal         numeric(10,3) not null default 0,
  shipping_fee     numeric(10,3) not null default 0,
  total            numeric(10,3) not null default 0,
  currency         text not null default 'BHD',
  created_at       timestamptz not null default now()
);

create table if not exists public.order_items (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  name       text not null,
  unit_price numeric(10,3) not null,
  quantity   integer not null check (quantity > 0),
  created_at timestamptz not null default now()
);

create index if not exists order_items_order_idx on public.order_items (order_id);

-- ---------- Row Level Security ----------
-- Public storefront: anyone may READ the catalogue with the anon key.
-- Writes (and any order access) require the service role, which bypasses RLS.
alter table public.categories  enable row level security;
alter table public.brands      enable row level security;
alter table public.products    enable row level security;
alter table public.orders      enable row level security;
alter table public.order_items enable row level security;

drop policy if exists "public read categories" on public.categories;
create policy "public read categories" on public.categories
  for select using (true);

drop policy if exists "public read brands" on public.brands;
create policy "public read brands" on public.brands
  for select using (true);

drop policy if exists "public read products" on public.products;
create policy "public read products" on public.products
  for select using (true);

-- orders / order_items intentionally have NO public policies:
-- with RLS enabled and no policy, the anon key cannot read or write them.
