"use client";

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
  const [busy, setBusy] = useState(false);

  async function submit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);

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

    router.push(next || "/account");
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
