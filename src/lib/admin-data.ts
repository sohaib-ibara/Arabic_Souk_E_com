import { getSupabaseAdmin } from "./supabase/server";
import { getAllProducts, getBrands, getCategories } from "./data";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface TopWantedRow {
  slug: string | null;
  name: string | null;
  shoppers: number;
  totalQuantity: number;
  lastRequestedAt: string | null;
}

export interface RecentSignalRow {
  id: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  subtotal: number;
  currency: string;
  allInStock: boolean;
  itemCount: number;
  createdAt: string;
}

export interface AdminOverview {
  catalogue: { products: number; categories: number; brands: number };
  demandAvailable: boolean;
  demandError: string | null;
  stats: { attempts: number; itemsRequested: number; productsWanted: number };
  topWanted: TopWantedRow[];
  recent: RecentSignalRow[];
}

/**
 * Assembles everything the admin dashboard shows: catalogue counts (always
 * available from the active data source) plus demand analytics read with the
 * service-role client. Demand loading is defensive — if the service key isn't
 * set, or migration 0003 hasn't been run, it returns a friendly error instead
 * of throwing, so the dashboard still renders.
 */
export async function getAdminOverview(): Promise<AdminOverview> {
  const [products, categories, brands] = await Promise.all([
    getAllProducts(),
    getCategories(),
    getBrands(),
  ]);

  const overview: AdminOverview = {
    catalogue: { products: products.length, categories: categories.length, brands: brands.length },
    demandAvailable: false,
    demandError: null,
    stats: { attempts: 0, itemsRequested: 0, productsWanted: 0 },
    topWanted: [],
    recent: [],
  };

  const admin = getSupabaseAdmin();
  if (!admin) {
    overview.demandError =
      "SUPABASE_SERVICE_ROLE_KEY isn't set — add it to .env.local (and run migration 0003) to monitor demand.";
    return overview;
  }

  try {
    const [byProduct, attemptsHead, recent] = await Promise.all([
      admin.from("demand_by_product").select("*").order("total_quantity", { ascending: false }),
      admin.from("demand_signals").select("*", { count: "exact", head: true }),
      admin
        .from("demand_signals")
        .select("*, items:demand_signal_items(count)")
        .order("created_at", { ascending: false })
        .limit(25),
    ]);

    const firstError = byProduct.error || attemptsHead.error || recent.error;
    if (firstError) throw new Error(firstError.message);

    const rows = (byProduct.data ?? []) as any[];
    overview.demandAvailable = true;
    overview.stats = {
      attempts: attemptsHead.count ?? 0,
      itemsRequested: rows.reduce((s, r) => s + Number(r.total_quantity ?? 0), 0),
      productsWanted: rows.length,
    };
    overview.topWanted = rows.slice(0, 20).map((r) => ({
      slug: r.slug ?? null,
      name: r.name ?? null,
      shoppers: Number(r.shoppers ?? 0),
      totalQuantity: Number(r.total_quantity ?? 0),
      lastRequestedAt: r.last_requested_at ?? null,
    }));
    overview.recent = ((recent.data ?? []) as any[]).map((r) => ({
      id: r.id,
      fullName: r.full_name ?? null,
      email: r.email ?? null,
      phone: r.phone ?? null,
      city: r.shipping_address?.city ?? null,
      subtotal: Number(r.subtotal ?? 0),
      currency: r.currency ?? "BHD",
      allInStock: Boolean(r.all_in_stock),
      itemCount: Number(r.items?.[0]?.count ?? 0),
      createdAt: r.created_at,
    }));
  } catch (e) {
    overview.demandError = `Couldn't load demand data — has migration 0003 been run? (${(e as Error).message})`;
  }

  return overview;
}
