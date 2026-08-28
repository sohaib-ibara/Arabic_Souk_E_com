/**
 * Write a capture into `staging_products`, keyed by supplier.
 *
 * This is the step that puts scraped products in the database. It writes to
 * staging, never to the live catalogue: nothing reaches a shopper until a human
 * approves it and promote-staging.ts moves it across. Prices land in the
 * supplier's own currency, because converting them is a pricing decision that
 * has not been made yet — see docs/SUPPLIER_SYNC.md.
 *
 * Identity is `(source, source_sku)`, not the URL. A retailer renaming a
 * product changes its URL but not its code, so keying on the URL would make
 * every rename look like a brand-new product and quietly duplicate the row.
 * That pair is a unique index, so a re-run updates rather than inserts — which
 * is exactly what a daily sync needs.
 *
 *   SITE=cultbeauty CONFIRM_STAGE=1 npm run import:stage
 *
 * A row already reviewed keeps its status: `status` is not sent on update, so
 * an approve or reject survives the next sync. New rows arrive 'pending'.
 *
 * Env: SITE (required), CONFIRM_STAGE (required =1), IN (capture path),
 *      NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { getSite } from "./sites/index.mjs";

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
const CONFIRM = env.CONFIRM_STAGE === "1";
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SITE) {
  console.error("Set SITE=<key>. Known: noon, cultbeauty");
  process.exit(2);
}
const site = getSite(SITE);
const IN =
  env.IN ||
  new URL(`./.${site.key}-capture.json`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
if (!CONFIRM) {
  console.error(
    `Refusing to write. Set CONFIRM_STAGE=1.\n` +
      `This writes scraped third-party data to staging_products for review — see docs/NOON_IMPORT.md.`,
  );
  process.exit(2);
}

const capture = JSON.parse(readFileSync(IN, "utf8"));
if (capture.site && capture.site !== site.key) {
  console.error(`Capture is from "${capture.site}" but SITE=${site.key}. Refusing to mislabel it.`);
  process.exit(2);
}

const records = (capture.products ?? []).filter((p) => !p.error && p.sku && p.name);
console.log(`${site.label} — ${records.length} record(s) from ${IN}`);
console.log(`Captured ${capture.capturedAt}\n`);

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

/**
 * One staging row. `status` is deliberately absent — sending it would reset a
 * human's approve/reject decision every time the sync ran.
 */
const toRow = (r) => ({
  source: r.source ?? site.key,
  source_sku: String(r.sku),
  source_url: r.sourceUrl,
  // The whole normalised record, so a later question ("how many variants did
  // this have?") can be answered without re-scraping.
  raw: r,
  name: r.name,
  brand: r.brand,
  price: r.price,
  currency: r.currency,
  short_description: r.description ? r.description.slice(0, 200) : null,
  description: r.description,
  category: r.category?.slug ?? null,
  images: r.images ?? [],
  // The supplier's own availability where it states one. noon does not, so
  // those stay null rather than being invented as `true`.
  in_stock: r.available,
  rating: r.rating ? Math.round(r.rating * 10) / 10 : null,
  review_count: r.reviewCount ?? 0,
  // What the supplier says about getting it here. Null throughout for a source
  // that states nothing (noon), so the product page falls back to the site
  // default rather than showing a window nobody promised.
  supplier_dispatch_note: r.fulfilment?.dispatchNote ?? null,
  lead_days_min: r.fulfilment?.leadDays?.min ?? null,
  lead_days_max: r.fulfilment?.leadDays?.max ?? null,
  max_per_order: r.fulfilment?.maxPerOrder ?? null,
  scraped_at: capture.capturedAt ?? new Date().toISOString(),
});

/* Chunked so one oversized request can't fail the whole run. */
const CHUNK = 100;
let written = 0;
const failures = [];

for (let i = 0; i < records.length; i += CHUNK) {
  const batch = records.slice(i, i + CHUNK).map(toRow);
  const { error } = await sb
    .from("staging_products")
    .upsert(batch, { onConflict: "source,source_sku" });
  if (error) {
    failures.push(error.message);
    console.log(`  ✗ rows ${i + 1}–${i + batch.length}: ${error.message}`);
  } else {
    written += batch.length;
    console.log(`  ✓ rows ${i + 1}–${i + batch.length}`);
  }
}

console.log(`\nStaged ${written}/${records.length}.`);
if (failures.length) process.exitCode = 1;

/* ---- What is now waiting, by status and supplier ---- */
const { data: counts } = await sb
  .from("staging_products")
  .select("source,status")
  .eq("source", site.key);

if (counts) {
  const byStatus = {};
  for (const row of counts) byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
  console.log(`\n${site.label} in staging:`);
  for (const [status, n] of Object.entries(byStatus).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${status.padEnd(10)} ${n}`);
  }
}

const uncategorised = records.filter((r) => !r.category).length;
if (uncategorised) console.log(`\n⚠  ${uncategorised} staged without a category — set one before promoting.`);
console.log(
  `\nPrices are ${site.currency}. promote-staging.ts converts on the way to the live catalogue.`,
);
