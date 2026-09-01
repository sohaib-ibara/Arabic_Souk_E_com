/**
 * Find a site's product URLs.
 *
 * Two strategies, chosen by the adapter's `discover.kind`:
 *
 *   sitemap  — download the list the retailer publishes for search engines.
 *              Cheap, complete, and no browser: one request returns every
 *              product URL, which makes "what's new since yesterday?" a set
 *              difference rather than a crawl.
 *   listing  — walk category pages in a real browser and scroll until they
 *              stop growing. The fallback for sites that publish no sitemap.
 *
 * Prefer sitemap wherever a site offers one. It is faster, it is far gentler on
 * the retailer, and it is the access route they have explicitly invited.
 */
import { gunzipSync } from "node:zlib";
import { DEFAULT_UA } from "./sites/index.mjs";

const LOC = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;

/** Sitemaps named .gz may arrive gzipped or already decoded — handle both. */
async function fetchXml(url, timeoutMs) {
  const res = await fetch(url, {
    headers: { "User-Agent": DEFAULT_UA, Accept: "application/xml,text/xml,*/*" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const gzipped = buf[0] === 0x1f && buf[1] === 0x8b;
  return (gzipped ? gunzipSync(buf) : buf).toString("utf8");
}

const locsIn = (xml) => [...xml.matchAll(LOC)].map((m) => m[1]);

/**
 * Walk a sitemap index down to the URLs themselves.
 *
 * `maxChildren` is a guard, not a preference: an index pointing at hundreds of
 * shards would otherwise fan out into hundreds of requests from one call.
 */
export async function fromSitemap(entry, { timeoutMs = 30_000, maxChildren = 25, log = () => {} } = {}) {
  const xml = await fetchXml(entry, timeoutMs);
  const isIndex = /<sitemapindex/i.test(xml);
  if (!isIndex) return locsIn(xml);

  const children = locsIn(xml);
  if (children.length > maxChildren) {
    log(`  sitemap index has ${children.length} shards; reading the first ${maxChildren}`);
  }
  const urls = [];
  for (const child of children.slice(0, maxChildren)) {
    try {
      const shard = await fetchXml(child, timeoutMs);
      const found = locsIn(shard);
      urls.push(...found);
      log(`  ${child.split("/").pop()} → ${found.length} URLs`);
    } catch (e) {
      log(`  ${child} failed — ${e.message}`);
    }
  }
  return urls;
}

/**
 * Every product URL a set of listing pages yields, via a transport that can
 * scroll them for us.
 *
 * `linksFn(url)` returns every href on that page once it has been scrolled to
 * the end. It exists so a source whose browser is out of process — Camoufox,
 * which is the only client noon accepts — can still discover products it has
 * never seen. Before this, such a source could only refresh URLs already on
 * file, so anything the retailer added was invisible to us for ever.
 */
export async function fromListingLinks(linksFn, listingUrls, site, { max = 100, log = () => {} } = {}) {
  const found = new Set();
  for (const listing of listingUrls) {
    if (found.size >= max) break;
    try {
      const hrefs = await linksFn(listing);
      const products = hrefs.filter((u) => site.isProductUrl(u));
      for (const u of products) {
        if (found.size >= max) break;
        found.add(u);
      }
      log(`  ${listing} → ${products.length} product links (${found.size} total)`);
    } catch (e) {
      log(`  ${listing} failed — ${e.message}`);
    }
  }
  return [...found];
}

/**
 * Scroll a listing page until the product-link count stops growing.
 * Runs inside a caller-supplied Playwright page so the browser is launched once.
 */
export async function fromListing(page, listingUrls, site, { max = 100, log = () => {} } = {}) {
  const found = new Set();
  for (const listing of listingUrls) {
    try {
      await page.goto(listing, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2500);
      let last = 0;
      let stalls = 0;
      for (let i = 0; i < 40 && stalls < 3; i++) {
        await page.evaluate(() => window.scrollBy(0, window.innerHeight * 1.5));
        await page.waitForTimeout(700);
        const links = await page.evaluate(() =>
          Array.from(document.querySelectorAll("a[href]"), (a) => a.href),
        );
        const n = links.filter((u) => site.isProductUrl(u)).length;
        if (n >= max) break;
        if (n <= last) stalls++;
        else stalls = 0;
        last = n;
      }
      const links = await page.evaluate(() =>
        Array.from(document.querySelectorAll("a[href]"), (a) => a.href),
      );
      links.filter((u) => site.isProductUrl(u)).slice(0, max).forEach((u) => found.add(u));
      log(`  ${listing} → ${found.size} so far`);
    } catch (e) {
      log(`  ${listing} failed — ${e.message}`);
    }
  }
  return [...found];
}

/**
 * Product URLs for a site, by whichever route its adapter declares.
 * `page` is required only for listing-based sites.
 */
export async function discoverProducts(
  site,
  { page = null, links = null, max = Infinity, log = () => {} } = {},
) {
  const d = site.discover;
  if (d.kind === "sitemap") {
    const all = await fromSitemap(d.url, { log });
    const products = all.filter((u) => site.isProductUrl(u));
    log(`  ${all.length} sitemap URLs → ${products.length} product URLs`);
    return products.slice(0, max);
  }
  if (d.kind === "listing") {
    const cap = Number.isFinite(max) ? max : 100;
    // A transport that scrolls for us is preferred: it is the only route open
    // to an out-of-process browser, and it behaves identically from here.
    if (links) return fromListingLinks(links, d.urls, site, { max: cap, log });
    if (page) return fromListing(page, d.urls, site, { max: cap, log });
    throw new Error(`${site.key} discovery needs a browser page or a links() transport`);
  }
  throw new Error(`Unknown discovery kind "${d.kind}" for ${site.key}`);
}
