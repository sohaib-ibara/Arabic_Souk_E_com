/**
 * Round every stored price to two decimals.
 *
 * The shop displays two now (see src/lib/format.ts), and displaying two while
 * storing three is how a basket comes to disagree with its own total by a fil.
 * Migration 0018 stops new prices arriving with a third decimal; this fixes the
 * ones already there.
 *
 *   node --env-file=.env.local scripts/round-prices.mjs           # dry run
 *   node --env-file=.env.local scripts/round-prices.mjs --apply
 *
 * Products only. Past orders are deliberately left alone: an order records what
 * the customer was actually charged, and rewriting it to match today's rounding
 * would make the record disagree with the receipt and with Stripe. Whatever a
 * historic line says, that is what happened.
 *
 * Safe to re-run: it only touches rows that are not already rounded.
 */
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");

/** Half-up on the third decimal, matching Postgres round() and toFixed(2). */
const to2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

const { data, error } = await sb
  .from("products")
  .select("id, name, price, compare_at_price, cost_price");

if (error) {
  console.error("reading products:", error.message);
  process.exit(1);
}

const changes = [];
for (const p of data) {
  const patch = {};
  for (const field of ["price", "compare_at_price", "cost_price"]) {
    const value = p[field];
    if (value == null) continue;
    const rounded = to2(value);
    if (rounded !== Number(value)) patch[field] = rounded;
  }
  if (Object.keys(patch).length) changes.push({ p, patch });
}

console.log(`${data.length} products, ${changes.length} carrying a third decimal`);

for (const { p, patch } of changes.slice(0, 10)) {
  const shown = Object.entries(patch)
    .map(([f, v]) => `${f} ${Number(p[f]).toFixed(3)} -> ${v.toFixed(2)}`)
    .join(", ");
  console.log(`   ${shown}   ${p.name.slice(0, 44)}`);
}
if (changes.length > 10) console.log(`   ... and ${changes.length - 10} more`);

/*
  No process.exit on a path that succeeded: leaving while the Supabase client
  still holds an open socket trips a libuv assertion on Windows, which prints
  what looks like a crash at the end of a run that worked. Falling off the end
  lets Node close the handle and exit quietly.
*/
if (!changes.length) {
  console.log("\nNothing to do.");
} else if (!APPLY) {
  console.log("\nDry run. Re-run with --apply to write.");
} else {
  let done = 0;
  let failed = null;

  for (const { p, patch } of changes) {
    // One row at a time: each has its own values, so there is nothing to
    // batch, and a few hundred single updates take seconds while keeping a
    // failure attributable to one product rather than to a batch of fifty.
    const { error: updateError } = await sb.from("products").update(patch).eq("id", p.id);
    if (updateError) {
      failed = `${p.name}: ${updateError.message}`;
      break;
    }
    done += 1;
  }

  console.log(`\nrounded ${done} products.`);
  if (failed) {
    console.error(`stopped at ${failed}`);
    console.error("Re-run to continue — rows already rounded are skipped.");
    process.exitCode = 1;
  }
}
