import Stripe from "stripe";

let cached: Stripe | null = null;

/**
 * Server-side Stripe client. Returns null when STRIPE_SECRET_KEY is absent, so
 * checkout degrades gracefully (the UI shows "payment not configured") instead
 * of throwing. Server-only — never import this into a client component.
 */
export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  // Pin to the SDK's default API version (omit apiVersion) to avoid drift.
  if (!cached) cached = new Stripe(key);
  return cached;
}

// Currencies with three decimal places. Stripe expects their amounts in the
// 1000-based minor unit AND requires the value to be a multiple of 10.
const THREE_DECIMAL = new Set(["BHD", "KWD", "OMR", "JOD", "TND"]);

/**
 * Convert a major-unit amount (e.g. 3.507 BHD) to the integer minor-unit amount
 * Stripe expects. For 3-decimal currencies the result is rounded to the nearest
 * 10 (Stripe's requirement), i.e. to the nearest 0.010 — at most a 0.005 delta.
 */
export function toStripeAmount(amount: number, currency: string): number {
  if (THREE_DECIMAL.has(currency.toUpperCase())) {
    return Math.round(amount * 100) * 10;
  }
  return Math.round(amount * 100);
}
