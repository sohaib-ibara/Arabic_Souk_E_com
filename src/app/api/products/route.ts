import { getAllProducts } from "@/lib/data";

/**
 * Minimal product lookup for the two places the browser has to ask.
 *
 *   ?slugs=a,b,c   the recently-viewed strip, which knows slugs from
 *                  localStorage and nothing else about them
 *   ?q=term        the header's instant search
 *
 * Deliberately narrow. It reads through `getAllProducts`, which is the same
 * path the storefront itself uses, so every provisioning rule already applies:
 * a product whose vendor, category or listing switch is off is not in the list
 * this handler can see, and cannot be surfaced by guessing its slug.
 *
 * The response is built field by field rather than passing rows through. The
 * shop's sourcing list is not public — which supplier a product came from is
 * the one thing migrations 0007, 0008 and 0010 went to some trouble to keep
 * out of anon's reach — and an endpoint that spreads a row is one column away
 * from undoing that quietly.
 */

/** Small enough that a crafted URL cannot turn this into a catalogue dump. */
const MAX_SLUGS = 12;
const MAX_RESULTS = 8;

interface Card {
  slug: string;
  name: string;
  price: number;
  compare_at_price: number | null;
  currency: string;
  image: string | null;
  brand: string | null;
  rating: number;
  in_stock: boolean;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const slugsParam = searchParams.get("slugs");
  const q = (searchParams.get("q") ?? "").trim().slice(0, 80);

  if (!slugsParam && !q) {
    return Response.json({ products: [] satisfies Card[] });
  }

  const all = await getAllProducts();

  const card = (p: (typeof all)[number]): Card => ({
    slug: p.slug,
    name: p.name,
    price: p.price,
    compare_at_price: p.compare_at_price ?? null,
    currency: p.currency,
    image: p.images[0] ?? null,
    brand: p.brand_name ?? null,
    rating: p.rating,
    in_stock: p.in_stock,
  });

  if (slugsParam) {
    const wanted = slugsParam.split(",").map((s) => s.trim()).filter(Boolean).slice(0, MAX_SLUGS);
    const bySlug = new Map(all.map((p) => [p.slug, p]));
    // Returned in the order asked for: the caller's order is most-recent-first
    // and re-sorting it would silently reverse the point of the strip.
    const products = wanted.map((s) => bySlug.get(s)).filter(Boolean).map((p) => card(p!));
    return Response.json({ products });
  }

  const needle = q.toLowerCase();
  const products = all
    .filter(
      (p) =>
        p.name.toLowerCase().includes(needle) ||
        (p.brand_name ?? "").toLowerCase().includes(needle) ||
        (p.category_name ?? "").toLowerCase().includes(needle),
    )
    // A name match is what someone typing a product name meant; brand and
    // category matches are the fallback, and go underneath.
    .sort((a, b) => {
      const rank = (p: (typeof all)[number]) => (p.name.toLowerCase().includes(needle) ? 0 : 1);
      return rank(a) - rank(b) || b.rating - a.rating;
    })
    .slice(0, MAX_RESULTS)
    .map(card);

  return Response.json({ products });
}
