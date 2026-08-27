import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

/**
 * Verifies the live Supabase connection and reports row counts, WITHOUT ever
 * printing secrets (the URL is masked, the anon key is never shown).
 *
 * Run:  node scripts/check-supabase.ts   (or: npm run check:supabase)
 */

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = { ...(process.env as Record<string, string>) };
  for (const file of [".env.local", ".env"]) {
    try {
      const raw = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
      for (const line of raw.split("\n")) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
        if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    } catch {
      /* file may not exist */
    }
  }
  return env;
}

function maskUrl(u?: string): string {
  if (!u) return "(missing)";
  try {
    const host = new URL(u).host;
    return host.replace(/^([a-z0-9]{4})[a-z0-9]*(\.supabase\.co)$/i, "$1…$2");
  } catch {
    return "(invalid URL)";
  }
}

const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

console.log("── Arabic Souk · Supabase check ──");
console.log(`Project URL : ${maskUrl(url)}`);
console.log(`Anon key    : ${key ? "set ✓" : "MISSING ✗"}`);

if (!url || !key) {
  console.error("\nMissing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local");
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

let ok = true;
for (const table of ["categories", "brands", "products"]) {
  // `id`, not `*`. Since 0008 dropped the blanket table grant on products and
  // granted back only the public columns, `select("*")` as anon is a
  // permission error — so this check reported the catalogue unseeded whenever
  // it was working exactly as designed.
  const { count, error } = await sb.from(table).select("id", { count: "exact", head: true });
  if (error) {
    ok = false;
    console.log(`  ${table.padEnd(11)}: ERROR — ${error.message}`);
  } else if (!count) {
    ok = false;
    console.log(`  ${table.padEnd(11)}: 0 rows  ⚠ run supabase/seed.sql`);
  } else {
    console.log(`  ${table.padEnd(11)}: ${count} rows ✓`);
  }
}

const { data: sample } = await sb.from("products").select("name, price").limit(3);
if (sample?.length) {
  console.log(
    `  sample      : ${sample.map((p) => `${p.name} (BHD ${Number(p.price).toFixed(3)})`).join(", ")}`,
  );
}

/*
  Is every migration actually applied?

  Worth checking separately from row counts, because a missing table is easy to
  mistake for an empty one — `select(count, head)` returns a null count and NO
  error for a table that does not exist, which is exactly how 0002 went
  unnoticed until 0010 failed on it in the SQL editor.

  A plain select tells them apart. A missing table errors with PGRST205; a
  table that exists but is closed to anon by RLS returns an empty list, which
  is the correct and expected answer for the staff-only ones.
*/
console.log("\nSchema (has every migration been run?)");

const EXPECTED: Array<{ table: string; migration: string; staffOnly?: boolean }> = [
  { table: "categories", migration: "0001_init" },
  { table: "brands", migration: "0001_init" },
  { table: "products", migration: "0001_init" },
  { table: "orders", migration: "0001_init", staffOnly: true },
  { table: "order_items", migration: "0001_init", staffOnly: true },
  { table: "staging_products", migration: "0002_staging", staffOnly: true },
  { table: "demand_signals", migration: "0003_demand_signals", staffOnly: true },
  { table: "stock_movements", migration: "0005_inventory", staffOnly: true },
];

const missing: string[] = [];
for (const { table, migration, staffOnly } of EXPECTED) {
  // `id` for the same reason as above: `*` would report a column grant as a
  // missing table.
  const { error } = await sb.from(table).select("id").limit(1);
  if (error?.code === "PGRST205") {
    missing.push(migration);
    ok = false;
    console.log(`  ${table.padEnd(18)} MISSING ✗  run supabase/migrations/${migration}.sql`);
  } else if (error) {
    console.log(`  ${table.padEnd(18)} ${error.code ?? "error"} — ${error.message.slice(0, 45)}`);
  } else {
    console.log(`  ${table.padEnd(18)} present ✓${staffOnly ? "  (staff-only, anon sees nothing)" : ""}`);
  }
}

if (missing.length) {
  console.log(
    `\n⚠ ${new Set(missing).size} migration(s) never applied: ${[...new Set(missing)].join(", ")}`,
  );
}

console.log(
  ok
    ? "\n✅ Supabase is connected and seeded — the storefront will serve products from your database."
    : "\n⚠ Connected, but the catalogue isn't fully seeded. Run the migration + seed, then re-check.",
);
process.exit(ok ? 0 : 2);
