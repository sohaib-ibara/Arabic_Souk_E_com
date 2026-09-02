-- ============================================================================
-- 0019 — Choose what the Bestsellers row shows
--
-- The homepage row is computed: featured first, then rating weighted by how
-- many people left one (see getBestsellers). That was the right default while
-- nobody had curated anything, and it is still the right fallback — but it is
-- not a shop window. The client wants to put a product in position one because
-- there is a reason to, and no scoring formula knows what that reason is.
--
-- A separate table rather than a column on products, for two reasons:
--
--   1. The importer upserts products. A curation column living there is one
--      careless `update ... set` in a sync script away from being wiped, and
--      the person who notices is the client looking at their own home page.
--   2. Order is a property of the list, not of a product. "Third" only means
--      anything relative to the other picks, and clearing the list should be
--      one delete rather than 478 nullings.
--
-- An empty table means "decide it for me", which is exactly today's behaviour,
-- so running this migration changes nothing until somebody picks something.
-- ============================================================================

-- HOW TO RUN: paste this whole file into the Supabase SQL editor and Run.

begin;

create table if not exists public.home_bestsellers (
  -- Cascade: a product deleted from the catalogue must not leave a hole in the
  -- home page that only shows up as a missing card.
  product_id uuid primary key references public.products(id) on delete cascade,

  -- Position in the row, 1-based. Not unique, and deliberately: the admin
  -- rewrites the whole list on every save, and a unique constraint would fail
  -- half way through a reorder unless it were deferrable.
  sort_order int not null default 0,

  added_at   timestamptz not null default now()
);

create index if not exists home_bestsellers_order_idx
  on public.home_bestsellers (sort_order);

comment on table public.home_bestsellers is
  'Hand-picked products for the home page Bestsellers row, in order. Empty = fall back to the automatic ranking.';

-- ---------------------------------------------------------------------------
-- Readable by the shop, writable only by staff
--
-- Nothing here is secret — every row is a product already on public display,
-- in an order every visitor can see. So the storefront reads it under the anon
-- key like categories and products, and writes go through the admin on the
-- service-role key, which bypasses RLS.
-- ---------------------------------------------------------------------------

alter table public.home_bestsellers enable row level security;

drop policy if exists "public read home bestsellers" on public.home_bestsellers;
create policy "public read home bestsellers" on public.home_bestsellers
  for select using (true);

-- Revoke first: 0008 established that a blanket grant is how a column leaks,
-- and the same reasoning applies to a table. Grant back exactly select.
revoke all on public.home_bestsellers from anon, authenticated;
grant select on public.home_bestsellers to anon, authenticated;

commit;

-- Sanity check — what the home page will lead with:
--   select h.sort_order, p.name
--     from public.home_bestsellers h
--     join public.products p on p.id = h.product_id
--    order by h.sort_order;
