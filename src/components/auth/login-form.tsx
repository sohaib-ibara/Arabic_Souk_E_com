"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const field =
  "rounded-xl border border-line bg-white px-4 py-3 text-ink outline-none transition-colors focus:border-brand";

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isAdminAccount, setIsAdminAccount] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setIsAdminAccount(false);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(
        /email not confirmed/i.test(error.message)
          ? "Please confirm your email first — check your inbox."
          : "Incorrect email or password.",
      );
      setBusy(false);
      return;
    }

    // Staff accounts don't get a storefront session. The allowlist lives in a
    // server-only env var, so we ask the server once the session exists rather
    // than shipping the list of admin emails to the browser.
    try {
      const res = await fetch("/api/auth/account-kind", { method: "POST" });
      const { isAdmin } = (await res.json()) as { isAdmin?: boolean };
      if (isAdmin) {
        await supabase.auth.signOut();
        setIsAdminAccount(true);
        setBusy(false);
        return;
      }
    } catch {
      // A failed check shouldn't strand a legitimate shopper — the /account
      // page re-checks server-side and will redirect a staff account anyway.
    }

    // `replace`, not `push`: the sign-in page shouldn't sit in history behind
    // the account it just opened, or Back lands the shopper on a form they've
    // already completed.
    router.replace(next || "/account");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-muted">Email</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
          className={field}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-muted">Password</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
          className={field}
        />
      </label>

      {isAdminAccount && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-800">
          That&rsquo;s an administrator account, so it can&rsquo;t be used to shop. Sign in at{" "}
          <Link href="/admin" className="font-medium underline underline-offset-2">
            the admin console
          </Link>{" "}
          instead.
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={busy}
        className="flex w-full items-center justify-center rounded-full bg-ink py-3 text-sm font-medium text-white transition-colors hover:bg-brand disabled:opacity-60"
      >
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
