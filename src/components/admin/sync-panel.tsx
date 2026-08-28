import Link from "next/link";
import type { SourceSync, SyncHealth, SyncStatus } from "@/lib/sync-status";
import { formatDateTime } from "@/lib/format";

const SOURCE_LABELS: Record<string, string> = {
  noon: "noon",
  cultbeauty: "Cult Beauty",
};
const label = (key: string) => SOURCE_LABELS[key] ?? key;

/**
 * Where each source runs, and why.
 *
 * Shown in the UI rather than buried in a doc because it explains the thing an
 * admin will otherwise misread: noon failing is not the same kind of event as
 * Cult Beauty failing. One is a PC in an office, the other is a cloud job.
 */
const WHERE_IT_RUNS: Record<string, string> = {
  noon: "Office machine — noon blocks datacentre IPs, so this cannot run in the cloud.",
  cultbeauty: "GitHub Actions, 05:20 Bahrain daily.",
};

const HEALTH: Record<SyncHealth, { text: string; cls: string }> = {
  ok: { text: "Healthy", cls: "bg-emerald-50 text-emerald-700" },
  running: { text: "Running", cls: "bg-sky-50 text-sky-700" },
  stale: { text: "Overdue", cls: "bg-amber-50 text-amber-700" },
  failed: { text: "Failed", cls: "bg-red-50 text-red-700" },
  never: { text: "Never run", cls: "bg-sand text-muted" },
};

function ago(hours: number | null): string {
  if (hours == null) return "—";
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min ago`;
  if (hours < 48) return `${Math.round(hours)} hours ago`;
  return `${Math.round(hours / 24)} days ago`;
}

function SourceCard({ s }: { s: SourceSync }) {
  const h = HEALTH[s.health];
  const r = s.last;
  return (
    <div className="rounded-2xl border border-line bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium">{label(s.source)}</h2>
        <span className={`rounded-full px-2.5 py-0.5 text-xs ${h.cls}`}>{h.text}</span>
      </div>

      <p className="mt-1 text-sm text-muted">
        {r ? `Last run ${ago(s.hoursAgo)} · ${formatDateTime(r.started_at)}` : "No run recorded."}
      </p>

      {/*
        An overdue or never-run source is the failure this page exists for, so
        it gets a sentence rather than just a colour: a badge alone reads as
        decoration, and this is the state where the shop is quietly wrong.
      */}
      {(s.health === "stale" || s.health === "never") && (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {s.health === "never"
            ? "This source has never reported a run. Prices and stock here are as old as the last manual import."
            : "No sync in over a day. The shop may be showing prices and availability the supplier has since changed."}
        </p>
      )}

      {s.health === "failed" && (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">
          {r?.error ?? "The run started but never finished — the process was killed or the machine went down."}
        </p>
      )}

      {r && r.ok && (
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-muted">New</dt>
            <dd className="font-medium">{r.new_products}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Changed</dt>
            <dd className="font-medium">{r.changed}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Checked</dt>
            <dd className="font-medium">{r.fetched}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Failed</dt>
            <dd className={`font-medium ${r.failed ? "text-red-700" : ""}`}>{r.failed}</dd>
          </div>
        </dl>
      )}

      {r && !r.applied && r.ok && (
        <p className="mt-3 text-xs text-muted">
          Dry run — nothing was written.
        </p>
      )}

      <p className="mt-4 border-t border-line pt-3 text-xs text-muted">
        {WHERE_IT_RUNS[s.source] ?? "Schedule not recorded."}
      </p>
    </div>
  );
}

const KIND_LABELS: Record<string, string> = {
  price: "Price",
  name: "Name",
  description: "Description",
  images: "Images",
  availability: "Availability",
  delivery: "Delivery",
};

export function SyncPanel({
  status,
  changes,
}: {
  status: SyncStatus;
  changes: Awaited<ReturnType<typeof import("@/lib/sync-status").getPendingChanges>>;
}) {
  const anyBad = status.sources.some((s) => s.health !== "ok" && s.health !== "running");

  return (
    <>
      {anyBad && (
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
          <strong className="font-medium">Not every source is up to date.</strong> This store buys
          from the supplier after the customer pays, so a stale source means orders it may not be
          able to fill at the price shown.
        </div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {status.sources.map((s) => (
          <SourceCard key={s.source} s={s} />
        ))}
      </div>

      <div className="mt-10">
        <h2 className="font-serif text-2xl">What the suppliers changed</h2>
        <p className="mt-1 text-sm text-muted">
          Recorded, not applied. Prices on the shop are yours — the sync never overwrites them.
        </p>

        {Object.keys(changes.counts).length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {Object.entries(changes.counts)
              .sort((a, b) => b[1] - a[1])
              .map(([kind, n]) => (
                <span
                  key={kind}
                  className="rounded-full border border-line bg-white px-3 py-1 text-xs"
                >
                  {KIND_LABELS[kind] ?? kind} <span className="text-muted">{n}</span>
                </span>
              ))}
          </div>
        )}

        {changes.rows.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-line bg-white px-5 py-10 text-center text-sm text-muted">
            Nothing recorded yet. Changes appear here after a sync runs.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-line bg-white">
            <table className="w-full min-w-180 text-sm">
              <thead className="bg-sand text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Product</th>
                  <th className="px-4 py-3 font-medium">Supplier</th>
                  <th className="px-4 py-3 font-medium">Changed</th>
                  <th className="px-4 py-3 font-medium">Was → now</th>
                  <th className="px-4 py-3 font-medium">When</th>
                </tr>
              </thead>
              <tbody>
                {changes.rows.map((r) => (
                  <tr key={r.id} className="border-t border-line align-top">
                    <td className="px-4 py-3">
                      <span className="font-medium">{r.name ?? r.source_sku}</span>
                      <p className="text-xs text-muted">{r.source_sku}</p>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted">{label(r.source)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(r.change_kinds ?? []).map((k) => (
                          <span
                            key={k}
                            className={`rounded-full px-2 py-0.5 text-xs ${
                              k === "availability"
                                ? "bg-red-50 text-red-700"
                                : k === "price"
                                  ? "bg-amber-50 text-amber-800"
                                  : "bg-sand text-muted"
                            }`}
                          >
                            {KIND_LABELS[k] ?? k}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {/* Only price reads usefully as a before/after; the rest
                          are prose or arrays and would just make noise. */}
                      {r.previous?.price != null ? (
                        <span>
                          <span className="text-muted line-through">
                            {r.previous.price} {r.currency}
                          </span>{" "}
                          → <span className="font-medium">
                            {r.price} {r.currency}
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-muted">
                      {r.changed_at ? formatDateTime(r.changed_at) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-4 text-sm text-muted">
          To act on a price change, edit the product in{" "}
          <Link href="/admin/products" className="text-brand hover:underline">
            Products
          </Link>
          . New products arrive hidden and are listed from there too.
        </p>
      </div>
    </>
  );
}
