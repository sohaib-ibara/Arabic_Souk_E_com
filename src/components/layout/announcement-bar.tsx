import Link from "next/link";
import { siteConfig } from "@/lib/config";

/**
 * The promo strip, plus the one link people go hunting for after they've
 * bought something.
 *
 * Order tracking lived only in the footer, which is where you look for a
 * policy, not for "where is my parcel". This bar is on every page and already
 * has room to its right. Deliberately not in the header account menu: knowing
 * whether someone is signed in means reading cookies in the store layout, which
 * would turn all 301 product pages dynamic to place one link.
 */
export function AnnouncementBar() {
  return (
    <div className="bg-ink text-cream">
      <div className="mx-auto flex max-w-7xl items-center justify-center gap-4 px-4 py-2 text-center text-[13px] sm:justify-between">
        {/* Spacer keeps the promo centred on wide screens without absolute
            positioning; hidden below sm, where the link wraps underneath. */}
        <span className="hidden shrink-0 sm:block sm:w-32" aria-hidden />
        <span>
          Free delivery across Bahrain on orders over {siteConfig.currency}{" "}
          {siteConfig.shipping.freeThreshold.toFixed(3)} · Authentic brands ·{" "}
          {siteConfig.shipping.etaDays} delivery
        </span>
        <Link
          href="/track"
          className="hidden shrink-0 underline-offset-4 hover:underline sm:block sm:w-32 sm:text-right"
        >
          Track your order
        </Link>
      </div>
    </div>
  );
}
