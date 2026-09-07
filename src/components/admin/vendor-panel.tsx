import Link from "next/link";
import {
  saveVendorAction,
  setVendorEnabledAction,
} from "@/app/admin/actions";
import type { Vendor } from "@/lib/vendors";
import { VendorImport } from "@/components/admin/vendor-import";
import { VendorPricing } from "@/components/admin/vendor-pricing";
import { cn } from "@/lib/cn";
import { adminButton } from "@/components/admin/button-styles";
import { SubmitButton } from "@/components/admin/submit-button";

/**
 * Vendor provisioning.
 *
 * Plain form posts rather than a client component, matching the rest of the
 * admin: every switch here works with JavaScript off, and each one is a single
 * server round trip that ends in a redirect back to the same view.
 *
 * The switches are not enforced in this file. `products.is_listed` is
 * recomputed by database trigger, so what a shopper sees follows from the
 * write, not from anything rendered here.
 */

const KIND_LABEL: Record<string, string> = {
  scrape: "Scraped",
  api: "API feed",
  manual: "Manual",
};

/**
 * The vendor cards: what each supplier is, and whether it is on.
 *
 * Deliberately short. The category ticklist lived here for a version and made
 * each card fifty-four rows tall, which pushed the second vendor off the screen
 * and made the one thing these cards are for - comparing suppliers at a glance
 * - impossible. It is one panel with a vendor dropdown now; see
 * VendorCategoryPicker.
 */
export function VendorList({
  vendors,
  selectedId,
  back,
}: {
  vendors: Vendor[];
  selectedId: string | null;
  back: string;
}) {
  return (
    <div className="space-y-3">
      {vendors.map((v) => {
        const selected = v.id === selectedId;
        return (
          <div
            key={v.id}
            className={cn(
              "rounded-2xl border bg-white p-5 transition-colors",
              selected ? "border-brand" : "border-line",
            )}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-medium">{v.name}</h2>
                  <span className="rounded-full bg-sand px-2 py-0.5 text-xs text-muted">
                    {KIND_LABEL[v.kind] ?? v.kind}
                  </span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-medium",
                      v.is_enabled
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-neutral-100 text-neutral-600",
                    )}
                  >
                    {v.is_enabled ? "On" : "Off"}
                  </span>
                </div>

                <p className="mt-1 text-sm text-muted">
                  {v.product_count === 0 ? (
                    v.staged_count > 0 ? (
                      <>
                        {v.staged_count} products waiting in staging, none in the catalogue yet
                      </>
                    ) : (
                      <>No products yet. Run the sync.</>
                    )
                  ) : (
                    <>
                      {v.listed_count} of {v.product_count} products visible
                      {v.staged_count > v.product_count && (
                        <> · {v.staged_count - v.product_count} more in staging</>
                      )}
                      {v.disabled_categories > 0 && (
                        <> · {v.disabled_categories} category switched off</>
                      )}
                    </>
                  )}
                  {" · "}1 {v.currency} = {v.fx_rate_to_bhd} BHD
                </p>

                {v.notes && <p className="mt-1 text-xs text-muted">{v.notes}</p>}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <Link
                  href={selected ? "/admin/vendors" : `/admin/vendors?vendor=${v.id}`}
                  className={adminButton("secondary")}
                >
                  {selected ? "Close" : "Configure"}
                </Link>

                <form action={setVendorEnabledAction}>
                  <input type="hidden" name="vendor_id" value={v.id} />
                  <input type="hidden" name="enabled" value={v.is_enabled ? "0" : "1"} />
                  <input type="hidden" name="back" value={back} />
                  {/* Turning a vendor ON is the eye-catching action; turning
                      one off is the quiet one you should have to mean. */}
                  <SubmitButton
                    variant={v.is_enabled ? "secondary" : "primary"}
                    pendingLabel={v.is_enabled ? "Turning off" : "Turning on"}
                  >
                    {v.is_enabled ? "Turn off" : "Turn on"}
                  </SubmitButton>
                </form>
              </div>
            </div>

          </div>
        );
      })}
    </div>
  );
}

/**
 * The settings behind Configure: pricing, importing, the vendor key.
 *
 * Categories are deliberately NOT here any more — they are on the card itself,
 * where somebody looking at "noon: 301 products" can change what noon sells
 * without first working out that Configure is where that lives.
 */
export function VendorDetail({
  vendor,
  back,
}: {
  vendor: Vendor;
  back: string;
}) {
  return (
    <div className="mt-8 space-y-6">
      <div>
        <h2 className="font-serif text-2xl">{vendor.name}</h2>
        <p className="mt-1 text-sm text-muted">
          Key <code className="rounded bg-sand px-1.5 py-0.5 text-xs">{vendor.key}</code> — this
          is what ties products to this vendor and cannot be changed.
        </p>
      </div>

      {!vendor.is_enabled && (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          This vendor is switched off, so none of its products are on the shop whatever its
          category choices say. They take effect when you turn it on.
        </p>
      )}

      <VendorImport
        vendorId={vendor.id}
        vendorName={vendor.name}
        stagedCount={vendor.staged_count}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <PricingRule vendor={vendor} back={back} />
        <VendorPricing
          vendorId={vendor.id}
          vendorName={vendor.name}
          currency={vendor.currency}
        />
      </div>

    </div>
  );
}

/**
 * The pricing rule. Saving it changes no price on its own — it only decides
 * what the next reprice computes, which is why the two are separate panels.
 */
function PricingRule({ vendor, back }: { vendor: Vendor; back: string }) {
  const field =
    "mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm focus:border-brand focus:outline-none";

  return (
    <form action={saveVendorAction} className="rounded-2xl border border-line bg-white p-5">
      <input type="hidden" name="vendor_id" value={vendor.id} />
      <input type="hidden" name="back" value={back} />

      <h3 className="font-medium">Pricing rule</h3>
      <p className="mt-1 text-sm text-muted">
        Applied in order: supplier price × rate, plus markup, plus surcharge, then rounded.
        Saving this does not change any price.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          Name
          <input name="name" defaultValue={vendor.name} className={field} />
        </label>

        <label className="block text-sm">
          Data arrives by
          <select name="kind" defaultValue={vendor.kind} className={field}>
            <option value="scrape">Scraping</option>
            <option value="api">Their API</option>
            <option value="manual">Manually</option>
          </select>
        </label>

        <label className="block text-sm">
          Their currency
          <input name="currency" defaultValue={vendor.currency} className={field} />
        </label>

        <label className="block text-sm">
          1 {vendor.currency} in BHD
          <input
            name="fx_rate_to_bhd"
            type="number"
            step="0.000001"
            min="0.000001"
            defaultValue={vendor.fx_rate_to_bhd}
            className={field}
          />
        </label>

        <label className="block text-sm">
          Markup %
          <input
            name="markup_percent"
            type="number"
            step="0.01"
            defaultValue={vendor.markup_percent}
            className={field}
          />
        </label>

        <label className="block text-sm">
          Per-item surcharge (BHD)
          <input
            name="surcharge_bhd"
            type="number"
            step="0.01"
            min="0"
            defaultValue={vendor.surcharge_bhd}
            className={field}
          />
        </label>
      </div>

      <label className="mt-3 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="round_prices"
          defaultChecked={vendor.round_prices}
          className="accent-brand"
        />
        Round to a retail ending (.19 / .29 / .49 / .69 / .89 / .99)
      </label>

      {/*
        The setting that decides whether importing puts things on the shop.

        Worth spelling out on the form rather than leaving as a bare tick: it
        is the difference between a supplier whose catalogue you pick over and
        one you carry wholesale, and the shop showing 330 of 547 products was
        this being off with nobody realising it was a choice.
      */}
      <label className="mt-3 flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="auto_list"
          defaultChecked={vendor.auto_list}
          className="mt-0.5 accent-brand"
        />
        <span>
          List new products on the shop as they are imported
          <span className="mt-0.5 block text-xs text-muted">
            Off, every import arrives hidden and somebody lists it by hand. On, we carry
            whatever this supplier adds. Either way each product keeps its own switch
            afterwards, and this changes nothing about what is already in the catalogue.
          </span>
        </span>
      </label>

      <label className="mt-3 block text-sm">
        Notes
        <textarea name="notes" rows={2} defaultValue={vendor.notes ?? ""} className={field} />
      </label>

      <button
        type="submit"
        className="mt-4 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
      >
        Save rule
      </button>
    </form>
  );
}
