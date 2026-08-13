import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Container } from "@/components/ui/container";
import { siteConfig } from "@/lib/config";
import { getSessionUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin-auth";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = { title: "Sign in" };

// Reads the auth cookie — must not be cached.
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  // Staff and shoppers hold separate sessions, so a signed-in admin has no
  // customer session and would otherwise be shown a sign-in form — including
  // when they press Back out of the console. Send them to their own console
  // instead; the only way to see this page again is to sign out.
  if (await isAdmin()) redirect("/admin");

  const user = await getSessionUser();
  if (user) redirect(next || "/account");

  const registerHref = next ? `/register?next=${encodeURIComponent(next)}` : "/register";

  return (
    <Container className="flex min-h-[70vh] flex-col items-center justify-center py-16">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-white p-8">
        <h1 className="font-serif text-2xl">Sign in</h1>
        <p className="mt-1 text-sm text-muted">Welcome back to {siteConfig.name}.</p>

        <LoginForm next={next} />

        <p className="mt-6 text-center text-sm text-muted">
          New here?{" "}
          <Link href={registerHref} className="text-brand hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </Container>
  );
}
