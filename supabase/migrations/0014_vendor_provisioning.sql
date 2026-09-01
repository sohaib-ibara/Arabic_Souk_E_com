-- ============================================================================
-- 0014 — Vendors, provisioning, and one currency at the till
--
-- From the 1 Sep client call. Four requirements, and they interlock:
--
--   1. VENDORS ARE A THING. Not a text label on a product but a row that can be
--      switched on and off, priced, and given a way of arriving. Some vendors
--      we scrape; some will hand us an API. The catalogue must not care which.
--
--   2. PROVISIONING AT THREE LEVELS. The whole vendor, one category from that
--      vendor, or one product. All three combine.
--
--   3. THE LAYOUT MUST NOT MOVE. Turning Cult Beauty on inside "skin care"
--      adds its products to the same grid noon's already occupy. Turning noon
--      off in that category leaves Cult's behind, in the same place, under the
--      same heading. Categories are not per-vendor and never disappear.
--
--   4. ONE CURRENCY ON THE SHELF. Vendors quote SAR, GBP, whatever. Shoppers
--      see BHD, rounded to a price that looks like a price.
--
-- ---------------------------------------------------------------------------
-- THE ONE DESIGN DECISION WORTH READING
--
-- The storefront must NOT be able to see which vendor a product came from.
-- That is the sourcing list, and 0007/0008/0010 went to some trouble to keep it
-- off the anon grant. But requirement 2 means visibility now DEPENDS on the
-- vendor, and requirement 3 means it has to be resolved per product.
--
-- So the answer is not "filter by vendor at read time" — that would need
-- `source` granted to anon, undoing all of it. Instead the three switches are
-- resolved server-side into ONE public boolean, `products.is_listed`, kept
-- current by trigger. The storefront filters on that and learns nothing else.
-- Provisioning changes become an UPDATE, not a re-import.
--
-- `is_published` keeps its meaning exactly: the per-product switch, set by a
-- human. `is_listed` is the computed answer to "does a shopper see this",
-- which is is_published AND vendor-on AND category-on-for-that-vendor.
-- ============================================================================

-- HOW TO RUN: paste this whole file into the Supabase SQL editor and Run.
-- Requires 0010 (products.source) and 0012 (products.is_published).

begin;

do $$
begin
  if to_regclass('public.products') is null then
    raise exception 'Migration 0014 requires the catalogue. Run 0001_init.sql first.';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'products'
                    and column_name = 'source') then
    raise exception 'Migration 0014 requires products.source. Run 0010_product_source.sql first.';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'products'
                    and column_name = 'is_published') then
    raise exception 'Migration 0014 requires products.is_published. Run 0012_visibility_and_lead_time.sql first.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Vendors
-- ---------------------------------------------------------------------------

create table if not exists public.vendors (
  id           uuid primary key default gen_random_uuid(),
  -- Matches products.source and the adapter key in scripts/import/sites/.
  -- That is what lets an existing catalogue adopt a vendor row with no
  -- backfill: the join key is already on every product.
  key          text not null unique,
  name         text not null,

  -- How the data arrives. 'scrape' runs an adapter; 'api' will call the
  -- vendor's own endpoint; 'manual' is a human with a spreadsheet. Nothing
  -- downstream branches on this yet — it is here so that adding an API vendor
  -- is a row, not a schema change.
  kind         text not null default 'scrape'
                 check (kind in ('scrape', 'api', 'manual')),

  -- Switch 1 of 3. Off by default: a vendor that has just been added has not
  -- been priced or reviewed, and must not reach the shop merely because
  -- someone created the row.
  is_enabled   boolean not null default false,

  -- What this vendor quotes in, and what one of those is worth in dinar.
  -- The rate is stored rather than fetched, because a price that moves on its
  -- own is a price nobody can reconcile against an invoice.
  currency        text not null default 'BHD',
  fx_rate_to_bhd  numeric(14,6) not null default 1 check (fx_rate_to_bhd > 0),

  -- Applied in this order: source price -> x rate -> +markup% -> +surcharge.
  -- The surcharge is in BHD, for per-item landed cost (shipping, duty) that
  -- does not scale with the item's price.
  markup_percent  numeric(6,2) not null default 0 check (markup_percent >= -100),
  surcharge_bhd   numeric(10,3) not null default 0 check (surcharge_bhd >= 0),

  -- Requirement 4's second half. On by default because the client asked for it
  -- everywhere; per-vendor so a future vendor with fixed RRPs can opt out.
  round_prices    boolean not null default true,

  notes        text,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.vendors is
  'Suppliers, with their provisioning and pricing rules. Staff-only: never granted to anon.';
comment on column public.vendors.key is
  'Joins to products.source. Same string as the adapter key in scripts/import/sites/.';

drop trigger if exists vendors_set_updated_at on public.vendors;
create trigger vendors_set_updated_at
  before update on public.vendors
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. Switch 2 of 3 — a category, for one vendor
--
-- Absence means enabled. That is deliberate: a new category, or a vendor's
-- first product in an existing one, should follow the vendor's own switch
-- rather than silently vanish until someone notices a row is missing. Only an
-- explicit row with is_enabled = false hides anything.
-- ---------------------------------------------------------------------------

create table if not exists public.vendor_categories (
  vendor_id   uuid not null references public.vendors(id)    on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  is_enabled  boolean not null default true,
  updated_at  timestamptz not null default now(),
  primary key (vendor_id, category_id)
);

comment on table public.vendor_categories is
  'Per-vendor category switch. No row = enabled; only is_enabled = false hides.';

-- ---------------------------------------------------------------------------
-- 3. The resolved answer, and the supplier price it was built from
-- ---------------------------------------------------------------------------

alter table public.products
  -- PUBLIC. The only visibility column the storefront reads.
  add column if not exists is_listed boolean not null default true,
  -- STAFF-ONLY. What the vendor charges, in the vendor's currency, so a price
  -- can be recomputed when a rate or markup changes without re-scraping.
  add column if not exists source_price    numeric(12,4) check (source_price >= 0),
  add column if not exists source_currency text,
  -- STAFF-ONLY. Set on a price a human typed. Recalculation skips these, so a
  -- hand-negotiated price is never quietly overwritten by an FX change.
  add column if not exists price_locked    boolean not null default false;

comment on column public.products.is_listed is
  'Computed: is_published AND vendor enabled AND category enabled for that vendor. The storefront filter.';
comment on column public.products.source_price is
  'The vendor''s own price in their currency. Staff-only — this is cost data.';
comment on column public.products.price_locked is
  'A human set this price. Bulk recalculation leaves it alone.';

-- ---------------------------------------------------------------------------
-- 4. Pricing
--
-- The "attractive price" ladder, from the client's own examples:
--
--     6.38 -> 6.49     7.12 -> 7.19
--     6.52 -> 6.49     7.26 -> 7.29
--     6.63 -> 6.69     7.41 -> 7.49
--
-- Read together these say two things. Endings come from a fixed ladder
-- (.19 .29 .49 .69 .89 .99 — note .39 and .59 are absent, or 6.38 would have
-- become 6.39 and 6.63 would have become 6.59). And the move is UP to the next
-- rung, unless the price has only just passed one, which is why 6.52 falls
-- back to 6.49 rather than climbing to 6.69.
--
-- Rounding up by default is also the commercially safe direction: the error is
-- always in the shop's favour, never below landed cost.
--
-- The client's prose said ".49, .59, .69, .79, .89, .99" and "closest". Their
-- six worked examples contradict both — .59 appears in the list but 6.63 goes
-- to 6.69, and "closest" would send 6.38 to 6.39. The examples won, because
-- they are the specific thing they checked. Worth confirming on the next call.
-- ---------------------------------------------------------------------------

create or replace function public.attractive_price(amount numeric)
returns numeric
language sql
immutable
as $$
  with ladder as (
    -- The ladder repeats every 1.00, so the unit below, at, and above the
    -- amount is always enough to bracket it.
    select floor(amount) + d + e as rung
      from unnest(array[-1, 0, 1])                           as d,
           unnest(array[0.19, 0.29, 0.49, 0.69, 0.89, 0.99]) as e
  )
  select case
    -- 0 is how a vendor says "out of stock". It is not a price to prettify.
    when amount is null or amount <= 0 then amount
    when below.rung is not null and amount - below.rung <= 0.05 then below.rung
    else coalesce(above.rung, below.rung)
  end
  from (select max(rung) as rung from ladder where rung <= amount and rung > 0) as below,
       (select min(rung) as rung from ladder where rung >  amount)              as above;
$$;

comment on function public.attractive_price(numeric) is
  'Snap to the retail ladder .19/.29/.49/.69/.89/.99 — up, unless within 0.05 above a rung.';

create or replace function public.vendor_retail_price(
  p_amount    numeric,
  p_fx        numeric,
  p_markup    numeric,
  p_surcharge numeric,
  p_round     boolean
) returns numeric
language sql
immutable
as $$
  select case
    when p_amount is null then null
    when p_amount <= 0    then 0::numeric
    when p_round          then public.attractive_price(
                                round(p_amount * p_fx * (1 + p_markup / 100.0) + p_surcharge, 3))
    else                       round(p_amount * p_fx * (1 + p_markup / 100.0) + p_surcharge, 3)
  end;
$$;

comment on function public.vendor_retail_price(numeric,numeric,numeric,numeric,boolean) is
  'Vendor price -> BHD shelf price: rate, then markup, then per-item surcharge, then the ladder.';

-- ---------------------------------------------------------------------------
-- 4b. Repricing, as whole statements
--
-- The admin previews a change before applying it, so the same arithmetic runs
-- twice. Doing it here rather than in TypeScript means the preview cannot
-- drift from the write, and that repricing a vendor is one round trip instead
-- of one per product.
--
-- Two operations, deliberately separate:
--
--   reprice — recompute from what the vendor charges. Needs source_price.
--   round   — snap an existing BHD price onto the ladder, arithmetic untouched.
--
-- The 301 noon products already on the shop have a hand-corrected BHD price
-- and no source_price, so only the second one can reach them today. They
-- acquire a source_price on their next sync.
--
-- Both skip price_locked rows: a price a human negotiated is not a number for
-- an exchange rate to overwrite.
-- ---------------------------------------------------------------------------

create or replace function public.vendor_reprice_preview(p_vendor_id uuid)
returns table (
  id              uuid,
  name            text,
  source_price    numeric,
  source_currency text,
  old_price       numeric,
  new_price       numeric
)
language sql
stable
as $$
  select p.id,
         p.name,
         p.source_price,
         coalesce(p.source_currency, v.currency),
         p.price,
         public.vendor_retail_price(p.source_price, v.fx_rate_to_bhd,
                                    v.markup_percent, v.surcharge_bhd, v.round_prices)
    from public.products p
    join public.vendors  v on v.key = p.source
   where v.id = p_vendor_id
     and not p.price_locked
     and p.source_price is not null
     and public.vendor_retail_price(p.source_price, v.fx_rate_to_bhd,
                                    v.markup_percent, v.surcharge_bhd, v.round_prices)
         is distinct from p.price
   order by p.name;
$$;

create or replace function public.vendor_reprice_apply(p_vendor_id uuid)
returns integer
language plpgsql
as $$
declare
  n integer;
begin
  with updated as (
    update public.products p
       set price    = public.vendor_retail_price(p.source_price, v.fx_rate_to_bhd,
                                                 v.markup_percent, v.surcharge_bhd, v.round_prices),
           currency = 'BHD'
      from public.vendors v
     where v.id = p_vendor_id
       and v.key = p.source
       and not p.price_locked
       and p.source_price is not null
       and public.vendor_retail_price(p.source_price, v.fx_rate_to_bhd,
                                      v.markup_percent, v.surcharge_bhd, v.round_prices)
           is distinct from p.price
    returning 1
  )
  select count(*) into n from updated;
  return n;
end $$;

create or replace function public.vendor_round_preview(p_vendor_id uuid)
returns table (
  id        uuid,
  name      text,
  old_price numeric,
  new_price numeric
)
language sql
stable
as $$
  select p.id, p.name, p.price, public.attractive_price(p.price)
    from public.products p
    join public.vendors  v on v.key = p.source
   where v.id = p_vendor_id
     and not p.price_locked
     and p.price > 0
     and public.attractive_price(p.price) is distinct from p.price
   order by p.name;
$$;

create or replace function public.vendor_round_apply(p_vendor_id uuid)
returns integer
language plpgsql
as $$
declare
  n integer;
begin
  with updated as (
    update public.products p
       set price = public.attractive_price(p.price)
      from public.vendors v
     where v.id = p_vendor_id
       and v.key = p.source
       and not p.price_locked
       and p.price > 0
       and public.attractive_price(p.price) is distinct from p.price
    returning 1
  )
  select count(*) into n from updated;
  return n;
end $$;

/*
  How many rows each operation cannot touch, and why — so the admin screen can
  say "40 skipped" instead of quietly repricing fewer products than expected.
*/
create or replace function public.vendor_reprice_skipped(p_vendor_id uuid)
returns table (locked integer, missing_source_price integer)
language sql
stable
as $$
  select count(*) filter (where p.price_locked)::integer,
         count(*) filter (where not p.price_locked and p.source_price is null)::integer
    from public.products p
    join public.vendors v on v.key = p.source
   where v.id = p_vendor_id;
$$;

-- PostgREST grants EXECUTE on public functions to anon by default. These read
-- vendor pricing rules, which are the commercial core, so take that back. RLS
-- would return them no rows anyway; this makes the intent explicit rather than
-- relying on that.
revoke execute on function public.vendor_reprice_preview(uuid) from anon, authenticated;
revoke execute on function public.vendor_reprice_apply(uuid)   from anon, authenticated;
revoke execute on function public.vendor_round_preview(uuid)   from anon, authenticated;
revoke execute on function public.vendor_round_apply(uuid)     from anon, authenticated;
revoke execute on function public.vendor_reprice_skipped(uuid) from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Keeping is_listed true
--
-- Three writers can change the answer: the product, the vendor, and the
-- vendor/category pair. Each gets a trigger. None of them recurse: the refresh
-- triggers touch only `is_listed`, and the product trigger fires on
-- source / category_id / is_published.
-- ---------------------------------------------------------------------------

create or replace function public.compute_is_listed(
  p_source       text,
  p_category_id  uuid,
  p_is_published boolean
) returns boolean
language sql
stable
as $$
  select coalesce(p_is_published, false)
     -- A product with no vendor is hand-added stock: is_published governs it
     -- alone, and no vendor switch can take it off the shop.
     and (p_source is null or exists (
           select 1 from public.vendors v
            where v.key = p_source and v.is_enabled))
     and (p_source is null or p_category_id is null or not exists (
           select 1
             from public.vendor_categories vc
             join public.vendors v on v.id = vc.vendor_id
            where v.key = p_source
              and vc.category_id = p_category_id
              and not vc.is_enabled));
$$;

create or replace function public.products_set_is_listed()
returns trigger language plpgsql as $$
begin
  new.is_listed := public.compute_is_listed(new.source, new.category_id, new.is_published);
  return new;
end $$;

drop trigger if exists products_is_listed on public.products;
create trigger products_is_listed
  before insert or update of source, category_id, is_published on public.products
  for each row execute function public.products_set_is_listed();

create or replace function public.vendors_refresh_listing()
returns trigger language plpgsql as $$
begin
  update public.products p
     set is_listed = public.compute_is_listed(p.source, p.category_id, p.is_published)
   where p.source in (new.key, old.key);
  return null;
end $$;

drop trigger if exists vendors_refresh_listing on public.vendors;
create trigger vendors_refresh_listing
  after update of is_enabled, key on public.vendors
  for each row execute function public.vendors_refresh_listing();

create or replace function public.vendor_categories_refresh_listing()
returns trigger language plpgsql as $$
declare
  rec   record;
  v_key text;
begin
  -- NEW is unassigned on DELETE, so pick whichever row exists.
  if tg_op = 'DELETE' then rec := old; else rec := new; end if;

  select key into v_key from public.vendors where id = rec.vendor_id;
  if v_key is null then return null; end if;

  update public.products p
     set is_listed = public.compute_is_listed(p.source, p.category_id, p.is_published)
   where p.source = v_key
     and p.category_id = rec.category_id;
  return null;
end $$;

drop trigger if exists vendor_categories_refresh_listing on public.vendor_categories;
create trigger vendor_categories_refresh_listing
  after insert or update or delete on public.vendor_categories
  for each row execute function public.vendor_categories_refresh_listing();

-- ---------------------------------------------------------------------------
-- 6. Seed the vendors we already have
--
-- noon is enabled because its 301 products are live today and this migration
-- must not take the shop down. Cult Beauty is disabled: its 177 products are
-- still in staging awaiting the category and pricing decisions.
--
-- The rates are STARTING VALUES, not quotes. Both are editable in
-- /admin/vendors and should be checked against a real rate before anything is
-- repriced from them.
-- ---------------------------------------------------------------------------

insert into public.vendors (key, name, kind, is_enabled, currency, fx_rate_to_bhd, sort_order, notes)
values
  ('noon', 'noon', 'scrape', true, 'SAR', 0.100000, 1,
   'Saudi marketplace. Scraped nightly from a local machine (Camoufox, headed).'),
  ('cultbeauty', 'Cult Beauty', 'scrape', false, 'GBP', 0.476000, 2,
   'UK retailer. Scraped daily in GitHub Actions. Disabled until categories and pricing are agreed.')
on conflict (key) do nothing;

-- Any other source already in the catalogue gets a vendor row too — enabled,
-- because those products are on the shop today and a migration must not
-- delist them. Review them in /admin/vendors.
insert into public.vendors (key, name, kind, is_enabled, currency, notes)
select distinct p.source, p.source, 'scrape', true, 'BHD',
       'Auto-created by migration 0014 from an existing product source. Review its pricing rule.'
  from public.products p
 where p.source is not null
   and not exists (select 1 from public.vendors v where v.key = p.source)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 7. Backfill and index
-- ---------------------------------------------------------------------------

update public.products p
   set is_listed = public.compute_is_listed(p.source, p.category_id, p.is_published);

create index if not exists products_listed_idx
  on public.products (is_listed)
  where is_listed;

create index if not exists vendor_categories_category_idx
  on public.vendor_categories (category_id);

-- ---------------------------------------------------------------------------
-- 8. Grants and RLS
--
-- is_listed is public for the same reason is_published was in 0012: the
-- storefront filters on it under the anon key, and it leaks nothing — an
-- unlisted product simply never appears. Everything else added here is cost
-- and sourcing data and stays private.
--
-- PUBLIC_PRODUCT_COLUMNS in src/lib/data.ts must list is_listed, or the
-- catalogue 403s.
-- ---------------------------------------------------------------------------

grant select (is_listed) on public.products to anon, authenticated;

alter table public.vendors           enable row level security;
alter table public.vendor_categories enable row level security;

-- No policies, deliberately. Which suppliers we buy from, at what rate and
-- what markup, is the commercial core of the business. Only the service role
-- (which bypasses RLS) reads these, and only the admin console uses it.

commit;

-- Sanity checks (optional):
--   select key, is_enabled, currency, fx_rate_to_bhd from public.vendors order by sort_order;
--   select source, count(*) filter (where is_listed) as listed,
--          count(*) filter (where not is_listed) as hidden
--     from public.products group by source;
--   select v, public.attractive_price(v)
--     from unnest(array[6.38,6.52,6.63,7.12,7.26,7.41]) as v;
