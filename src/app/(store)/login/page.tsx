import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Container } from "@/components/ui/container";
import { siteConfig } from "@/lib/config";
import { getSessionUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin-auth";
import { LoginForm } from "@/components/auth/login-form";

// Nothing here for a searcher, and an indexed sign-in form only competes with
// the pages that should rank. Links are still followed.
export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: true },
};

// Reads the auth cookie — must not be cached.
export const dynamic = "force-dynamic";

/** What /auth/callback reports back when a confirmation link fails. */
const confirmNotice: Record<string, string> = {
  expired:
    "That confirmation link has expired or has already been used. Links are good for one sign-in, and not for long.",
  failed:
    "We couldn't confirm your email from that link. It may have been cut in half by your mail app — try opening it again, or ask for a new one.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; confirm?: string }>;
}) {
  const { next, confirm } = await searchParams;

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

        {/*
          A confirmation link that did not work has to say so here, because
          here is where it lands. Without this the shopper is returned to a
          plain sign-in form having just clicked "confirm my email", with no
          way to tell whether it worked -- and their password will not sign
          them in until the address is confirmed, so they are stuck.
        */}
        {confirmNotice[confirm ?? ""] && (
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p>{confirmNotice[confirm!]}</p>
            <Link href={registerHref} className="mt-2 inline-block font-medium underline">
              Send a new confirmation link
            </Link>
          </div>
        )}

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
