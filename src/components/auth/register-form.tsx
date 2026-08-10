"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const field =
  "rounded-xl border border-line bg-white px-4 py-3 text-ink outline-none transition-colors focus:border-brand";

export function RegisterForm({ next }: { next?: string }) {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);

    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName.trim(), phone: phone.trim() } },
    });

    if (error) {
      setError(
        /already registered/i.test(error.message)
          ? "An account with this email already exists — try signing in."
          : error.message,
      );
      setBusy(false);
      return;
    }

    // When email confirmation is ON, Supabase returns a user but no session.
    if (!data.session) {
      setNotice("Account created. Check your email to confirm it, then sign in.");
      setBusy(false);
      return;
    }

    router.push(next || "/account");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-muted">Full name</span>
        <input
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          autoComplete="name"
          required
          className={field}
        />
      </label>
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
        <span className="text-muted">
          Phone <span className="text-muted/70">(optional)</span>
        </span>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          autoComplete="tel"
          className={field}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-muted">Password</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          required
          minLength={6}
          className={field}
        />
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {notice && <p className="text-sm text-green-700">{notice}</p>}

      <button
        type="submit"
        disabled={busy}
        className="flex w-full items-center justify-center rounded-full bg-ink py-3 text-sm font-medium text-white transition-colors hover:bg-brand disabled:opacity-60"
      >
        {busy ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}
