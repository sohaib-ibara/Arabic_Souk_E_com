import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/container";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { TrackOrderForm } from "@/components/checkout/track-order-form";
import { CompanyDetails } from "@/components/layout/company-details";
import { siteConfig } from "@/lib/config";

export const metadata: Metadata = {
  title: "Track your order",
  description: `Check the status of your ${siteConfig.name} order using your order number and email address.`,
  alternates: { canonical: "/track" },
};

/**
 * Order tracking for everyone, account or not.
 *
 * "Track your order" used to point at /account, which sent guests to a login
 * page for an account they never made — and guests are now the majority of
 * orders. The order number and email are the credential instead.
 */
export default async function TrackOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const { order } = await searchParams;

  return (
    <Container className="py-10 sm:py-14">
      <div className="mx-auto max-w-2xl">
        <Breadcrumbs items={[{ name: "Home", href: "/" }, { name: "Track your order" }]} />

        <header className="mt-4">
          <h1 className="font-serif text-3xl sm:text-4xl">Track your order</h1>
          <p className="mt-2 text-sm text-muted">
            Enter your order number and the email you used at checkout. No account needed.
          </p>
        </header>

        <TrackOrderForm defaultOrderNumber={order?.slice(0, 40)} />

        <p className="mt-8 text-center text-sm text-muted">
          Have an account?{" "}
          <Link href="/account" className="text-brand hover:underline">
            See all your orders
          </Link>
        </p>

        {/* A looked-up order stands in for a receipt, so the same registered
            identity appears here as on the confirmation page and email. */}
        <CompanyDetails className="mt-8 border-t border-line pt-6 text-center" />
      </div>
    </Container>
  );
}
