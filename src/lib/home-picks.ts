import { cache } from "react";
import { getSupabaseAdmin, getSupabaseServer } from "./supabase/server";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * The hand-picked half of the homepage Bestsellers row.
 *
 * `getBestsellers` ranks the catalogue by featured-then-rating, which is a
 * sensible default and a poor shop window: it has no idea that a brand has just
 * paid for the position, or that the client wants the oud front and centre this
 * week. So the row is now two lists joined end to end — what somebody chose,
 * in the order they chose it, then the automatic ranking to fill what is left.
 *
 * Picking nothing is a valid state and the one the shop starts in. An empty
 * table means "rank it for me", so this feature costs nothing until it is used.
 *
 * Reads happen on the anon key (the order is public the moment the page
 * renders); writes go through the service role from the admin. See migration
 * 0019.
 */

/** Missing table, i.e. migration 0019 has not been run yet. */
const MISSING_TABLE = "PGRST205";

/**
 * How many products can be pinned.
 *
 * The row draws eight cards. Allowing more would mean picks that quietly never
 * appear, which is worse than a full list that says so.
 */
export const MAX_HOME_PICKS = 8;

export interface HomePick {
  product_id: string;
  name: string;
  slug: string;
  price: number;
  image: string | null;
  in_stock: boolean;
  /** The resolved answer to "can a shopper see this" — see migration 0014. */
  is_listed: boolean;
  /**
   * Which supplier this came from, by display name — staff-only.
   *
   * Two suppliers stock near-identical products under near-identical names,
   * and choosing between them is a real decision: they have different prices,
   * different delivery windows, and one of them cannot be re-synced from the
   * cloud. A search for "hair dryer brush" returns several and the name alone
   * does not say which is whose.
   *
   * Never rendered on the storefront. `products.source` is deliberately not
   * granted to the anon role (migration 0014), so this is only ever populated
   * on the admin path.
   */
  vendor: string | null;
}

export interface HomePicksResult {
  /** False when migration 0019 hasn't run or Supabase isn't configured. */
  ready: boolean;
  message: string | null;
  picks: HomePick[];
}

const PICK_SELECT =
  "product_id, sort_order, product:products(name, slug, price, images, in_stock, is_listed, source)";

/**
 * Supplier key to display name, once per request.
 *
 * `products.source` holds the adapter key — "cultbeauty", "noon" — and the
 * screen should say "Cult Beauty". Memoised because both the pick list and a
 * search resolve names, and neither should cost a round trip the other has
 * already paid for. Falls back to the raw key: a supplier with no vendor row
 * is a provisioning gap worth seeing, not worth hiding behind a blank.
 */
const vendorNames = cache(async function vendorNames(): Promise<Map<string, string>> {
  const admin = getSupabaseAdmin();
  if (!admin) return new Map();
  const { data } = await admin.from("vendors").select("key, name");
  return new Map((data ?? []).map((v: any) => [String(v.key), String(v.name)]));
});

function mapPick(row: any, names: Map<string, string>): HomePick | null {
  // PostgREST returns an object for a to-one embed and an array when it cannot
  // work out the cardinality. Accept either rather than depend on which.
  const p = Array.isArray(row.product) ? row.product[0] : row.product;
  // A pick whose product has been deleted. The cascade in 0019 should make
  // this impossible; if it happens anyway, drop it rather than render a hole.
  if (!p) return null;
  return {
    product_id: row.product_id,
    name: p.name,
    slug: p.slug,
    price: Number(p.price ?? 0),
    image: Array.isArray(p.images) && p.images.length ? String(p.images[0]) : null,
    in_stock: Boolean(p.in_stock),
    is_listed: p.is_listed !== false,
    vendor: vendorLabel(p.source, names),
  };
}

/** "cultbeauty" -> "Cult Beauty"; null for a product somebody added by hand. */
function vendorLabel(source: unknown, names: Map<string, string>): string | null {
  if (typeof source !== "string" || !source) return null;
  return names.get(source) ?? source;
}

/**
 * The picked ids, in order, for the storefront.
 *
 * Every failure returns an empty list: no Supabase, no table, a bad query. The
 * homepage then shows the automatic ranking, which is what it showed before
 * this feature existed. A curation feature must never be able to empty the
 * shop window.
 */
export async function getHomePickIds(): Promise<string[]> {
  const sb = getSupabaseServer();
  if (!sb) return [];

  const { data, error } = await sb
    .from("home_bestsellers")
    .select("product_id, sort_order")
    .order("sort_order", { ascending: true });

  if (error || !data) {
    if (error && error.code !== MISSING_TABLE && process.env.NODE_ENV !== "production") {
      console.warn(`[home-picks] could not read the picks — using the automatic order: ${error.message}`);
    }
    return [];
  }
  return data.map((r: any) => String(r.product_id));
}

/** The same list for the admin, with enough of each product to draw a card. */
export async function listHomePicks(): Promise<HomePicksResult> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return {
      ready: false,
      message: "Supabase isn't configured, so the home page can't be curated from here.",
      picks: [],
    };
  }

  const { data, error } = await admin
    .from("home_bestsellers")
    .select(PICK_SELECT)
    .order("sort_order", { ascending: true });

  if (error) {
    return {
      ready: false,
      message:
        error.code === MISSING_TABLE
          ? "Run supabase/migrations/0019_home_bestsellers.sql, then reload this page."
          : error.message,
      picks: [],
    };
  }

  const names = await vendorNames();
  return {
    ready: true,
    message: null,
    picks: (data ?? []).map((r) => mapPick(r, names)).filter((p): p is HomePick => p !== null),
  };
}

/**
 * Products the admin can add, matched by name.
 *
 * Listed ones only. Pinning something a shopper cannot see produces a row that
 * silently drops back to the automatic order, and the person who chose it has
 * no way to know why.
 */
export async function searchPickable(term: string, limit = 12): Promise<HomePick[]> {
  const admin = getSupabaseAdmin();
  const s = term.trim().replace(/[%,]/g, "");
  if (!admin || !s) return [];

  /*
    Every word has to match, not the phrase.

    A single `ilike %term%` needs the words in the order and spacing the
    supplier used, so "mascara waterproof" found nothing while "waterproof
    mascara" found six — which reads as a broken search when you are typing
    into it live. Splitting on whitespace and requiring each word somewhere in
    the name is what people expect from a search box, and is what makes typing
    progressively narrow the list instead of emptying it.

    PostgREST spells AND-of-ORs as repeated `.or()` calls, one per word: every
    call is another AND clause, and each word may match the name or the slug.
  */
  const words = s.split(/\s+/).filter(Boolean).slice(0, 6);

  let query = admin
    .from("products")
    .select("id, name, slug, price, images, in_stock, is_listed, source")
    .eq("is_listed", true);

  for (const w of words) query = query.or(`name.ilike.%${w}%,slug.ilike.%${w}%`);

  const { data, error } = await query
    // In stock first, then the cheapest way to get a stable order.
    .order("in_stock", { ascending: false })
    .order("name", { ascending: true })
    .limit(limit);

  if (error || !data) return [];

  const names = await vendorNames();
  return data.map((row: any) => ({
    product_id: row.id,
    name: row.name,
    slug: row.slug,
    price: Number(row.price ?? 0),
    image: Array.isArray(row.images) && row.images.length ? String(row.images[0]) : null,
    in_stock: Boolean(row.in_stock),
    is_listed: true,
    vendor: vendorLabel(row.source, names),
  }));
}

/**
 * Replace the whole list.
 *
 * Rewritten rather than patched, because every operation the admin has —
 * add, remove, move up, move down — changes the order of everything after it.
 * Sending the finished list means the server never has to reconstruct what the
 * person meant from a diff, and two people saving at once end with one of the
 * two orders rather than an interleaving of both.
 */
export async function setHomePicks(ids: string[]): Promise<number> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error("Supabase service role isn't configured.");

  const unique = [...new Set(ids.filter(Boolean))].slice(0, MAX_HOME_PICKS);

  // PostgREST refuses an unfiltered delete. The primary key is NOT NULL, so
  // this matches every row and says so plainly.
  const { error: clearError } = await admin
    .from("home_bestsellers")
    .delete()
    .not("product_id", "is", null);

  if (clearError) {
    throw new Error(
      clearError.code === MISSING_TABLE
        ? "Run supabase/migrations/0019_home_bestsellers.sql first."
        : clearError.message,
    );
  }

  if (unique.length === 0) return 0;

  const { error } = await admin.from("home_bestsellers").insert(
    unique.map((product_id, i) => ({ product_id, sort_order: i + 1 })),
  );
  if (error) throw new Error(error.message);

  return unique.length;
}

/* -------------------------------------------------------------------------
   The four things the admin can do.

   All four are read-modify-write on the whole list rather than a targeted
   update, because that is what the list is: order carries no meaning per row.
   The read is authoritative and comes from the database, not from hidden
   fields in the page, so a form left open for an hour cannot resurrect an
   order somebody else has since changed.
   ------------------------------------------------------------------------- */

/*
  add / remove / move / clear used to live here, one function each, and each
  one re-read the list, changed a single element and wrote the whole thing
  back. The editor now sends the finished list for every gesture — a drag has
  no single-element equivalent to send — so they had four callers between them
  and now have none. `setHomePicks` above was always the thing doing the work.
*/
