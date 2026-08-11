"use client";

import { useActionState, useRef, useState, startTransition } from "react";
import { stockCsvAction } from "@/app/admin/actions";
import { emptyStockCsvState, type StockCsvState } from "@/lib/admin-form-state";
import { cn } from "@/lib/cn";

/**
 * CSV stock tools. Like the pricing tools, the file is held in state rather
 * than submitted through `<form action={…}>` — React resets uncontrolled fields
 * once an action resolves, which would clear the picker between preview and
 * apply.
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

function TemplateLink({ headers, rows, name }: { headers: string; rows: string[]; name: string }) {
  const csv = [headers, ...rows].join("\r\n");
  return (
    <a
      href={`data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`}
      download={name}
      className="text-xs text-brand hover:underline"
    >
      Download template
    </a>
  );
}

function Problems({ state }: { state: StockCsvState }) {
  if (state.kind !== "preview" && state.kind !== "applied") return null;
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
            {notFound.slice(0, 8).map((n) => `line ${n.line}: ${n.key}`).join(" · ")}
            {notFound.length > 8 && ` …and ${notFound.length - 8} more`}
          </p>
        </div>
      )}
    </div>
  );
}

function ChangeTable({ state }: { state: StockCsvState }) {
  if (state.kind !== "preview" && state.kind !== "applied") return null;
  const { changes, mode } = state.result;
  if (!changes.length) return null;

  return (
    <div className="mt-5 max-h-96 overflow-auto rounded-xl border border-line">
      <table className="w-full min-w-140 text-sm">
        <thead className="sticky top-0 bg-sand text-left text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="px-4 py-3 font-medium">Product</th>
            <th className="px-4 py-3 font-medium text-right">
              {mode === "count" ? "System" : "Current"}
            </th>
            <th className="px-4 py-3 font-medium text-right">
              {mode === "count" ? "Counted" : "New"}
            </th>
            <th className="px-4 py-3 font-medium text-right">
              {mode === "count" ? "Variance" : "Change"}
            </th>
          </tr>
        </thead>
        <tbody>
          {changes.map((c) => (
            <tr key={c.id} className="border-t border-line">
              <td className="px-4 py-2.5">
                {c.name}
                <span className="block text-xs text-muted">{c.sku ?? c.slug}</span>
              </td>
              <td className="px-4 py-2.5 text-right text-muted">{c.from}</td>
              <td className="px-4 py-2.5 text-right font-medium">{c.to}</td>
              <td
                className={cn(
                  "px-4 py-2.5 text-right font-medium",
                  c.delta > 0 ? "text-emerald-700" : "text-red-700",
                )}
              >
                {c.delta > 0 ? "+" : ""}
                {c.delta}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Summary({ state }: { state: StockCsvState }) {
  if (state.kind !== "preview" && state.kind !== "applied") return null;
  const r = state.result;
  return (
    <div className="mt-5 flex flex-wrap gap-x-6 gap-y-1 text-sm">
      <span>
        <span className="text-muted">Rows read:</span> {r.total}
      </span>
      <span>
        <span className="text-muted">
          {state.kind === "applied" ? "Changed:" : r.mode === "count" ? "Variances:" : "Will change:"}
        </span>{" "}
        <strong>{r.changes.length}</strong>
      </span>
      <span>
        <span className="text-muted">Already correct:</span> {r.unchanged}
      </span>
      <span>
        <span className="text-muted">Net units:</span>{" "}
        <strong className={r.netUnits < 0 ? "text-red-700" : undefined}>
          {r.netUnits > 0 ? "+" : ""}
          {r.netUnits}
        </strong>
      </span>
      <span className="text-muted">
        Matched on “{r.idHeader}” / “{r.qtyHeader}”
      </span>
    </div>
  );
}

/** Shared panel for both CSV modes; only the copy and the ledger reason differ. */
function CsvPanel({
  mode,
  title,
  description,
  columnHint,
  template,
  applyLabel,
}: {
  mode: "set" | "count";
  title: string;
  description: React.ReactNode;
  columnHint: React.ReactNode;
  template: { name: string; headers: string; rows: string[] };
  applyLabel: string;
}) {
  const [state, dispatch, pending] = useActionState(stockCsvAction, emptyStockCsvState);
  const [file, setFile] = useState<File | null>(null);

  function run(apply: boolean) {
    if (!file) return;
    const fd = new FormData();
    fd.set("file", file);
    fd.set("mode", mode);
    fd.set("apply", apply ? "1" : "0");
    startTransition(() => dispatch(fd));
  }

  const previewed = state.kind === "preview" && state.result.changes.length > 0;

  return (
    <section className="rounded-2xl border border-line bg-white p-5 sm:p-6">
      <h2 className="font-serif text-xl">{title}</h2>
      <p className="mt-1 text-sm text-muted">{description}</p>
      <p className="mt-2 text-xs text-muted">
        {columnHint}{" "}
        <TemplateLink name={template.name} headers={template.headers} rows={template.rows} />
      </p>

      <div className="mt-5">
        <FilePicker id={`${mode}-csv`} file={file} onPick={setFile} disabled={pending} />
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => run(false)}
          disabled={!file || pending}
          className="rounded-full border border-line px-5 py-2.5 text-sm font-medium transition-colors hover:border-brand hover:text-brand disabled:opacity-50"
        >
          {pending ? "Working…" : mode === "count" ? "Check variance" : "Preview changes"}
        </button>
        <button
          type="button"
          onClick={() => run(true)}
          disabled={!file || pending || !previewed}
          title={previewed ? undefined : "Preview the file first"}
          className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {applyLabel}
          {previewed && ` (${state.result.changes.length})`}
        </button>
      </div>

      {state.kind === "error" && (
        <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {state.message}
        </div>
      )}

      {state.kind === "applied" && (
        <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          Recorded {state.result.changes.length} stock movement(s).
        </div>
      )}

      {state.kind === "preview" && state.result.changes.length === 0 && (
        <p className="mt-5 text-sm text-muted">
          {state.result.mode === "count"
            ? "No variance — every counted product matches the system."
            : "Every matched product already has this quantity."}
        </p>
      )}

      <Summary state={state} />
      <Problems state={state} />
      <ChangeTable state={state} />
    </section>
  );
}

export function BulkStockUpdate() {
  return (
    <CsvPanel
      mode="set"
      title="Bulk stock update"
      description="Upload a CSV of products and their new on-hand quantities. Preview first — nothing is written until you apply."
      columnHint={
        <>
          Columns: <code className="text-ink">id</code>, <code className="text-ink">slug</code> or{" "}
          <code className="text-ink">sku</code>, plus{" "}
          <code className="text-ink">quantity</code>.
        </>
      }
      template={{
        name: "stock-update-template.csv",
        headers: "sku,quantity",
        rows: ["AS-SERUM-001,24", "AS-LIP-014,8"],
      }}
      applyLabel="Apply"
    />
  );
}

export function StockTake() {
  return (
    <div className="mt-8">
      <CsvPanel
        mode="count"
        title="Stock take"
        description="Upload counted quantities from a physical count. The variance against the system is shown before anything is written, and each correction is logged as a stock count."
        columnHint={
          <>
            Columns: <code className="text-ink">sku</code> (or{" "}
            <code className="text-ink">id</code>/<code className="text-ink">slug</code>) plus{" "}
            <code className="text-ink">counted</code>.
          </>
        }
        template={{
          name: "stock-take-template.csv",
          headers: "sku,counted",
          rows: ["AS-SERUM-001,22", "AS-LIP-014,9"],
        }}
        applyLabel="Post corrections"
      />
    </div>
  );
}
