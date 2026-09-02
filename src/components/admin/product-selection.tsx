"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Ticking 177 products, twenty-five at a time.
 *
 * That was the job before this: eight pages of individual checkboxes with no
 * way to tell whether a page had been missed. The client raised it after a
 * demo, and they were right — it is the one thing the admin is used for most.
 *
 * Two components, deliberately talking through the DOM rather than through
 * React state. The table itself is a Server Component and stays that way: the
 * rows are just HTML checkboxes inside a plain form, which is what makes the
 * bulk action work with JavaScript off. These two ride on top of that and add
 * nothing the form needs to function.
 */

/** All the row checkboxes in the form this element belongs to. */
function boxesIn(node: HTMLElement | null): HTMLInputElement[] {
  const form = node?.closest("form");
  if (!form) return [];
  return Array.from(form.querySelectorAll<HTMLInputElement>('input[name="ids"]'));
}

/**
 * The header checkbox: everything on this page, on or off.
 *
 * Indeterminate when some but not all are ticked, because a plain unchecked box
 * over a part-selected page is a lie about what the next click will do.
 */
export function SelectAllOnPage() {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const node = ref.current;
    const form = node?.closest("form");
    if (!node || !form) return;

    const sync = () => {
      const boxes = boxesIn(node);
      const on = boxes.filter((b) => b.checked).length;
      node.checked = boxes.length > 0 && on === boxes.length;
      node.indeterminate = on > 0 && on < boxes.length;
    };

    sync();
    form.addEventListener("change", sync);
    return () => form.removeEventListener("change", sync);
  }, []);

  function toggle(e: React.ChangeEvent<HTMLInputElement>) {
    const on = e.target.checked;
    for (const b of boxesIn(e.target)) b.checked = on;
    // The summary listens on the form, and setting `checked` in script fires
    // no event of its own.
    e.target.form?.dispatchEvent(new Event("change", { bubbles: true }));
  }

  return (
    <input
      ref={ref}
      type="checkbox"
      onChange={toggle}
      aria-label="Select every product on this page"
      title="Select every product on this page"
      className="h-4 w-4 cursor-pointer accent-brand"
    />
  );
}

/**
 * How many are selected, and the way out of page-by-page ticking.
 *
 * When the filter matches more than one page, this offers the whole match as a
 * single choice. That submits `scope=filtered` and the filter itself rather
 * than a list of ids, so the server re-runs the query — see
 * setPublishedByFilter. A list of ids from a page drawn ten minutes ago is a
 * different set from the one the person believes they are acting on.
 */
export function SelectionSummary({
  onPage,
  total,
}: {
  /** Rows rendered on this page. */
  onPage: number;
  /** Rows the current filter matches, across every page. */
  total: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState(0);
  const [wantWhole, setWantWhole] = useState(false);

  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    const sync = () => setSelected(boxesIn(ref.current).filter((b) => b.checked).length);
    sync();
    form.addEventListener("change", sync);
    return () => form.removeEventListener("change", sync);
  }, []);

  /*
    Choosing "everything matching" and then un-ticking a row is a
    contradiction, and the row wins: it is the more recent and more specific
    instruction.

    Derived, not stored. Holding it in state would mean an effect that
    un-sets it whenever the count drops, which paints one frame claiming all
    177 are selected after the person has just said otherwise.
  */
  const wholeFilter = wantWhole && onPage > 0 && selected >= onPage;
  const setWholeFilter = setWantWhole;

  const moreThanThisPage = total > onPage;

  return (
    <div ref={ref} className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {/* Read by the server action. Absent from the DOM unless chosen, so the
          default can only ever be "just the ticked rows". */}
      {wholeFilter && <input type="hidden" name="scope" value="filtered" />}

      <span className="text-sm font-medium text-ink">
        {wholeFilter
          ? `All ${total} matching selected`
          : selected === 0
            ? "Nothing selected"
            : `${selected} selected`}
      </span>

      {moreThanThisPage && selected === onPage && !wholeFilter && (
        <button
          type="button"
          onClick={() => setWholeFilter(true)}
          className="text-sm text-brand underline underline-offset-4 hover:text-brand-dark"
        >
          Select all {total} matching these filters
        </button>
      )}

      {wholeFilter && (
        <button
          type="button"
          onClick={() => setWholeFilter(false)}
          className="text-sm text-muted underline underline-offset-4 hover:text-ink"
        >
          Just this page
        </button>
      )}
    </div>
  );
}
