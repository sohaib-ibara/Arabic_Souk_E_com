"use client";

import { adminButton } from "@/components/admin/button-styles";
import { formatPrice } from "@/lib/format";
import {
  supplierCsv,
  supplierCsvFilename,
  type SupplierRequest,
  type SupplierSplit,
} from "@/lib/supplier-order";

/**
 * "What we need to buy, per supplier" — as a file you can send them.
 *
 * One component for both callers: an order screen passes that order, the
 * orders list passes a day's worth. The only difference is what `covers`
 * says, which is also what the filename is built from.
 *
 * Built in the browser from what the page already rendered, matching
 * SubscriberExport: a download route would be a second place to get the
 * authorisation check right, for data this page has already fetched and
 * displayed to the same person.
 *
 * One button per supplier, never a combined file. The point of the file is
 * that it gets emailed to somebody, and a request to noon listing what we buy
 * from Cult Beauty is a thing you cannot send. The split is done on the
 * server; see splitBySupplier.
 */
export function SupplierExport({
  split,
  covers,
  coversLabel,
  children,
}: {
  split: SupplierSplit;
  /** Goes in the filename: an order number, or a date. */
  covers: string;
  /** Goes on screen: "AS-260907-1008", "7 Oct 2026", "all open orders". */
  coversLabel: string;
  /** Anything the calling page needs to say about what was included. */
  children?: React.ReactNode;
}) {
  const { requests, unsourced } = split;

  return (
    <section className="mt-6 rounded-2xl border border-line bg-white p-5">
      <h2 className="font-medium">Send to suppliers</h2>
      <p className="mt-1 text-sm text-muted">
        {/* Explicit space: this JSX transform drops the one that would
            otherwise sit between </span> and the word after it — the same
            trap already noted on the order screen. */}
        What <span className="text-ink">{coversLabel}</span>{" "}
        needs us to buy, as one file per supplier. The file carries their prices and their product codes — not the
        customer&rsquo;s details, and not what we charged.
      </p>

      {children}

      {requests.length === 0 ? (
        <p className="mt-4 rounded-xl bg-sand/60 px-4 py-3 text-sm text-muted">
          Nothing to buy here.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {requests.map((r) => (
            <li
              key={r.key}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">{r.name}</p>
                <p className="text-xs text-muted">
                  {r.lines.length} line{r.lines.length === 1 ? "" : "s"} · {r.units} unit
                  {r.units === 1 ? "" : "s"}
                  {r.total > 0 && r.currency && <> · about {formatPrice(r.total, r.currency)}</>}
                  {/* Said plainly rather than folded into the total: a figure
                      that quietly leaves an item out is worse than no figure. */}
                  {r.missingPrices > 0 && (
                    <span className="text-amber-700">
                      {" "}
                      · {r.missingPrices} line{r.missingPrices === 1 ? "" : "s"} with no price
                      from them
                    </span>
                  )}
                </p>
              </div>
              <DownloadButton request={r} covers={covers} />
            </li>
          ))}
        </ul>
      )}

      {/*
        Not from a supplier: hand-added products, and products deleted from the
        catalogue since the order was placed. They are in no file and still
        have to be fulfilled, so the only safe thing is to say so.
      */}
      {unsourced.length > 0 && (
        <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-900">
          {unsourced.length} line{unsourced.length === 1 ? " is" : "s are"} not linked to a
          supplier and {unsourced.length === 1 ? "is" : "are"} in none of these files:{" "}
          {[...new Set(unsourced.map((i) => i.name))].join(", ")}.
        </p>
      )}
    </section>
  );
}

function DownloadButton({ request, covers }: { request: SupplierRequest; covers: string }) {
  function download() {
    const csv = supplierCsv(request);
    // A BOM, so Excel opens it as UTF-8 rather than mangling any non-ASCII —
    // and product names here are full of ™, é and ×.
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = supplierCsvFilename(request, covers);
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button type="button" onClick={download} className={adminButton("secondary", "sm")}>
      Download CSV
    </button>
  );
}
