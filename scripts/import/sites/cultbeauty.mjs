/**
 * cultbeauty.co.uk (THG) — the second source.
 *
 * Easier than noon in three ways that matter, all measured on 27 Aug 2026:
 *
 *   1. No bot challenge. A plain `fetch` returns the full product page, so this
 *      needs no browser — which is why `transport` is "http". That also means
 *      it is not tied to a residential connection the way noon is.
 *   2. It publishes a product sitemap (10,588 URLs), so discovery is a download
 *      rather than a crawl, and new products are a set difference.
 *   3. Its offers carry `availability`, so we learn stock, not just price.
 *
 * Two ways it is harder:
 *
 *   1. The structured data is a `ProductGroup` with `hasVariant`, not a flat
 *      `Product` — one URL can hold several sellable SKUs at different prices.
 *   2. Its breadcrumb is the *brand* path ("Home › Philip Kingsley"), not a
 *      category one, so `category()` cannot work from the page alone. See the
 *      note on that method.
 */
import {
  availabilityToBool,
  breadcrumbOf,
  cleanUrl,
  decode,
  findType,
  imageList,
  isType,
} from "./shared.mjs";

/**
 * Pick the SKU a shopper lands on. The variant whose sku equals the group id is
 * the page default; failing that take the cheapest in-stock one, because a
 * lapsed variant left at a stale price should not become our headline figure.
 */
function chooseVariant(group) {
  const variants = (group.hasVariant ?? []).filter(Boolean);
  if (!variants.length) return null;
  const offerOf = (v) => (Array.isArray(v.offers) ? v.offers[0] : v.offers) ?? {};
  const canonical = variants.find((v) => String(v.sku) === String(group.productGroupID));
  if (canonical) return { variant: canonical, offer: offerOf(canonical) };

  const ranked = variants
    .map((v) => ({ variant: v, offer: offerOf(v) }))
    .filter((x) => Number(x.offer.price) > 0)
    .sort((a, b) => {
      const stock = (x) => (availabilityToBool(x.offer.availability) === false ? 1 : 0);
      return stock(a) - stock(b) || Number(a.offer.price) - Number(b.offer.price);
    });
  return ranked[0] ?? { variant: variants[0], offer: offerOf(variants[0]) };
}

export default {
  key: "cultbeauty",
  label: "Cult Beauty (UK)",
  origin: "https://www.cultbeauty.co.uk",
  currency: "GBP",
  transport: "http",

  discover: {
    kind: "sitemap",
    // robots.txt lists this; it is regenerated daily, which is what makes a
    // daily "what's new" diff cheap and reliable.
    url: "https://www.cultbeauty.co.uk/sitemapindex-product.xml.gz",
  },

  // /p/{slug}/{numeric id}/
  isProductUrl: (url) => /\/p\/[^/]+\/\d+\/?/.test(url),

  skuFromUrl: (url) => url.match(/\/p\/[^/]+\/(\d+)/)?.[1] ?? null,

  parse(page) {
    // A ProductGroup is the usual shape; single-variant lines still appear as a
    // plain Product, so accept either.
    const group = page.entities.find((e) => isType(e, "ProductGroup"));
    const flat = findType(page.entities, "Product");
    const root = group ?? flat;
    if (!root?.name) return null;

    const picked = group ? chooseVariant(group) : null;
    const offer = picked
      ? picked.offer
      : (Array.isArray(flat?.offers) ? flat.offers[0] : flat?.offers) ?? {};

    const sku =
      String(picked?.variant?.sku ?? root.productGroupID ?? root.sku ?? "") ||
      this.skuFromUrl(page.url) ||
      "";
    if (!sku) return null;

    // Brand is absent from the variants but is the first breadcrumb node here.
    const crumbs = breadcrumbOf(page.entities);

    return {
      source: this.key,
      sku,
      sourceUrl: cleanUrl(page.url || offer.url || ""),
      name: decode(root.name),
      brand: decode(root.brand?.name ?? root.brand ?? crumbs[0] ?? "") || null,
      description: decode(root.description) || null,
      images: imageList(root.image ?? picked?.variant?.image),
      price: Number(offer.price ?? 0),
      currency: offer.priceCurrency || this.currency,
      available: availabilityToBool(offer.availability),
      rating: Number(root.aggregateRating?.ratingValue ?? 0) || 0,
      reviewCount:
        Number(root.aggregateRating?.reviewCount ?? root.aggregateRating?.ratingCount ?? 0) || 0,
      breadcrumb: crumbs,
      // Carried so the review queue can flag "this page sells 4 sizes and we
      // imported one of them" rather than silently picking.
      variantCount: (group?.hasVariant ?? []).length || 1,
    };
  },

  /**
   * Returns null on purpose.
   *
   * Cult Beauty's breadcrumb is the brand path, so a product page never states
   * its category. The taxonomy has to come from the other direction: crawl the
   * category pages we care about (`/c/make-up/`, `/c/fragrance/…`) and record
   * which product ids appear on each. `discoverCategories` below does that.
   *
   * Until that mapping is fed in, the importer must not guess — an
   * uncategorised product belongs in the review queue, not in a wrong aisle.
   */
  category() {
    return null;
  },

  /**
   * Category pages, for building the product → category map.
   *
   * The `list` sitemap holds 4,683 URLs, most of them marketing landing pages
   * ("/c/affiliates/…", "/c/birthday/"). Only the client can say which aisles
   * this store should carry, so this stays an explicit list rather than
   * everything the sitemap offers.
   */
  categoryPages: {
    sitemap: "https://www.cultbeauty.co.uk/sitemapindex-list.xml.gz",
    // Confirmed to exist, 27 Aug 2026. Extend once the client picks the range.
    seed: ["make-up", "fragrance", "bath-body", "tools"],
  },
};
