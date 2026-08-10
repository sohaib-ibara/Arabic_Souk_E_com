import { loadStripe, type Stripe } from "@stripe/stripe-js";

let promise: Promise<Stripe | null> | null = null;

/**
 * Browser Stripe.js singleton for the embedded Payment Element. Resolves to
 * null when the publishable key isn't set, so the checkout can show a clear
 * "payment not configured" message instead of crashing.
 */
export function getStripePromise(): Promise<Stripe | null> {
  if (!promise) {
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    promise = key ? loadStripe(key) : Promise.resolve(null);
  }
  return promise;
}
