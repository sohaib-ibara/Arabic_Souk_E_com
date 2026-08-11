import { siteConfig } from "./config";

/**
 * Format a monetary amount. Bahraini Dinar (BHD) is a 3-decimal currency
 * (1 dinar = 1000 fils), so prices display with three decimal places.
 */
export function formatPrice(amount: number, currency: string = siteConfig.currency): string {
  const decimals = currency === "BHD" ? 3 : 2;
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
