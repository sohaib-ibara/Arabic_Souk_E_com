-- ============================================================================
-- 0010 — Which supplier a product came from, and its code there
--
-- Until now the only trace of origin was `source_url`, a free-text link. That
-- was enough while every product came from noon. It is not enough now that a
-- second supplier is being added, because a daily sync has to answer three
-- questions on every run:
--
--   "have I seen this product before?"          → (source, source_sku)
--   "which of ours did its price change?"        → look up by that pair
--   "which supplier do I buy this one from?"     → source
--
-- A URL cannot answer them reliably: it carries a slug that changes when the
-- retailer renames a product, and query strings that differ per visit. The
-- supplier's own product code does not change. So the code becomes the key and
-- the URL goes back to being what it always was — a link for staff to click.
--
-- `source_url` stays. It is still how someone actually buys the item.
--
-- ⚠️  Both new columns are STAFF-ONLY and neither is granted to anon or
-- authenticated. Which suppliers we buy from, and their product codes, is the
-- sourcing list — the same commercial secret 0007/0008 protect for source_url.
-- Since 0008 dropped the blanket table grant, a new column is private by
-- default and needs a deliberate grant to expose it. Do not add these to the
-- grant list in 0008 or to PUBLIC_PRODUCT_COLUMNS in src/lib/data.ts.
-- ============================================================================

-- HOW TO RUN: paste this whole file into the Supabase SQL editor and Run.
-- All of it or none of it: the guard below aborts the transaction rather than
-- leave the catalogue half-identified.

begin;

alter table public.products
  add column if not exists source     text,
  add column if not exists source_sku text;

comment on column public.products.source is
  'Supplier adapter key (scripts/import/sites/): noon, cultbeauty. Staff-only.';
comment on column public.products.source_sku is
  'The product code at that supplier. Stable across renames; the sync key. Staff-only.';

-- ---------------------------------------------------------------------------
-- Backfill the existing catalogue from source_url.
--
-- Every one of the 301 live products is a noon import with a URL of the form
--   /saudi-en/<slug>/<CODE>/p/
-- and all 301 codes extract cleanly and uniquely — checked against the live
-- database before writing this. The cultbeauty branch is here so the migration
-- is correct whenever those rows land, not because any exist yet.
-- ---------------------------------------------------------------------------

update public.products
   set source     = 'noon',
       source_sku = upper(substring(source_url from '/([A-Za-z0-9]+)/p/'))
 where source is null
   and source_url like '%noon.com%'
   and substring(source_url from '/([A-Za-z0-9]+)/p/') is not null;

update public.products
   set source     = 'cultbeauty',
       source_sku = substring(source_url from '/p/[^/]+/([0-9]+)')
 where source is null
   and source_url like '%cultbeauty.co.uk%'
   and substring(source_url from '/p/[^/]+/([0-9]+)') is not null;

-- Fail loudly rather than leave a half-identified catalogue behind. A product
-- with a supplier URL we could not parse is one the sync would treat as new
-- every single night, quietly creating duplicates.
do $$
declare
  unparsed integer;
begin
  select count(*) into unparsed
    from public.products
   where source is null
     and source_url is not null;

  if unparsed > 0 then
    raise exception
      'Migration 0010: % product(s) have a source_url that no adapter pattern matched. '
      'Add the pattern here, or clear those URLs, then re-run.', unparsed;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- The identity.
-- ---------------------------------------------------------------------------

-- Both or neither. A source without a code is not identifiable, and a code
-- without a source is ambiguous the moment two suppliers use the same numbers.
alter table public.products
  drop constraint if exists products_source_pair;

alter table public.products
  add constraint products_source_pair
  check ((source is null) = (source_sku is null));

-- One row per product per supplier.
--
-- Not a partial index, deliberately. A partial unique index cannot be used to
-- infer an ON CONFLICT target unless the statement repeats its WHERE clause,
-- which PostgREST cannot express — so `upsert(..., onConflict: 'source,source_sku')`
-- would fail, and that upsert is the whole point of having the key.
--
-- The partial version is not needed anyway: Postgres treats NULLs as distinct
-- in a unique index, so any number of hand-added products with no supplier
-- coexist happily. The pair constraint above guarantees a row is either fully
-- identified or fully anonymous, never half of each.
create unique index if not exists products_source_identity_idx
  on public.products (source, source_sku);

-- The sync looks products up by supplier on every run.
create index if not exists products_source_idx
  on public.products (source)
  where source is not null;

-- ---------------------------------------------------------------------------
-- Staging gets the same treatment.
--
-- It already had `source`, but defaulted to 'noon' — which silently mislabels
-- every row a second supplier writes. With two suppliers the caller has to say
-- which, so the default goes. `source_url` alone was its uniqueness key; the
-- supplier's code is the better one for the same reason as above.
-- ---------------------------------------------------------------------------

alter table public.staging_products
  add column if not exists source_sku text;

alter table public.staging_products
  alter column source drop default;

comment on column public.staging_products.source_sku is
  'The product code at the supplier — matches products.source_sku on promotion.';

-- Non-partial for the same reason: the stage step upserts on this pair so a
-- re-run updates a row instead of duplicating it.
create unique index if not exists staging_products_source_identity_idx
  on public.staging_products (source, source_sku);

commit;

-- Sanity check (optional) — expect one row, noon | 301 | 301:
--   select source, count(*), count(distinct source_sku)
--     from public.products group by source;
