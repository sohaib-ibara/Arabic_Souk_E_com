"use client";

import { useState } from "react";
import type { Vendor, VendorCategory } from "@/lib/vendors";
import { setVendorCategoriesAction } from "@/app/admin/actions";
import { SubmitButton } from "@/components/admin/submit-button";
import { adminButton } from "@/components/admin/button-styles";
import { cn } from "@/lib/cn";

/**
 * What each vendor sells: pick the vendor, tick the categories.
 *
 * Three shapes in three days, and the reasons are worth keeping. It began
 * behind a Configure button with the shop-wide switch on a separate page also
 * called Categories — two screens about "categories" meaning different things.
 * Then it moved inside every vendor card, which put the choice where the vendor
 * was but printed fifty-four rows per card and pushed the second vendor off the
 * screen. Now it is one panel with a vendor dropdown: one list, one Save, and
 * the vendor cards go back to being short enough to compare.
 *
 * The wording is about products, not switches. An admin who is not technical
 * does not need to know that un-ticking writes a row to vendor_categories; they
 * need to know that Cult Beauty's lipsticks stop appearing and noon's stay
 * exactly where they are.
 */
export function VendorCategoryPicker({
  vendors,
  categoriesByVendor,
  back,
}: {
  vendors: Vendor[];
  categoriesByVendor: Record<string, VendorCategory[]>;
  back: string;
}) {
  const [vendorId, setVendorId] = useState(vendors[0]?.id ?? "");
  const vendor = vendors.find((v) => v.id === vendorId) ?? vendors[0] ?? null;
  const categories = vendor ? (categoriesByVendor[vendor.id] ?? []) : [];

  const [ticked, setTicked] = useState<Set<string>>(
    () => new Set(categories.filter((c) => c.is_enabled).map((c) => c.category_id)),
  );

  /*
    Reset the ticks when the vendor changes, or when the server sends a new
    selection after a save.

    Adjusted during render rather than in an effect: an effect paints one frame
    of the previous vendor's ticks against the new vendor's names, and this is
    React's own documented pattern for state that follows a prop.
  */
  const signature = `${vendor?.id ?? ""}|${categories
    .map((c) => `${c.category_id}:${c.is_enabled}`)
    .join(",")}`;
  const [lastSignature, setLastSignature] = useState(signature);
  if (signature !== lastSignature) {
    setLastSignature(signature);
    setTicked(new Set(categories.filter((c) => c.is_enabled).map((c) => c.category_id)));
  }

  if (!vendor) return null;

  function toggle(id: string) {
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const dirty = categories.some((c) => c.is_enabled !== ticked.has(c.category_id));
  const off = categories.length - ticked.size;

  return (
    <section className="mt-8 rounded-2xl border border-line bg-white p-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-medium">What we sell from each vendor</h2>
          <p className="mt-1 text-sm text-muted">
            Pick a vendor, then tick the categories you want its products to appear in.
          </p>
        </div>

        <label className="text-sm">
          <span className="mr-2 text-muted">Vendor</span>
          <select
            value={vendor.id}
            onChange={(e) => setVendorId(e.target.value)}
            className="rounded-full border border-line bg-white px-4 py-2 text-sm outline-none focus:border-brand"
          >
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
                {v.is_enabled ? "" : " (switched off)"}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!vendor.is_enabled && (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {vendor.name} is switched off, so none of its products are on the shop whatever is
          ticked here. These choices take effect when you turn it back on.
        </p>
      )}

      {categories.length === 0 ? (
        <p className="mt-4 text-sm text-muted">No categories exist yet.</p>
      ) : (
        <form action={setVendorCategoriesAction} className="mt-4">
          <input type="hidden" name="vendor_id" value={vendor.id} />
          <input type="hidden" name="back" value={back} />

          <p className="rounded-xl bg-sand/60 px-3 py-2 text-xs text-muted">
            Un-tick a category and {vendor.name}&rsquo;s products disappear from it. Other
            vendors&rsquo; products stay exactly where they are, and the category itself stays
            on the shop.
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setTicked(new Set(categories.map((c) => c.category_id)))}
              className={adminButton("secondary", "sm")}
            >
              Tick all
            </button>
            <button
              type="button"
              onClick={() => setTicked(new Set())}
              className={adminButton("secondary", "sm")}
            >
              Untick all
            </button>
            <span className="text-xs text-muted">
              {off === 0
                ? `All ${categories.length} ticked`
                : `${ticked.size} of ${categories.length} ticked`}
            </span>
          </div>

          <ul className="mt-3 grid max-h-96 gap-x-4 overflow-y-auto rounded-xl border border-line p-2 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((c) => {
              const on = ticked.has(c.category_id);
              return (
                <li key={c.category_id}>
                  {/* Submitted whether ticked or not, so the server can tell
                      "un-ticked" from "was not on screen" — a category created
                      since this page loaded must not be switched off by
                      somebody saving an older form. */}
                  <input type="hidden" name="known" value={c.category_id} />
                  <label
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-brand-tint",
                      !on && "text-muted",
                    )}
                  >
                    <input
                      type="checkbox"
                      name="enabled"
                      value={c.category_id}
                      checked={on}
                      onChange={() => toggle(c.category_id)}
                      className="h-4 w-4 shrink-0 accent-brand"
                    />
                    <span className="truncate">{c.category_name}</span>
                    <span className="ml-auto shrink-0 text-xs text-muted">
                      {c.product_count || "—"}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <SubmitButton pendingLabel="Saving">Save what {vendor.name} sells</SubmitButton>
            {dirty && (
              <span className="text-xs font-medium text-brand">
                Unsaved changes — press Save
              </span>
            )}
          </div>
        </form>
      )}
    </section>
  );
}
