"use client";

import { useActionState, useRef, useState, startTransition } from "react";
import { pricingCsvAction } from "@/app/admin/actions";
import { emptyPricingState, type PricingState } from "@/lib/admin-form-state";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/cn";

/**
 * CSV pricing tools.
 *
 * The file is held in component state rather than submitted through
 * `<form action={…}>`: React resets uncontrolled form fields once an action
 * resolves, which would clear the file input between "Preview" and "Apply".
 * Keeping it here lets the same upload drive both steps.
 */

function FilePicker({
  id,
  file,
  onPick,
  disabled,
}: {
  id: string;
  file: File | null;
  onPick: (f: File | null) => void;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <input
        ref={ref}
        id={id}
        type="file"
        accept=".csv,text/csv"
        disabled={disabled}
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
        className="sr-only"
      />
      <label
        htmlFor={id}
        className={cn(
          "cursor-pointer rounded-full border border-line bg-white px-5 py-2.5 text-sm font-medium transition-colors hover:border-brand hover:text-brand",
          disabled && "pointer-events-none opacity-60",
        )}
      >
        Choose CSV…
      </label>
      <span className="text-sm text-muted">
        {file ? (
          <>
            {file.name}{" "}
            <button
              type="button"
              onClick={() => {
                onPick(null);
                if (ref.current) ref.current.value = "";
              }}
              className="ml-1 text-xs text-brand hover:underline"
            >
              clear
            </button>
          </>
        ) : (
          "No file selected"
        )}
      </span>
    </div>
  );
}

/** A downloadable example sheet, built client-side — no route needed. */
function TemplateLink({ headers, rows, name }: { headers: string; rows: string[]; name: string }) {
  const csv = [headers, ...rows].join("\r\n");
  const href = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
  return (
    <a href={href} download={name} className="text-xs text-brand hover:underline">
      Download template
    </a>
  );
}

function Counts({ children }: { children: React.ReactNode }) {
  return <div className="mt-5 flex flex-wrap gap-x-6 gap-y-1 text-sm">{children}</div>;
}

function Problems({ state }: { state: PricingState }) {
  if (state.kind !== "preview" && state.kind !== "applied" && state.kind !== "validated") {
    return null;
  }
  const { notFound, invalid } = state.result;
  if (!notFound.length && !invalid.length) return null;

  return (
    <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
      {invalid.length > 0 && (
        <div>
          <p className="font-medium">{invalid.length} row(s) skipped as unreadable</p>
          <ul className="mt-1 list-inside list-disc text-xs">
            {invalid.slice(0, 8).map((i) => (
              <li key={`i-${i.line}`}>
                Line {i.line}: {i.reason}
              </li>
            ))}
            {invalid.length > 8 && <li>…and {invalid.length - 8} more</li>}
          </ul>
        </div>
      )}
      {notFound.length > 0 && (
        <div className={cn(invalid.length > 0 && "mt-3")}>
          <p className="font-medium">{notFound.length} product(s) not found</p>
          <p className="mt-1 text-xs">
            {notFound
              .slice(0, 8)
              .map((n) => `line ${n.line}: ${n.key}`)
              .join(" · ")}
            {notFound.length > 8 && ` …and ${notFound.length - 8} more`}
          </p>
        </div>
      )}
    </div>
  );
}

/* ------------------------- 1. bulk price update ------------------------- */

export function BulkPriceUpdate() {
  const [state, dispatch, pending] = useActionState(pricingCsvAction, emptyPricingState);
  const [file, setFile] = useState<File | null>(null);

  function run(mode: "preview" | "apply") {
    if (!file) return;
    const fd = new FormData();
    fd.set("file", file);
    fd.set("mode", mode);
    startTransition(() => dispatch(fd));
  }

  const hasPreview = state.kind === "preview" && state.result.changes.length > 0;

  return (
    <section className="rounded-2xl border border-line bg-white p-5 sm:p-6">
      <h2 className="font-serif text-xl">Bulk price update</h2>
      <p className="mt-1 text-sm text-muted">
        Upload a CSV of product ids (or slugs) and new prices. Preview first — nothing is written
        until you apply.
      </p>
      <p className="mt-2 text-xs text-muted">
        Columns: <code className="text-ink">id</code> (or <code className="text-ink">slug</code>)
        and <code className="text-ink">price</code>.{" "}
        <TemplateLink
          name="price-update-template.csv"
          headers="id,price"
          rows={["hydrating-rose-serum,12.500", "velvet-matte-lipstick,7.250"]}
        />
      </p>

      <div className="mt-5">
        <FilePicker id="update-csv" file={file} onPick={setFile} disabled={pending} />
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => run("preview")}
          disabled={!file || pending}
          className="rounded-full border border-line px-5 py-2.5 text-sm font-medium transition-colors hover:border-brand hover:text-brand disabled:opacity-50"
        >
          {pending ? "Working…" : "Preview changes"}
        </button>
        <button
          type="button"
          onClick={() => run("apply")}
          disabled={!file || pending || !hasPreview}
          title={hasPreview ? undefined : "Preview the file first"}
          className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          Apply {hasPreview ? `${state.result.changes.length} change(s)` : "changes"}
        </button>
      </div>

      {state.kind === "error" && (
        <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {state.message}
        </div>
      )}

      {(state.kind === "preview" || state.kind === "applied") && (
        <>
          {state.kind === "applied" && (
            <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              Applied {state.result.changes.length} price change(s).
            </div>
          )}

          <Counts>
            <span>
              <span className="text-muted">Rows read:</span> {state.result.total}
            </span>
            <span>
              <span className="text-muted">
                {state.kind === "applied" ? "Changed:" : "Will change:"}
              </span>{" "}
              <strong>{state.result.changes.length}</strong>
            </span>
            <span>
              <span className="text-muted">Already correct:</span> {state.result.unchanged}
            </span>
            <span className="text-muted">
              Matched on “{state.result.idHeader}” / “{state.result.priceHeader}”
            </span>
          </Counts>

          <Problems state={state} />

          {state.result.changes.length > 0 && (
            <div className="mt-5 max-h-96 overflow-auto rounded-xl border border-line">
              <table className="w-full min-w-140 text-sm">
                <thead className="sticky top-0 bg-sand text-left text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">Product</th>
                    <th className="px-4 py-3 font-medium text-right">Current</th>
                    <th className="px-4 py-3 font-medium text-right">New</th>
                    <th className="px-4 py-3 font-medium text-right">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {state.result.changes.map((c) => {
                    const delta = c.to - c.from;
                    return (
                      <tr key={c.id} className="border-t border-line">
                        <td className="px-4 py-2.5">
                          {c.name}
                          <span className="block text-xs text-muted">{c.slug}</span>
                        </td>
                        <td className="px-4 py-2.5 text-right text-muted">
                          {formatPrice(c.from, c.currency)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-medium">
                          {formatPrice(c.to, c.currency)}
                        </td>
                        <td
                          className={cn(
                            "px-4 py-2.5 text-right",
                            delta > 0 ? "text-emerald-700" : "text-red-700",
                          )}
                        >
                          {delta > 0 ? "+" : ""}
                          {delta.toFixed(3)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {state.kind === "preview" && state.result.changes.length === 0 && (
            <p className="mt-5 text-sm text-muted">
              Every matched product already has the price in this sheet — nothing to apply.
            </p>
          )}
        </>
      )}
    </section>
  );
}

/* ---------------------- 2. margin floor validation ---------------------- */

export function PriceFloorValidation() {
  const [state, dispatch, pending] = useActionState(pricingCsvAction, emptyPricingState);
  const [file, setFile] = useState<File | null>(null);

  function run() {
    if (!file) return;
    const fd = new FormData();
    fd.set("file", file);
    fd.set("mode", "validate");
    startTransition(() => dispatch(fd));
  }

  return (
    <section className="mt-8 rounded-2xl border border-line bg-white p-5 sm:p-6">
      <h2 className="font-serif text-xl">Price validation (margin guard)</h2>
      <p className="mt-1 text-sm text-muted">
        Upload a sheet of minimum acceptable prices. Every product is checked to confirm the store
        price is <strong>equal to or above</strong> its floor, so margin can&rsquo;t go negative.
        Read-only — this never changes a price.
      </p>
      <p className="mt-2 text-xs text-muted">
        Columns: <code className="text-ink">id</code> (or <code className="text-ink">slug</code>)
        and <code className="text-ink">min_price</code> (also accepts{" "}
        <code className="text-ink">cost</code> or <code className="text-ink">price</code>).{" "}
        <TemplateLink
          name="price-floor-template.csv"
          headers="id,min_price"
          rows={["hydrating-rose-serum,10.000", "velvet-matte-lipstick,6.000"]}
        />
      </p>

      <div className="mt-5">
        <FilePicker id="validate-csv" file={file} onPick={setFile} disabled={pending} />
      </div>

      <div className="mt-5">
        <button
          type="button"
          onClick={run}
          disabled={!file || pending}
          className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Checking…" : "Validate prices"}
        </button>
      </div>

      {state.kind === "error" && (
        <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {state.message}
        </div>
      )}

      {state.kind === "validated" && (
        <>
          {state.result.violations.length === 0 ? (
            <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              All {state.result.passed} matched product(s) are priced at or above their floor.
              Margin is safe.
            </div>
          ) : (
            <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              <strong>{state.result.violations.length}</strong> product(s) are priced{" "}
              <strong>below</strong> their floor and are losing margin.
            </div>
          )}

          <Counts>
            <span>
              <span className="text-muted">Rows read:</span> {state.result.total}
            </span>
            <span>
              <span className="text-muted">Passed:</span>{" "}
              <strong className="text-emerald-700">{state.result.passed}</strong>
            </span>
            <span>
              <span className="text-muted">Below floor:</span>{" "}
              <strong className={state.result.violations.length ? "text-red-700" : undefined}>
                {state.result.violations.length}
              </strong>
            </span>
            <span className="text-muted">
              Matched on “{state.result.idHeader}” / “{state.result.priceHeader}”
            </span>
          </Counts>

          <Problems state={state} />

          {state.result.violations.length > 0 && (
            <div className="mt-5 max-h-96 overflow-auto rounded-xl border border-line">
              <table className="w-full min-w-140 text-sm">
                <thead className="sticky top-0 bg-sand text-left text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">Product</th>
                    <th className="px-4 py-3 font-medium text-right">Store price</th>
                    <th className="px-4 py-3 font-medium text-right">Floor</th>
                    <th className="px-4 py-3 font-medium text-right">Short by</th>
                    <th className="px-4 py-3 font-medium text-right">Fix</th>
                  </tr>
                </thead>
                <tbody>
                  {state.result.violations.map((v) => (
                    <tr key={v.id} className="border-t border-line">
                      <td className="px-4 py-2.5">
                        {v.name}
                        <span className="block text-xs text-muted">{v.slug}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-red-700">
                        {formatPrice(v.storePrice, v.currency)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-muted">
                        {formatPrice(v.floorPrice, v.currency)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium text-red-700">
                        −{v.shortfall.toFixed(3)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <a
                          href={`/admin/products/${v.id}`}
                          className="text-brand hover:underline"
                        >
                          Edit
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
