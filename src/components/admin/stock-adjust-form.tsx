"use client";

import { useActionState, useState } from "react";
import { adjustStockAction } from "@/app/admin/actions";
import { emptyStockAdjustState } from "@/lib/admin-form-state";
import { MANUAL_REASONS, reasonLabels, type InventoryRow } from "@/lib/inventory";
import { cn } from "@/lib/cn";

const inputClass =
  "w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm outline-none focus:border-brand";

/**
 * Manual stock change for one product.
 *
 * Offers both an absolute figure and a relative change because the two match
 * different real tasks: counting a shelf gives you a total, while receiving a
 * delivery or writing off breakage gives you a difference. Forcing one into the
 * other is where miscounts come from.
 */
export function StockAdjustForm({ product }: { product: InventoryRow }) {
  const [state, formAction, pending] = useActionState(adjustStockAction, emptyStockAdjustState);
  const [mode, setMode] = useState<"absolute" | "delta">("absolute");

  return (
    <section className="rounded-2xl border border-line bg-white p-5 sm:p-6">
      <h2 className="font-serif text-xl">Adjust stock</h2>
      <p className="mt-1 text-sm text-muted">
        Every change is written to the ledger with your email against it.
      </p>

      {state.ok && state.message && (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-sm text-emerald-800">
          {state.message}
        </div>
      )}
      {state.error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-800">
          {state.error}
        </div>
      )}

      <form action={formAction} className="mt-5 space-y-4">
        <input type="hidden" name="product_id" value={product.id} />
        <input type="hidden" name="slug" value={product.slug} />
        <input type="hidden" name="adjust_mode" value={mode} />

        <div className="flex gap-2">
          {(["absolute", "delta"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                "rounded-full border px-4 py-2 text-sm transition-colors",
                mode === m
                  ? "border-ink bg-ink text-white"
                  : "border-line bg-white text-muted hover:border-brand hover:text-brand",
              )}
            >
              {m === "absolute" ? "Set to" : "Add / remove"}
            </button>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="value" className="block text-sm font-medium text-ink">
              {mode === "absolute" ? "New on-hand total" : "Change (use − to remove)"}
            </label>
            <input
              id="value"
              name="value"
              inputMode="numeric"
              required
              defaultValue={mode === "absolute" ? String(product.stockQuantity) : ""}
              placeholder={mode === "absolute" ? "0" : "e.g. 12 or −3"}
              className={cn(inputClass, "mt-1.5")}
            />
            <p className="mt-1.5 text-xs text-muted">
              Currently {product.stockQuantity} in stock.
            </p>
          </div>

          <div>
            <label htmlFor="reason" className="block text-sm font-medium text-ink">
              Reason
            </label>
            <select
              id="reason"
              name="reason"
              defaultValue="adjustment"
              className={cn(inputClass, "mt-1.5")}
            >
              {MANUAL_REASONS.map((r) => (
                <option key={r} value={r}>
                  {reasonLabels[r]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="note" className="block text-sm font-medium text-ink">
            Note <span className="font-normal text-muted">(optional)</span>
          </label>
          <input
            id="note"
            name="note"
            placeholder="Damaged in transit, supplier delivery #1234…"
            className={cn(inputClass, "mt-1.5")}
          />
        </div>

        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-ink px-6 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Recording…" : "Record change"}
        </button>
      </form>

      <p className="mt-4 rounded-xl border border-line bg-sand/50 p-3.5 text-xs text-muted">
        Changing this number doesn&rsquo;t stop customers ordering. To take the product off the
        store, use the <strong className="text-ink">Sold on the store</strong> switch.
      </p>
    </section>
  );
}
