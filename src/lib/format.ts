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
