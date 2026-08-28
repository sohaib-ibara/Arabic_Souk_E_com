-- ============================================================================
-- 0013 — Record every sync, and what it found
--
-- The daily sync runs unattended, and for noon it runs on an office PC rather
-- than a cloud host (see docs/SUPPLIER_SYNC.md — noon refuses every datacentre
-- IP we measured). An office PC fails in ways a server does not: someone
-- reboots it, Windows Update restarts overnight, a plug gets pulled. None of
-- that announces itself.
--
-- Without a record of runs, a sync that silently stopped three weeks ago looks
-- exactly like a sync with nothing to report. The store keeps serving last
-- month's prices and the first person to notice is a customer ordering
-- something the supplier no longer sells. So every run writes a row here, and
-- the admin shows the last one per source.
--
-- What a run must NOT do is quietly change the shop. Prices here are not the
-- supplier's: noon's came in at SAR×0.1 and staff have corrected them by hand
-- since. So a sync writes to staging and records what moved; a human decides.
-- The one exception is delivery, which is the supplier's own fact about its own
-- logistics and nobody edits here.
-- ============================================================================

begin;

create table if not exists public.sync_runs (
  id            uuid primary key default gen_random_uuid(),
  source        text        not null,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,

  -- null while running. A row that still reads null long after started_at is
  -- the signature of a killed process, which is exactly what we want to see.
  ok            boolean,
  error         text,

  -- Was this a real run or a dry run? Dry runs are recorded too: "someone
  -- checked and chose not to apply" is different from "nothing ran".
  applied       boolean     not null default false,

  discovered    integer     not null default 0,
  fetched       integer     not null default 0,
  new_products  integer     not null default 0,
  changed       integer     not null default 0,
  unchanged     integer     not null default 0,
  failed        integer     not null default 0,

  -- Per-kind counts plus a sample, e.g.
  --   {"price": 12, "availability": 3, "samples": [{"sku": "...", ...}]}
  -- Enough for the admin to say what happened without re-reading staging.
  summary       jsonb       not null default '{}'::jsonb
);

create index if not exists sync_runs_source_started_idx
  on public.sync_runs (source, started_at desc);

comment on table public.sync_runs is
  'One row per supplier sync attempt. Absence of recent rows is the alarm.';

-- Staff-only: this describes our supply chain, not the catalogue.
alter table public.sync_runs enable row level security;

-- ---------------------------------------------------------------------------
-- Staging carries when it was last seen and what moved
-- ---------------------------------------------------------------------------

alter table public.staging_products
  -- When the sync last found this product on the supplier's site. A row whose
  -- last_seen_at stops advancing has been delisted upstream — worth knowing
  -- before a customer orders it.
  add column if not exists last_seen_at timestamptz,
  -- When the supplier last changed something about it.
  add column if not exists changed_at   timestamptz,
  -- Which fields moved on that last change: {price,name,description,images,
  -- availability,delivery}. An array so the admin can filter to price alone.
  add column if not exists change_kinds text[] not null default '{}',
  -- What the supplier said before the change, for the fields that moved. Lets
  -- the admin see "SAR 48.10 → SAR 61.00" without keeping every old capture.
  add column if not exists previous     jsonb;

create index if not exists staging_products_changed_idx
  on public.staging_products (source, changed_at desc)
  where changed_at is not null;

commit;

-- Sanity check (optional):
--   select source, max(started_at) as last_run, bool_and(ok) as healthy
--     from public.sync_runs group by source;
