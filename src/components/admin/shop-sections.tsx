"use client";

import { useState } from "react";
import type { CategorySwitch } from "@/lib/vendors";
import { setSectionsEnabledAction } from "@/app/admin/actions";
import { SubmitButton } from "@/components/admin/submit-button";
import { adminButton } from "@/components/admin/button-styles";
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
 * under a name that says what it does.
 *
 * WHY THE PANEL STAYS OPEN NOW. Every switch used to end in a redirect. A
 * redirect is a navigation, a navigation remounts this component, and a
 * remounted component starts with `open` false — so the panel slammed shut on
 * every click and hiding three sections meant opening it three times, from the
 * top of the page each time. The action calls `refresh()` instead of
 * redirecting, which re-renders the route into the same response: new counts,
 * same client state, same scroll position. Nothing here does that work — the
 * fix is the absence of the redirect. See `setSectionsEnabledAction`.
 *
 * The rows are still plain forms, so all of it works with JavaScript off. It
 * degrades to the old behaviour there — a real POST, a real navigation, a shut
 * panel — which is a floor worth keeping rather than a reason to hand-roll
 * fetches.
 */
export function ShopSections({
  sections,
  back,
}: {
  sections: CategorySwitch[];
  back: string;
}) {
  const [open, setOpen] = useState(false);
  // Hiding all of them is the one move on this screen that cannot be undone by
  // pressing the thing you just pressed, so it asks first.
  const [confirmingHideAll, setConfirmingHideAll] = useState(false);

  const off = sections.filter((s) => !s.is_enabled);
  const on = sections.filter((s) => s.is_enabled);
  /*
    Empty AND showing: a heading in the menu that opens onto "Nothing here yet".

    Twenty of these appeared the day everything was switched on at once, because
    Cult Beauty's shelves are campaigns rather than aisles — Halloween, Goody
    Bag, Grunge, Refillable — and none of them ever had a product filed under
    it. Switching them off one at a time is twenty clicks, which is how the
    button below earned its place next to the two that were asked for.
  */
  const emptyOn = on.filter((s) => s.product_count === 0);

  /*
    Put the confirm strip away once there is nothing left to confirm.

    Done during render rather than in an effect, which is the supported way to
    adjust state to a prop that changed: `sections` comes back from the server
    re-render with everything off, and the alternative — clearing the flag in
    the form's onSubmit — would swap the strip out the instant the button was
    pressed, taking the "Saving" indicator with it.
  */
  if (confirmingHideAll && on.length === 0) setConfirmingHideAll(false);

  if (sections.length === 0) return null;

  const ids = (list: CategorySwitch[]) => list.map((s) => s.id).join(",");

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
            {/* Naming them is useful for two or three and unreadable for
                thirty, which is reachable in one click now. */}
            {off.length === 0
              ? `all ${sections.length} showing`
              : off.length <= 3
                ? `${off.length} hidden: ${off.map((s) => s.name).join(", ")}`
                : `${off.length} of ${sections.length} hidden`}
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

          {confirmingHideAll ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
              <p className="text-sm text-amber-900">
                Hide all {sections.length} sections? The shop keeps its products, but the menu
                loses every entry and shoppers can only reach anything through Shop all and
                search.
              </p>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmingHideAll(false)}
                  className={adminButton("secondary", "sm")}
                >
                  Keep them
                </button>
                <Bulk ids={ids(sections)} enabled={false} back={back} variant="danger">
                  Yes, hide all {sections.length}
                </Bulk>
              </div>
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
              <p className="text-xs text-muted">
                {on.length} of {sections.length} showing
                {emptyOn.length > 0 && <> · {emptyOn.length} with nothing in them</>}
              </p>

              <div className="flex flex-wrap items-center gap-2">
                {off.length > 0 && (
                  <Bulk ids={ids(off)} enabled back={back} variant="secondary">
                    Show all {off.length}
                  </Bulk>
                )}
                {emptyOn.length > 0 && (
                  <Bulk ids={ids(emptyOn)} enabled={false} back={back} variant="secondary">
                    Hide the {emptyOn.length} empty
                  </Bulk>
                )}
                {on.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setConfirmingHideAll(true)}
                    className={adminButton("quiet", "sm")}
                  >
                    Hide all
                  </button>
                )}
              </div>
            </div>
          )}

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
                      ? s.is_enabled
                        ? "no products — an empty page on the menu"
                        : "no products"
                      : s.is_enabled
                        ? `${s.listed_count} of ${s.product_count} visible`
                        : `${s.product_count} products, all hidden with the section`}
                  </p>
                </div>

                <form action={setSectionsEnabledAction} className="shrink-0">
                  <input type="hidden" name="category_ids" value={s.id} />
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

/**
 * One of the bulk buttons: the same form as a row's, with a longer id list.
 *
 * Its own component so `useFormStatus` inside `SubmitButton` sees a form of its
 * own — three bulk buttons in one form would all show "Saving" together, and
 * pressing one would submit whichever fields that form happened to hold.
 */
function Bulk({
  ids,
  enabled,
  back,
  variant,
  children,
}: {
  ids: string;
  enabled: boolean;
  back: string;
  variant: "secondary" | "danger";
  children: React.ReactNode;
}) {
  return (
    <form action={setSectionsEnabledAction}>
      <input type="hidden" name="category_ids" value={ids} />
      <input type="hidden" name="enabled" value={enabled ? "1" : "0"} />
      <input type="hidden" name="back" value={back} />
      <SubmitButton variant={variant} size="sm" pendingLabel="Saving">
        {children}
      </SubmitButton>
    </form>
  );
}
