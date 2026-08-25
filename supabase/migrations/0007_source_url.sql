-- ============================================================================
-- 0007 — Supplier link on each product (fulfilment)
--
-- The store sources per order: a customer buys here, staff then buy the item
-- from the supplier and have it delivered. That last step needs the supplier's
-- product page, so it lives on the product record rather than in someone's
-- notes.
--
-- Internal only. It is a purchasing instruction, never customer-facing.
-- ============================================================================

alter table public.products
  add column if not exists source_url text;

comment on column public.products.source_url is
  'Supplier product page used to fulfil an order. Staff-only — never rendered on the storefront.';

/*
  Why a column-level revoke rather than RLS.

  `products` carries a "public read" policy for select using (true), which is
  per-row, not per-column, so any new column here is readable by anyone holding
  the anon key. Which supplier we buy from, and at what URL, is commercially
  sensitive — it hands a competitor the sourcing list.

  Same treatment as cost_price in 0005. The storefront selects an explicit
  column list rather than `*`, so this doesn't break it; `select *` as anon
  would start failing, which is the intended safety net.

  The admin uses the service-role key, which bypasses both RLS and this revoke.
*/
revoke select (source_url) on public.products from anon, authenticated;

-- Cheap guard against a pasted search result or a stray note landing here.
-- NOT VALID so the constraint applies to new writes without forcing a scan of
-- rows that predate it; the backfill only ever writes https URLs.
alter table public.products
  drop constraint if exists products_source_url_is_url;

alter table public.products
  add constraint products_source_url_is_url
  check (source_url is null or source_url ~ '^https?://')
  not valid;
