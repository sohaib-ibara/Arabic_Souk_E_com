"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { NewsletterForm } from "@/components/newsletter-form";
import { CloseIcon } from "@/components/ui/icons";
import { siteConfig } from "@/lib/config";

/**
 * The welcome-offer modal, from the Cult Beauty reference the client sent.
 *
 * Everything it says comes from `siteConfig.promo`, so a sale can be changed or
 * switched off without editing this file.
 *
 * Three restraints, each of them a decision rather than an oversight:
 *
 *   It waits. Appearing on load reads as an ad and gets dismissed unread; the
 *   reference site does the same.
 *
 *   It stays dismissed for a fortnight. A modal that returns every visit is
 *   the thing people install blockers over, and a shopper who said no once has
 *   answered the question.
 *
 *   It never appears during checkout, or on the success page. Interrupting
 *   someone mid-payment to offer them a discount on the order they are already
 *   placing costs more than the signup is worth.
 */

const STORAGE_KEY = "promo-dismissed-at";

export function PromoModal() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const promo = siteConfig.promo;

  const dismiss = useCallback(() => {
    setOpen(false);
    try {
      window.localStorage.setItem(STORAGE_KEY, String(Date.now()));
    } catch {
      // Private browsing refuses storage. The modal then reappears next visit,
      // which is a smaller problem than not rendering at all.
    }
  }, []);

  const onCheckout = pathname?.startsWith("/checkout") ?? false;

  useEffect(() => {
    if (!promo.enabled || onCheckout) return;
    if (typeof window === "undefined") return;

    let asked = 0;
    try {
      asked = Number(window.localStorage.getItem(STORAGE_KEY) ?? 0);
    } catch {
      /* see dismiss() */
    }
    const waitMs = promo.remindAfterDays * 24 * 60 * 60 * 1000;
    if (asked && Date.now() - asked < waitMs) return;

    const t = window.setTimeout(() => setOpen(true), promo.delaySeconds * 1000);
    return () => window.clearTimeout(t);
  }, [promo.enabled, promo.delaySeconds, promo.remindAfterDays, onCheckout]);

  // Escape closes it, and the page behind must not scroll while it is up —
  // otherwise dismissing returns you somewhere you did not choose to be.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") dismiss();
    }
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, dismiss]);

  if (!promo.enabled || !open || onCheckout) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="promo-headline"
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
    >
      {/* Clicking away closes it. A modal you cannot escape by the obvious
          gesture is the one people leave the site to escape. */}
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        onClick={dismiss}
        className="absolute inset-0 h-full w-full cursor-default bg-ink/60 backdrop-blur-[2px]"
      />

      <div
        ref={panelRef}
        className="relative w-full max-w-lg overflow-hidden rounded-3xl bg-cream shadow-2xl motion-safe:animate-fade-in-up sm:max-w-2xl"
      >
        <button
          ref={closeRef}
          type="button"
          onClick={dismiss}
          aria-label="Close"
          className="absolute right-3 top-3 z-10 rounded-full bg-white/80 p-2 text-ink transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <CloseIcon width={18} height={18} />
        </button>

        <div className="grid sm:grid-cols-2">
          {/* The mascot, on the half that disappears first. Hidden below `sm`
              rather than shrunk: on a phone the offer and the field are what
              matter, and a portrait pushes them under the fold. */}
          <div className="relative hidden bg-[#0b3b4a] sm:block">
            <Image
              src="/whatsapp.jpeg"
              alt=""
              fill
              sizes="(min-width: 640px) 20rem, 0px"
              className="object-cover object-top"
            />
          </div>

          <div className="p-7 sm:p-8">
            <p className="text-xs uppercase tracking-[0.2em] text-brand">{promo.eyebrow}</p>
            <h2 id="promo-headline" className="mt-2 font-serif text-3xl leading-tight">
              {promo.headline}
            </h2>
            <p className="mt-3 text-sm text-muted">{promo.body}</p>

            <NewsletterForm className="mt-5 max-w-none" />

            <p className="mt-3 text-xs text-muted">
              Use code{" "}
              <span className="font-medium tracking-wide text-ink">{promo.code}</span> at
              checkout.
            </p>

            <button
              type="button"
              onClick={dismiss}
              className="mt-4 text-sm text-muted underline underline-offset-4 transition-colors hover:text-ink"
            >
              {promo.decline}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
