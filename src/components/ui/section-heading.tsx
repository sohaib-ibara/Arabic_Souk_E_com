import Link from "next/link";
import { cn } from "@/lib/cn";
import { ChevronRightIcon } from "./icons";

export function SectionHeading({
  eyebrow,
  title,
  description,
  href,
  linkLabel = "View all",
  align = "left",
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  href?: string;
  linkLabel?: string;
  align?: "left" | "center";
  className?: string;
}) {
  return (
    <div
      className={cn(
        // Two distinct layouts — kept mutually exclusive so no conflicting
        // align-items utilities leak through (cn does not merge Tailwind classes).
        align === "center"
          ? "flex flex-col items-center gap-4 text-center"
          : "flex items-end justify-between gap-4",
        className,
      )}
    >
      <div className={cn(align === "center" && "flex flex-col items-center")}>
        {/* The rule is the whole change: a short accent bar in front of the
            eyebrow, so the eye finds where a section starts while scrolling
            past rather than having to read the word. */}
        {eyebrow && (
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-brand">
            <span aria-hidden="true" className="h-px w-6 bg-linear-to-r from-brand to-gold" />
            {eyebrow}
          </p>
        )}
        <h2 className="mt-2 font-serif text-2xl sm:text-3xl">{title}</h2>
        {description && <p className="mt-2 max-w-xl text-sm text-muted">{description}</p>}
      </div>
      {href && (
        <Link
          href={href}
          className="group hidden shrink-0 items-center gap-1 text-sm font-medium text-ink transition-colors hover:text-brand sm:inline-flex"
        >
          {linkLabel}
          {/* Moves with the cursor rather than only changing colour — the
              arrow is the part that says "this goes somewhere". */}
          <ChevronRightIcon
            width={16}
            height={16}
            className="transition-transform duration-200 motion-safe:group-hover:translate-x-1"
          />
        </Link>
      )}
    </div>
  );
}
