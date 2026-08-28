/**
 * Write supplier delivery windows onto products we already carry.
 *
 *   SITE=noon npm run import:delivery              # dry run, writes nothing
 *   SITE=noon CONFIRM_BACKFILL=1 npm run import:delivery
 *
 * Why this exists rather than re-running promote-staging.
 *
 * Promotion rewrites the whole product row, and two things on the live rows are
 * no longer the supplier's to state. Prices were converted on the way in — the
 * noon catalogue went live at SAR×0.1 — so a re-promote at the default rate of
 * 1 would turn BHD 2.249 into SAR 22.49 across the shop. And staff have since
 * corrected prices by hand (the implied rate across the 301 live noon products
 * runs 0.048 to 0.133, not a flat 0.1), so even re-promoting at the *right*
 * rate would throw that work away.
 *
 * Delivery is different: it is the supplier's fact about its own logistics, and
 * nobody edits it here. So this touches those columns and nothing else, matched
 * on (source, source_sku) — the same identity the sync uses.
 *
 * It reads a capture off disk and does not fetch anything, so it is safe to run
 * against noon without a browser and without tripping Akamai.
 *
 * Env: SITE (required), CONFIRM_BACKFILL (=1 to write), IN (capture path),
 *      NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { getSite, toPage } from "./sites/index.mjs";

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
const CONFIRM = env.CONFIRM_BACKFILL === "1";
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
const IN =
  env.IN ||
  new URL(`./.${site.key}-capture.json`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

const capture = JSON.parse(readFileSync(IN, "utf8"));
if (capture.site && capture.site !== site.key) {
  console.error(`Capture is from "${capture.site}" but SITE=${site.key}. Refusing to mislabel it.`);
  process.exit(2);
}

/* ---- Parse the capture into delivery facts, keyed by the supplier's code ---- */

const raws = capture.products ?? [];
const delivery = new Map();
let parsed = 0;
let stated = 0;

for (const raw of raws) {
  if (raw.error || raw.blocked) continue;
  // A capture holds raw pages (jsonld/html) before the adapter has run; a
  // normalised one holds records that already carry `fulfilment`.
  const record = raw.fulfilment !== undefined
    ? raw
    : site.parse(toPage({ url: raw.sourceUrl ?? raw.url, html: raw.html ?? "", jsonld: raw.jsonld }));
  if (!record?.sku) continue;
  parsed++;
  const f = record.fulfilment;
  if (!f) continue;
  stated++;
  delivery.set(String(record.sku), {
    supplier_dispatch_note: f.dispatchNote ?? null,
    lead_days_min: f.leadDays?.min ?? null,
    lead_days_max: f.leadDays?.max ?? null,
    max_per_order: f.maxPerOrder ?? null,
  });
}

console.log(`${site.label} — ${IN}`);
console.log(`  captured ${capture.capturedAt ?? "(no date)"}`);
console.log(`  parsed ${parsed}, ${stated} with delivery data\n`);

if (!delivery.size) {
  console.log("Nothing to write.");
  process.exit(0);
}

/* ---- Match against the live catalogue ---- */

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const { data: live, error } = await sb
  .from("products")
  .select("id,name,source_sku,lead_days_min,lead_days_max")
  .eq("source", site.key);
if (error) throw error;

const same = (a, b) => (a ?? null) === (b ?? null);
const changes = [];
let unchanged = 0;

for (const row of live ?? []) {
  const next = delivery.get(String(row.source_sku));
  if (!next) continue;
  if (same(row.lead_days_min, next.lead_days_min) && same(row.lead_days_max, next.lead_days_max)) {
    unchanged++;
    continue;
  }
  changes.push({ ...row, next });
}

const notInCapture = (live ?? []).filter((r) => !delivery.get(String(r.source_sku))).length;

console.log(`live ${site.label} products : ${live?.length ?? 0}`);
console.log(`  would change            : ${changes.length}`);
console.log(`  already correct         : ${unchanged}`);
console.log(`  no delivery in capture  : ${notInCapture}`);

if (changes.length) {
  console.log(`\nfirst few:`);
  for (const c of changes.slice(0, 5)) {
    const was = c.lead_days_max == null ? "site default" : `${c.lead_days_min}–${c.lead_days_max} days`;
    console.log(`  ${c.name.slice(0, 44).padEnd(46)} ${was}  →  ${c.next.lead_days_min}–${c.next.lead_days_max} days`);
  }
}

/*
  Written with a plain `if` rather than an early process.exit: exiting while the
  Supabase client still holds an open handle makes libuv abort on Windows with
  "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)" after the output,
  which reads like the script crashed when it had in fact finished.
*/
if (!CONFIRM) {
  console.log(`\nDry run — nothing written. Re-run with CONFIRM_BACKFILL=1 to apply.`);
} else {
  /* One row at a time, so a single bad row cannot fail the batch. */
  let ok = 0;
  const failed = [];
  for (const c of changes) {
    const { error: upErr } = await sb.from("products").update(c.next).eq("id", c.id);
    if (upErr) failed.push(`${c.name}: ${upErr.message}`);
    else ok++;
  }

  console.log(`\nUpdated ${ok}/${changes.length}.`);
  for (const f of failed.slice(0, 10)) console.log(`  ✗ ${f}`);
  if (failed.length) process.exitCode = 1;

  console.log(
    `\nStorefront pages cache for an hour — a product page will show the new\n` +
      `window on its next revalidation, or immediately after a redeploy.`,
  );
}
