import { getSupabaseAdmin } from "./supabase/server";

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

export interface Vendor {
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
  /** Products in the catalogue attributed to this vendor. */
  product_count: number;
  /** How many of those a shopper can currently see. */
  listed_count: number;
  /** Categories this vendor has products in, that it is switched off for. */
  disabled_categories: number;
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
 */
export async function getVendorsStatus(): Promise<VendorsStatus> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return notReady(
      "SUPABASE_SERVICE_ROLE_KEY isn't set — add it to .env.local to manage vendors.",
    );
  }
  const { error } = await admin.from("vendors").select("id", { count: "exact", head: true });
  if (error) {
    if (error.code === MISSING_TABLE) {
      return notReady(
        "The vendors table doesn't exist yet. Run supabase/migrations/0014_vendor_provisioning.sql in the Supabase SQL editor.",
      );
    }
    return notReady(`Couldn't reach the vendors table: ${error.message}`);
  }
  return { ready: true, error: null };
}

/**
 * Every vendor, with the counts that make the switches meaningful.
 *
 * The counts are computed here rather than in SQL because the catalogue is a
 * few hundred rows and PostgREST cannot express the grouping in one request.
 * If it ever grows past a few thousand this should become a view.
 */
export async function listVendors(): Promise<Vendor[]> {
  const admin = getSupabaseAdmin();
  if (!admin) return [];

  const { data: vendors, error } = await admin
    .from("vendors")
    .select("*")
    .order("sort_order")
    .order("name");
  if (error || !vendors) return [];

  const { data: products } = await admin
    .from("products")
    .select("source, category_id, is_listed");

  const { data: disabled } = await admin
    .from("vendor_categories")
    .select("vendor_id, category_id")
    .eq("is_enabled", false);

  return vendors.map((v: any) => {
    const mine = (products ?? []).filter((p: any) => p.source === v.key);
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
      product_count: mine.length,
      listed_count: mine.filter((p: any) => p.is_listed).length,
      disabled_categories: (disabled ?? []).filter((d: any) => d.vendor_id === v.id).length,
    };
  });
}

export async function getVendor(id: string): Promise<Vendor | null> {
  const all = await listVendors();
  return all.find((v) => v.id === id) ?? null;
}

/**
 * The category switches for one vendor.
 *
 * Every category is returned, not just the ones this vendor stocks, because
 * turning a category on ahead of an import is a reasonable thing to want —
 * and because a category with no products is exactly where someone will look
 * when a newly imported product doesn't appear.
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
