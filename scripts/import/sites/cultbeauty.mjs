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
 * The JSON-LD lists one image per product; the gallery holds far more.
 *
 * Every shot is served from the same CDN path with the product id as its
 * filename prefix, which is what makes this safe: filtering on that id means a
 * "related products" thumbnail elsewhere on the page can never be mistaken for
 * one of ours. Falls back to the LD image if the markup ever changes shape.
 */
function galleryImages(html, sku, max) {
  if (!html || !sku) return [];
  const re = new RegExp(String.raw`https://static\.thcdn\.com/productimg/\w+/${sku}-\d+\.\w+`, "gi");
  return [...new Set(html.match(re) ?? [])].slice(0, max);
}

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
      images: (() => {
        const gallery = galleryImages(page.html, sku, 4);
        return gallery.length ? gallery : imageList(root.image ?? picked?.variant?.image);
      })(),
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
   * Where a product's category comes from.
   *
   * "crawl", not "breadcrumb": Cult Beauty's breadcrumb is the brand path, so a
   * product page never states its own category. The mapping has to be built
   * from the other direction — walk the category pages and record which product
   * ids appear on each. map-categories.mjs does that; this adapter only
   * declares which pages are worth walking.
   */
  categorySource: "crawl",

  /**
   * Takes the map built by that crawl. Returns null when a product wasn't seen
   * on any category page we walked — the importer must not guess, because an
   * uncategorised product belongs in the review queue, not in a wrong aisle.
   */
  category(record, categoryMap) {
    return categoryMap?.get(String(record.sku)) ?? null;
  },

  /**
   * Its departments line up with noon's, which is what lets both sources feed
   * one storefront taxonomy instead of two parallel ones. `body-wellbeing` is
   * the nearest equivalent of noon's "Personal Care".
   *
   * The `list` sitemap holds 4,683 URLs, most of them marketing pages
   * ("/c/affiliates/…", "/c/birthday/") and 3,137 brand pages. Only the client
   * can say which aisles this store should carry, so departments are named
   * explicitly and subcategories are discovered beneath them.
   */
  departments: [
    { name: "Makeup", path: "make-up" },
    { name: "Skin Care", path: "skin-care" },
    { name: "Hair Care", path: "hair-care" },
    { name: "Fragrance", path: "fragrance" },
    { name: "Personal Care", path: "body-wellbeing" },
  ],

  /**
   * Brands Cult Beauty will not ship to Bahrain — read from their own Bahrain
   * delivery page on 27 Aug 2026.
   *
   * This is not a nicety. The store buys from the supplier *after* the customer
   * has paid, so listing one of these means taking money for something that
   * cannot be delivered, then refunding and apologising. The importer has to
   * drop them at the door.
   *
   * The list is theirs and it will drift, so re-read the page when re-running a
   * full import: https://www.cultbeauty.co.uk/c/info/delivery-information/middle-east/bahrain/
   */
  unfulfillableBrands: [
    "Aveda", "BECCA", "Charlotte Tilbury", "Davines", "Escentric Molecules",
    "ghd", "Healist", "High Beauty", "Higher Dose", "KEVIN.MURPHY", "La Mer",
    "Le Labo", "LOUM", "Paula's Choice", "RevitaLash", "simplehuman", "Too Faced",
  ],

  /**
   * Can this actually reach a customer in Bahrain?
   *
   * Brand names are compared loosely because the same brand is written several
   * ways across a catalogue ("MALIN + GOETZ", "Malin + Goetz", "KEVIN.MURPHY").
   * CBD is a separate restriction and is caught on the product name.
   */
  canFulfil(record) {
    const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const brand = norm(record.brand);
    if (brand && this.unfulfillableBrands.some((b) => norm(b) === brand)) {
      return { ok: false, reason: `${record.brand} is not shipped to Bahrain` };
    }
    if (/\bcbd\b/i.test(record.name)) {
      return { ok: false, reason: "CBD products are not shipped to Bahrain" };
    }
    return { ok: true };
  },

  /**
   * What it costs to get one order here, for whoever sets the markup.
   * Duties are payable by the recipient on arrival, which the shelf price has
   * to absorb if the customer is not to be surprised at the door.
   */
  shippingToBahrain: {
    standard: { cost: 6.95, currency: "GBP", days: "5-15", freeOver: 40 },
    priority: { cost: 36, currency: "GBP", days: "2-4", freeOver: 150 },
    dutiesPaidBy: "recipient",
  },

  categoryPages: {
    sitemap: "https://www.cultbeauty.co.uk/sitemapindex-list.xml.gz",
    /** `?pageNumber=n`; robots.txt permits it (unlike sort= and facetFilters=). */
    paginate: (url, n) => (n <= 1 ? url : `${url}?pageNumber=${n}`),
    /**
     * Seasonal and merchandising shelves ("autumn-trends", "under-25",
     * "curated-by-team-cult-beauty") sit alongside real ones in the sitemap.
     * They are shelves, not aisles — a product in "80s Make-up" still needs a
     * real category — so they are skipped when discovering subcategories.
     */
    skip: /shop-all|quiz|zero-result|shipping|sampling|-edit$|edit$|offer|discount|under-|over-|autumn|spring|summer|winter|christmas|black-friday|advent|trends|curated|hot-on-socials|top-10|bundle|gift/i,
  },
};
