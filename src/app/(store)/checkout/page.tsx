import type { Metadata } from "next";
import { getSessionUser } from "@/lib/auth";
import { siteConfig } from "@/lib/config";
import { CheckoutView } from "@/components/checkout/checkout-view";

export const metadata: Metadata = {
  title: "Checkout",
  robots: { index: false, follow: false },
};

// Reads the auth cookie — never cache.
export const dynamic = "force-dynamic";

/**
 * Open to guests.
 *
 * Requiring an account here cost orders for no benefit: everything the shop
 * needs to fulfil and deliver is collected on the form regardless, and an
 * account adds a password and an inbox round-trip between a customer and their
 * basket. Signing in is offered at the top, and creating an account is offered
 * after the order is placed, when it costs the sale nothing.
 */
export default async function CheckoutPage() {
  const user = await getSessionUser();

  const paymentReady = Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);

  return (
    <CheckoutView
      paymentReady={paymentReady}
      codEnabled={siteConfig.payments.cashOnDelivery}
      user={user ? { fullName: user.fullName, email: user.email, phone: user.phone } : null}
    />
  );
}
