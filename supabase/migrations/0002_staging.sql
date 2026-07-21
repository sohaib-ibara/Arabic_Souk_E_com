-- ============================================================================
-- Import staging area (feature/noon-import branch)
--
-- ⚠️  LEGAL / RIGHTS NOTICE
-- Scraped third-party catalogue data (product names, descriptions, images,
-- prices) is owned by the source site and the brands. It is stored here for
-- REVIEW ONLY. Do NOT promote scraped images or copy to the public `products`
-- table for a live commercial store without the right to use them — see
-- docs/NOON_IMPORT.md. This table has NO public read policy on purpose.
-- ============================================================================

create table if not exists public.staging_products (
  id                uuid primary key default gen_random_uuid(),
  source            text not null default 'noon',
  source_url        text not null,
  raw               jsonb,                 -- full model-extracted object
  name              text,
  brand             text,
  price             numeric(12,3),
  currency          text,                  -- e.g. 'SAR' (source currency)
  short_description text,
  description       text,
  category          text,                  -- our slug guess (skincare, makeup, …)
  images            jsonb not null default '[]'::jsonb,
  in_stock          boolean,
  rating            numeric(2,1),
  review_count      integer,
  -- Review workflow: nothing reaches the live store until a human approves it.
  status            text not null default 'pending'
                      check (status in ('pending', 'approved', 'rejected', 'promoted')),
  review_notes      text,
  scraped_at        timestamptz not null default now(),
  promoted_at       timestamptz,
  unique (source, source_url)
);

create index if not exists staging_products_status_idx on public.staging_products (status);

-- RLS on, NO policy → the anon/public key cannot read or write this table.
-- Only the service-role key (used by the import scripts, bypasses RLS) can.
alter table public.staging_products enable row level security;
