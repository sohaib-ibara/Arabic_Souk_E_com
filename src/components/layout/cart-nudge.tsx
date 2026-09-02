"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useCart } from "@/components/cart/cart-provider";
import { ProductImage } from "@/components/ui/product-image";
import { Price } from "@/components/ui/price";
import { useNudgeSlot } from "@/lib/nudge-queue";
import { formatPrice } from "@/lib/format";

/**
 * The corner nudge: a card, not a modal.
 *
 * The client asked for something that speaks up when a visitor has been on the
 * site a while without adding anything. That is worth doing, but the shape
 * matters more than the trigger: a modal for this would dim the page and block
 * the very browsing it is trying to encourage. A card in the corner can be
 * ignored, which is what most people will rightly do with it.
 *
 * Two things to say, one at a time:
 *
 *   browse  nothing in the bag after a while looking — offer a starting point.
 *   bag     something in the bag, untouched for a while — offer the way back.
 *
 * `bag` is the one that earns its place. The shopper has already chosen; all
 * this does is shorten the path back. `browse` is a gesture, and is treated
 * like one: later, quieter, and gone for the session the moment it is waved
 * away.
 *
 * Never on the cart or checkout pages. Telling somebody their bag is waiting
 * while they are looking straight at it is the kind of thing that makes a shop
 * feel automated.
 */

export interface NudgeProduct {
  slug: string;
  name: string;
  price: number;
  currency?: string;
  image?: string | null;
}

/** How long someone browses with an empty bag before we offer a starting point. */
const BROWSE_MS = 75_000;
/** How long a filled bag sits untouched before we offer the way back to it. */
const BAG_IDLE_MS = 120_000;
/** How often the conditions are re-checked. Coarse on purpose; this is not urgent. */
const TICK_MS = 5_000;

const VISIT_KEY = "arabicsouk.visit-start";
const DISMISS_KEY = "arabicsouk.nudge-dismissed";

type Mode = "browse" | "bag";

/** Milliseconds since this visit began, surviving navigation between pages. */
function visitElapsed(): number {
  try {
    const started = Number(window.sessionStorage.getItem(VISIT_KEY) ?? 0);
    if (!started) {
      window.sessionStorage.setItem(VISIT_KEY, String(Date.now()));
      return 0;
    }
    return Date.now() - started;
  } catch {
    return 0;
  }
}

function dismissedThisSession(mode: Mode): boolean {
  try {
    return window.sessionStorage.getItem(DISMISS_KEY + "." + mode) === "1";
  } catch {
    return false;
  }
}

function rememberDismissal(mode: Mode) {
  try {
    window.sessionStorage.setItem(DISMISS_KEY + "." + mode, "1");
  } catch {
    /* private browsing; it will simply offer again on the next page */
  }
}

export function CartNudge({ suggestions }: { suggestions: NudgeProduct[] }) {
  const [mode, setMode] = useState<Mode | null>(null);
  const pathname = usePathname();
  const { items, count, subtotal, hydrated, openCart } = useCart();

  // When the bag last changed. A ref, not state: it feeds the interval's
  // decision and must never itself cause a render.
  const lastCartChange = useRef<number>(0);
  useEffect(() => {
    lastCartChange.current = Date.now();
  }, [count]);

  const onOwnTurf = Boolean(
    pathname?.startsWith("/cart") || pathname?.startsWith("/checkout"),
  );
  const show = useNudgeSlot("cart-nudge", "corner", 3, mode !== null);

  useEffect(() => {
    if (onOwnTurf || !hydrated) return;
    if (typeof window === "undefined") return;

    visitElapsed(); // starts the clock on the first page of the visit

    const check = () => {
      // The bag wins whenever both could apply: a product someone chose beats
      // a product we guessed at.
      if (count > 0) {
        if (dismissedThisSession("bag")) return setMode(null);
        const idle = Date.now() - (lastCartChange.current || Date.now());
        return setMode(idle >= BAG_IDLE_MS ? "bag" : null);
      }
      if (dismissedThisSession("browse") || suggestions.length === 0) return setMode(null);
      setMode(visitElapsed() >= BROWSE_MS ? "browse" : null);
    };

    const timer = window.setInterval(check, TICK_MS);
    return () => window.clearInterval(timer);
  }, [count, hydrated, onOwnTurf, suggestions.length]);

  function dismiss() {
    if (mode) rememberDismissal(mode);
    setMode(null);
  }

  if (!show || !mode || onOwnTurf) return null;

  const isBag = mode === "bag";

  return (
    /*
      bottom-24 clears the WhatsApp button rather than sitting on it. They share
      the corner slot so they are never both up, but the button itself is always
      there, and a card landing on top of it would cover the shop's support
      channel.
    */
    <div className="fixed bottom-24 right-4 z-40 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-line bg-cream shadow-2xl shadow-black/10 motion-safe:animate-[fadeUp_.25s_ease-out] sm:bottom-28 sm:right-6">
      <div className="flex items-start justify-between gap-3 px-4 pt-4">
        <div className="min-w-0">
          <p className="font-serif text-lg leading-tight">
            {isBag ? "Your bag is waiting" : "Still looking?"}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {isBag
              ? count + (count === 1 ? " item · " : " items · ") + formatPrice(subtotal)
              : "A few our customers reach for first."}
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="-mr-1 -mt-1 shrink-0 rounded-full p-1.5 text-muted transition-colors hover:bg-black/5 hover:text-ink"
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden="true">
            <path
              d="M6 6l12 12M18 6L6 18"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              fill="none"
            />
          </svg>
        </button>
      </div>

      {isBag ? (
        <>
          <div className="mt-3 flex gap-2 px-4">
            {items.slice(0, 3).map((i) => (
              <div
                key={i.productId}
                className="relative h-14 w-14 overflow-hidden rounded-lg bg-white"
                title={i.name}
              >
                <ProductImage src={i.image} alt="" fill sizes="56px" className="object-cover" />
              </div>
            ))}
            {items.length > 3 && (
              <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-white text-xs text-muted">
                +{items.length - 3}
              </div>
            )}
          </div>
          <div className="mt-4 px-4 pb-4">
            <button
              type="button"
              onClick={() => {
                dismiss();
                openCart();
              }}
              className="w-full rounded-full bg-ink px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              View bag
            </button>
          </div>
        </>
      ) : (
        <>
          <ul className="mt-3 divide-y divide-line border-t border-line">
            {suggestions.slice(0, 3).map((p) => (
              <li key={p.slug}>
                <Link
                  href={`/product/${p.slug}`}
                  onClick={dismiss}
                  className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-brand-tint"
                >
                  <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-white">
                    <ProductImage src={p.image} alt="" fill sizes="48px" className="object-cover" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-ink">{p.name}</p>
                    <Price price={p.price} currency={p.currency} size="sm" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <div className="px-4 py-3">
            <Link
              href="/shop"
              onClick={dismiss}
              className="text-sm text-brand underline underline-offset-4 hover:text-brand-dark"
            >
              Browse everything
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
