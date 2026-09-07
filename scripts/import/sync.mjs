/**
 * The daily supplier sync — find what's new, find what moved.
 *
 *   SITE=cultbeauty npm run sync                    # dry run, writes nothing
 *   SITE=cultbeauty CONFIRM_SYNC=1 npm run sync     # applies
 *
 * WHAT IT DOES NOT DO, and why.
 *
 * It does not change prices on the live shop. The prices there are not the
 * supplier's: noon's came in at SAR×0.1 and staff have corrected them by hand
 * since (the implied rate across the live catalogue runs 0.048 to 0.133, not a
 * flat 0.1). A sync that followed the supplier would erase that work every
 * night, and would need a markup rule the client has not given. So a price
 * move is *recorded* — staging holds the supplier's new figure, the run
 * reports it, and a human decides.
 *
 * It does not list anything. New products land in staging as 'pending' and, if
 * promoted, arrive hidden. Curation is the client's, per supplier.
 *
 * It DOES write delivery windows straight through to live products. That is
 * the supplier's own fact about its own logistics, nobody edits it here, and a
 * stale one is a promise we break. Same reasoning as backfill-delivery.mjs.
 *
 * Every run records itself in `sync_runs` whether it succeeds, fails or is a
 * dry run — a sync that silently died three weeks ago has to look different
 * from a sync with nothing to report.
 *
 * Env:
 *   SITE          required — noon | cultbeauty
 *   CONFIRM_SYNC  =1 to write; without it this is a dry run
 *   NEW_LIMIT     default 40   — most new products one run may take on
 *   REFRESH_LIMIT default 60   — how many known products to re-check (stalest first)
 *   REFRESH       all | unpriced (default all) — which known products qualify
 *   DELAY_MS / CONCURRENCY / HEADLESS — as import:capture
 *   DISCOVER      shelves | sitemap | listing (default: the adapter's)
 */
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { getSite, toPage } from "./sites/index.mjs";
import { discoverProducts } from "./discover.mjs";
import { openFetcher, pooled } from "./fetcher.mjs";

function loadEnv() {
  const env = { ...process.env };
  for (const file of [".env.local", ".env"]) {
    try {
      const raw = readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
      for (const line of raw.split("\n")) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
        if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    } catch {
      /* optional */
    }
  }
  return env;
}

const env = loadEnv();
const SITE = env.SITE;
const CONFIRM = env.CONFIRM_SYNC === "1";
const NEW_LIMIT = Number(env.NEW_LIMIT || 40);
const REFRESH_LIMIT = Number(env.REFRESH_LIMIT || 60);
const REFRESH_ONLY_UNPRICED = (env.REFRESH || "all").toLowerCase() === "unpriced";
const HEADLESS = env.HEADLESS === "1";
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SITE) {
  console.error("Set SITE=<key>. Known: noon, cultbeauty");
  process.exit(2);
}
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const site = getSite(SITE);
// Both real-browser transports drive a single page, so they share the serial
// pacing. Only a plain HTTP source can safely run a pool.
const isBrowser = site.transport === "browser" || site.transport === "camoufox";
const DELAY_MS = Number(env.DELAY_MS || (isBrowser ? 1500 : 400));
const CONCURRENCY = Number(env.CONCURRENCY || (isBrowser ? 1 : 4));

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const now = () => new Date().toISOString();

console.log(`\n${site.label} sync — ${CONFIRM ? "APPLYING" : "dry run, writes nothing"}`);
console.log(`  transport ${site.transport}   new≤${NEW_LIMIT}  refresh≤${REFRESH_LIMIT}\n`);

/* ------------------------------------------------------------------ *
 * 1. Open the run record first, so a crash leaves evidence
 * ------------------------------------------------------------------ */

let runId = null;
{
  const { data, error } = await sb
    .from("sync_runs")
    .insert({ source: site.key, applied: CONFIRM })
    .select("id")
    .single();
  if (error) {
    // A missing table means migration 0013 has not run. Say so plainly rather
    // than failing later with a confusing PostgREST error.
    console.error(
      error.code === "PGRST205"
        ? "sync_runs is missing — run supabase/migrations/0013_sync_runs.sql first."
        : `Could not open a run record: ${error.message}`,
    );
    process.exit(1);
  }
  runId = data.id;
}

/** Close the run record, whatever happened. */
async function finish(fields) {
  await sb.from("sync_runs").update({ finished_at: now(), ...fields }).eq("id", runId);
}

process.on("unhandledRejection", async (e) => {
  await finish({ ok: false, error: String(e).slice(0, 500) });
  process.exit(1);
});

/* ------------------------------------------------------------------ *
 * 2. What we already hold
 * ------------------------------------------------------------------ */

/*
  Indexed by URL as well as by SKU, and both are needed.

  On a multi-variant product the two disagree: Cult Beauty's /p/…/10449360/
  parses to sku 10302495, because the adapter picks a variant and the variant
  carries its own code. Roughly 40% of that catalogue is multi-variant.

  Classifying by URL-derived SKU alone therefore never matches what we stored,
  so those products look new on every run: re-fetched nightly, never diffed for
  a price change, and — worst of the three — consuming the whole NEW_LIMIT
  budget forever, so genuinely new products would never be reached at all.

  The URL is the stable half of the pair, so it is the primary key here and the
  SKU is the fallback.
*/
const stagedByUrl = new Map();
const stagedBySku = new Map();
{
  // Paged: a source can hold thousands and PostgREST caps a response.
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from("staging_products")
      .select("source_sku,source_url,raw,scraped_at")
      .eq("source", site.key)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    for (const r of data) {
      stagedBySku.set(String(r.source_sku), r);
      if (r.source_url) stagedByUrl.set(r.source_url, r);
    }
    if (data.length < PAGE) break;
  }
}
/** What we already hold for this page, by either identity. */
const known = (url, sku) =>
  stagedByUrl.get(url) ?? (sku == null ? null : stagedBySku.get(String(sku))) ?? null;

/*
  Live products count as "held" for discovery, even with no staging row.

  noon's 301 went live through the original import, which predated staging, so
  staging knows nothing about them. Without this the first noon sync would
  discover nothing and refresh nothing. They arrive as new *to staging*, which
  is accurate — that first run seeds the mirror, and every run after it diffs
  against it.
*/
/*
  The vendor's pricing rule, for the one case below where this sync sets a
  price: a product that has none.

  Read from `vendors` rather than assumed, and applied through the same
  `vendor_retail_price` function the admin's reprice uses, so a price this
  writes and a price the admin computes cannot disagree. Null when the vendor
  row or the function is absent — an older database, or a source with no vendor
  configured — and then no price is written and everything else still runs.
*/
let vendorRule = null;
{
  const { data } = await sb
    .from("vendors")
    .select("fx_rate_to_bhd, markup_percent, surcharge_bhd, round_prices")
    .eq("key", site.key)
    .maybeSingle();
  if (data) vendorRule = data;
}

async function retailPrice(amount) {
  if (!vendorRule) return 0;
  const { data, error } = await sb.rpc("vendor_retail_price", {
    p_amount: amount,
    p_fx: vendorRule.fx_rate_to_bhd,
    p_markup: vendorRule.markup_percent,
    p_surcharge: vendorRule.surcharge_bhd,
    p_round: vendorRule.round_prices,
  });
  if (error) {
    vendorRule = null; // say it once, not once per product
    console.log(`First prices not set: ${error.message}`);
    return 0;
  }
  return Number(data ?? 0);
}

const liveUrls = new Set();
/*
  The live rows that have no price, by URL.

  Two jobs. `REFRESH=unpriced` re-checks exactly these, which matters because
  the ordinary rotation is stalest-first and takes five runs to come round on
  301 products — so a product that came back into stock at the supplier can sit
  unsellable on the shop for a week. These are the ones worth the requests: we
  cannot sell them as they stand.

  And below, they are the only rows whose `price` this sync will write. See the
  note there for why that is not a contradiction of "the sync never sets
  prices".
*/
const unpricedUrls = new Set();
{
  const { data } = await sb
    .from("products")
    .select("source_url, price")
    .eq("source", site.key)
    .not("source_url", "is", null);
  for (const r of data ?? []) {
    liveUrls.add(r.source_url);
    if (!(Number(r.price) > 0)) unpricedUrls.add(r.source_url);
  }
}

console.log(`Already held: ${stagedBySku.size} staged, ${liveUrls.size} live`);

/* ------------------------------------------------------------------ *
 * 3. Discover what the supplier currently lists
 * ------------------------------------------------------------------ */

function loadCategoryMap() {
  if (site.categorySource !== "crawl") return null;
  const path = new URL(`./.${site.key}-categories.json`, import.meta.url).pathname.replace(
    /^\/([A-Za-z]:)/,
    "$1",
  );
  if (!existsSync(path)) return new Map();
  const raw = JSON.parse(readFileSync(path, "utf8"));
  return new Map(Object.entries(raw.products));
}

const categoryMap = loadCategoryMap();

/*
  Where the candidate URLs come from.

    shelves  the category map (Cult Beauty; every result arrives categorised)
    sitemap  everything the source publishes
    listing  walk listing pages in a browser and scroll
    staged   only the products we already hold

  The machinery for `listing` under Camoufox now exists — the helper scrolls a
  page itself and hands back the links (`LIST <url>` in camoufox-fetch.py,
  surfaced as `net.links`) — but noon is NOT defaulted to it, and the reason is
  worth recording.

  noon's category grids are refused. Measured 2 Sep: a product page through
  Camoufox returns 250KB of real HTML, while
  /beauty/makeup-16142/face-18064/foundation/ returns 2,667 bytes of Akamai
  block page, warmed session or not. The July capture crawled those same eight
  grids at 45 products each, so this tightened between July and now — the same
  direction as the Chrome-wide block on 31 Aug.

  So defaulting noon to `listing` would spend eight refused requests every
  night before falling back, which is both pointless and how a soft block
  becomes a hard one. It stays on `staged` until there is a route that works,
  and `DISCOVER=listing` is there to retest whenever someone wants to check
  whether noon has relaxed.

  Cult Beauty is unaffected: it has a sitemap and needs none of this.
*/
const noonListingsAreBlocked =
  site.discover.kind === "listing" && site.transport === "camoufox";
const DISCOVER =
  env.DISCOVER ||
  (noonListingsAreBlocked
    ? "staged"
    : site.discover.kind === "listing"
      ? "listing"
      : categoryMap?.size
        ? "shelves"
        : "sitemap");

/*
  A crawl-categorised source without its map cannot categorise anything.

  This bites in CI specifically: the map is a local build artefact and is
  gitignored, so a GitHub Actions run has no map, falls back to sitemap
  discovery, and files every new product under no category. Cult Beauty's
  breadcrumb is brand-based — ["Philip Kingsley", "<product name>"] — so there
  is nothing on the page to fall back to.

  Not fatal, and not worth blocking the run over: change detection on products
  we already hold is the valuable half and needs no map at all. But it must be
  said out loud and recorded, because "40 new products" reads like a good night
  when in fact none of them can be shelved.
*/
const missingCategoryMap = site.categorySource === "crawl" && !categoryMap?.size;
if (missingCategoryMap) {
  console.log(
    `⚠  No category map for ${site.key} — new products will be staged UNCATEGORISED.\n` +
      `   Change detection on known products is unaffected.\n` +
      `   Build one with:  SITE=${site.key} npm run import:categories\n`,
  );
}

let net = null;
let discovered = [];
try {
  if (DISCOVER === "staged") {
    discovered = [...new Set([...stagedByUrl.keys(), ...liveUrls])];
    const unseeded = discovered.filter((u) => !stagedByUrl.has(u)).length;
    console.log(`Discovered: ${discovered.length} (products we already hold — refresh only)`);
    if (unseeded) {
      console.log(
        `  ${unseeded} of them are live but not yet in staging — this run seeds them,\n` +
          `  so they are counted as new here. Later runs will diff against them.`,
      );
    }
    if (!discovered.length) {
      throw new Error(
        `Nothing held for ${site.key}, so there is nothing to refresh. ` +
          `Seed it with a capture first: SITE=${site.key} npm run import:capture`,
      );
    }
  } else if (DISCOVER === "shelves") {
    if (!categoryMap?.size) {
      throw new Error(`No category map. Run: SITE=${site.key} npm run import:categories`);
    }
    discovered = [...categoryMap.values()].map((c) => c.url).filter(Boolean);
    console.log(`Discovered: ${discovered.length} (from the category map)`);
  } else {
    net = await openFetcher(site, { headless: HEADLESS });

    /*
      Warm the session before crawling a listing page.

      Measured on noon: a cold Camoufox session asking for a category page gets
      Akamai's interstitial, and the only link on it is akamai.com/privacy.
      Fetch one ordinary product page first and the same category URL returns
      885 hrefs. One request buys the clearance cookie that makes discovery
      work at all, so it is cheap at any price.
    */
    const warmUrl = [...liveUrls][0] ?? [...stagedByUrl.keys()][0];
    if (warmUrl && typeof net.links === "function" && site.discover.kind === "listing") {
      try {
        await net.grab(warmUrl);
        console.log("  (warmed the session with one product page)");
      } catch {
        // Discovery reports what it managed to find; no need to fail here.
      }
    }

    discovered = await discoverProducts(site, {
      page: net.page,
      // Camoufox has no page but can scroll on our behalf; see fetcher.mjs.
      links: typeof net.links === "function" ? net.links : null,
      max: Number(env.MAX_DISCOVER || 5000),
      log: (s) => console.log(s),
    });
    console.log(`Discovered: ${discovered.length} (${DISCOVER})`);

    /*
      A listing crawl that comes back empty must not be read as "the retailer
      delisted everything". Fall back to what we hold so the run still does its
      refresh, and say so loudly — a blocked or restructured listing page looks
      exactly like an empty one from here.
    */
    if (!discovered.length) {
      discovered = [...new Set([...stagedByUrl.keys(), ...liveUrls])];
      console.log(
        `⚠  Discovery returned nothing. Falling back to the ${discovered.length} products we
` +
          `   already hold. Check the listing URLs in scripts/import/sites/${site.key}.mjs.`,
      );
    }
  }
} catch (e) {
  await finish({ ok: false, error: `discovery: ${String(e.message ?? e)}`.slice(0, 500) });
  console.error(`Discovery failed: ${e.message ?? e}`);
  process.exit(1);
}

/* ------------------------------------------------------------------ *
 * 4. Decide what to fetch
 *
 * New products are found by SKU, which the adapter reads from the URL —
 * so classifying costs no requests. Known products are re-checked
 * stalest-first: a full re-fetch of thousands of pages every night is
 * neither necessary nor polite, and rotation means everything comes
 * round eventually.
 * ------------------------------------------------------------------ */

const candidates = [];
const seenUrls = new Set();
for (const url of discovered) {
  if (seenUrls.has(url)) continue;
  seenUrls.add(url);
  const prev = known(url, site.skuFromUrl(url));
  candidates.push({ url, sku: site.skuFromUrl(url), prev });
}

const fresh = candidates.filter((c) => !c.prev);
let revisit = candidates.filter((c) => c.prev);

if (REFRESH_ONLY_UNPRICED) {
  const before = revisit.length;
  revisit = revisit.filter((c) => unpricedUrls.has(c.url));
  console.log(`  REFRESH=unpriced: ${revisit.length} of ${before} known products have no price`);
}

revisit.sort((a, b) => {
  const at = a.prev?.scraped_at ?? "";
  const bt = b.prev?.scraped_at ?? "";
  return at < bt ? -1 : at > bt ? 1 : 0;
});

const toFetch = [
  ...fresh.slice(0, NEW_LIMIT).map((c) => ({ ...c, isNew: true })),
  ...revisit.slice(0, REFRESH_LIMIT).map((c) => ({ ...c, isNew: false })),
];

console.log(
  `  new upstream    ${fresh.length}` +
    (fresh.length > NEW_LIMIT ? `  (taking ${NEW_LIMIT} this run)` : ""),
);
console.log(
  `  already known   ${revisit.length}` +
    (revisit.length > REFRESH_LIMIT ? `  (re-checking the ${REFRESH_LIMIT} stalest)` : ""),
);
console.log(`  fetching        ${toFetch.length}\n`);

/* ------------------------------------------------------------------ *
 * 5. What counts as a change
 * ------------------------------------------------------------------ */

const num = (v) => (v == null ? null : Math.round(Number(v) * 1000) / 1000);
const text = (v) => (v == null ? null : String(v).trim());
const list = (v) => JSON.stringify(Array.isArray(v) ? v : []);

/*
  Compare the window by its values, never by JSON.stringify.

  `prev` comes back out of a jsonb column, and Postgres normalises jsonb key
  order — the adapter writes {min, max} and reads back {"max":…,"min":…}. Two
  identical windows therefore produce two different strings, and the first run
  of this sync duly reported a delivery change on 58 of 60 unchanged products.
  Left in, it would have marked the whole catalogue changed every night and
  buried the price moves that actually matter.
*/
const sameWindow = (a, b) =>
  (a?.min ?? null) === (b?.min ?? null) && (a?.max ?? null) === (b?.max ?? null);

/**
 * Compare a fresh record against the last one we captured.
 *
 * Only fields a shopper or a buyer would care about. Rating and review count
 * drift constantly and would mark half the catalogue "changed" every night,
 * drowning the price moves that matter — so they are deliberately excluded.
 */
function diff(prev, next) {
  if (!prev) return { kinds: [], previous: null };
  const checks = [
    ["price", () => num(prev.price) !== num(next.price), () => num(prev.price)],
    ["name", () => text(prev.name) !== text(next.name), () => text(prev.name)],
    [
      "description",
      () => text(prev.description) !== text(next.description),
      () => (text(prev.description) ?? "").slice(0, 300),
    ],
    ["images", () => list(prev.images) !== list(next.images), () => (prev.images ?? []).length],
    ["availability", () => prev.available !== next.available, () => prev.available],
    [
      "delivery",
      () => !sameWindow(prev.fulfilment?.leadDays, next.fulfilment?.leadDays),
      () => prev.fulfilment?.leadDays ?? null,
    ],
  ];
  const kinds = [];
  const previous = {};
  for (const [kind, changed, before] of checks) {
    if (changed()) {
      kinds.push(kind);
      previous[kind] = before();
    }
  }
  return { kinds, previous: kinds.length ? previous : null };
}

/* ------------------------------------------------------------------ *
 * 6. Fetch and compare
 * ------------------------------------------------------------------ */

if (!net) net = await openFetcher(site, { headless: HEADLESS });

const results = { new: [], changed: [], unchanged: 0, failed: [], refused: [] };

/*
  Every record we successfully parsed, whether or not anything about it moved.

  Kept separately because `results` only retains the rows that differ, and the
  supplier's own price has to reach `products.source_price` for ALL of them —
  that column is what /admin/vendors reprices from, and a product that happens
  not to have changed still needs one. Identity here is the record's own SKU
  plus its URL, for the multi-variant reason described below.
*/
const parsed = [];
let i = 0;

await pooled(toFetch, CONCURRENCY, DELAY_MS, async ({ sku, url }) => {
  const n = ++i;
  try {
    const record = site.parse(toPage({ url, html: await net.grab(url) }));
    if (!record) {
      results.failed.push({ sku, url, reason: "no product data" });
      console.log(`  [${n}/${toFetch.length}] ✗ no product data`);
      return;
    }

    const fulfil = site.canFulfil(record);
    if (!fulfil.ok) {
      results.refused.push({ sku, reason: fulfil.reason });
      console.log(`  [${n}/${toFetch.length}] ⊘ ${fulfil.reason}`);
      return;
    }

    record.category = site.category(record, categoryMap);
    parsed.push({ url, record });

    /*
      Decided from the parsed record, not from the pre-fetch guess.

      The guess is made before the page is read, so on a multi-variant product
      it is made from the wrong SKU. Re-checking here — by the record's own SKU
      as well as its URL — means such a product is recognised as one we hold
      and gets diffed, instead of being filed as new forever.
    */
    const prev = known(url, record.sku);
    if (!prev) {
      results.new.push(record);
      console.log(
        `  [${n}/${toFetch.length}] + ${record.name.slice(0, 44).padEnd(46)} ${String(record.price).padStart(8)} ${record.currency}`,
      );
      return;
    }

    const { kinds, previous } = diff(prev.raw, record);
    if (!kinds.length) {
      results.unchanged++;
      return;
    }
    /*
      Keep the SKU we already stored, do not adopt the one just parsed.

      On a multi-variant product the parsed SKU is whichever variant the page
      happened to lead with, and that moves: this row was stored as 10785712
      and came back 13321112 after Cult Beauty reordered the shades. Writing
      the new one would try to insert a second row for a URL we already hold,
      which violates staging_products_source_source_url_key.

      The URL is the stable half of the pair — it is what we matched on — so
      the identity stays put and only the content updates.
    */
    results.changed.push({ record, kinds, previous, sku: prev.source_sku });
    const detail = kinds
      .map((k) =>
        k === "price" ? `price ${previous.price} → ${num(record.price)}` : k,
      )
      .join(", ");
    console.log(`  [${n}/${toFetch.length}] ~ ${record.name.slice(0, 34).padEnd(36)} ${detail}`);
  } catch (e) {
    results.failed.push({ sku, url, reason: String(e?.message ?? e).slice(0, 80) });
    console.log(`  [${n}/${toFetch.length}] ✗ ${String(e?.message ?? e).slice(0, 60)}`);
  }
});

await net.close();

/* ------------------------------------------------------------------ *
 * 7. Report
 * ------------------------------------------------------------------ */

const kindCounts = {};
for (const c of results.changed) for (const k of c.kinds) kindCounts[k] = (kindCounts[k] ?? 0) + 1;

console.log(`\n${"─".repeat(60)}`);
console.log(`new products    ${results.new.length}`);
console.log(`changed         ${results.changed.length}`);
for (const [k, n] of Object.entries(kindCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`   ${k.padEnd(13)}${n}`);
}
console.log(`unchanged       ${results.unchanged}`);
console.log(`refused         ${results.refused.length}`);
console.log(`failed          ${results.failed.length}`);

if (kindCounts.availability) {
  console.log(
    `\n⚠  ${kindCounts.availability} availability change(s). This store buys after the customer\n` +
      `   pays, so a supplier going out of stock means an order it cannot fill.`,
  );
}

const summary = {
  ...kindCounts,
  refused: results.refused.length,
  // Surfaced in /admin/sync so a run that staged uncategorised products is not
  // mistaken for a clean one.
  ...(missingCategoryMap ? { no_category_map: true } : {}),
  samples: results.changed.slice(0, 20).map((c) => ({
    sku: c.record.sku,
    name: c.record.name.slice(0, 80),
    kinds: c.kinds,
    previous: c.previous,
    price: num(c.record.price),
  })),
};

if (!CONFIRM) {
  console.log(`\nDry run — nothing written. Re-run with CONFIRM_SYNC=1 to apply.`);
  await finish({
    ok: true,
    discovered: discovered.length,
    fetched: toFetch.length,
    new_products: results.new.length,
    changed: results.changed.length,
    unchanged: results.unchanged,
    failed: results.failed.length,
    summary,
  });
} else {
  /* ---------------------------------------------------------------- *
   * 8. Write: staging for everything, live products for delivery only
   * ---------------------------------------------------------------- */

  const stamp = now();
  const toRow = (r, kinds, previous, sku) => ({
    source: r.source ?? site.key,
    // `sku` is the identity we already hold, where we hold one — see the note
    // where results.changed is built. Only a genuinely new product uses the
    // freshly parsed value.
    source_sku: String(sku ?? r.sku),
    source_url: r.sourceUrl,
    raw: r,
    name: r.name,
    brand: r.brand,
    price: r.price,
    currency: r.currency,
    short_description: r.description ? r.description.slice(0, 200) : null,
    description: r.description,
    category: r.category?.slug ?? null,
    images: r.images ?? [],
    in_stock: r.available,
    rating: r.rating ? Math.round(r.rating * 10) / 10 : null,
    review_count: r.reviewCount ?? 0,
    supplier_dispatch_note: r.fulfilment?.dispatchNote ?? null,
    lead_days_min: r.fulfilment?.leadDays?.min ?? null,
    lead_days_max: r.fulfilment?.leadDays?.max ?? null,
    max_per_order: r.fulfilment?.maxPerOrder ?? null,
    scraped_at: stamp,
    last_seen_at: stamp,
    ...(kinds?.length ? { changed_at: stamp, change_kinds: kinds, previous } : {}),
    // `status` stays absent: sending it would reset a human's approve/reject
    // every time the sync ran.
  });

  const rows = [
    ...results.new.map((r) => toRow(r, [], null)),
    ...results.changed.map((c) => toRow(c.record, c.kinds, c.previous, c.sku)),
  ];

  /*
    A rejected batch is retried row by row.

    An upsert is one statement, so one bad row discards the whole batch. That
    is how a run detected three changes, wrote none, and still reported
    success: two perfectly good rows were collateral damage from a third that
    violated a unique constraint. Falling back to individual writes keeps the
    good ones and names the row that actually failed.
  */
  let staged_ok = 0;
  const stagingErrors = [];
  const CHUNK = 100;
  for (let k = 0; k < rows.length; k += CHUNK) {
    const batch = rows.slice(k, k + CHUNK);
    const { error } = await sb
      .from("staging_products")
      .upsert(batch, { onConflict: "source,source_sku" });
    if (!error) {
      staged_ok += batch.length;
      continue;
    }
    console.log(`  ⚠ batch ${k + 1}–${k + batch.length} rejected (${error.message}) — retrying singly`);
    for (const row of batch) {
      const { error: one } = await sb
        .from("staging_products")
        .upsert([row], { onConflict: "source,source_sku" });
      if (one) {
        stagingErrors.push(`${row.source_sku} ${String(row.name).slice(0, 40)}: ${one.message}`);
        console.log(`    ✗ ${row.source_sku} ${String(row.name).slice(0, 40)} — ${one.message}`);
      } else staged_ok++;
    }
  }
  console.log(`\nStaged ${staged_ok}/${rows.length}.`);

  // Mark everything we saw as still listed upstream, so a row whose
  // last_seen_at stops advancing stands out as delisted.
  // By URL, not SKU: on a multi-variant product the URL's id is not the SKU
  // the row was stored under, so matching on SKU would silently mark nothing.
  const seen = toFetch.map((t) => t.url).filter(Boolean);
  for (let k = 0; k < seen.length; k += 200) {
    await sb
      .from("staging_products")
      .update({ last_seen_at: stamp })
      .eq("source", site.key)
      .in("source_url", seen.slice(k, k + 200));
  }

  /* Delivery goes straight to live products — supplier fact, nobody edits it. */
  const deliveryMoves = results.changed.filter((c) => c.kinds.includes("delivery"));
  let deliveryApplied = 0;
  for (const c of deliveryMoves) {
    const { error, count } = await sb
      .from("products")
      .update(
        {
          supplier_dispatch_note: c.record.fulfilment?.dispatchNote ?? null,
          lead_days_min: c.record.fulfilment?.leadDays?.min ?? null,
          lead_days_max: c.record.fulfilment?.leadDays?.max ?? null,
        },
        { count: "exact" },
      )
      .eq("source", site.key)
      .eq("source_sku", String(c.record.sku));
    if (!error) deliveryApplied += count ?? 0;
  }
  if (deliveryMoves.length) {
    console.log(`Delivery windows updated on ${deliveryApplied} live product(s).`);
  }

  /*
    The supplier's own price, onto the live row — never the shelf price.

    `source_price` is what /admin/vendors recomputes from: rate, markup,
    surcharge, ladder. Writing it here rather than at promotion time is what
    gives the 301 noon products already on the shop something to reprice from,
    since they were loaded by a pasted seed file that predates the column.

    `price` is deliberately not touched. What the shop charges stays a human
    decision made in the admin, exactly as the message below has always said.
  */
  let costsApplied = 0;
  let stockApplied = 0;
  let firstPrices = 0;
  for (let k = 0; k < parsed.length; k += 1) {
    const { url, record } = parsed[k];
    const patch = {};

    /*
      Availability goes through, and it goes through BOTH ways.

      Same argument as the delivery window above: this shop holds no stock. It
      buys from the supplier after the customer pays, so "can this be bought"
      is the supplier's fact about its own warehouse, not a number anybody
      edits here. Nothing else writes this column for a supplier product, so
      leaving it alone is what left 46 noon products marked Out of stock on the
      shop while noon was selling them, with no way back.

      Outside the price guard below, and that placement is the whole point. A
      product going out of stock is exactly the case where the supplier quotes
      no price — noon publishes `price: 0` and `OutOfStock` together — so
      handling availability only alongside a price would update the shop when
      something came back and never when it went away. That is the direction
      that sells a customer something we cannot buy.
    */
    if (record.available === true) patch.in_stock = true;
    else if (record.available === false) patch.in_stock = false;

    if (Number(record.price) > 0) {
      // 0 is "out of stock", not "free", so it is never recorded as a cost.
      patch.source_price = record.price;
      patch.source_currency = record.currency;

      /*
        And the shelf price, but ONLY where there is none.

        The rule this file has always followed — the sync does not set what the
        shop charges — is about not overwriting a decision. A product with no
        price at all embodies no decision: it cannot be bought, it shows
        nothing where a figure should be, and every one of them got there by
        being captured on a day the supplier happened to be out of stock.

        So a first price is filled in from the vendor's own rule, through the
        same database function /admin/vendors reprices with, and anything that
        already has a price is left alone. Repricing the rest stays a human
        action behind a preview.
      */
      if (unpricedUrls.has(url) && vendorRule) {
        const shelf = await retailPrice(record.price);
        if (shelf > 0) patch.price = shelf;
      }
    }

    if (Object.keys(patch).length === 0) continue;

    // By URL first, because on a multi-variant product the parsed SKU is not
    // the one the row is stored under — the same trap as last_seen_at above.
    let { count, error } = await sb
      .from("products")
      .update(patch, { count: "exact" })
      .eq("source", site.key)
      .eq("source_url", url);

    /*
      Stop at the first missing column rather than failing 200 more times.

      This runs on whatever database the machine points at, which may not have
      had 0014 applied yet — and the sync's real job (staging) has already
      succeeded by this point, so a missing column is a note, not a failure.
    */
    if (error?.code === "42703") {
      console.log(
        "Supplier prices not recorded: products.source_price is missing. " +
          "Run supabase/migrations/0014_vendor_provisioning.sql.",
      );
      costsApplied = 0;
      break;
    }

    if (!count) {
      ({ count } = await sb
        .from("products")
        .update(patch, { count: "exact" })
        .eq("source", site.key)
        .eq("source_sku", String(record.sku)));
    }
    const n = count ?? 0;
    if (patch.source_price != null) costsApplied += n;
    if (patch.in_stock != null) stockApplied += n;
    if (patch.price != null) firstPrices += n;
  }
  if (stockApplied) {
    console.log(`Availability updated on ${stockApplied} live product(s).`);
  }
  if (firstPrices) {
    console.log(`First shelf price set on ${firstPrices} product(s) that had none.`);
  }
  if (costsApplied) {
    console.log(`Supplier price recorded on ${costsApplied} live product(s).`);
  }

  /*
    Say what was NOT done, precisely, because this line is the whole contract
    between the sync and the person reading its output. It used to say "prices
    were NOT changed on the live shop" full stop, which stopped being true the
    day this started filling in a first price for a product that had none.
    A summary that overstates its own restraint is worse than none.
  */
  const moves = results.changed.filter((c) => c.kinds.includes("price")).length;
  const held = Math.max(0, moves - firstPrices);
  console.log(
    `\n${held} price move(s) are waiting in staging for review — an existing price is\n` +
      `never changed here, only in /admin/vendors behind a preview.` +
      (firstPrices
        ? `\n${firstPrices} product(s) that had NO price were given their first one.`
        : "") +
      `\nNothing new is listed until an admin lists it.`,
  );

  /*
    A run that could not write what it found is not a successful run.

    The first applied run detected three changes, wrote zero, and recorded
    ok=true — so /admin/sync would have shown a healthy sync while the shop
    quietly learned nothing. Whether the writes landed is the only thing an
    applied run is actually for.
  */
  if (stagingErrors.length) {
    console.log(
      `\n⚠  ${stagingErrors.length} row(s) could not be staged. This run is marked failed.`,
    );
  }
  await finish({
    ok: stagingErrors.length === 0,
    error: stagingErrors.length ? stagingErrors.slice(0, 5).join(" | ").slice(0, 500) : null,
    discovered: discovered.length,
    fetched: toFetch.length,
    new_products: results.new.length,
    changed: results.changed.length,
    unchanged: results.unchanged,
    failed: results.failed.length,
    summary: {
      ...summary,
      delivery_applied: deliveryApplied,
      staged: staged_ok,
      staging_errors: stagingErrors.length,
    },
  });
  if (stagingErrors.length) process.exitCode = 1;
}

console.log(`\nRun recorded: ${runId}`);
