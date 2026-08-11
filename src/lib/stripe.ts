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

// Currencies with no minor unit at all — the amount IS the integer to send.
const ZERO_DECIMAL = new Set([
  "BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA",
  "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF",
]);

/** How many minor units make one major unit of `currency`. */
function minorUnits(currency: string): number {
  const c = currency.toUpperCase();
  if (ZERO_DECIMAL.has(c)) return 1;
  if (THREE_DECIMAL.has(c)) return 1000;
  return 100;
}

/**
 * Convert a major-unit amount (e.g. 3.507 BHD) to the integer minor-unit amount
 * Stripe expects. For 3-decimal currencies the result is rounded to the nearest
 * 10 (Stripe's requirement), i.e. to the nearest 0.010 — at most a 0.005 delta.
 */
export function toStripeAmount(amount: number, currency: string): number {
  const c = currency.toUpperCase();
  if (ZERO_DECIMAL.has(c)) return Math.round(amount);
  if (THREE_DECIMAL.has(c)) return Math.round(amount * 100) * 10;
  return Math.round(amount * 100);
}

/**
 * What the card is actually debited, as opposed to what the store quotes.
 *
 * Stripe restricts which currencies an account may present in, based on the
 * country the account is registered in — a UK account, for instance, cannot
 * charge in BHD at all. When the store currency isn't available, the shop still
 * prices in BHD (that's the business record, and what every order row stores)
 * and Stripe settles in a supported currency at a fixed rate.
 */
export interface Presentment {
  /** ISO code Stripe charges in. */
  currency: string;
  /** Total in that currency's major unit — exactly what the customer pays. */
  amount: number;
  /** The same total in Stripe's minor unit. */
  stripeAmount: number;
  /** Store currency → payment currency multiplier. 1 when there's no conversion. */
  rate: number;
  converted: boolean;
}

function build(amount: number, currency: string, rate: number, converted: boolean): Presentment {
  // Derive the displayed figure back out of the integer Stripe receives, so the
  // amount shown at checkout is never a rounding step away from the charge.
  const stripeAmount = toStripeAmount(amount, currency);
  return {
    currency,
    amount: stripeAmount / minorUnits(currency),
    stripeAmount,
    rate,
    converted,
  };
}

/**
 * Resolve the charge for an order total.
 *
 * Set `STRIPE_CURRENCY` to settle in something other than the store currency;
 * `STRIPE_FX_RATE` is then required and is the store→payment multiplier.
 * Returns null when a conversion is called for but no usable rate is set —
 * charging at an unknown rate is worse than refusing the payment.
 */
export function getPresentment(total: number, storeCurrency: string): Presentment | null {
  const store = storeCurrency.toUpperCase();
  const target = (process.env.STRIPE_CURRENCY || store).toUpperCase();

  if (target === store) return build(total, store, 1, false);

  const rate = Number(process.env.STRIPE_FX_RATE);
  if (!Number.isFinite(rate) || rate <= 0) return null;

  return build(total * rate, target, rate, true);
}
