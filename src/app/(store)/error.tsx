"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Container } from "@/components/ui/container";
import { siteConfig } from "@/lib/config";

/**
 * Storefront error boundary.
 *
 * Without one, any client-side throw unmounts the whole route and the shopper
 * gets Next's bare error page — including on /checkout/success, where the
 * payment has already gone through and the confirmation is the only record they
 * have. This keeps the chrome and offers a way forward instead.
 *
 * Scoped to the (store) group; /admin has its own layout and its own audience.
 */
export default function StoreError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The digest is what correlates this with the server log entry.
    console.error("[storefront]", error);
  }, [error]);

  return (
    <Container className="flex flex-col items-center py-24 text-center">
      <h1 className="font-serif text-3xl sm:text-4xl">Something went wrong</h1>
      <p className="mt-3 max-w-md text-sm text-muted">
        Sorry — this page didn&rsquo;t load properly. If you were placing an order, your
        payment status is unaffected; check{" "}
        <Link href="/account" className="text-brand hover:underline">
          your account
        </Link>{" "}
        for the order, or contact us at{" "}
        <a href={`mailto:${siteConfig.contact.email}`} className="text-brand hover:underline">
          {siteConfig.contact.email}
        </a>
        .
      </p>

      {error.digest && (
        <p className="mt-4 font-mono text-xs text-muted">Reference: {error.digest}</p>
      )}

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-full bg-ink px-7 py-3.5 text-sm font-medium text-white transition-colors hover:bg-brand"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-full border border-ink/15 px-7 py-3.5 text-sm font-medium transition-colors hover:border-brand hover:text-brand"
        >
          Back to home
        </Link>
      </div>
    </Container>
  );
}
