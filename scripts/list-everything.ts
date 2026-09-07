/**
 * Put the whole of both suppliers' catalogues on the shop.
 *
 * The client's report was "website doesn't show all the products available
 * from both vendors, only shows 330 products". It was accurate, and it had
 * three causes, none of them a bug:
 *
 *   62   Cult Beauty products sat in staging, discovered by the sync and never
 *        imported. Importing is a button on /admin/vendors and nobody had
 *        pressed it.
 *   214  had been imported and never listed. Everything the importer adopts is
 *        born hidden, on the reasoning that a human should see a product
 *        before a shopper can. Migration 0020 makes that a per-vendor setting;
 *        this catches up on what the old default left behind.
 *    58  sit in a category switched off shop-wide. Most of those categories are
 *        Cult Beauty's editorial shelves -- "Grunge", "Halloween", "Goody
 *        Bag", "Customer Favourites" -- which are not aisles and are correctly
 *        hidden. One, "Bath", was a duplicate of "Bath & Body" and is merged
 *        into it here.
 *
 * Run it:
 *   node --env-file=.env.local scripts/list-everything.ts
 *   node --env-file=.env.local scripts/list-everything.ts --apply
 *
 * Dry by default: it prints what it would do and writes nothing. Every step is
 * reversible from the admin -- Products can bulk-hide exactly what this lists.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const SOURCES = ["cultbeauty", "noon"];

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (use --env-file=.env.local).");
  process.exitCode = 2;
} else {
  await main(createClient(url, key, { auth: { persistSession: false } }));
}

async function main(sb: SupabaseClient) {
  console.log(APPLY ? "APPLYING.\n" : "Dry run — nothing will be written.\n");
  await report(sb, "Before");

  /* 1 ------------------------------------------------- staging -> catalogue */
  /*
    Reported, not done.

    Promoting a staged row into the catalogue resolves its category, builds a
    unique slug and computes a shelf price from the vendor's rule -- about a
    hundred and fifty lines that already exist, correct and tested, behind the
    Import button on /admin/vendors. A second copy here would be a second
    thing to keep right. So this says what is waiting and who should press it.
  */
  const { data: vendors } = await sb.from("vendors").select("id, key, name");
  for (const v of vendors ?? []) {
    if (!SOURCES.includes(v.key as string)) continue;
    const { count } = await sb
      .from("staging_products")
      .select("id", { count: "exact", head: true })
      .eq("source", v.key)
      .eq("status", "pending");
    if (!count) continue;
    console.log(`\n[1] ${v.name}: ${count} product(s) found by the sync, never imported.`);
    console.log(`    Press Import on /admin/vendors?vendor=${v.id}`);
    console.log(`    Tick "List new products on the shop as they are imported" first,`);
    console.log(`    or re-run this script afterwards to list them.`);
  }

  /* 2 -------------------------------------------- one bath aisle, not two */
  const { data: bath } = await sb.from("categories").select("id, name").eq("slug", "bath").maybeSingle();
  const { data: bathBody } = await sb
    .from("categories")
    .select("id, name")
    .eq("slug", "bath-body")
    .maybeSingle();

  if (bath && bathBody) {
    const { data: inBath } = await sb.from("products").select("id").eq("category_id", bath.id);
    const n = inBath?.length ?? 0;
    if (n) {
      console.log(`\n[2] ${n} product(s) in "${bath.name}", which is switched off, while "${bathBody.name}" is on.`);
      if (!APPLY) {
        console.log(`    would move them to "${bathBody.name}".`);
      } else {
        const ids = inBath!.map((r) => r.id as string);
        for (let i = 0; i < ids.length; i += 100) {
          const { error } = await sb
            .from("products")
            .update({ category_id: bathBody.id })
            .in("id", ids.slice(i, i + 100));
          if (error) throw new Error(error.message);
        }
        console.log(`    moved ${n} to "${bathBody.name}".`);
      }
    }
  }

  /* 3 ------------------------------------------------------------- publish */
  const { data: hidden } = await sb
    .from("products")
    .select("id, source")
    .in("source", SOURCES)
    .eq("is_published", false);

  const n = hidden?.length ?? 0;
  console.log(`\n[3] ${n} product(s) in the catalogue are not listed on the shop.`);
  if (n) {
    if (!APPLY) {
      console.log("    would list every one of them.");
    } else {
      const ids = hidden!.map((r) => r.id as string);
      for (let i = 0; i < ids.length; i += 100) {
        const { error } = await sb
          .from("products")
          .update({ is_published: true })
          .in("id", ids.slice(i, i + 100));
        if (error) throw new Error(error.message);
      }
      console.log(`    listed ${n}. is_listed is recomputed by trigger.`);
    }
  }

  if (APPLY) await report(sb, "\nAfter");
  else console.log("\nRe-run with --apply to make these changes.");
}

/** What the shop is showing, and what is holding the rest back. */
async function report(sb: SupabaseClient, label: string) {
  const { data: cats } = await sb.from("categories").select("id, name, is_enabled");
  const byId = new Map((cats ?? []).map((c) => [c.id as string, c]));
  const { data: p } = await sb
    .from("products")
    .select("source, category_id, is_published, is_listed");

  const rows = p ?? [];
  console.log(`${label}: ${rows.filter((r) => r.is_listed).length} of ${rows.length} products live on the shop.`);

  const why = new Map<string, number>();
  for (const r of rows) {
    if (r.is_listed) continue;
    const c = r.category_id ? byId.get(r.category_id as string) : null;
    const reason = !r.is_published
      ? "not listed"
      : c && c.is_enabled === false
        ? `category switched off (${c.name})`
        : "blocked by a vendor rule";
    why.set(reason, (why.get(reason) ?? 0) + 1);
  }
  for (const [reason, n] of [...why.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`   ${String(n).padStart(4)}  ${reason}`);
  }
}
