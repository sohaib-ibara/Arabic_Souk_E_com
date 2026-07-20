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
  const { count, error } = await sb.from(table).select("*", { count: "exact", head: true });
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

console.log(
  ok
    ? "\n✅ Supabase is connected and seeded — the storefront will serve products from your database."
    : "\n⚠ Connected, but the catalogue isn't fully seeded. Run the migration + seed, then re-check.",
);
process.exit(ok ? 0 : 2);
