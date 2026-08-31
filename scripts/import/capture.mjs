/**
 * Capture a supplier's catalogue into normalised records — any supplier.
 *
 * This replaces the noon-only browser-noon.mjs. It reads the transport and the
 * discovery method from the site's adapter, so the same command works whether a
 * source needs a real browser on a residential connection (noon) or answers a
 * plain HTTP fetch from anywhere (Cult Beauty):
 *
 *   SITE=cultbeauty CONFIRM_SCRAPE=1 npm run import:capture
 *   SITE=noon CONFIRM_SCRAPE=1 npm run import:capture
 *
 * Output is one JSON file of normalised records — same shape from every source,
 * prices still in the source's own currency. It publishes nothing and writes to
 * no database; a human decides what happens next.
 *
 * ⚠️  The captured copy and images belong to the retailer and the brands. This
 * writes a LOCAL review file. Publishing scraped assets to a live store is a
 * decision with legal consequences — see docs/NOON_IMPORT.md.
 *
 * Env:
 *   SITE           required — noon | cultbeauty
 *   CONFIRM_SCRAPE required =1, acknowledges the notice above
 *   MAX_PRODUCTS   default 50
 *   DELAY_MS       default 1500 (browser) / 400 (http)
 *   CONCURRENCY    default 1 (browser) / 4 (http)
 *   MERGE=1        top up an existing capture instead of restarting
 *   HEADLESS=1     browser sources only; headed evades bot checks better
 *   OUT            default scripts/import/.<site>-capture.json (gitignored)
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { getSite, toPage } from "./sites/index.mjs";
import { discoverProducts } from "./discover.mjs";
import { openFetcher, pooled } from "./fetcher.mjs";

const SITE = process.env.SITE;
if (!SITE) {
  console.error("Set SITE=<key>. Known: noon, cultbeauty");
  process.exit(2);
}
const site = getSite(SITE);
// Both real-browser transports drive a single page, so they share the serial
// pacing. Only a plain HTTP source can safely run a pool.
const isBrowser = site.transport === "browser" || site.transport === "camoufox";

const CONFIRM = process.env.CONFIRM_SCRAPE === "1";
const MAX_PRODUCTS = Number(process.env.MAX_PRODUCTS || 50);
const DELAY_MS = Number(process.env.DELAY_MS || (isBrowser ? 1500 : 400));
const CONCURRENCY = Number(process.env.CONCURRENCY || (isBrowser ? 1 : 4));
const MERGE = process.env.MERGE === "1";
const HEADLESS = process.env.HEADLESS === "1";
const OUT =
  process.env.OUT ||
  new URL(`./.${site.key}-capture.json`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

const BANNER = `
────────────────────────────────────────────────────────────────────────────
  ${site.label} capture · REVIEW-ONLY · writes a local file, publishes nothing
  Transport: ${site.transport}   Discovery: ${site.discover.kind}
  The captured copy and images belong to the retailer and the brands.
  Publishing them is your legal liability. See docs/NOON_IMPORT.md.
────────────────────────────────────────────────────────────────────────────`;

console.log(BANNER);
if (!CONFIRM) {
  console.error("\nRefusing to run. Set CONFIRM_SCRAPE=1 to acknowledge the notice above.");
  process.exit(2);
}

/** The category map, if this source needs one and it has been built. */
function loadCategoryMap() {
  if (site.categorySource !== "crawl") return null;
  const path = new URL(`./.${site.key}-categories.json`, import.meta.url).pathname.replace(
    /^\/([A-Za-z]:)/,
    "$1",
  );
  if (!existsSync(path)) {
    console.log(
      `\n⚠  No category map at ${path}\n   Run:  SITE=${site.key} npm run import:categories\n` +
        `   Without it every product lands uncategorised.\n`,
    );
    return new Map();
  }
  const raw = JSON.parse(readFileSync(path, "utf8"));
  console.log(`Category map: ${Object.keys(raw.products).length} products, built ${raw.builtAt}`);
  return new Map(Object.entries(raw.products));
}

/* ------------------------------------------------------------------ */

const categoryMap = loadCategoryMap();

// Resume: keep what was captured cleanly last time and skip re-fetching it.
let existing = [];
const done = new Set();
if (MERGE && existsSync(OUT)) {
  try {
    existing = JSON.parse(readFileSync(OUT, "utf8")).products ?? [];
    for (const p of existing) if (!p.error) done.add(p.sourceUrl);
    console.log(`MERGE: ${existing.length} existing records (${done.size} clean) preserved.`);
  } catch {
    /* an unreadable prior capture is not worth failing over */
  }
}

// Transport, browser flags and politeness all live in fetcher.mjs, shared with
// the daily sync — the arguments that get past noon's Akamai challenge must not
// exist in two copies that can drift apart.
const net = await openFetcher(site, { headless: HEADLESS });
const page = net.page;

/**
 * Where the product list comes from.
 *
 * For a source whose pages don't state their own category, walking the shelves
 * we already mapped beats walking the sitemap: every product then arrives
 * categorised, and we only fetch products from aisles the store actually
 * carries. The sitemap route stays for change detection over the whole
 * catalogue and for sources that need no map.
 *
 *   DISCOVER=shelves   product URLs from the category map (the default when
 *                      one exists — every result is categorised)
 *   DISCOVER=sitemap   every product the source publishes
 */
const DISCOVER = process.env.DISCOVER || (categoryMap?.size ? "shelves" : "sitemap");

console.log(`\nDiscovering products (${DISCOVER})…`);
let discovered;
if (DISCOVER === "shelves") {
  if (!categoryMap?.size) {
    console.error(`No category map. Run:  SITE=${site.key} npm run import:categories`);
    process.exit(2);
  }
  discovered = [...categoryMap.values()]
    .map((c) => c.url)
    .filter(Boolean)
    .slice(0, MAX_PRODUCTS);
  console.log(`  ${categoryMap.size} mapped products → ${discovered.length} selected`);
} else {
  discovered = await discoverProducts(site, { page, max: MAX_PRODUCTS, log: (s) => console.log(s) });
}
const urls = discovered.filter((u) => !done.has(u));
console.log(`${discovered.length} discovered · ${urls.length} to fetch\n`);

const products = [];
const skipped = [];
let n = 0;

async function handle(url) {
  const i = ++n;
  try {
    const record = site.parse(toPage({ url, html: await net.grab(url) }));
    if (!record) {
      products.push({ sourceUrl: url, error: "no product data" });
      console.log(`  [${i}/${urls.length}] ✗ no product data — ${url}`);
      return;
    }

    // Refuse anything the supplier can't actually deliver here. Doing this at
    // capture time means it never reaches a review queue, let alone a shelf.
    const fulfil = site.canFulfil(record);
    if (!fulfil.ok) {
      skipped.push({ name: record.name, reason: fulfil.reason });
      console.log(`  [${i}/${urls.length}] ⊘ ${fulfil.reason}`);
      return;
    }

    record.category = site.category(record, categoryMap);
    products.push(record);
    const cat = record.category ? `${record.category.department} › ${record.category.name}` : "uncategorised";
    console.log(
      `  [${i}/${urls.length}] ✓ ${record.name.slice(0, 46).padEnd(48)} ${String(record.price).padStart(7)} ${record.currency}  ${cat}`,
    );
  } catch (e) {
    products.push({ sourceUrl: url, error: String(e?.message ?? e).slice(0, 60) });
    console.log(`  [${i}/${urls.length}] ✗ ${String(e?.message ?? e).slice(0, 50)}`);
  }
}

// A browser drives one page, so it stays serial; HTTP sources run a small pool.
// Either way there is a delay between requests — this is someone else's server.
await pooled(urls, CONCURRENCY, DELAY_MS, handle);

await net.close();

/* ---- merge with any preserved records, preferring a clean capture ---- */
let final = products;
if (MERGE && existing.length) {
  const map = new Map();
  for (const p of [...existing, ...products]) {
    const cur = map.get(p.sourceUrl);
    if (!cur || (cur.error && !p.error)) map.set(p.sourceUrl, p);
  }
  final = [...map.values()];
}

const clean = final.filter((p) => !p.error);
const uncategorised = clean.filter((p) => !p.category).length;

writeFileSync(
  OUT,
  JSON.stringify(
    {
      site: site.key,
      currency: site.currency,
      capturedAt: new Date().toISOString(),
      discovered: discovered.length,
      skipped,
      products: final,
    },
    null,
    2,
  ),
  "utf8",
);

console.log(`\nSaved → ${OUT}`);
console.log(`  captured      ${clean.length} / ${final.length}`);
console.log(`  uncategorised ${uncategorised}${uncategorised ? "  ← review queue" : ""}`);
if (skipped.length) {
  console.log(`  refused       ${skipped.length} (cannot ship to Bahrain)`);
  const why = {};
  for (const s of skipped) why[s.reason] = (why[s.reason] ?? 0) + 1;
  for (const [reason, count] of Object.entries(why).sort((a, b) => b[1] - a[1])) {
    console.log(`      ${String(count).padStart(4)} × ${reason}`);
  }
}
console.log(`\nPrices are in ${site.currency} — converting to BHD is a pricing decision, not this script's.`);
