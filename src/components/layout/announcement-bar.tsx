import Link from "next/link";
import { siteConfig } from "@/lib/config";
import { PRICE_DECIMALS } from "@/lib/format";

/**
 * The promo strip, plus the one link people go hunting for after they've
 * bought something.
 *
 * Order tracking lived only in the footer, which is where you look for a
 * policy, not for "where is my parcel". This bar is on every page and already
 * has room to its right. Deliberately not in the header account menu: knowing
 * whether someone is signed in means reading cookies in the store layout, which
 * would turn all 301 product pages dynamic to place one link.
 *
 * The rays: the link was plain underlined text on a dark bar, which is where
 * the eye is trained not to look. It is now a pill with two rings expanding out
 * of it — the ripple a stone makes rather than a flashing sign. See
 * `.animate-ray` in globals.css for why it is built out of transform and
 * opacity only, and why it disappears under prefers-reduced-motion instead of
 * merely stopping.
 */
export function AnnouncementBar() {
  return (
    <div className="bg-ink text-cream">
      <div className="mx-auto flex max-w-7xl items-center justify-center gap-4 px-4 py-2 text-center text-[13px] sm:justify-between">
        {/* Spacer keeps the promo centred on wide screens without absolute
            positioning; hidden below sm, where the link wraps underneath.
            Matches the pill's width, not the old text's. */}
        <span className="hidden shrink-0 sm:block sm:w-40" aria-hidden />
        <span>
          Free delivery across Bahrain on orders over {siteConfig.currency}{" "}
          {siteConfig.shipping.freeThreshold.toFixed(PRICE_DECIMALS)} · Authentic brands ·{" "}
          {siteConfig.shipping.etaDays} delivery
        </span>

        <span className="relative hidden shrink-0 sm:flex sm:w-40 sm:justify-end">
          {/* The rays. Behind the pill, ignored by assistive tech, and
              pointer-events-none so they can never swallow the click they
              exist to attract. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 w-[8.5rem]"
          >
            <span className="animate-ray absolute inset-0 rounded-full bg-brand/50" />
            <span className="animate-ray-delayed absolute inset-0 rounded-full bg-brand/35" />
          </span>

          <Link
            href="/track"
            className="relative inline-flex items-center gap-1.5 rounded-full bg-brand px-3.5 py-1 font-medium text-white transition-colors hover:bg-brand-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cream"
          >
            {/* A parcel, small enough to read as punctuation rather than an
                icon competing with the words. */}
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden="true" fill="none">
              <path
                d="M21 8.5v7a1.5 1.5 0 0 1-.79 1.32l-7.5 4a1.5 1.5 0 0 1-1.42 0l-7.5-4A1.5 1.5 0 0 1 3 15.5v-7"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="m3.3 7.6 8-4.27a1.5 1.5 0 0 1 1.4 0l8 4.27a.5.5 0 0 1 0 .88l-8 4.27a1.5 1.5 0 0 1-1.4 0l-8-4.27a.5.5 0 0 1 0-.88Z"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinejoin="round"
              />
            </svg>
            Track your order
          </Link>
        </span>
      </div>
    </div>
  );
}
