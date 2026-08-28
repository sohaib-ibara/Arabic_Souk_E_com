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
const isBrowser = site.transport === "browser";
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

console.log(`Already staged: ${stagedBySku.size}`);

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
const DISCOVER = env.DISCOVER || (categoryMap?.size ? "shelves" : "sitemap");

let net = null;
let discovered = [];
try {
  if (DISCOVER === "shelves") {
    if (!categoryMap?.size) {
      throw new Error(`No category map. Run: SITE=${site.key} npm run import:categories`);
    }
    discovered = [...categoryMap.values()].map((c) => c.url).filter(Boolean);
    console.log(`Discovered: ${discovered.length} (from the category map)`);
  } else {
    net = await openFetcher(site, { headless: HEADLESS });
    discovered = await discoverProducts(site, {
      page: net.page,
      max: Number(env.MAX_DISCOVER || 5000),
      log: (s) => console.log(s),
    });
    console.log(`Discovered: ${discovered.length} (${DISCOVER})`);
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
const revisit = candidates.filter((c) => c.prev);

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
    results.changed.push({ record, kinds, previous });
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
  const toRow = (r, kinds, previous) => ({
    source: r.source ?? site.key,
    source_sku: String(r.sku),
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
    ...results.changed.map((c) => toRow(c.record, c.kinds, c.previous)),
  ];

  let staged_ok = 0;
  const CHUNK = 100;
  for (let k = 0; k < rows.length; k += CHUNK) {
    const batch = rows.slice(k, k + CHUNK);
    const { error } = await sb
      .from("staging_products")
      .upsert(batch, { onConflict: "source,source_sku" });
    if (error) console.log(`  ✗ staging rows ${k + 1}–${k + batch.length}: ${error.message}`);
    else staged_ok += batch.length;
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

  console.log(
    `\nPrices were NOT changed on the live shop — ${results.changed.filter((c) => c.kinds.includes("price")).length} price move(s) are\n` +
      `waiting in staging for review. Nothing new is listed until an admin lists it.`,
  );

  await finish({
    ok: true,
    discovered: discovered.length,
    fetched: toFetch.length,
    new_products: results.new.length,
    changed: results.changed.length,
    unchanged: results.unchanged,
    failed: results.failed.length,
    summary: { ...summary, delivery_applied: deliveryApplied, staged: staged_ok },
  });
}

console.log(`\nRun recorded: ${runId}`);
