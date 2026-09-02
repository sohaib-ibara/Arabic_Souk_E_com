"use client";

import { useFormStatus } from "react-dom";
import { cn } from "@/lib/cn";

/**
 * A submit button that admits it is working.
 *
 * Every admin control is a server action, and a server action is a round trip:
 * the click is registered, the server does the work, the page re-renders. On a
 * fast connection that is a blink. On a normal one it is a second or two of a
 * page that looks exactly as it did before, and staff reported clicking twice
 * because nothing said the first click had landed.
 *
 * So the button disables itself and says what it is doing. Disabling matters as
 * much as the label: a second click on "Turn off" while the first is in flight
 * is a second write, and for the destructive ones that is a real problem rather
 * than an untidy one.
 *
 * `useFormStatus` reads the state of the form this button is inside, which is
 * why this must be its own component - a hook cannot see a form its own
 * component renders, only one above it.
 */
export function SubmitButton({
  children,
  pendingLabel,
  className,
  name,
  value,
  variant = "primary",
  title,
  "aria-label": ariaLabel,
}: {
  children: React.ReactNode;
  /** What to say while the server is working. Defaults to an ellipsis. */
  pendingLabel?: React.ReactNode;
  className?: string;
  name?: string;
  value?: string;
  variant?: "primary" | "secondary" | "bare";
  title?: string;
  "aria-label"?: string;
}) {
  const { pending } = useFormStatus();

  const base =
    "inline-flex items-center justify-center gap-2 rounded-full text-sm font-medium transition-all disabled:cursor-not-allowed disabled:opacity-60";
  const variants = {
    primary: "bg-ink px-4 py-2 text-white hover:opacity-90",
    secondary:
      "border border-line bg-white px-4 py-2 text-ink hover:border-brand hover:text-brand",
    bare: "",
  };

  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending}
      title={title}
      aria-label={ariaLabel}
      /* aria-busy, not just a changed label: a screen reader user gets no
         benefit from a spinner they cannot see. */
      aria-busy={pending}
      className={cn(base, variants[variant], className)}
    >
      {pending && <Spinner />}
      {pending ? (pendingLabel ?? children) : children}
    </button>
  );
}

/** Hidden from assistive tech — `aria-busy` on the button already says this. */
function Spinner() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5 shrink-0 motion-safe:animate-spin"
      aria-hidden="true"
      fill="none"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
