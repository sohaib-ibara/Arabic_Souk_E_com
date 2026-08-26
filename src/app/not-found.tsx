import Link from "next/link";
import { Container } from "@/components/ui/container";
import { getNavGroups } from "@/lib/nav";

/**
 * The 404, as a way back rather than a dead end.
 *
 * "Back to home" alone put the whole job of recovering on the shopper: they
 * clicked a category, got nothing, and their only offer was to start again.
 * Real departments and a search box mean the page can still do what they came
 * for. The status stays 404 — soft-200s on missing pages are worse than useless
 * for crawlers — but a 404 is allowed to be helpful.
 *
 * The departments listed are the live ones, so this page can never repeat the
 * mistake that sent someone here.
 */
export default async function NotFound() {
  const groups = await getNavGroups();
  const shelves = groups
    .flatMap((g) => (g.items.length ? g.items : [{ name: g.name, slug: g.slug }]))
    .slice(0, 8);

  return (
    <Container className="flex flex-col items-center py-24 text-center">
      <p className="font-serif text-6xl text-brand">404</p>
      <h1 className="mt-4 font-serif text-3xl">Page not found</h1>
      <p className="mt-2 max-w-md text-sm text-muted">
        This page doesn&rsquo;t exist or has moved. The catalogue changes as stock does, so a
        category you saw before may have been folded into another.
      </p>

      <form action="/shop" className="mt-8 flex w-full max-w-sm gap-2">
        <input
          type="search"
          name="search"
          placeholder="Search for a product or brand"
          aria-label="Search products"
          className="flex-1 rounded-full border border-line bg-white px-5 py-3 text-sm text-ink outline-none transition-colors focus:border-brand"
        />
        <button
          type="submit"
          className="rounded-full bg-ink px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-brand"
        >
          Search
        </button>
      </form>

      {shelves.length > 0 && (
        <div className="mt-10 w-full max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
            Or browse
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {shelves.map((c) => (
              <Link
                key={c.slug}
                href={`/category/${c.slug}`}
                className="rounded-full border border-line bg-white px-4 py-2 text-sm transition-colors hover:border-brand hover:text-brand"
              >
                {c.name}
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="mt-10 flex flex-wrap justify-center gap-3">
        <Link
          href="/shop"
          className="rounded-full bg-ink px-7 py-3.5 text-sm font-medium text-white transition-colors hover:bg-brand"
        >
          Shop all products
        </Link>
        <Link
          href="/"
          className="rounded-full border border-ink/15 px-7 py-3.5 text-sm font-medium transition-colors hover:border-brand hover:text-brand"
        >
          Back to home
        </Link>
      </div>
    </Container>
  );
}
