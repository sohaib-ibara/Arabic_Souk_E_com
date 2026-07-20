import Link from "next/link";
import { ChevronRightIcon } from "./icons";

export function Breadcrumbs({
  items,
}: {
  items: Array<{ name: string; href?: string }>;
}) {
  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
      {items.map((it, i) => (
        <span key={`${it.name}-${i}`} className="flex items-center gap-1.5">
          {i > 0 && <ChevronRightIcon width={12} height={12} className="text-line" />}
          {it.href ? (
            <Link href={it.href} className="hover:text-brand">
              {it.name}
            </Link>
          ) : (
            <span className="text-ink">{it.name}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
