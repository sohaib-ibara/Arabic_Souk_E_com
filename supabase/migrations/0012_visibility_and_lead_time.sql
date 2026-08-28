-- ============================================================================
-- 0012 — Choose what to list, and tell the truth about when it arrives
--
-- Two things the client asked for after the 28 Aug meeting.
--
-- 1. CURATION. They want to carry some noon products and some Cult Beauty
--    ones, chosen by hand rather than everything an importer finds. There was
--    no way to express that: `in_stock` is the off-sale switch, and a product
--    turned off with it still appears on the storefront, marked unavailable.
--    "Don't list this at all" is a different statement and needs its own flag.
--
-- 2. DELIVERY TIME. They asked for it to be scraped along with the product.
--    The reason it matters is sharper than a missing field: the store tells
--    every shopper "1–2 days" from siteConfig, while a Cult Beauty line is
--    dispatched from the UK in ~24h and then takes 5–15 business days to reach
--    Bahrain. Sourcing per order means that promise is already wrong for any
--    UK product, and would be wrong for every one of them after an import.
--    These columns hold what the supplier actually says, per product, so the
--    page can quote a real window instead of a house default.
--
-- Both are staff-set and derived from the supplier, so neither is granted to
-- anon; 0008 dropped the blanket table grant, which is why `is_published` has
-- to be handled explicitly below — the storefront genuinely needs to read it.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Visibility
-- ---------------------------------------------------------------------------

alter table public.products
  add column if not exists is_published boolean not null default true;

comment on column public.products.is_published is
  'Listed on the storefront at all. Distinct from in_stock, which means listed but not buyable.';

/*
  Unlike source/source_sku, this one IS public.

  The storefront filters on it, and that filter runs under the anon key. It
  leaks nothing — an unpublished product simply never appears, and a published
  one is visible by definition. Added to the 0008 grant list explicitly rather
  than by widening the table grant, so every other column stays private.

  PUBLIC_PRODUCT_COLUMNS in src/lib/data.ts must list it too, or the storefront
  selects a column it has no grant for and the whole catalogue 403s.
*/
grant select (is_published) on public.products to anon, authenticated;

-- Every catalogue query filters on this, and most also filter on a source.
create index if not exists products_published_idx
  on public.products (is_published)
  where is_published;

-- ---------------------------------------------------------------------------
-- 2. Delivery, as the supplier states it
-- ---------------------------------------------------------------------------

alter table public.products
  -- The supplier's own wording, kept verbatim for staff — "In stock | Usually
  -- dispatched within 24 hours". Not shown to customers; it describes the
  -- supplier's warehouse, not our delivery.
  add column if not exists supplier_dispatch_note text,
  -- The window we can honestly quote: supplier dispatch plus their shipping to
  -- Bahrain, in days. Null means unknown, and the page then falls back to the
  -- site default rather than inventing a number.
  add column if not exists lead_days_min integer check (lead_days_min >= 0),
  add column if not exists lead_days_max integer check (lead_days_max >= 0),
  -- Some suppliers cap how many of a line one order may contain. Buying for a
  -- customer who ordered ten of something capped at five is a problem best
  -- found before they pay, not after.
  add column if not exists max_per_order integer check (max_per_order > 0);

alter table public.products
  drop constraint if exists products_lead_days_ordered;

alter table public.products
  add constraint products_lead_days_ordered
  check (
    lead_days_min is null
    or lead_days_max is null
    or lead_days_min <= lead_days_max
  );

comment on column public.products.lead_days_min is
  'Realistic delivery window, low end, in days: supplier dispatch + their shipping to Bahrain.';

-- The window is shown on the product page, so anon must be able to read it.
-- The dispatch note and the order cap are staff-only and deliberately are not
-- granted: one describes another company's warehouse, the other is a
-- purchasing constraint.
grant select (lead_days_min, lead_days_max) on public.products to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Staging carries the same, so a promotion has something to copy
-- ---------------------------------------------------------------------------

alter table public.staging_products
  add column if not exists supplier_dispatch_note text,
  add column if not exists lead_days_min integer,
  add column if not exists lead_days_max integer,
  add column if not exists max_per_order integer;

commit;

-- Sanity check (optional):
--   select source, count(*) filter (where is_published) as listed,
--          count(*) filter (where not is_published) as hidden,
--          count(*) filter (where lead_days_max is not null) as with_lead_time
--     from public.products group by source;
