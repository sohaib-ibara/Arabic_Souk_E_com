"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { NewsletterForm } from "@/components/newsletter-form";
import { CloseIcon } from "@/components/ui/icons";
import { siteConfig } from "@/lib/config";

/**
 * The sticky "Sign me up" tab on the right edge, opening a newsletter panel.
 *
 * Modelled on the reference the client sent (Cult Beauty). Two departures from
 * it, both deliberate:
 *
 *   It is hidden during checkout. A tab whose whole job is to pull attention
 *   sideways does not belong on the one page where the shopper is trying to
 *   finish paying, and an abandoned basket costs more than a missed signup.
 *
 *   It sits above the WhatsApp button rather than beside it — vertically
 *   centred on the edge, where the floating button occupies the bottom corner,
 *   so the two never overlap at any viewport height.
 */
export function SignupTab() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement>(null);
  const tabRef = useRef<HTMLButtonElement>(null);

  // Anything under /checkout, including the payment step and the success page.
  const hidden = pathname?.startsWith("/checkout") ?? false;

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        // Send focus back to the tab; closing with the keyboard should not
        // dump the caret at the top of the document.
        tabRef.current?.focus();
      }
    }
    function onClick(e: MouseEvent) {
      const t = e.target as Node;
      if (!panelRef.current?.contains(t) && !tabRef.current?.contains(t)) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  /*
    Route changes shouldn't leave the panel hanging open over the new page.

    Adjusted during render rather than in an effect. Closing it from an effect
    means React commits one frame with the panel still open on the new route,
    and it trips react-hooks/set-state-in-effect; this is the pattern React
    documents for state that has to follow a prop.
  */
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  if (hidden) return null;

  return (
    <>
      <button
        ref={tabRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="signup-panel"
        /* Vertical writing mode, not `rotate-90`.
           Rotating leaves the element's real box horizontal, so it has to be
           translated back by half the difference between its width and height
           — an offset that changes with the label and needs a calc() the
           moment the wording does. Writing-mode makes the box genuinely tall
           and narrow instead, so `right-0` is simply flush, at any label
           length. `rotate-180` sets it reading bottom-to-top, matching the
           reference; it turns the box in place, so alignment is unaffected. */
        className="fixed right-0 top-1/2 z-40 -translate-y-1/2 rotate-180 rounded-t-lg bg-brand px-2 py-4 text-xs font-medium uppercase tracking-widest text-white shadow-lg transition-colors [writing-mode:vertical-rl] hover:bg-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        Sign me up
      </button>

      {open && (
        <div
          ref={panelRef}
          id="signup-panel"
          role="dialog"
          aria-label="Join our mailing list"
          className="fixed right-3 top-1/2 z-40 w-[min(22rem,calc(100vw-1.5rem))] -translate-y-1/2 rounded-2xl border border-line bg-cream p-5 shadow-xl sm:right-14"
        >
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="absolute right-3 top-3 text-muted transition-colors hover:text-ink"
          >
            <CloseIcon width={18} height={18} />
          </button>

          <h2 className="pr-6 font-serif text-lg">Be first to know</h2>
          <p className="mt-1 text-sm text-muted">
            New arrivals, offers and beauty edits — straight to your inbox. We deliver across{" "}
            {siteConfig.country}.
          </p>
          <NewsletterForm className="mt-4 max-w-none flex-col sm:flex-row" />
          <p className="mt-3 text-xs text-muted">Unsubscribe any time.</p>
        </div>
      )}
    </>
  );
}
