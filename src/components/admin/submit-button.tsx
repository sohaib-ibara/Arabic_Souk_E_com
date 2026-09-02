"use client";

import { useFormStatus } from "react-dom";
import { cn } from "@/lib/cn";
import {
  adminButton,
  type AdminButtonSize,
  type AdminButtonVariant,
} from "@/components/admin/button-styles";

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
  size = "md",
  title,
  "aria-label": ariaLabel,
}: {
  children: React.ReactNode;
  /** What to say while the server is working. Defaults to an ellipsis. */
  pendingLabel?: React.ReactNode;
  className?: string;
  name?: string;
  value?: string;
  variant?: AdminButtonVariant | "bare";
  size?: AdminButtonSize;
  title?: string;
  "aria-label"?: string;
}) {
  const { pending } = useFormStatus();

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
      /* "bare" opts out of the shared look for the handful of buttons that
         carry their own colour, such as the on/off pills. */
      className={
        variant === "bare"
          ? cn(
              "inline-flex items-center justify-center gap-2 transition-all motion-safe:active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60",
              className,
            )
          : adminButton(variant, size, className)
      }
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
