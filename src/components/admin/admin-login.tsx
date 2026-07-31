"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Container } from "@/components/ui/container";

export function AdminLogin({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        router.refresh();
        return;
      }
      if (res.status === 503) {
        setError("Admin isn't configured yet — set ADMIN_EMAILS in .env.local and create the user in Supabase.");
      } else if (res.status === 403) {
        setError("That account isn't an admin.");
      } else {
        setError("Incorrect email or password.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Container className="flex min-h-[70vh] flex-col items-center justify-center py-20">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-white p-8">
        <h1 className="font-serif text-2xl">Admin sign in</h1>
        <p className="mt-1 text-sm text-muted">Use your Supabase admin account.</p>

        {!configured && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            Admin isn&rsquo;t configured. Create a user in Supabase (Authentication → Users) and add
            their email to <code>ADMIN_EMAILS</code> in <code>.env.local</code>, then restart the
            server.
          </div>
        )}

        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              className="rounded-xl border border-line bg-white px-4 py-3 text-ink outline-none transition-colors focus:border-brand"
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
              className="rounded-xl border border-line bg-white px-4 py-3 text-ink outline-none transition-colors focus:border-brand"
            />
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={busy || !configured}
            className="flex w-full items-center justify-center rounded-full bg-ink py-3 text-sm font-medium text-white transition-colors hover:bg-brand disabled:opacity-60"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </Container>
  );
}
