"use client";

import { useState } from "react";
import type { CategorySwitch } from "@/lib/vendors";
import { setCategoryEnabledAction } from "@/app/admin/actions";
import { SubmitButton } from "@/components/admin/submit-button";
import { cn } from "@/lib/cn";

/**
 * Sections of the shop — the other kind of category switch.
 *
 * There are genuinely two, and conflating them would lose something the client
 * asked for on the 1 Sep call:
 *
 *   On a vendor's card:  whose products fill a category that is staying.
 *   Here:                whether the shop has that section at all.
 *
 * The first must never change the shape of the site — switch noon off inside
 * Skin Care and the heading, the menu entry and Cult Beauty's products all stay
 * put. The second is the opposite, and is the only way to take a heading off
 * the menu.
 *
 * It used to be its own page in the nav, also called Categories, which made it
 * look like a duplicate of the per-vendor one. Same screen now, folded shut,
 * under a name that says what it does. A section is switched off perhaps twice
 * a year; the vendor choices are made weekly.
 */
export function ShopSections({
  sections,
  back,
}: {
  sections: CategorySwitch[];
  back: string;
}) {
  const [open, setOpen] = useState(false);
  const off = sections.filter((s) => !s.is_enabled);

  if (sections.length === 0) return null;

  return (
    <section className="mt-8 rounded-2xl border border-line bg-white p-5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span>
          <span className="font-medium">Sections of the shop</span>
          <span className="ml-2 text-sm text-muted">
            {off.length === 0
              ? `all ${sections.length} showing`
              : `${off.length} hidden: ${off.map((s) => s.name).join(", ")}`}
          </span>
        </span>
        <span className="shrink-0 text-sm text-brand">{open ? "Close" : "Open"}</span>
      </button>

      {open && (
        <>
          <p className="mt-3 rounded-xl bg-sand/60 px-3 py-2 text-xs text-muted">
            This is the heavier switch. Turning a section off removes it from the shop
            completely — the menu entry, the page and every product in it, whichever vendor
            supplied them. To keep a section but change who fills it, use{" "}
            <span className="text-ink">What we sell from…</span> on the vendor&rsquo;s card
            above.
          </p>

          <ul className="mt-3 grid gap-x-4 sm:grid-cols-2">
            {sections.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-3 border-b border-line py-2 last:border-b-0"
              >
                <div className="min-w-0">
                  <p className={cn("truncate text-sm", !s.is_enabled && "text-muted line-through")}>
                    {s.name}
                  </p>
                  <p className="text-xs text-muted">
                    {s.product_count === 0
                      ? "no products"
                      : s.is_enabled
                        ? `${s.listed_count} of ${s.product_count} visible`
                        : `${s.product_count} products, all hidden with the section`}
                  </p>
                </div>

                <form action={setCategoryEnabledAction} className="shrink-0">
                  <input type="hidden" name="category_id" value={s.id} />
                  <input type="hidden" name="enabled" value={s.is_enabled ? "0" : "1"} />
                  <input type="hidden" name="back" value={back} />
                  <SubmitButton
                    variant="bare"
                    pendingLabel="Saving"
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                      s.is_enabled
                        ? "border-line bg-white text-ink hover:border-brand hover:text-brand"
                        : "border-transparent bg-ink text-white hover:opacity-90",
                    )}
                  >
                    {s.is_enabled ? "Hide" : "Show"}
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
