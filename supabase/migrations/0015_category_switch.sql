-- ============================================================================
-- 0015 — Switch a whole category off
--
-- 0014 gave every vendor a per-category switch, which hides ONE vendor's
-- products in that category and deliberately leaves the others alone. That is
-- the 1 Sep requirement: turn noon off inside skin care and Cult Beauty's
-- products stay, in the same place, under the same heading.
--
-- What it does not do — and what was asked for next — is take a category off
-- the shop entirely. Switching every vendor off one by one empties the shelf
-- but leaves the heading, the nav entry and the page behind, which is not the
-- same thing as "we do not sell this".
--
-- So the two switches are deliberately different, and both are needed:
--
--   vendor_categories.is_enabled   whose products appear in this category
--   categories.is_enabled          whether this category exists on the shop
--
-- The second wins. A category switched off disappears from the navigation, the
-- homepage, the footer and its own URL, and its products stop being listed
-- wherever they would otherwise appear — search and /shop included, because a
-- product nobody can reach through a category should not surface through a
-- side door either.
-- ============================================================================

-- HOW TO RUN: paste this whole file into the Supabase SQL editor and Run.
-- Requires 0014.

begin;

do $$
begin
  if to_regclass('public.vendors') is null then
    raise exception 'Migration 0015 requires 0014_vendor_provisioning.sql. Run that first.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. The switch
-- ---------------------------------------------------------------------------

alter table public.categories
  add column if not exists is_enabled boolean not null default true;

comment on column public.categories.is_enabled is
  'Off = the category is not on the shop at all: no nav entry, no page, and its products are unlisted.';

/*
  Public, like products.is_published in 0012 and is_listed in 0014.

  The storefront reads the categories table under the anon key to build the
  navigation, so it has to be able to see this. It leaks nothing: a category
  that is switched off simply never appears.
*/
grant select (is_enabled) on public.categories to anon, authenticated;

create index if not exists categories_enabled_idx
  on public.categories (is_enabled)
  where is_enabled;

-- ---------------------------------------------------------------------------
-- 2. Fold it into the answer the storefront already asks
--
-- `products.is_listed` is the one boolean the shop filters on. Adding the
-- category switch here rather than at each call site means a disabled category
-- takes its products out of /shop, search, related products and the sitemap
-- too — not just off its own page.
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
     -- The category, if it has one, must be on the shop at all.
     and (p_category_id is null or exists (
           select 1 from public.categories c
            where c.id = p_category_id and c.is_enabled))
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

-- ---------------------------------------------------------------------------
-- 3. Keep it current
--
-- Same shape as the vendor triggers in 0014, and it does not recurse for the
-- same reason: this updates only `is_listed`, while the trigger on products
-- fires on source / category_id / is_published.
-- ---------------------------------------------------------------------------

create or replace function public.categories_refresh_listing()
returns trigger language plpgsql as $$
begin
  update public.products p
     set is_listed = public.compute_is_listed(p.source, p.category_id, p.is_published)
   where p.category_id = new.id;
  return null;
end $$;

drop trigger if exists categories_refresh_listing on public.categories;
create trigger categories_refresh_listing
  after update of is_enabled on public.categories
  for each row execute function public.categories_refresh_listing();

-- ---------------------------------------------------------------------------
-- 4. Backfill, so existing rows agree with the new rule
-- ---------------------------------------------------------------------------

update public.products p
   set is_listed = public.compute_is_listed(p.source, p.category_id, p.is_published);

commit;

-- Sanity checks (optional):
--   select slug, is_enabled from public.categories order by sort_order;
--   -- turning one off should drop its products out of is_listed:
--   -- update public.categories set is_enabled = false where slug = 'lips';
--   -- select count(*) from public.products where category_id =
--   --   (select id from public.categories where slug = 'lips') and is_listed;
