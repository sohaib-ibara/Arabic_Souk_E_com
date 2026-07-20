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

/** Percentage saved when there is a compare-at (was) price. */
export function discountPercent(price: number, compareAt: number | null | undefined): number | null {
  if (!compareAt || compareAt <= price) return null;
  return Math.round(((compareAt - price) / compareAt) * 100);
}
