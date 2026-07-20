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
        "flex items-end justify-between gap-4",
        align === "center" && "flex-col items-center",
        className,
      )}
    >
      <div className={cn(align === "center" && "text-center")}>
        {eyebrow && (
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-brand">{eyebrow}</p>
        )}
        <h2 className="mt-2 font-serif text-2xl sm:text-3xl">{title}</h2>
        {description && <p className="mt-2 max-w-xl text-sm text-muted">{description}</p>}
      </div>
      {href && (
        <Link
          href={href}
          className="hidden shrink-0 items-center gap-1 text-sm font-medium text-ink hover:text-brand sm:inline-flex"
        >
          {linkLabel}
          <ChevronRightIcon width={16} height={16} />
        </Link>
      )}
    </div>
  );
}
