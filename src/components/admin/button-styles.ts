import { cn } from "@/lib/cn";

/**
 * One look for every admin button.
 *
 * They were flat: a colour, a radius, and `hover:opacity-90`. Nothing lifted,
 * nothing pressed, nothing changed enough to catch the eye of somebody scanning
 * the screen for what to click. The client's word was "dull", and the fix is
 * not a brighter colour — it is the three states a physical button has:
 *
 *   rest     a shadow, so it sits above the page rather than being painted on
 *   hover    a deeper shadow and a darker fill, so it rises to meet the cursor
 *   press    scales down a hair, so the click is felt as well as seen
 *
 * Primary actions are brand rather than near-black. On a cream admin, black
 * reads as text; the brand colour reads as "this is the thing to press", and it
 * ties the admin to the shop it manages.
 *
 * Defined once and shared, because a button style copied into eleven files is
 * eleven files to keep in step, and the ones that fell behind are exactly the
 * ones that looked dull.
 */

export type AdminButtonVariant = "primary" | "secondary" | "danger" | "quiet";
export type AdminButtonSize = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-medium " +
  // Both the shadow and the scale are animated, so hover and press read as one
  // movement rather than two separate jumps.
  "transition-all duration-150 " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand " +
  // motion-safe: the press is feedback, not decoration, but somebody who has
  // asked for less movement should not get a button that flinches.
  "motion-safe:active:scale-[0.97] " +
  "disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none " +
  "motion-safe:disabled:active:scale-100";

const variants: Record<AdminButtonVariant, string> = {
  primary:
    "bg-brand text-white shadow-sm shadow-brand/25 hover:bg-brand-dark hover:shadow-md hover:shadow-brand/30",
  secondary:
    "border border-line bg-white text-ink shadow-xs hover:border-brand hover:text-brand hover:shadow-sm",
  danger:
    "border border-red-300 bg-white text-red-700 shadow-xs hover:border-red-400 hover:bg-red-50 hover:shadow-sm",
  // For the third and fourth actions in a row, where a shadow would make the
  // group look like a wall of buttons with no order to it.
  quiet: "text-muted hover:text-ink",
};

const sizes: Record<AdminButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-5 py-2.5 text-sm",
  lg: "px-6 py-3 text-sm",
};

export function adminButton(
  variant: AdminButtonVariant = "primary",
  size: AdminButtonSize = "md",
  className?: string,
): string {
  return cn(base, variants[variant], sizes[size], className);
}
