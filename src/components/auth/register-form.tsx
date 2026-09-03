"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const field =
  "rounded-xl border border-line bg-white px-4 py-3 text-ink outline-none transition-colors focus:border-brand";

export function RegisterForm({ next, defaultEmail }: { next?: string; defaultEmail?: string }) {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** The address a confirmation has gone to — the form is replaced once set. */
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  /**
   * Send the confirmation again.
   *
   * Worth a button of its own because the mail genuinely does go missing: the
   * built-in Supabase sender is rate-limited to a handful an hour and lands in
   * spam often enough that "check your junk, or try again" is the honest
   * instruction. Supabase applies its own cooldown and reports it as an error,
   * which is shown as-is rather than pretending the resend worked.
   */
  async function resend() {
    if (!sentTo) return;
    setResending(true);
    setError(null);
    setNotice(null);

    const supabase = createClient();
    const redirectTo = new URL("/auth/callback", window.location.origin);
    if (next) redirectTo.searchParams.set("next", next);

    const { error } = await supabase.auth.resend({
      type: "signup",
      email: sentTo,
      options: { emailRedirectTo: redirectTo.toString() },
    });

    if (error) setError(error.message);
    else setNotice("Sent again. It can take a minute or two to arrive.");
    setResending(false);
  }

  async function submit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);

    const supabase = createClient();
    /*
      `emailRedirectTo` is not optional here, whatever the type says.

      Without it Supabase sends people to the project's Site URL, which is a
      single value set in the dashboard and was pointing at localhost — so the
      confirmation link in a real customer's inbox led nowhere. Deriving it
      from the origin the person actually registered on means the link comes
      back to the same place, whether that is the deployed site, a preview
      build, or a developer's machine.

      The destination is /auth/callback, which exchanges the code Supabase
      appends for a real session. See the note in that route.
    */
    const redirectTo = new URL("/auth/callback", window.location.origin);
    if (next) redirectTo.searchParams.set("next", next);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName.trim(), phone: phone.trim() },
        emailRedirectTo: redirectTo.toString(),
      },
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

    /*
      No session means confirmation is required, which is the normal path.

      An empty `identities` array on the returned user is Supabase declining to
      say that the address is already taken — it replies as though the signup
      succeeded so that this form cannot be used to discover who has an
      account. The right thing to show is the same message either way: an email
      has gone to that address, and it is either a confirmation or a note that
      they already have an account.
    */
    if (!data.session) {
      setSentTo(email);
      setBusy(false);
      return;
    }

    // `replace`, not `push` — see the note in login-form.tsx.
    router.replace(next || "/account");
    router.refresh();
  }

  /*
    Once the mail is away the form has nothing left to do, so it goes.

    Leaving the filled-in form on screen under a one-line notice invited people
    to press Create account again, which Supabase rate-limits — so the second
    attempt produced an error on a signup that had actually worked.
  */
  if (sentTo) {
    return (
      <div className="mt-6 space-y-4">
        <div className="rounded-xl border border-line bg-sand p-5">
          <p className="text-sm font-medium text-ink">Check your email</p>
          <p className="mt-1.5 text-sm text-muted">
            We&rsquo;ve sent a confirmation link to <strong className="text-ink">{sentTo}</strong>.
            Open it to finish creating your account.
          </p>
          <p className="mt-3 text-xs text-muted">
            Nothing after a few minutes? Check your spam folder — confirmation mail often
            lands there.
          </p>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {notice && <p className="text-sm text-green-700">{notice}</p>}

        <button
          type="button"
          onClick={resend}
          disabled={resending}
          className="w-full rounded-full border border-line py-3 text-sm font-medium transition-colors hover:bg-sand disabled:opacity-60"
        >
          {resending ? "Sending…" : "Send it again"}
        </button>
      </div>
    );
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
