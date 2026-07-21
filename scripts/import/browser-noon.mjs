/**
 * Noon capture via LOCAL headed Chromium (feature/noon-import) — NO API KEYS.
 *
 * Runs a real browser on THIS machine (your residential IP), which noon trusts,
 * walks the listing page, opens each product, and dumps the raw structured data
 * it finds (JSON-LD, __NEXT_DATA__, Open Graph tags, visible price/title) to a
 * local JSON file. It does NOT interpret or publish anything — a human/Claude
 * parses the capture afterwards, then decides what (if anything) to use.
 *
 * ⚠️  Scraping noon breaches its ToS; its images & copy are copyrighted by noon
 * and the brands. This writes a LOCAL review file only. Publishing scraped assets
 * to a live store is your decision and legal liability. See docs/NOON_IMPORT.md.
 *
 * Run (nothing happens without the confirm flag):
 *   CONFIRM_SCRAPE=1 node scripts/import/browser-noon.mjs
 *
 * Env:
 *   CONFIRM_SCRAPE   required =1
 *   TARGET_URL       default: noon Saudi premium-beauty listing
 *   MAX_PRODUCTS     default: 20
 *   HEADLESS         default: false (headed evades bot checks better; set 1 for headless)
 *   OUT              default: scripts/import/.noon-capture.json  (gitignored)
 *   NAV_TIMEOUT_MS   default: 45000
 *   DELAY_MS         default: 1500 (politeness between product pages)
 */
import { chromium } from "playwright";
import { writeFileSync, readFileSync, existsSync } from "node:fs";

const CONFIRM = process.env.CONFIRM_SCRAPE === "1";
const TARGET_URL = process.env.TARGET_URL || "https://www.noon.com/saudi-en/noon-premium-beauty/";
// Multiple listings (comma-separated) → capture across all of them and merge.
// MAX_PRODUCTS is the per-listing cap.
const TARGET_URLS = (process.env.TARGET_URLS || TARGET_URL)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const MAX_PRODUCTS = Number(process.env.MAX_PRODUCTS || 20);
const HEADLESS = process.env.HEADLESS === "1" || process.env.HEADLESS === "true";
const OUT = process.env.OUT || new URL("./.noon-capture.json", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const NAV_TIMEOUT_MS = Number(process.env.NAV_TIMEOUT_MS || 45000);
const DELAY_MS = Number(process.env.DELAY_MS || 1500);
// MERGE=1 → accumulate into an existing capture (skip already-captured products),
// so a rate-limited run can be topped up gently instead of re-scraped from scratch.
const MERGE = process.env.MERGE === "1";

const BANNER = `
────────────────────────────────────────────────────────────────────────────
  noon capture · LOCAL browser · REVIEW-ONLY · no API keys
  Uses a real Chromium on this machine. Scraping noon breaches its ToS;
  its images & copy are copyrighted. Output is a LOCAL file for review only —
  publishing scraped assets is your legal liability. See docs/NOON_IMPORT.md.
────────────────────────────────────────────────────────────────────────────`;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Navigate with backoff — noon resets connections when it rate-limits; a short
// escalating wait usually recovers without abandoning the page.
async function gotoRetry(page, url, attempts = 3) {
  for (let i = 0; i <= attempts; i++) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded" });
      return;
    } catch (e) {
      if (i === attempts) throw e;
      await sleep(3000 * (i + 1));
    }
  }
}

function looksBlocked(html, title) {
  const t = `${title} ${html}`.toLowerCase();
  return (
    t.includes("just a moment") ||
    t.includes("access denied") ||
    t.includes("captcha") ||
    t.includes("are you a human") ||
    t.includes("attention required")
  );
}

// Pull every structured signal we can from a rendered page, in-browser.
async function grabPageData(page) {
  return page.evaluate(() => {
    const pick = (sel, attr) => document.querySelector(sel)?.getAttribute(attr) ?? null;
    const jsonld = [];
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        jsonld.push(JSON.parse(s.textContent));
      } catch {
        /* skip malformed */
      }
    }
    let nextData = null;
    const nd = document.getElementById("__NEXT_DATA__");
    if (nd) {
      try {
        nextData = JSON.parse(nd.textContent);
      } catch {
        /* skip */
      }
    }
    return {
      title: document.title,
      url: location.href,
      og: {
        title: pick('meta[property="og:title"]', "content"),
        description:
          pick('meta[property="og:description"]', "content") ||
          pick('meta[name="description"]', "content"),
        image: pick('meta[property="og:image"]', "content"),
        priceAmount: pick('meta[property="product:price:amount"]', "content"),
        priceCurrency: pick('meta[property="product:price:currency"]', "content"),
        brand: pick('meta[property="product:brand"]', "content"),
      },
      jsonld,
      nextData,
    };
  });
}

// Scroll until the count of product links stops growing (or we have enough).
async function scrollUntilLoaded(page, target) {
  let last = 0;
  let stalls = 0;
  for (let i = 0; i < 40 && stalls < 3; i++) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight * 1.5));
    await page.waitForTimeout(700);
    const count = await page.evaluate(
      () => Array.from(document.querySelectorAll("a[href]")).filter((a) => /\/p\//.test(a.href)).length,
    );
    if (count >= target) break;
    if (count <= last) stalls++;
    else stalls = 0;
    last = count;
  }
}

async function main() {
  console.log(BANNER);
  if (!CONFIRM) {
    console.error("\nRefusing to run. Set CONFIRM_SCRAPE=1 to acknowledge the ToS/copyright notice above.");
    process.exit(2);
  }

  // --disable-http2: noon's HTTP/2 stack returns ERR_HTTP2_PROTOCOL_ERROR to
  // automation; forcing HTTP/1.1 avoids it. Headed mode also evades bot checks.
  const browser = await chromium.launch({
    headless: HEADLESS,
    args: ["--disable-http2", "--disable-blink-features=AutomationControlled"],
  });
  const context = await browser.newContext({
    userAgent: UA,
    locale: "en-US",
    viewport: { width: 1366, height: 900 },
  });
  // Light stealth: hide the automation flag most bot checks read first.
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(NAV_TIMEOUT_MS);

  const result = {
    target: TARGET_URLS.join(", "),
    capturedAt: new Date().toISOString(),
    listings: [],
    products: [],
  };

  // Resume/merge: seed from an existing capture and skip products already captured cleanly.
  let existing = [];
  const doneUrls = new Set();
  if (MERGE && existsSync(OUT)) {
    try {
      existing = JSON.parse(readFileSync(OUT, "utf8")).products || [];
      for (const p of existing) if (!p.error && !p.blocked) doneUrls.add(p.sourceUrl);
      console.log(`MERGE: ${existing.length} existing products (${doneUrls.size} clean) will be preserved.`);
    } catch {
      /* ignore unreadable prior capture */
    }
  }

  try {
    // Phase 1 — walk every listing and gather product-detail URLs (contain '/p/').
    const productUrls = new Set();
    for (const listing of TARGET_URLS) {
      try {
        console.log(`\nOpening listing: ${listing}`);
        await gotoRetry(page, listing);
        await page.waitForTimeout(2500);
        await scrollUntilLoaded(page, MAX_PRODUCTS);
        const blocked = looksBlocked(await page.content(), await page.title());
        const links = await page.evaluate(() =>
          Array.from(document.querySelectorAll("a[href]"), (a) => a.href),
        );
        const found = Array.from(new Set(links.filter((u) => /\/p\//.test(u)))).slice(0, MAX_PRODUCTS);
        found.forEach((u) => productUrls.add(u));
        result.listings.push({ url: listing, found: found.length, blocked });
        console.log(`  → ${found.length} product URL(s)${blocked ? " (listing looked blocked)" : ""}`);
      } catch (e) {
        result.listings.push({ url: listing, error: String(e?.message || e) });
        console.log(`  ✗ listing failed — ${e?.message || e}`);
      }
      await sleep(DELAY_MS);
    }

    // Phase 2 — scrape each unique product page (skipping any already captured).
    const urls = [...productUrls].filter((u) => !doneUrls.has(u));
    if (MERGE) console.log(`Skipping ${productUrls.size - urls.length} already-captured; ${urls.length} new to scrape.`);
    if (process.env.LIST_ONLY === "1") {
      console.log(`\nLIST_ONLY: ${urls.length} unique product URL(s) found; skipping scrape.`);
      result.discovered = urls.length;
      writeFileSync(OUT, JSON.stringify(result, null, 2), "utf8");
      await browser.close();
      return;
    }
    console.log(`\nScraping ${urls.length} unique product page(s) across ${TARGET_URLS.length} listing(s)…`);
    result.discovered = urls.length;

    for (const [i, url] of urls.entries()) {
      try {
        await gotoRetry(page, url);
        await page.waitForTimeout(1800);
        const data = await grabPageData(page);
        const blocked = looksBlocked(await page.content(), data.title);
        result.products.push({ sourceUrl: url, blocked, ...data });
        console.log(`  [${i + 1}/${urls.length}] ${blocked ? "⚠ blocked" : "✓"} ${data.og.title || data.title}`);
      } catch (e) {
        result.products.push({ sourceUrl: url, error: String(e?.message || e) });
        console.log(`  [${i + 1}/${urls.length}] ✗ ${url} — ${e?.message || e}`);
      }
      await sleep(DELAY_MS);
    }
  } catch (e) {
    console.error("Fatal:", e?.message || e);
    result.fatal = String(e?.message || e);
  } finally {
    await browser.close();
  }

  // Union with the preserved existing products (prefer clean over error/blocked).
  if (MERGE && existing.length) {
    const map = new Map();
    for (const p of [...existing, ...result.products]) {
      const cur = map.get(p.sourceUrl);
      if (!cur) {
        map.set(p.sourceUrl, p);
      } else if ((cur.error || cur.blocked) && !p.error && !p.blocked) {
        map.set(p.sourceUrl, p); // upgrade a previously-failed URL to a clean capture
      }
    }
    result.products = [...map.values()];
  }

  writeFileSync(OUT, JSON.stringify(result, null, 2), "utf8");
  const good = result.products.filter((p) => !p.blocked && !p.error).length;
  console.log(`\nSaved capture → ${OUT}`);
  console.log(`Products captured: ${good} clean / ${result.products.length} total.`);
  if (good === 0) {
    console.log("If everything is blocked, try HEADLESS unset (headed) and re-run, or use the manual capture route.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
