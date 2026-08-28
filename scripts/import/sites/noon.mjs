/**
 * noon.com (Saudi storefront) — the original source.
 *
 * Parsing here reproduces scripts/import/build-imported-data.mjs exactly: same
 * SKU extraction, same slug, same breadcrumb-to-department mapping. That is
 * deliberate — the live catalogue's 301 slugs were produced by that code, and a
 * re-import that renamed them would break every indexed URL and every
 * `source_url` backfilled onto the products table.
 *
 * Transport is "browser" because it has to be: noon sits behind Akamai Bot
 * Manager, which serves a JavaScript sensor challenge. No HTTP client can pass
 * it. See docs/SUPPLIER_SYNC.md for the measurements.
 */
import { breadcrumbOf, decode, findType, imageList, slugify, availabilityToBool } from "./shared.mjs";

/** noon's own top-level beauty departments, in the order we show them. */
const DEPT_ORDER = ["Makeup", "Skin Care", "Hair Care", "Fragrance", "Personal Care"];
const KNOWN_DEPTS = new Set(DEPT_ORDER);

export default {
  key: "noon",
  label: "noon (Saudi)",
  origin: "https://www.noon.com",
  currency: "SAR",
  transport: "browser",
  departmentOrder: DEPT_ORDER,

  /**
   * noon publishes no product sitemap, so discovery means walking listing
   * pages in a real browser and scrolling until they stop growing.
   */
  discover: {
    kind: "listing",
    urls: ["https://www.noon.com/saudi-en/noon-premium-beauty/"],
  },

  // noon product URLs end in the product code then `/p/`.
  isProductUrl: (url) => /\/[A-Z0-9]+\/p\/?/i.test(url),

  skuFromUrl: (url) => url.match(/\/([A-Z0-9]+)\/p\//i)?.[1]?.toUpperCase() ?? null,

  parse(page) {
    const prod = findType(page.entities, "Product");
    if (!prod?.name) return null;

    const offer = Array.isArray(prod.offers) ? prod.offers[0] : prod.offers;
    const url = offer?.url || page.url || "";
    const sku = (this.skuFromUrl(url) ?? slugify(prod.name)).toUpperCase();

    return {
      source: this.key,
      sku,
      sourceUrl: page.url || url,
      name: decode(prod.name),
      brand: decode(prod.brand?.name ?? prod.brand ?? "") || null,
      description: decode(prod.description) || null,
      images: imageList(prod.image),
      price: Number(offer?.price ?? 0),
      currency: offer?.priceCurrency || this.currency,
      available: availabilityToBool(offer?.availability),
      rating: Number(prod.aggregateRating?.ratingValue ?? 0) || 0,
      reviewCount:
        Number(prod.aggregateRating?.reviewCount ?? prod.aggregateRating?.ratingCount ?? 0) || 0,
      breadcrumb: breadcrumbOf(page.entities),
      /**
       * null, and checked rather than assumed.
       *
       * noon's pages carry no dispatch time we can read: the JSON-LD states
       * availability and nothing more, and the July capture of 814 products
       * contains no delivery field of any kind. Cult Beauty embeds one, so the
       * interface allows it — but inventing a number for noon would put a
       * delivery promise on the page with nothing behind it.
       */
      fulfilment: null,
      variantCount: 1,
    };
  },

  /** The page states its own category, so no separate crawl is needed. */
  categorySource: "breadcrumb",

  /**
   * noon publishes no per-brand restriction list for Bahrain the way Cult
   * Beauty does, and staff have been sourcing from it by hand without hitting
   * one. Nothing is filtered here rather than guessing at a list — but this is
   * an absence of evidence, not a cleared route, and it is worth a look if a
   * noon order is ever refused at checkout on their side.
   */
  canFulfil: () => ({ ok: true }),

  /**
   * noon's breadcrumb is a category path, so the taxonomy comes free:
   * department = first node under "Beauty & Fragrance", category = the one
   * below it. Products cross-listed outside beauty fold into Personal Care so
   * the nav stays coherent.
   */
  category(record) {
    const path = record.breadcrumb.filter((c) => !/^beauty\s*&\s*fragrance$/i.test(c));
    let department = decode(path[0] || "Beauty");
    const name = decode(path[1] || path[0] || "Beauty");
    if (!KNOWN_DEPTS.has(department)) department = "Personal Care";
    return { department, departmentSlug: slugify(department), name, slug: slugify(name) };
  },
};
