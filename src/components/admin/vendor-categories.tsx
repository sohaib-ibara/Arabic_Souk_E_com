"use client";

import { useEffect, useRef, useState } from "react";
import type { VendorCategory } from "@/lib/vendors";
import { setVendorCategoriesAction } from "@/app/admin/actions";
import { SubmitButton } from "@/components/admin/submit-button";
import { cn } from "@/lib/cn";

/**
 * A vendor's categories, inside the vendor's own card.
 *
 * They used to live behind a Configure button, and the shop-wide switch lived
 * on a separate page also called Categories. Two screens, both about
 * "categories", meaning different things — the client watched a demo of it and
 * said, reasonably, that it should be one thing in one place.
 *
 * So: tick what this vendor sells, press Save. Not fifty-four separate
 * on/off buttons each costing a page reload, which is what it was, and which
 * gave no way to tell part-way through whether you had finished the list.
 *
 * The wording is deliberately about products rather than about switches. An
 * admin who is not technical does not need to know that "off" writes a row to
 * vendor_categories; they need to know that Cult Beauty's lipsticks stop
 * appearing and noon's stay exactly where they are.
 */
export function VendorCategories({
  vendorId,
  vendorName,
  categories,
  back,
}: {
  vendorId: string;
  vendorName: string;
  categories: VendorCategory[];
  back: string;
}) {
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLFormElement>(null);
  const [ticked, setTicked] = useState(
    () => new Set(categories.filter((c) => c.is_enabled).map((c) => c.category_id)),
  );

  // If the server sends a different selection (someone saved, the page
  // re-rendered) the local copy has to follow. Adjusted during render, which is
  // React's own pattern for state that tracks a prop.
  const signature = categories.map((c) => `${c.category_id}:${c.is_enabled}`).join(",");
  const [lastSignature, setLastSignature] = useState(signature);
  if (signature !== lastSignature) {
    setLastSignature(signature);
    setTicked(new Set(categories.filter((c) => c.is_enabled).map((c) => c.category_id)));
  }

  const off = categories.length - ticked.size;

  function toggle(id: string) {
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const all = () => setTicked(new Set(categories.map((c) => c.category_id)));
  const none = () => setTicked(new Set());

  // Once opened, scroll the panel into view: on a card near the bottom of the
  // list, expanding fifty rows otherwise happens entirely below the fold.
  useEffect(() => {
    if (open) listRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [open]);

  if (categories.length === 0) {
    return (
      <p className="mt-3 border-t border-line pt-3 text-sm text-muted">
        No categories exist yet, so there is nothing to choose from.
      </p>
    );
  }

  const dirty = categories.some((c) => c.is_enabled !== ticked.has(c.category_id));

  return (
    <div className="mt-4 border-t border-line pt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span className="text-sm">
          <span className="font-medium">What we sell from {vendorName}</span>
          <span className="ml-2 text-muted">
            {off === 0
              ? `all ${categories.length} categories`
              : `${ticked.size} of ${categories.length} categories`}
          </span>
        </span>
        <span className="shrink-0 text-sm text-brand">{open ? "Close" : "Choose"}</span>
      </button>

      {open && (
        <form action={setVendorCategoriesAction} ref={listRef} className="mt-3">
          <input type="hidden" name="vendor_id" value={vendorId} />
          <input type="hidden" name="back" value={back} />

          <p className="rounded-xl bg-sand/60 px-3 py-2 text-xs text-muted">
            Un-tick a category and {vendorName}&rsquo;s products disappear from it. Other
            vendors&rsquo; products stay exactly where they are, and the category itself stays
            on the shop.
          </p>

          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={all}
              className="rounded-full border border-line bg-white px-3 py-1 text-xs transition-colors hover:border-brand hover:text-brand"
            >
              Tick all
            </button>
            <button
              type="button"
              onClick={none}
              className="rounded-full border border-line bg-white px-3 py-1 text-xs transition-colors hover:border-brand hover:text-brand"
            >
              Untick all
            </button>
          </div>

          <ul className="mt-3 grid max-h-80 gap-x-4 overflow-y-auto rounded-xl border border-line p-2 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((c) => {
              const on = ticked.has(c.category_id);
              return (
                <li key={c.category_id}>
                  {/* Every category is submitted as `known`, ticked or not, so
                      the server can tell "un-ticked" from "was not on screen". */}
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

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <SubmitButton pendingLabel="Saving">Save</SubmitButton>
            {dirty && <span className="text-xs text-muted">Unsaved changes</span>}
          </div>
        </form>
      )}
    </div>
  );
}
