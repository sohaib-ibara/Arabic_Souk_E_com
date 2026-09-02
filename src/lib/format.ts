import { siteConfig } from "./config";

/**
 * How many decimals a shelf price is shown and stored to.
 *
 * Two, everywhere, including BHD.
 *
 * The dinar really is a 3-decimal currency — 1 dinar is 1000 fils — and prices
 * were shown to three on that basis. The client asked for two, repeatedly, and
 * they are right for a reason worth writing down: Stripe will not accept a
 * 3-decimal amount whose last digit is not zero, so `toStripeAmount` already
 * rounds BHD to two before charging. The shop was displaying BHD 1.157 and
 * taking BHD 1.160. Two decimals is not a simplification here, it is the shop
 * telling the truth about what it charges.
 *
 * Prices are stored to two as well (see scripts/round-prices.mjs and migration
 * 0018) so a basket's lines always add up to its total — rounding only at the
 * point of display is how a cart comes to disagree with itself by a fil.
 */
export const PRICE_DECIMALS = 2;

/**
 * How long this product takes to arrive, in words.
 *
 * Per-product where we captured it, the shop-wide promise where we did not —
 * 289 of the 294 listed products carry a real window, and the five that do not
 * should say what the rest of the site says rather than nothing.
 *
 * A zero minimum is real in the data and reads badly as a range: "0–3 days"
 * looks like a mistake, so it becomes "3 days or less". Written here once
 * because the product page and the product card both need the same sentence,
 * and the two had already drifted — the page's test treated a zero minimum as
 * missing and fell back to the site-wide string.
 */
export function deliveryWindow(
  min: number | null | undefined,
  max: number | null | undefined,
): string {
  if (min == null || max == null) return siteConfig.shipping.etaDays;
  if (max <= 0) return "same day";
  if (min <= 0) return `${max} days or less`;
  if (min === max) return `${min} days`;
  return `${min}–${max} days`;
}

export function formatPrice(amount: number, currency: string = siteConfig.currency): string {
  const decimals = PRICE_DECIMALS;
  const n = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
  return `${currency} ${n}`;
}

/**
 * Dates, always in the store's timezone (see siteConfig.timeZone).
 *
 * Both accept the ISO strings Supabase returns and degrade to an em dash rather
 * than "Invalid Date" for null or malformed input.
 */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    timeZone: siteConfig.timeZone,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    timeZone: siteConfig.timeZone,
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Compact form for dense tables — no year. */
export function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    timeZone: siteConfig.timeZone,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Percentage saved when there is a compare-at (was) price. */
export function discountPercent(price: number, compareAt: number | null | undefined): number | null {
  if (!compareAt || compareAt <= price) return null;
  return Math.round(((compareAt - price) / compareAt) * 100);
}
