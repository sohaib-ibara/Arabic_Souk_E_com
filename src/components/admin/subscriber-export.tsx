"use client";

import { toCsv } from "@/lib/csv";
import type { Subscriber } from "@/lib/newsletter";

/**
 * Download the list as CSV.
 *
 * Built in the browser from data the page already has, rather than as a route
 * that would re-query and need its own authorisation check. One fewer endpoint
 * exposing a subscriber list is worth a few lines here.
 */
export function SubscriberExport({ rows }: { rows: Subscriber[] }) {
  function download() {
    const csv = toCsv([
      ["email", "source", "page", "subscribed_at"],
      ...rows.map((r) => [r.email, r.source ?? "", r.page ?? "", r.subscribed_at]),
    ]);
    // A BOM, so Excel opens it as UTF-8 instead of mangling any non-ASCII.
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "subscribers.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      onClick={download}
      className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
    >
      Export CSV
    </button>
  );
}
