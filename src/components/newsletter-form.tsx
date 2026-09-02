"use client";

import { useActionState } from "react";
import { usePathname } from "next/navigation";
import { subscribeAction } from "@/app/(store)/actions";
import { emptyNewsletterState } from "@/lib/newsletter";
import { cn } from "@/lib/cn";
import { CheckIcon } from "@/components/ui/icons";

/**
 * Newsletter signup.
 *
 * It used to be a demo: it said "Thank you, you're on the list" and threw the
 * address away. Harmless in the footer, not harmless once a sticky tab and an
 * exit-intent modal were built to funnel people into it — at that point the
 * shop was actively asking for something it discarded, and saying it had kept
 * it. The address now goes to `newsletter_subscribers` (migration 0017).
 *
 * `source` says which of the four surfaces was used. They convert very
 * differently, and it is the only way to find out whether the modal is worth
 * the interruption it costs.
 */
export function NewsletterForm({
  className,
  tone = "light",
  source = "footer",
}: {
  className?: string;
  tone?: "light" | "dark";
  /** Which surface this instance is: footer, homepage, promo-modal, signup-tab. */
  source?: string;
}) {
  const [state, formAction, pending] = useActionState(subscribeAction, emptyNewsletterState);
  const pathname = usePathname();

  if (state.ok) {
    return (
      <p
        role="status"
        className={cn(
          "inline-flex items-center gap-2 text-sm",
          tone === "dark" ? "text-cream" : "text-brand",
          className,
        )}
      >
        <CheckIcon width={18} height={18} /> Thank you — {state.message}
      </p>
    );
  }

  return (
    <div className={cn("w-full max-w-md", className)}>
      <form action={formAction} className="flex w-full gap-2">
        <input type="hidden" name="source" value={source} />
        <input type="hidden" name="page" value={pathname ?? ""} />
        <input
          type="email"
          name="email"
          required
          /* Not a controlled input. useActionState re-renders on the result,
             and holding the value in React state as well means two sources of
             truth for one box; the browser keeps what was typed on a failure,
             which is the behaviour wanted anyway. */
          defaultValue=""
          placeholder="Enter your email"
          aria-label="Email address"
          aria-invalid={state.error || undefined}
          disabled={pending}
          className={cn(
            "w-full rounded-full border px-4 py-3 text-sm outline-none transition-colors disabled:opacity-60",
            tone === "dark"
              ? "border-white/25 bg-white/10 text-cream placeholder:text-cream/60 focus:border-white/60"
              : "border-line bg-white text-ink placeholder:text-muted focus:border-brand",
          )}
        />
        <button
          type="submit"
          disabled={pending}
          className={cn(
            "shrink-0 rounded-full px-5 py-3 text-sm font-medium transition-colors disabled:opacity-60",
            tone === "dark"
              ? "bg-cream text-ink hover:bg-white"
              : "bg-ink text-white hover:bg-brand",
          )}
        >
          {pending ? "Signing up…" : "Subscribe"}
        </button>
      </form>

      {state.error && state.message && (
        <p
          role="alert"
          className={cn("mt-2 text-xs", tone === "dark" ? "text-cream/80" : "text-brand")}
        >
          {state.message}
        </p>
      )}
    </div>
  );
}
