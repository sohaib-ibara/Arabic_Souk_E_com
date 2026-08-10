import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { CheckoutView } from "@/components/checkout/checkout-view";

export const metadata: Metadata = {
  title: "Checkout",
  robots: { index: false, follow: false },
};

// Reads the auth cookie — never cache.
export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/checkout");

  const paymentReady = Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);

  return (
    <CheckoutView
      paymentReady={paymentReady}
      user={{ fullName: user.fullName, email: user.email, phone: user.phone }}
    />
  );
}
