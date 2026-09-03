import { getSupabaseAdmin } from "./supabase/server";
import { resolveCategorySlug } from "./category-aliases";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Vendor provisioning — the admin side of migration 0014.
 *
 * Three switches decide whether a shopper sees a product: the vendor, the
 * vendor's setting for that product's category, and the product itself. This
 * module reads and writes the first two. The third already lives in
 * `admin-products.setPublished`.
 *
 * Nothing here resolves visibility in JavaScript. `products.is_listed` is
 * maintained by database triggers, so a switch flipped here is reflected for
 * every reader at once — including the storefront, the sitemap and any script
 * — without this code having to know who they are. See 0014's header for why
 * that column exists at all.
 *
 * Like `admin-products.ts` and unlike `data.ts`, everything here uses the
 * service-role client and never falls back to sample data: provisioning a
 * catalogue that isn't there would be a lie.
 */

/** Postgres "relation does not exist" via PostgREST — migration 0014 not run. */
const MISSING_TABLE = "PGRST205";
/** Postgres "column does not exist" — an older migration is missing. */
const UNDEFINED_COLUMN = "42703";

export type VendorKind = "scrape" | "api" | "manual";

/**
 * A vendor's own row — everything stored about it, and nothing derived.
 *
 * Split out from `Vendor` so that the things needing only a vendor's key or
 * its pricing rule can read one row, instead of loading the whole board to
 * find it. The counts on `Vendor` cost a scan of the catalogue to compute, and
 * a type that carried them as zeroes would be a quiet lie for whoever read
 * them next.
 */
export interface VendorRow {
  id: string;
  key: string;
  name: string;
  kind: VendorKind;
  is_enabled: boolean;
  currency: string;
  fx_rate_to_bhd: number;
  markup_percent: number;
  surcharge_bhd: number;
  round_prices: boolean;
  notes: string | null;
  sort_order: number;
}

export interface Vendor extends VendorRow {
  /** Products in the catalogue attributed to this vendor. */
  product_count: number;
  /** How many of those a shopper can currently see. */
  listed_count: number;
  /** Categories this vendor has products in, that it is switched off for. */
  disabled_categories: number;
  /**
   * Rows the sync has put in staging for this vendor.
   *
   * Distinct from product_count and often much larger: staging is what the
   * sync found, the catalogue is what someone chose to carry. A vendor with
   * 177 staged and 0 in the catalogue has simply never been imported.
   */
  staged_count: number;
}

export interface VendorCategory {
  category_id: string;
  category_name: string;
  category_slug: string;
  /** Products this vendor has in this category. */
  product_count: number;
  listed_count: number;
  /** No row in vendor_categories means enabled — see 0014. */
  is_enabled: boolean;
}

export interface VendorsStatus {
  ready: boolean;
  error: string | null;
}

function notReady(message: string): VendorsStatus {
  return { ready: false, error: message };
}

/**
 * Whether the vendor tables are usable, so a page can explain itself instead
 * of rendering a raw PostgREST error.
 *
 * Derived from an attempt to read the vendors table rather than probed ahead
 * of one — see `getVendorBoard`, which is where the read happens.
 */
function vendorsStatusFrom(error: { code?: string; message: string } | null): VendorsStatus {
  if (!error) return { ready: true, error: null };
  if (error.code === MISSING_TABLE) {
    return notReady(
      "The vendors table doesn't exist yet. Run supabase/migrations/0014_vendor_provisioning.sql in the Supabase SQL editor.",
    );
  }
  return notReady(`Couldn't reach the vendors table: ${error.message}`);
}

/** Shape the raw row, without the counts that cost a catalogue scan. */
function mapVendorRow(v: any): VendorRow {
  return {
    id: v.id,
    key: v.key,
    name: v.name,
    kind: v.kind as VendorKind,
    is_enabled: Boolean(v.is_enabled),
    currency: v.currency,
    fx_rate_to_bhd: Number(v.fx_rate_to_bhd),
    markup_percent: Number(v.markup_percent),
    surcharge_bhd: Number(v.surcharge_bhd),
    round_prices: Boolean(v.round_prices),
    notes: v.notes ?? null,
    sort_order: Number(v.sort_order ?? 0),
  };
}

/** Everything the Vendors screen draws, from one round trip. */
export interface VendorBoard {
  status: VendorsStatus;
  vendors: Vendor[];
  /** Keyed by vendor id — the category switches for each. */
  categoriesByVendor: Record<string, VendorCategory[]>;
  /** The other kind of switch: whether a category is on the shop at all. */
  sections: CategorySwitch[];
}

/**
 * The whole Vendors screen, in five queries that all leave at once.
 *
 * It used to be fourteen, in five waves, and it was the slowest page in the
 * console by some way — measured at 1.1s locally and 3.0s deployed, against
 * 0.17s and 0.7s for the lightest screen. Not one of them was slow: they were
 * simply queued behind each other, and most were the same three tables read
 * over and over.
 *
 * The shape that caused it: `listVendorCategories(id)` called `getVendor(id)`,
 * which called `listVendors()` — four queries including a full catalogue scan
 * — to learn one vendor's `key`. The page then called it once per vendor.
 * Next de-duplicates identical GETs within a render, which hid the repeats at
 * the network layer while the work of filtering the catalogue in memory
 * happened every time; and the calls were still strictly sequenced, so each
 * vendor's turn began only after the last one's had finished.
 *
 * There is no per-vendor query here at all. Ask for each table once, then do
 * the grouping in memory, which is where it was being done anyway. The
 * catalogue is a few hundred rows; if it ever reaches a scale where scanning
 * it per render is the wrong shape, the fix is a view, not more round trips.
 */
export async function getVendorBoard(): Promise<VendorBoard> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return {
      status: notReady(
        "SUPABASE_SERVICE_ROLE_KEY isn't set — add it to .env.local to manage vendors.",
      ),
      vendors: [],
      categoriesByVendor: {},
      sections: [],
    };
  }

  const [vendorRes, categoryRes, productRes, vcRes, stagedRes] = await Promise.all([
    admin.from("vendors").select("*").order("sort_order").order("name"),
    admin
      .from("categories")
      .select("id, name, slug, is_enabled")
      .order("sort_order")
      .order("name"),
    admin.from("products").select("source, category_id, is_listed"),
    // Every row, not just the disabled ones. The two screens on this page want
    // different halves of it, and one column of a two-row table is not worth a
    // second request to narrow.
    admin.from("vendor_categories").select("vendor_id, category_id, is_enabled"),
    admin.from("staging_products").select("source"),
  ]);

  const status = vendorsStatusFrom(vendorRes.error);
  if (!status.ready) {
    return { status, vendors: [], categoriesByVendor: {}, sections: [] };
  }

  /*
    Before 0015 there is no `is_enabled` on categories, and selecting it fails
    the whole query. Retry without it and treat every category as on, which is
    what the rest of this file means by a missing switch.
  */
  let categories = categoryRes.data as any[] | null;
  if (categoryRes.error?.code === UNDEFINED_COLUMN) {
    const retry = await admin
      .from("categories")
      .select("id, name, slug")
      .order("sort_order")
      .order("name");
    categories = retry.data as any[] | null;
  }

  const rawVendors = (vendorRes.data ?? []) as any[];
  const products = (productRes.data ?? []) as any[];
  const vendorCategories = (vcRes.data ?? []) as any[];
  const staged = (stagedRes.data ?? []) as any[];
  const cats = categories ?? [];

  // Group once, read many times. Filtering the arrays per vendor and again per
  // category is what made this quadratic in the first place.
  const bySource = new Map<string, any[]>();
  for (const p of products) {
    const key = p.source ?? "";
    const list = bySource.get(key);
    if (list) list.push(p);
    else bySource.set(key, [p]);
  }

  const stagedBySource = new Map<string, number>();
  for (const r of staged) {
    stagedBySource.set(r.source, (stagedBySource.get(r.source) ?? 0) + 1);
  }

  const offByVendor = new Map<string, Set<string>>();
  for (const r of vendorCategories) {
    if (r.is_enabled !== false) continue;
    const set = offByVendor.get(r.vendor_id);
    if (set) set.add(r.category_id);
    else offByVendor.set(r.vendor_id, new Set([r.category_id]));
  }

  const vendors: Vendor[] = rawVendors.map((v) => {
    const mine = bySource.get(v.key) ?? [];
    return {
      ...mapVendorRow(v),
      product_count: mine.length,
      listed_count: mine.filter((p) => p.is_listed).length,
      disabled_categories: offByVendor.get(v.id)?.size ?? 0,
      staged_count: stagedBySource.get(v.key) ?? 0,
    };
  });

  const categoriesByVendor: Record<string, VendorCategory[]> = {};
  for (const v of rawVendors) {
    const mine = bySource.get(v.key) ?? [];
    const inCategory = new Map<string, any[]>();
    for (const p of mine) {
      const list = inCategory.get(p.category_id);
      if (list) list.push(p);
      else inCategory.set(p.category_id, [p]);
    }
    const off = offByVendor.get(v.id);
    categoriesByVendor[v.id] = cats.map((c) => {
      const here = inCategory.get(c.id) ?? [];
      return {
        category_id: c.id,
        category_name: c.name,
        category_slug: c.slug,
        product_count: here.length,
        listed_count: here.filter((p: any) => p.is_listed).length,
        // Absent means enabled. 0014 chose that so a newly imported product in
        // a category nobody has configured appears under the vendor's own
        // switch rather than vanishing.
        is_enabled: !off?.has(c.id),
      };
    });
  }

  const vendorName = new Map(rawVendors.map((v) => [v.id as string, v.name as string]));
  const byCategory = new Map<string, any[]>();
  for (const p of products) {
    const list = byCategory.get(p.category_id);
    if (list) list.push(p);
    else byCategory.set(p.category_id, [p]);
  }

  const sections: CategorySwitch[] = cats.map((c) => {
    const mine = byCategory.get(c.id) ?? [];
    return {
      id: c.id,
      name: c.name,
      slug: c.slug,
      // Before migration 0015 the column is absent; absent means on.
      is_enabled: c.is_enabled !== false,
      product_count: mine.length,
      listed_count: mine.filter((p: any) => p.is_listed).length,
      vendors_off: vendorCategories
        .filter((r) => r.is_enabled === false && r.category_id === c.id)
        .map((r) => vendorName.get(r.vendor_id) ?? "a vendor"),
    };
  });

  return { status, vendors, categoriesByVendor, sections };
}

/**
 * One vendor's own row.
 *
 * A single query by id. This used to load the whole board and search it, which
 * is four queries — a full catalogue scan among them — to read a `key` and a
 * `name`. The return type is `VendorRow` rather than `Vendor` precisely
 * because the counts are not fetched: nobody can read a zero and believe it.
 */
export async function getVendor(id: string): Promise<VendorRow | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  const { data, error } = await admin.from("vendors").select("*").eq("id", id).maybeSingle();
  if (error || !data) return null;
  return mapVendorRow(data);
}

/**
 * The category switches for one vendor.
 *
 * Every category is returned, not just the ones this vendor stocks, because
 * turning a category on ahead of an import is a reasonable thing to want —
 * and because a category with no products is exactly where someone will look
 * when a newly imported product doesn't appear.
 *
 * The Vendors screen does NOT use this — it needs the same answer for every
 * vendor at once, and asking per vendor is what made that page slow. See
 * `getVendorBoard`. This remains for a caller that genuinely wants one.
 */
export async function listVendorCategories(vendorId: string): Promise<VendorCategory[]> {
  const admin = getSupabaseAdmin();
  if (!admin) return [];

  const vendor = await getVendor(vendorId);
  if (!vendor) return [];

  const [{ data: categories }, { data: rows }, { data: products }] = await Promise.all([
    admin.from("categories").select("id, name, slug").order("sort_order").order("name"),
    admin.from("vendor_categories").select("category_id, is_enabled").eq("vendor_id", vendorId),
    admin.from("products").select("category_id, is_listed").eq("source", vendor.key),
  ]);

  const explicit = new Map<string, boolean>(
    (rows ?? []).map((r: any) => [r.category_id as string, Boolean(r.is_enabled)]),
  );

  return (categories ?? []).map((c: any) => {
    const mine = (products ?? []).filter((p: any) => p.category_id === c.id);
    return {
      category_id: c.id,
      category_name: c.name,
      category_slug: c.slug,
      product_count: mine.length,
      listed_count: mine.filter((p: any) => p.is_listed).length,
      // Absent means enabled. 0014 chose that so a newly imported product in a
      // category nobody has configured appears under the vendor's own switch
      // rather than vanishing.
      is_enabled: explicit.get(c.id) ?? true,
    };
  });
}

/* --------------------------- writes --------------------------- */

export async function setVendorEnabled(id: string, enabled: boolean): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error("SUPABASE_SERVICE_ROLE_KEY isn't set.");
  const { error } = await admin.from("vendors").update({ is_enabled: enabled }).eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Switch one category on or off for one vendor.
 *
 * Enabling deletes the row rather than setting it true, so the table only ever
 * holds exceptions. That keeps "no row = enabled" honest and means the table
 * stays small no matter how many categories exist.
 */
/**
 * Set a vendor's whole category selection in one go.
 *
 * The per-category toggle is one write and one page reload each. Turning a
 * vendor's fifty-four categories off meant fifty-four of them, and no way to
 * tell part-way through whether the list had been finished. This takes the
 * ticked set and makes the table agree with it.
 *
 * `enabledIds` is what the form ticked; `allIds` is every category that was on
 * screen when it was drawn. Anything in `allIds` and not in `enabledIds` is
 * switched off, and — importantly — a category NOT in `allIds` is left alone
 * rather than being switched off by omission: a category created since the
 * page loaded must not be silently disabled by somebody saving an older form.
 *
 * The absent-row-means-enabled convention from 0014 is preserved, so enabling
 * deletes rather than writing `true`.
 */
export async function setVendorCategories(
  vendorId: string,
  enabledIds: string[],
  allIds: string[],
): Promise<{ on: number; off: number }> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error("SUPABASE_SERVICE_ROLE_KEY isn't set.");

  const enabled = new Set(enabledIds);
  const known = allIds.filter((id) => id);
  const toDisable = known.filter((id) => !enabled.has(id));
  const toEnable = known.filter((id) => enabled.has(id));

  if (toEnable.length) {
    const { error } = await admin
      .from("vendor_categories")
      .delete()
      .eq("vendor_id", vendorId)
      .in("category_id", toEnable);
    if (error) throw new Error(error.message);
  }

  if (toDisable.length) {
    const { error } = await admin.from("vendor_categories").upsert(
      toDisable.map((category_id) => ({ vendor_id: vendorId, category_id, is_enabled: false })),
      { onConflict: "vendor_id,category_id" },
    );
    if (error) throw new Error(error.message);
  }

  return { on: toEnable.length, off: toDisable.length };
}

export async function setVendorCategoryEnabled(
  vendorId: string,
  categoryId: string,
  enabled: boolean,
): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error("SUPABASE_SERVICE_ROLE_KEY isn't set.");

  if (enabled) {
    const { error } = await admin
      .from("vendor_categories")
      .delete()
      .eq("vendor_id", vendorId)
      .eq("category_id", categoryId);
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await admin
    .from("vendor_categories")
    .upsert(
      { vendor_id: vendorId, category_id: categoryId, is_enabled: false },
      { onConflict: "vendor_id,category_id" },
    );
  if (error) throw new Error(error.message);
}

export interface VendorPricingInput {
  name: string;
  kind: VendorKind;
  currency: string;
  fx_rate_to_bhd: number;
  markup_percent: number;
  surcharge_bhd: number;
  round_prices: boolean;
  notes: string | null;
}

export async function updateVendor(id: string, input: VendorPricingInput): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error("SUPABASE_SERVICE_ROLE_KEY isn't set.");
  const { error } = await admin.from("vendors").update(input).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function createVendor(
  key: string,
  input: VendorPricingInput,
): Promise<{ id: string }> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error("SUPABASE_SERVICE_ROLE_KEY isn't set.");
  const { data, error } = await admin
    .from("vendors")
    .insert({ key, ...input, is_enabled: false })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { id: data!.id as string };
}

/* --------------------------- repricing --------------------------- */

export interface RepriceRow {
  id: string;
  name: string;
  source_price: number;
  source_currency: string;
  old_price: number;
  new_price: number;
}

export interface RepriceResult {
  /** Products that would change, capped for display. */
  changes: RepriceRow[];
  /** How many would change in total, before the display cap. */
  changed: number;
  /** Products skipped because a human had set their price. */
  locked: number;
  /** Products with no supplier price recorded, so nothing to compute from. */
  missingSourcePrice: number;
  applied: boolean;
  error: string | null;
}

const PREVIEW_LIMIT = 50;

export type RepriceMode = "reprice" | "round";

const RPC = {
  reprice: { preview: "vendor_reprice_preview", apply: "vendor_reprice_apply" },
  round: { preview: "vendor_round_preview", apply: "vendor_round_apply" },
} as const;

/**
 * Preview or apply a vendor's prices.
 *
 * Two modes, and the difference matters:
 *
 *   "reprice" recomputes from what the vendor charges — rate, markup,
 *   surcharge, ladder. Needs `source_price`, which only arrives with a sync.
 *
 *   "round" leaves the arithmetic alone and only snaps an existing BHD price
 *   onto the ladder. This is the one that reaches the 301 noon products
 *   already on the shop, whose prices were corrected by hand and have no
 *   `source_price` behind them.
 *
 * Both skip `price_locked` rows, and both run as a single statement in the
 * database so the preview and the write cannot disagree — see 0014 section 4b.
 */
export async function priceVendor(
  vendorId: string,
  mode: RepriceMode,
  { apply }: { apply: boolean },
): Promise<RepriceResult> {
  const empty: RepriceResult = {
    changes: [],
    changed: 0,
    locked: 0,
    missingSourcePrice: 0,
    applied: false,
    error: null,
  };

  const admin = getSupabaseAdmin();
  if (!admin) return { ...empty, error: "SUPABASE_SERVICE_ROLE_KEY isn't set." };

  const { data: skipped } = await admin
    .rpc("vendor_reprice_skipped", { p_vendor_id: vendorId })
    .maybeSingle();

  const counts = {
    locked: Number((skipped as any)?.locked ?? 0),
    // Only meaningful for "reprice" — rounding needs no supplier price.
    missingSourcePrice:
      mode === "reprice" ? Number((skipped as any)?.missing_source_price ?? 0) : 0,
  };

  const preview = await admin.rpc(RPC[mode].preview, { p_vendor_id: vendorId });

  if (preview.error) {
    const missing =
      preview.error.code === MISSING_TABLE || preview.error.code === UNDEFINED_COLUMN;
    return {
      ...empty,
      ...counts,
      error: missing
        ? "Repricing needs supabase/migrations/0014_vendor_provisioning.sql to have been run."
        : preview.error.message,
    };
  }

  const rows = (preview.data ?? []) as any[];
  const changes: RepriceRow[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    // The round preview has no supplier side; show the BHD price on both sides
    // rather than inventing a currency for it.
    source_price: Number(r.source_price ?? r.old_price),
    source_currency: r.source_currency ?? "BHD",
    old_price: Number(r.old_price),
    new_price: Number(r.new_price),
  }));

  if (!apply) {
    return {
      changes: changes.slice(0, PREVIEW_LIMIT),
      changed: changes.length,
      ...counts,
      applied: false,
      error: null,
    };
  }

  const applied = await admin.rpc(RPC[mode].apply, { p_vendor_id: vendorId });
  if (applied.error) {
    return {
      changes: changes.slice(0, PREVIEW_LIMIT),
      changed: changes.length,
      ...counts,
      applied: false,
      error: applied.error.message,
    };
  }

  return {
    changes: changes.slice(0, PREVIEW_LIMIT),
    changed: Number(applied.data ?? changes.length),
    ...counts,
    applied: true,
    error: null,
  };
}

/* --------------------- staging → catalogue --------------------- */

export interface ImportResult {
  /** Products created in the catalogue, all unlisted. */
  created: number;
  /** Already in the catalogue; their supplier price and stock were refreshed. */
  updated: number;
  /** Created or updated with no category, so an admin has to file them. */
  uncategorised: number;
  failed: Array<{ name: string; reason: string }>;
  applied: boolean;
  error: string | null;
}

const emptyImport: ImportResult = {
  created: 0,
  updated: 0,
  uncategorised: 0,
  failed: [],
  applied: false,
  error: null,
};

/**
 * Bring a vendor's staged products into the catalogue, unlisted.
 *
 * The client's model is that the admin sees everything a vendor offers and
 * decides what to carry. That only works if the products are actually in
 * `products` — staging is the sync's scratch space, and nothing in the admin
 * or the storefront reads it. This is the step between the two.
 *
 * Everything arrives with `is_published = false`. Nothing reaches a shopper
 * until someone lists it, and the vendor switch has to be on as well.
 *
 * Prices come from the vendor's rule via the same database function the
 * repricing screen uses, so an imported product and a repriced one cannot
 * disagree.
 *
 * Categories are resolved through `resolveCategorySlug`. A product whose shelf
 * has no equivalent here arrives uncategorised rather than guessed at, and the
 * count is reported so it does not pass unnoticed.
 */
export async function importStagedForVendor(
  vendorId: string,
  { apply }: { apply: boolean },
): Promise<ImportResult> {
  const admin = getSupabaseAdmin();
  if (!admin) return { ...emptyImport, error: "SUPABASE_SERVICE_ROLE_KEY isn't set." };

  const vendor = await getVendor(vendorId);
  if (!vendor) return { ...emptyImport, error: "That vendor no longer exists." };

  const [{ data: staged, error: stagedError }, { data: categories }, { data: existing }] =
    await Promise.all([
      admin.from("staging_products").select("*").eq("source", vendor.key),
      admin.from("categories").select("id, slug"),
      admin
        .from("products")
        .select("id, slug, source_sku, is_published, price")
        .eq("source", vendor.key),
    ]);

  if (stagedError) return { ...emptyImport, error: stagedError.message };
  if (!staged?.length) {
    return { ...emptyImport, error: `Nothing is staged for ${vendor.name} yet. Run the sync first.` };
  }

  const known = new Set((categories ?? []).map((c: any) => c.slug as string));
  const categoryId = new Map<string, string>(
    (categories ?? []).map((c: any) => [c.slug as string, c.id as string]),
  );
  const bySku = new Map<string, any>(
    (existing ?? []).map((p: any) => [String(p.source_sku), p]),
  );
  const takenSlugs = new Set<string>((existing ?? []).map((p: any) => p.slug as string));

  // Slugs must be unique catalogue-wide, not just within this vendor.
  const { data: allSlugs } = await admin.from("products").select("slug");
  for (const s of allSlugs ?? []) takenSlugs.add((s as any).slug as string);

  const result: ImportResult = { ...emptyImport, applied: apply };

  for (const row of staged as any[]) {
    const name = String(row.name ?? "").trim();
    if (!name) {
      result.failed.push({ name: "(unnamed)", reason: "no name" });
      continue;
    }

    const sku = row.source_sku == null ? null : String(row.source_sku);
    const prior = sku ? bySku.get(sku) : undefined;
    const slug = prior?.slug ?? uniqueSlug(name, takenSlugs);
    const catSlug = resolveCategorySlug(vendor.key, row.category ?? null, known);
    if (!catSlug) result.uncategorised += 1;

    if (!apply) {
      if (prior) result.updated += 1;
      else result.created += 1;
      continue;
    }

    /*
      A price of zero is how noon says "we cannot sell you this today", not a
      price. Writing it through put 43 products on the shop reading BHD 0.00 —
      out of stock, correctly badged, and priced at nothing.

      So a zero never overwrites a price we already hold. The card then shows
      the last real price under an Out of stock badge, which is what a shopper
      expects and what every other shop does. A genuinely new product arriving
      at zero still gets zero: there is no earlier price to keep, and it stays
      hidden until somebody lists it.
    */
    const computed = await shelfPrice(admin, Number(row.price ?? 0), vendor);
    const priorPrice = Number(prior?.price ?? 0);
    const price = computed > 0 ? computed : priorPrice > 0 ? priorPrice : 0;

    const patch: Record<string, unknown> = {
      name,
      slug,
      description: row.description ?? null,
      short_description: row.short_description ?? null,
      price,
      currency: "BHD",
      images: row.images ?? [],
      category_id: catSlug ? (categoryId.get(catSlug) ?? null) : null,
      rating: row.rating ?? 0,
      review_count: row.review_count ?? 0,
      in_stock: row.in_stock ?? true,
      source: vendor.key,
      source_sku: sku,
      source_url: row.source_url ?? null,
      source_price: Number(row.price) > 0 ? Number(row.price) : null,
      source_currency: row.currency ?? vendor.currency,
      supplier_dispatch_note: row.supplier_dispatch_note ?? null,
      lead_days_min: row.lead_days_min ?? null,
      lead_days_max: row.lead_days_max ?? null,
      max_per_order: row.max_per_order ?? null,
      // An existing product keeps whatever the admin decided. Only a genuinely
      // new one is forced unlisted — sending false unconditionally would pull
      // a product someone had deliberately put on the shop.
      is_published: prior ? prior.is_published : false,
    };

    const { error } = sku
      ? await admin.from("products").upsert(patch, { onConflict: "source,source_sku" })
      : await admin.from("products").insert(patch);

    if (error) {
      result.failed.push({ name: name.slice(0, 60), reason: error.message });
      continue;
    }

    if (prior) result.updated += 1;
    else {
      result.created += 1;
      takenSlugs.add(slug);
    }

    await admin
      .from("staging_products")
      .update({ status: "promoted", promoted_at: new Date().toISOString() })
      .eq("id", row.id);
  }

  return result;
}

/** A URL-safe slug that no product already holds. */
function uniqueSlug(name: string, taken: Set<string>): string {
  const base =
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 70) || "product";
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** The shelf price for one supplier amount, via the vendor's own rule. */
async function shelfPrice(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  amount: number,
  // The pricing rule only, so a caller holding one vendor's row need not have
  // loaded the counts to price with it.
  v: VendorRow,
): Promise<number> {
  if (!(amount > 0)) return 0;
  const { data, error } = await admin.rpc("vendor_retail_price", {
    p_amount: amount,
    p_fx: v.fx_rate_to_bhd,
    p_markup: v.markup_percent,
    p_surcharge: v.surcharge_bhd,
    p_round: v.round_prices,
  });
  if (error || data == null) {
    // Same arithmetic without the ladder, so a missing function degrades to a
    // sane price rather than importing everything at zero.
    return Math.round(amount * v.fx_rate_to_bhd * (1 + v.markup_percent / 100) * 1000) / 1000;
  }
  return Number(data);
}

/* --------------------- categories, shop-wide --------------------- */

export interface CategorySwitch {
  id: string;
  name: string;
  slug: string;
  is_enabled: boolean;
  /** Products filed here, whatever their vendor or state. */
  product_count: number;
  /** How many a shopper can currently see. */
  listed_count: number;
  /** Vendors explicitly switched off in this category. */
  vendors_off: string[];
}

/**
 * Every category with the counts behind its switch.
 *
 * This switch is the blunt one, and the difference from the per-vendor switch
 * matters: turning a category off removes it from the shop entirely — nav,
 * homepage, footer, its own URL — and unlists everything in it, whoever
 * supplies it. The per-vendor switch only decides whose products fill a
 * category that is staying.
 */
export async function listCategorySwitches(): Promise<CategorySwitch[]> {
  const admin = getSupabaseAdmin();
  if (!admin) return [];

  const [{ data: categories, error }, { data: products }, { data: off }, { data: vendors }] =
    await Promise.all([
      admin.from("categories").select("id, name, slug, is_enabled").order("sort_order").order("name"),
      admin.from("products").select("category_id, is_listed"),
      admin.from("vendor_categories").select("vendor_id, category_id").eq("is_enabled", false),
      admin.from("vendors").select("id, name"),
    ]);

  if (error || !categories) return [];
  const vendorName = new Map((vendors ?? []).map((v: any) => [v.id as string, v.name as string]));

  return (categories as any[]).map((c) => {
    const mine = (products ?? []).filter((p: any) => p.category_id === c.id);
    return {
      id: c.id,
      name: c.name,
      slug: c.slug,
      // Before migration 0015 the column is absent; absent means on.
      is_enabled: c.is_enabled !== false,
      product_count: mine.length,
      listed_count: mine.filter((p: any) => p.is_listed).length,
      vendors_off: (off ?? [])
        .filter((r: any) => r.category_id === c.id)
        .map((r: any) => vendorName.get(r.vendor_id) ?? "a vendor"),
    };
  });
}

export async function setCategoryEnabled(id: string, enabled: boolean): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error("SUPABASE_SERVICE_ROLE_KEY isn't set.");
  const { error } = await admin.from("categories").update({ is_enabled: enabled }).eq("id", id);
  if (error) {
    if (error.code === UNDEFINED_COLUMN) {
      throw new Error(
        "categories.is_enabled is missing — run supabase/migrations/0015_category_switch.sql.",
      );
    }
    throw new Error(error.message);
  }
}
