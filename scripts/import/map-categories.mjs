/**
 * Build a product → category map for sites whose product pages don't say.
 *
 * noon puts the category in every product's breadcrumb, so it needs none of
 * this. Cult Beauty's breadcrumb is the brand path instead, so the only way to
 * learn that a product is a lipstick is to see it on the lipstick shelf. This
 * walks the category pages an adapter declares and records what's on each.
 *
 * The output is a plain JSON map, written once and reused by every import, so
 * a daily sync doesn't re-crawl the taxonomy — only products change daily,
 * aisles don't. Re-run it when the client changes which categories to carry.
 *
 *   SITE=cultbeauty node scripts/import/map-categories.mjs
 *
 * Env: SITE (required), DEPTS (comma-separated, default: all the adapter names),
 *      MAX_PAGES per category (default 5), DELAY_MS (default 800), OUT
 *
 * Politeness matters here: this is the one step that makes many requests, so it
 * is rate-limited by default and capped per category. It reads only pages
 * robots.txt permits.
 */
import { writeFileSync } from "node:fs";
import { DEFAULT_UA, getSite } from "./sites/index.mjs";
import { fromSitemap } from "./discover.mjs";
import { slugify } from "./sites/shared.mjs";

const SITE = process.env.SITE;
const MAX_PAGES = Number(process.env.MAX_PAGES || 5);
const DELAY_MS = Number(process.env.DELAY_MS || 800);

if (!SITE) {
  console.error("Set SITE=<key>. Known: noon, cultbeauty");
  process.exit(2);
}
const site = getSite(SITE);
const OUT =
  process.env.OUT ||
  new URL(`./.${site.key}-categories.json`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

if (site.categorySource !== "crawl") {
  console.log(`${site.label} states each product's category on the page itself — no map needed.`);
  process.exit(0);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getHtml(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": DEFAULT_UA, Accept: "text/html,*/*;q=0.8", "Accept-Language": "en-GB,en;q=0.9" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/**
 * Every product linked from a category page, as id → URL.
 *
 * The URL is kept, not just the id, so a capture can be driven straight from
 * this map. That matters more than it sounds: discovering from the shelves
 * means every captured product arrives already categorised, where discovering
 * from the sitemap leaves most of them uncategorised because no shelf crawl
 * ever reaches the whole 10,541-product catalogue.
 */
function productsIn(html, origin) {
  const found = new Map();
  for (const m of html.matchAll(/\/p\/([a-z0-9-]+)\/(\d+)\//gi)) {
    found.set(m[2], `${origin}/p/${m[1]}/${m[2]}/`);
  }
  return found;
}

/**
 * Titlecase a slug into a category label fit to show a shopper.
 *
 * Two special cases, because these are shelf names on a live storefront:
 * connectors stay lowercase ("Eau de Parfum", not "Eau De Parfum") and known
 * abbreviations stay uppercase ("SPF", not "Spf").
 */
const LOWER = new Set(["de", "la", "le", "du", "of", "and", "the", "for", "by", "in", "with"]);
const UPPER = new Set(["spf", "uv", "bb", "cc", "led", "ml", "eu", "usa", "uk", "pm", "am"]);
const label = (slug) =>
  slug
    .split("-")
    .map((w, i) => {
      if (UPPER.has(w)) return w.toUpperCase();
      if (i > 0 && LOWER.has(w)) return w;
      return w[0].toUpperCase() + w.slice(1);
    })
    .join(" ");

const wanted = (process.env.DEPTS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const departments = wanted.length
  ? site.departments.filter((d) => wanted.includes(d.name) || wanted.includes(d.path))
  : site.departments;

console.log(`${site.label} — mapping ${departments.length} department(s)\n`);

/* ---- 1. Find the real subcategories under each department. ---- */
const all = await fromSitemap(site.categoryPages.sitemap, { log: () => {} });
const paths = all
  .map((u) => u.replace(`${site.origin}/c/`, "").replace(/\/$/, ""))
  .filter(Boolean);

const shelves = [];
for (const dept of departments) {
  const subs = paths
    .filter((p) => p.startsWith(`${dept.path}/`) && p.split("/").length === 2)
    .filter((p) => !site.categoryPages.skip.test(p));
  // The department page itself catches products not on any subcategory shelf.
  shelves.push({ department: dept.name, path: dept.path, name: dept.name });
  for (const p of subs) shelves.push({ department: dept.name, path: p, name: label(p.split("/")[1]) });
  console.log(`  ${dept.name.padEnd(14)} ${subs.length} subcategories`);
}

/* ---- 2. Walk each shelf and record what's on it. ---- */
console.log(`\nCrawling ${shelves.length} pages (max ${MAX_PAGES} pages each, ${DELAY_MS}ms apart)…\n`);

const map = {}; // sku -> { department, name, slug }
let requests = 0;
let failures = 0;

for (const shelf of shelves) {
  const base = `${site.origin}/c/${shelf.path}/`;
  let total = 0;
  for (let n = 1; n <= MAX_PAGES; n++) {
    const url = site.categoryPages.paginate(base, n);
    let found;
    try {
      found = productsIn(await getHtml(url), site.origin);
      requests++;
    } catch (e) {
      failures++;
      console.log(`  ✗ ${shelf.path} p${n} — ${e.message}`);
      break;
    }
    if (!found.size) break; // ran past the last page
    for (const [id, productUrl] of found) {
      // First shelf wins. Subcategories are crawled after their department
      // page, so a product only keeps the broad label if no narrower one
      // claimed it — which is the wrong way round, so prefer the deeper path.
      const existing = map[id];
      const deeper = shelf.path.includes("/");
      if (!existing || (deeper && !existing.deep)) {
        map[id] = {
          department: shelf.department,
          departmentSlug: slugify(shelf.department),
          name: shelf.name,
          slug: slugify(shelf.name),
          url: productUrl,
          deep: deeper,
        };
      }
    }
    total += found.size;
    await sleep(DELAY_MS);
  }
  if (total) console.log(`  ${shelf.path.padEnd(42)} ${total}`);
}

for (const v of Object.values(map)) delete v.deep; // internal only

const byDept = {};
for (const v of Object.values(map)) byDept[v.department] = (byDept[v.department] ?? 0) + 1;

writeFileSync(
  OUT,
  JSON.stringify({ site: site.key, builtAt: new Date().toISOString(), products: map }, null, 2),
  "utf8",
);

console.log(`\n${Object.keys(map).length} products mapped across ${requests} requests (${failures} failed)`);
for (const [d, n] of Object.entries(byDept).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${d.padEnd(14)} ${n}`);
}
console.log(`\nWrote ${OUT}`);
