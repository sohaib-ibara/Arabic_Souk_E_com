import Link from "next/link";
import { cn } from "@/lib/cn";
import { ChevronRightIcon } from "@/components/ui/icons";

/**
 * Builds a compact page list with ellipses, e.g. for 13 pages on page 6:
 *   1 … 5 6 7 … 13
 * Always keeps the first, last, current and its immediate neighbours.
 */
function pageList(current: number, total: number): Array<number | "gap"> {
  const out: Array<number | "gap"> = [];
  const range: number[] = [];
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) {
    range.push(i);
  }
  out.push(1);
  if (range.length && range[0] > 2) out.push("gap");
  out.push(...range);
  if (range.length && range[range.length - 1] < total - 1) out.push("gap");
  if (total > 1) out.push(total);
  return out;
}

/**
 * Link-based pagination for the shop grid. Rendered on the server — no client
 * JS — so it works with static rendering and preserves the active filters via
 * the `hrefFor` builder passed in by the page.
 */
export function Pagination({
  currentPage,
  totalPages,
  hrefFor,
}: {
  currentPage: number;
  totalPages: number;
  hrefFor: (page: number) => string;
}) {
  if (totalPages <= 1) return null;

  const cellClass = (active: boolean) =>
    cn(
      "inline-flex h-9 min-w-9 items-center justify-center rounded-full border px-3 text-sm transition-colors",
      active
        ? "border-brand bg-brand text-white"
        : "border-line bg-white text-ink hover:border-brand hover:text-brand",
    );

  const arrowClass = (disabled: boolean) =>
    cn(
      "inline-flex h-9 w-9 items-center justify-center rounded-full border transition-colors",
      disabled
        ? "cursor-not-allowed border-line text-muted opacity-50"
        : "border-line bg-white text-ink hover:border-brand hover:text-brand",
    );

  const prevDisabled = currentPage <= 1;
  const nextDisabled = currentPage >= totalPages;

  return (
    <nav
      aria-label="Pagination"
      className="mt-12 flex items-center justify-center gap-1.5 sm:gap-2"
    >
      {prevDisabled ? (
        <span className={arrowClass(true)} aria-hidden="true">
          <ChevronRightIcon className="rotate-180" width={16} height={16} />
        </span>
      ) : (
        <Link href={hrefFor(currentPage - 1)} className={arrowClass(false)} aria-label="Previous page" rel="prev">
          <ChevronRightIcon className="rotate-180" width={16} height={16} />
        </Link>
      )}

      {pageList(currentPage, totalPages).map((item, i) =>
        item === "gap" ? (
          <span key={`gap-${i}`} className="px-1 text-sm text-muted" aria-hidden="true">
            …
          </span>
        ) : (
          <Link
            key={item}
            href={hrefFor(item)}
            className={cellClass(item === currentPage)}
            aria-label={`Page ${item}`}
            aria-current={item === currentPage ? "page" : undefined}
          >
            {item}
          </Link>
        ),
      )}

      {nextDisabled ? (
        <span className={arrowClass(true)} aria-hidden="true">
          <ChevronRightIcon width={16} height={16} />
        </span>
      ) : (
        <Link href={hrefFor(currentPage + 1)} className={arrowClass(false)} aria-label="Next page" rel="next">
          <ChevronRightIcon width={16} height={16} />
        </Link>
      )}
    </nav>
  );
}
