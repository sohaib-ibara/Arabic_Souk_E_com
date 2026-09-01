import Link from "next/link";
import {
  saveVendorAction,
  setVendorCategoryAction,
  setVendorEnabledAction,
} from "@/app/admin/actions";
import type { Vendor, VendorCategory } from "@/lib/vendors";
import { VendorPricing } from "@/components/admin/vendor-pricing";
import { cn } from "@/lib/cn";

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
                    <>No products in the catalogue yet.</>
                  ) : (
                    <>
                      {v.listed_count} of {v.product_count} products visible
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
                  className="rounded-full border border-line px-4 py-2 text-sm transition-colors hover:border-brand hover:text-brand"
                >
                  {selected ? "Close" : "Configure"}
                </Link>

                <form action={setVendorEnabledAction}>
                  <input type="hidden" name="vendor_id" value={v.id} />
                  <input type="hidden" name="enabled" value={v.is_enabled ? "0" : "1"} />
                  <input type="hidden" name="back" value={back} />
                  <button
                    type="submit"
                    className={cn(
                      "rounded-full px-4 py-2 text-sm font-medium transition-opacity hover:opacity-90",
                      v.is_enabled
                        ? "border border-line bg-white text-ink"
                        : "bg-ink text-white",
                    )}
                  >
                    {v.is_enabled ? "Turn off" : "Turn on"}
                  </button>
                </form>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function VendorDetail({
  vendor,
  categories,
  back,
}: {
  vendor: Vendor;
  categories: VendorCategory[];
  back: string;
}) {
  const stocked = categories.filter((c) => c.product_count > 0);
  const empty = categories.filter((c) => c.product_count === 0);

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
          This vendor is switched off, so none of its products are on the shop whatever the
          category switches below say. They take effect when you turn it on.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <PricingRule vendor={vendor} back={back} />
        <VendorPricing
          vendorId={vendor.id}
          vendorName={vendor.name}
          currency={vendor.currency}
        />
      </div>

      <div className="rounded-2xl border border-line bg-white p-5">
        <h3 className="font-medium">Categories</h3>
        <p className="mt-1 text-sm text-muted">
          Switching a category off hides only {vendor.name}&rsquo;s products in it. Other
          vendors&rsquo; products stay exactly where they are, and the category itself never
          disappears from the shop.
        </p>

        {stocked.length > 0 && (
          <CategoryRows rows={stocked} vendorId={vendor.id} back={back} />
        )}

        {empty.length > 0 && (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm text-muted hover:text-ink">
              {empty.length} categories this vendor has no products in
            </summary>
            <CategoryRows rows={empty} vendorId={vendor.id} back={back} />
          </details>
        )}

        {categories.length === 0 && (
          <p className="mt-3 text-sm text-muted">No categories exist yet.</p>
        )}
      </div>
    </div>
  );
}

function CategoryRows({
  rows,
  vendorId,
  back,
}: {
  rows: VendorCategory[];
  vendorId: string;
  back: string;
}) {
  return (
    <ul className="mt-3 divide-y divide-line rounded-2xl border border-line">
      {rows.map((c) => (
        <li key={c.category_id} className="flex items-center justify-between gap-4 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm">{c.category_name}</p>
            <p className="text-xs text-muted">
              {c.product_count === 0
                ? "no products"
                : `${c.listed_count} of ${c.product_count} visible`}
            </p>
          </div>
          <form action={setVendorCategoryAction} className="shrink-0">
            <input type="hidden" name="vendor_id" value={vendorId} />
            <input type="hidden" name="category_id" value={c.category_id} />
            <input type="hidden" name="enabled" value={c.is_enabled ? "0" : "1"} />
            <input type="hidden" name="back" value={back} />
            <button
              type="submit"
              className={cn(
                "rounded-full border px-4 py-1.5 text-xs font-medium transition-colors",
                c.is_enabled
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300"
                  : "border-line bg-white text-muted hover:border-brand hover:text-brand",
              )}
            >
              {c.is_enabled ? "On" : "Off"}
            </button>
          </form>
        </li>
      ))}
    </ul>
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
            step="0.001"
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
