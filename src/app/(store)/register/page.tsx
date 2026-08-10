import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Container } from "@/components/ui/container";
import { siteConfig } from "@/lib/config";
import { getSessionUser } from "@/lib/auth";
import { RegisterForm } from "@/components/auth/register-form";

export const metadata: Metadata = { title: "Create account" };

// Reads the auth cookie — must not be cached.
export const dynamic = "force-dynamic";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const user = await getSessionUser();
  if (user) redirect(next || "/account");

  const loginHref = next ? `/login?next=${encodeURIComponent(next)}` : "/login";

  return (
    <Container className="flex min-h-[70vh] flex-col items-center justify-center py-16">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-white p-8">
        <h1 className="font-serif text-2xl">Create your account</h1>
        <p className="mt-1 text-sm text-muted">
          Join {siteConfig.name} to order and track your deliveries.
        </p>

        <RegisterForm next={next} />

        <p className="mt-6 text-center text-sm text-muted">
          Already have an account?{" "}
          <Link href={loginHref} className="text-brand hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </Container>
  );
}
