import Link from "next/link";
import type { Brand } from "@/lib/types";
import { cn } from "@/lib/cn";

/**
 * The brand wall, moving.
 *
 * A hundred and forty-eight names wrapped into a centred block is a wall of
 * text: too much to read, too static to glance at, and it pushed everything
 * below it a long way down the page. Two rows drifting in opposite directions
 * take a fraction of the height, and reading one name in passing is the entire
 * job here — the shop is telling you it carries brands you have heard of.
 *
 * Every name stays a link. The rows pause on hover and on keyboard focus, so
 * one can always be caught, and the duplicate copy that makes the loop seamless
 * is hidden from assistive tech rather than read out twice.
 *
 * Under prefers-reduced-motion the CSS puts it back to the wrapped block it
 * was, with the duplicate removed. Stopping a marquee where it stands would
 * leave most of the names off the side of the screen.
 */
export function BrandStrip({ brands }: { brands: Brand[] }) {
  if (brands.length === 0) return null;

  // Split rather than repeated, so the two rows never show the same name at
  // the same moment travelling opposite ways, which reads as a mistake.
  const half = Math.ceil(brands.length / 2);
  const rows = [brands.slice(0, half), brands.slice(half)].filter((r) => r.length > 0);

  return (
    <div
      className="marquee flex flex-col gap-4 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_6%,black_94%,transparent)]"
    >
      {rows.map((row, i) => (
        <MarqueeRow key={i} brands={row} reverse={i % 2 === 1} />
      ))}
    </div>
  );
}

function MarqueeRow({ brands, reverse }: { brands: Brand[]; reverse: boolean }) {
  /*
    Duration from the length, not a fixed number: with a fixed 60s a row of
    twelve names crawls and a row of seventy-four sprints. About two seconds a
    name keeps the speed the same whatever the catalogue does.
  */
  const seconds = Math.max(30, Math.round(brands.length * 2.2));

  return (
    <div
      className="marquee-track flex w-max animate-marquee"
      style={{
        animationDuration: `${seconds}s`,
        animationDirection: reverse ? "reverse" : undefined,
      }}
    >
      {[0, 1].map((copy) => (
        <div
          key={copy}
          aria-hidden={copy === 1}
          /* The gap lives inside each copy, including a trailing one, so a copy
             is exactly half the track and the -50% travel lands seamlessly. */
          className={cn(
            "marquee-copy flex shrink-0 items-center gap-x-10 pr-10",
            copy === 1 && "marquee-dup",
          )}
        >
          {brands.map((b) => (
            <Link
              key={`${copy}-${b.id}`}
              href={`/shop?brand=${b.slug}`}
              tabIndex={copy === 1 ? -1 : undefined}
              className="whitespace-nowrap font-serif text-lg text-ink/45 transition-colors hover:text-brand sm:text-xl"
            >
              {b.name}
            </Link>
          ))}
        </div>
      ))}
    </div>
  );
}
