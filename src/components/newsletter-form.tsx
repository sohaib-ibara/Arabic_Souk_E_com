"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { CheckIcon } from "@/components/ui/icons";

/** Demo newsletter form — no backend; just confirms the submission. */
export function NewsletterForm({
  className,
  tone = "light",
}: {
  className?: string;
  tone?: "light" | "dark";
}) {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (email.trim()) {
      setDone(true);
      setEmail("");
    }
  }

  if (done) {
    return (
      <p
        className={cn(
          "inline-flex items-center gap-2 text-sm",
          tone === "dark" ? "text-cream" : "text-brand",
          className,
        )}
      >
        <CheckIcon width={18} height={18} /> Thank you — you&rsquo;re on the list.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className={cn("flex w-full max-w-md gap-2", className)}>
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Enter your email"
        aria-label="Email address"
        className={cn(
          "w-full rounded-full border px-4 py-3 text-sm outline-none transition-colors",
          tone === "dark"
            ? "border-white/25 bg-white/10 text-cream placeholder:text-cream/60 focus:border-white/60"
            : "border-line bg-white text-ink placeholder:text-muted focus:border-brand",
        )}
      />
      <button
        type="submit"
        className={cn(
          "shrink-0 rounded-full px-5 py-3 text-sm font-medium transition-colors",
          tone === "dark"
            ? "bg-cream text-ink hover:bg-white"
            : "bg-ink text-white hover:bg-brand",
        )}
      >
        Subscribe
      </button>
    </form>
  );
}
