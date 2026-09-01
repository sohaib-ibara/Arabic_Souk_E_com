"use client";

import { useActionState } from "react";
import { vendorPriceAction } from "@/app/admin/actions";
import { emptyVendorPriceState, type VendorPriceState } from "@/lib/admin-form-state";
import { formatPrice } from "@/lib/format";
import { Notice } from "@/components/admin/notice";

/**
 * Preview-then-apply for a vendor's prices.
 *
 * Two buttons submit the same form with a different `intent`, so the preview
 * and the write are guaranteed to be asking for the same thing. The apply
 * button only appears once a preview has been seen — repricing rewrites every
 * price a vendor owns, and a mistyped exchange rate should not be one click
 * away from the shop.
 */
export function VendorPricing({
  vendorId,
  vendorName,
  currency,
}: {
  vendorId: string;
  vendorName: string;
  currency: string;
}) {
  const [state, formAction, pending] = useActionState<VendorPriceState, FormData>(
    vendorPriceAction,
    emptyVendorPriceState,
  );

  const previewed = state.kind === "preview" && state.result.changed > 0;

  return (
    <div className="rounded-2xl border border-line bg-white p-5">
      <h3 className="font-medium">Prices</h3>
      <p className="mt-1 text-sm text-muted">
        Everything a shopper sees is in BHD. These two rebuild that number — the first from
        what {vendorName} charges, the second from the price already on the shop.
      </p>

      <form action={formAction} className="mt-4 flex flex-wrap items-center gap-3">
        <input type="hidden" name="vendor_id" value={vendorId} />

        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="mode"
            value="reprice"
            defaultChecked
            className="accent-brand"
          />
          Recompute from {currency}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="mode" value="round" className="accent-brand" />
          Only round existing BHD prices
        </label>

        <div className="flex w-full flex-wrap gap-3 pt-1">
          <button
            type="submit"
            name="intent"
            value="preview"
            disabled={pending}
            className="rounded-full border border-line bg-white px-5 py-2.5 text-sm font-medium transition-colors hover:border-brand hover:text-brand disabled:opacity-60"
          >
            {pending ? "Working…" : "Preview changes"}
          </button>

          {previewed && (
            <button
              type="submit"
              name="intent"
              value="apply"
              disabled={pending}
              className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              Apply {state.result.changed} price change
              {state.result.changed === 1 ? "" : "s"}
            </button>
          )}
        </div>
      </form>

      {state.kind === "error" && (
        <Notice tone="danger" title="Couldn’t reprice" className="mt-4">
          {state.message}
        </Notice>
      )}

      {(state.kind === "preview" || state.kind === "applied") && (
        <PriceTable state={state} />
      )}
    </div>
  );
}

function PriceTable({
  state,
}: {
  state: Extract<VendorPriceState, { kind: "preview" | "applied" }>;
}) {
  const { result, mode } = state;
  const applied = state.kind === "applied";

  if (result.changed === 0) {
    return (
      <Notice tone="success" className="mt-4">
        Every price already matches the rule. Nothing to change.
        <Skipped result={result} mode={mode} />
      </Notice>
    );
  }

  return (
    <div className="mt-4">
      <Notice tone={applied ? "success" : "info"}>
        {applied
          ? `Updated ${result.changed} price${result.changed === 1 ? "" : "s"}.`
          : `${result.changed} price${result.changed === 1 ? "" : "s"} would change. Nothing has been written yet.`}
        <Skipped result={result} mode={mode} />
      </Notice>

      <div className="mt-3 overflow-x-auto rounded-2xl border border-line">
        <table className="w-full min-w-[34rem] text-sm">
          <thead className="bg-sand text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-2.5 font-medium">Product</th>
              {mode === "reprice" && <th className="px-4 py-2.5 font-medium">Supplier</th>}
              <th className="px-4 py-2.5 font-medium">Now</th>
              <th className="px-4 py-2.5 font-medium">
                {applied ? "Became" : "Would become"}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {result.changes.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-2.5">{c.name}</td>
                {mode === "reprice" && (
                  <td className="whitespace-nowrap px-4 py-2.5 text-muted">
                    {c.source_currency} {c.source_price.toFixed(2)}
                  </td>
                )}
                <td className="whitespace-nowrap px-4 py-2.5 text-muted">
                  {formatPrice(c.old_price)}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 font-medium">
                  {formatPrice(c.new_price)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {result.changed > result.changes.length && (
        <p className="mt-2 text-xs text-muted">
          Showing the first {result.changes.length} of {result.changed}.
        </p>
      )}
    </div>
  );
}

/**
 * What the operation could not touch.
 *
 * Said out loud because a silent skip reads as "done" — someone who repriced
 * 301 products and saw 40 change should know the other 261 had no supplier
 * price rather than assuming they were already correct.
 */
function Skipped({
  result,
  mode,
}: {
  result: Extract<VendorPriceState, { kind: "preview" }>["result"];
  mode: string;
}) {
  const bits: string[] = [];
  if (result.locked) bits.push(`${result.locked} with a manually set price`);
  if (mode === "reprice" && result.missingSourcePrice) {
    bits.push(`${result.missingSourcePrice} with no supplier price yet`);
  }
  if (!bits.length) return null;

  return (
    <p className="mt-1 text-xs">
      Left alone: {bits.join(", ")}.
      {mode === "reprice" && result.missingSourcePrice > 0 && (
        <> Those pick up a supplier price on their next sync.</>
      )}
    </p>
  );
}
