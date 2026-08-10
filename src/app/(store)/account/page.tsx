import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Container } from "@/components/ui/container";
import { getSessionUser } from "@/lib/auth";
import { SignOutButton } from "@/components/auth/sign-out-button";

export const metadata: Metadata = { title: "My account" };

// Reads the auth cookie — must not be cached.
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/account");

  const firstName = user.fullName?.split(" ")[0] || null;

  return (
    <Container className="py-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl sm:text-4xl">
            {firstName ? `Hello, ${firstName}` : "My account"}
          </h1>
          <p className="mt-1 text-sm text-muted">Manage your details and orders.</p>
        </div>
        <SignOutButton />
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {/* Details */}
        <section className="rounded-2xl border border-line bg-white p-6">
          <h2 className="font-serif text-lg">Your details</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Name</dt>
              <dd className="text-right">{user.fullName || "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Email</dt>
              <dd className="text-right break-all">{user.email}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Phone</dt>
              <dd className="text-right">{user.phone || "—"}</dd>
            </div>
          </dl>
        </section>

        {/* Orders (filled in by the order-history feature) */}
        <section className="rounded-2xl border border-line bg-white p-6">
          <h2 className="font-serif text-lg">Your orders</h2>
          <p className="mt-4 text-sm text-muted">
            You haven&rsquo;t placed any orders yet.
          </p>
          <Link
            href="/shop"
            className="mt-5 inline-flex rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand"
          >
            Start shopping
          </Link>
        </section>
      </div>
    </Container>
  );
}
