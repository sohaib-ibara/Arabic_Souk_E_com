import { getSupabaseAdmin } from "./supabase/server";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * What the daily supplier sync has been doing.
 *
 * The point of surfacing this is the failure that does not announce itself.
 * noon's sync cannot run in the cloud — it is blocked from every datacentre IP
 * we measured — so it runs on an office machine, and office machines get
 * rebooted, updated and unplugged. A sync that stopped three weeks ago looks
 * exactly like a sync with nothing to report, and the shop quietly keeps
 * serving last month's prices until a customer orders something the supplier
 * no longer sells.
 *
 * So "stale" is a first-class state here, not an absence of data.
 *
 * Only applied runs are counted — see `getSyncStatus`.
 */

/** Past this, a source is considered stale. Daily sync, so a missed day is a day late. */
const STALE_AFTER_HOURS = 30;

export interface SyncRun {
  id: string;
  source: string;
  started_at: string;
  finished_at: string | null;
  ok: boolean | null;
  applied: boolean;
  error: string | null;
  discovered: number;
  fetched: number;
  new_products: number;
  changed: number;
  unchanged: number;
  failed: number;
  summary: Record<string, any>;
}

export type SyncHealth = "ok" | "stale" | "failed" | "running" | "never";

export interface SourceSync {
  source: string;
  last: SyncRun | null;
  health: SyncHealth;
  hoursAgo: number | null;
}

export interface SyncStatus {
  /** False when migration 0013 has not been applied — show a hint, not an error. */
  ready: boolean;
  message: string | null;
  sources: SourceSync[];
}

const MISSING_TABLE = "PGRST205";

function classify(run: SyncRun | null): { health: SyncHealth; hoursAgo: number | null } {
  if (!run) return { health: "never", hoursAgo: null };

  const started = new Date(run.started_at).getTime();
  const hoursAgo = (Date.now() - started) / 36e5;

  /*
    A run with no finished_at is either in flight or was killed. Distinguishing
    them by age is the only signal available: the process that would have
    written `ok` is the one that died. Two hours is well past any real run.
  */
  if (run.finished_at == null) {
    return { health: hoursAgo > 2 ? "failed" : "running", hoursAgo };
  }
  if (run.ok === false) return { health: "failed", hoursAgo };
  if (hoursAgo > STALE_AFTER_HOURS) return { health: "stale", hoursAgo };
  return { health: "ok", hoursAgo };
}

/** The most recent run per source, with a verdict on each. */
export async function getSyncStatus(knownSources: string[] = []): Promise<SyncStatus> {
  // Returns null rather than throwing when the service-role key is absent.
  const sb = getSupabaseAdmin();
  if (!sb) {
    return {
      ready: false,
      message: "SUPABASE_SERVICE_ROLE_KEY isn’t set, so sync history can’t be read.",
      sources: [],
    };
  }

  // Newest first, then keep the first per source. Cheaper than a per-source
  // query and there are only ever a handful of sources.
  const { data, error } = await sb
    .from("sync_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(200);

  if (error) {
    if (error.code === MISSING_TABLE) {
      return {
        ready: false,
        message:
          "Sync history isn’t installed yet — run supabase/migrations/0013_sync_runs.sql.",
        sources: [],
      };
    }
    return { ready: false, message: error.message, sources: [] };
  }

  /*
    Only runs that were allowed to WRITE count.

    This page answers one question — how fresh is what we hold — and a dry run
    cannot change the answer. It fetches, compares, reports and discards. It
    cannot make the catalogue fresher, so abandoning one halfway must not be
    able to make it look staler.

    That is not hypothetical. Two dry runs were killed mid-investigation on the
    evening of 1 Sept and left without a `finished_at`. Both supplier cards went
    red, and the warning banner with them, while the real syncs had both
    succeeded earlier the same day and written everything they found. The page
    reported the shop broken on the strength of two rehearsals.
  */
  const latest = new Map<string, SyncRun>();
  const everSeen = new Set<string>();
  for (const row of (data ?? []) as SyncRun[]) {
    everSeen.add(row.source);
    if (row.applied && !latest.has(row.source)) latest.set(row.source, row);
  }

  // A source that has never run for real still needs a row, or "never synced"
  // would be invisible — which is the exact failure this page exists to catch.
  // `everSeen` covers a source that has only ever been rehearsed: it has
  // history, but nothing it fetched was ever kept, so "never" is the truth.
  for (const s of [...knownSources, ...everSeen]) if (!latest.has(s)) latest.set(s, null as never);

  const sources: SourceSync[] = [...latest.entries()]
    .map(([source, run]) => ({ source, last: run ?? null, ...classify(run ?? null) }))
    .sort((a, b) => a.source.localeCompare(b.source));

  return { ready: true, message: null, sources };
}

/** Products the sync flagged as changed and nobody has reviewed yet. */
export async function getPendingChanges(limit = 50): Promise<{
  ready: boolean;
  rows: Array<{
    id: string;
    source: string;
    source_sku: string;
    name: string | null;
    price: number | null;
    currency: string | null;
    status: string;
    change_kinds: string[];
    previous: Record<string, any> | null;
    changed_at: string | null;
  }>;
  counts: Record<string, number>;
}> {
  const sb = getSupabaseAdmin();
  if (!sb) return { ready: false, rows: [], counts: {} };

  const { data, error } = await sb
    .from("staging_products")
    .select("id,source,source_sku,name,price,currency,status,change_kinds,previous,changed_at")
    .not("changed_at", "is", null)
    .order("changed_at", { ascending: false })
    .limit(limit);

  if (error) return { ready: false, rows: [], counts: {} };

  const counts: Record<string, number> = {};
  for (const r of data ?? []) {
    for (const k of (r as any).change_kinds ?? []) counts[k] = (counts[k] ?? 0) + 1;
  }
  return { ready: true, rows: (data ?? []) as any, counts };
}
