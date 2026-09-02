-- ============================================================================
-- 0017 — Keep the email addresses people give us
--
-- The newsletter form was a demo: it said "Thank you, you're on the list" and
-- threw the address away. That was survivable while it sat quietly in the
-- footer. It stopped being survivable when the storefront grew a sticky signup
-- tab and an exit-intent modal that both funnel people into it — the shop now
-- actively asks for something it then discards, and tells the person it was
-- kept.
--
-- This is the smallest honest fix: store the address. Sending is somebody
-- else's problem for now, and deliberately so — an export beats a half-built
-- campaign tool, and the addresses are the part that cannot be recovered later.
--
-- Staff-only, by RLS with no policies. A subscriber list is the one table on
-- this shop where a leak is a privacy incident rather than an inconvenience, so
-- anon and authenticated get nothing at all: writes go through the server
-- action on the service-role key, and reads happen in the admin.
-- ============================================================================

-- HOW TO RUN: paste this whole file into the Supabase SQL editor and Run.

begin;

create table if not exists public.newsletter_subscribers (
  id             uuid primary key default gen_random_uuid(),

  -- Stored lower-cased and trimmed by the writer, with a unique index below
  -- rather than a UNIQUE constraint, so re-subscribing is an upsert and never
  -- an error the shopper has to see.
  email          text        not null,

  -- Which surface it came from: 'footer', 'promo-modal', 'signup-tab',
  -- 'homepage'. Worth a column because these convert very differently and the
  -- answer decides whether the modal earns its interruption.
  source         text,

  -- The page they were on. Useful for the same reason and costs nothing.
  page           text,

  subscribed_at  timestamptz not null default now(),

  -- Set instead of deleting the row: an address that unsubscribed must stay
  -- known, or the next import silently signs them up again.
  unsubscribed_at timestamptz
);

create unique index if not exists newsletter_subscribers_email_key
  on public.newsletter_subscribers (lower(email));

create index if not exists newsletter_subscribers_subscribed_idx
  on public.newsletter_subscribers (subscribed_at desc);

comment on table public.newsletter_subscribers is
  'Marketing opt-ins. Staff-only: RLS on with no policies, so only the service role can read or write.';

alter table public.newsletter_subscribers enable row level security;

/*
  No grants and no policies.

  RLS with zero policies denies everything to anon and authenticated, which is
  the intent — but a future `grant all on all tables in schema public` would
  still hand out the table-level privilege, so revoke explicitly and let the
  service role (which bypasses RLS entirely) be the only way in.
*/
revoke all on public.newsletter_subscribers from anon, authenticated;

commit;

-- Sanity check:
--   select count(*) from public.newsletter_subscribers;
