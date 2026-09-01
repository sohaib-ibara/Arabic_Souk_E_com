-- ============================================================================
-- 0016 — Aisles the captured taxonomy has no place for ("Others")
--
-- The menu's shape came from noon, so it only has room for aisles noon has.
-- Cult Beauty does not respect that boundary: it sells home scents, baby care
-- and supplements, and it files everything else by merchandising angle rather
-- than by product type — `mature-skin`, `vegan-make-up`, `halloween`.
--
-- 68 imported products landed with no category because of it. They were
-- buyable, searchable and had their own pages, but sat under no heading, and
-- neither the shop-wide switch (0015) nor the per-vendor one (0014) could reach
-- them, because both are keyed on a category.
--
-- This migration gives each of those shelves a real category row. `nav.ts`
-- collects any category the captured tree does not claim into an "Others" group
-- at the end of the menu, so nothing has to be registered in two places:
-- creating a row here is enough for it to appear.
--
-- SWITCHED OFF BY DEFAULT, all but three. Most of these shelves are moods, not
-- aisles: `refillable` holds two Chloé perfumes that belong in Eau de Parfum,
-- and `grunge` holds one eyeliner. Putting twenty-six of those in the menu on
-- the strength of a scrape is not a decision a migration should make — so they
-- arrive visible to the admin in /admin/categories and invisible to shoppers.
-- The three that are on are the three that currently hold a published product,
-- which keeps "Others" from being an empty heading.
--
-- Cult's `personal-care` shelf is deliberately absent. `personal-care` is
-- already the slug of a menu DEPARTMENT, so a category of that name would be
-- unreachable from the menu it collided with; its four products (three oral,
-- one deodorant) go to aisles we already have. See the repair script.
-- ============================================================================

-- HOW TO RUN: paste this whole file into the Supabase SQL editor and Run,
-- then `node --env-file=.env.local scripts/assign-other-categories.mjs --apply`
-- to move the products onto them.

begin;

insert into public.categories (slug, name, sort_order, is_enabled)
select v.slug,
       v.name,
       (select coalesce(max(sort_order), 0) from public.categories)
         + row_number() over (order by v.ord),
       v.enabled
  from (values
    -- Enabled: each of these holds a product that is already published, so the
    -- "Others" heading has something behind it the day this runs.
    ( 1, 'active',                  'Active Ingredients',   true ),
    ( 2, 'eyes-lips',               'Eyes & Lips',          true ),
    ( 3, 'sun-kissed',              'Sun-kissed',           true ),

    -- Off until someone decides otherwise.
    ( 4, 'mature-skin',             'Mature Skin',          false),
    ( 5, 'vegan-make-up',           'Vegan Make-up',        false),
    ( 6, 'our-customers-love',      'Customer Favourites',  false),
    ( 7, 'multi-tasking-make-up',   'Multi-tasking Make-up',false),
    ( 8, 'mother-baby',             'Mother & Baby',        false),
    ( 9, 'skin-care-benefits',      'Skin Care Benefits',   false),
    (10, 'night-time',              'Night-time',           false),
    (11, 'hair-type',               'Hair Type',            false),
    (12, 'refillable',              'Refillable',           false),
    (13, 'skin-care-tools',         'Skin Care Tools',      false),
    (14, 'dewy',                    'Dewy',                 false),
    (15, 'dermatological-skincare', 'Dermatological Skincare', false),
    (16, 'goody-bag',               'Goody Bag',            false),
    (17, 'good-to-skin-make-up',    'Good-to-Skin Make-up', false),
    (18, 'tools-technology',        'Tools & Technology',   false),
    (19, 'home-scents',             'Home Scents',          false),
    (20, 'grunge',                  'Grunge',               false),
    (21, 'vitamins-supplements',    'Vitamins & Supplements', false),
    (22, 'korean-skin-care',        'Korean Skin Care',     false),
    (23, 'spotlight',               'Spotlight',            false),
    (24, 'skin-barrier-relief',     'Skin Barrier Relief',  false),
    (25, 'firming',                 'Firming',              false),
    (26, 'halloween',               'Halloween',            false)
  ) as v(ord, slug, name, enabled)
 where not exists (select 1 from public.categories c where c.slug = v.slug);

commit;

-- Sanity check:
--   select slug, name, is_enabled from public.categories
--    where sort_order > 28 order by sort_order;
