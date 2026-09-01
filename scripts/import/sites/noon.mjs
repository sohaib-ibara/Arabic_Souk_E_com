/**
 * noon.com (Saudi storefront) — the original source.
 *
 * Parsing here reproduces scripts/import/build-imported-data.mjs exactly: same
 * SKU extraction, same slug, same breadcrumb-to-department mapping. That is
 * deliberate — the live catalogue's 301 slugs were produced by that code, and a
 * re-import that renamed them would break every indexed URL and every
 * `source_url` backfilled onto the products table.
 *
 * Transport is "camoufox", and it has to be.
 *
 * noon sits behind Akamai Bot Manager, which serves a JavaScript sensor
 * challenge, so no HTTP client can pass it — that much was always true. What
 * changed on 31 Aug 2026 is that Chrome stopped working too: Playwright's
 * bundled Chromium, the real Chrome binary and rebrowser-patched Chromium were
 * each refused from an IP where a human's Chrome loaded the site fine, minutes
 * apart. They share CDP, and the sensor reads it.
 *
 * Camoufox is Firefox patched at the C++ level, drives no CDP, and passed on
 * the first attempt. See docs/SUPPLIER_SYNC.md for the measurements.
 */
import {
  availabilityToBool,
  breadcrumbOf,
  dayRange,
  decode,
  findType,
  imageList,
  shippingDeliveryTime,
  slugify,
} from "./shared.mjs";

/** noon's own top-level beauty departments, in the order we show them. */
const DEPT_ORDER = ["Makeup", "Skin Care", "Hair Care", "Fragrance", "Personal Care"];
const KNOWN_DEPTS = new Set(DEPT_ORDER);

export default {
  key: "noon",
  label: "noon (Saudi)",
  origin: "https://www.noon.com",
  currency: "SAR",
  transport: "camoufox",
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
    /**
     * page.url is the page we actually asked for, so it is the identity we can
     * trust. `offer.url` agrees with it while the product is in stock, but an
     * out-of-stock page publishes the storefront homepage there instead. That
     * yields no SKU, falls through to the slugified name, and gives the product
     * a second identity for exactly as long as it stays out of stock.
     */
    const url = page.url || offer?.url || "";
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
       * noon states delivery per product, inside `offers.shippingDetails`.
       *
       * ⚠ The window is to an address in noon's OWN country — `SA` on all 703
       * products in the July capture that carry one. It is not what a Bahrain
       * customer experiences: the Saudi→Bahrain leg is on top of it, and noon
       * does not state that leg anywhere on the page.
       *
       * Recorded as noon gives it, deliberately, pending the client's answer on
       * how goods actually cross. The scope is written into `dispatchNote`,
       * which is staff-only (migration 0012 grants it to no one), so whoever
       * reads it in the admin can see what the number does and does not cover.
       */
      fulfilment: (() => {
        const d = shippingDeliveryTime(offer);
        if (!d) return null;
        const where = d.destinationCountry ?? "the stated destination";
        const legs = [
          d.handling && `dispatch ${dayRange(d.handling)}`,
          d.transit && `transit ${dayRange(d.transit)}`,
        ].filter(Boolean);
        return {
          dispatchNote:
            `noon: ${legs.join(" + ")}, to an address in ${where}. ` +
            `Excludes ${where}→BH, which noon does not state.`,
          dispatchDays: d.handling?.max ?? null,
          maxPerOrder: null,
          barcode: null,
          preorder: false,
          // Null when noon states dispatch but not transit — see
          // shippingDeliveryTime. Those products fall back to the site default
          // rather than passing a dispatch time off as a delivery time.
          leadDays: d.total,
        };
      })(),
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
