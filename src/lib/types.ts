export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  sort_order: number;
  /**
   * On the shop at all. Off hides the category, its page and its products
   * everywhere — distinct from a vendor's per-category switch, which only
   * hides that one vendor's products in it. Optional because the column
   * arrives with migration 0015; absent means on.
   */
  is_enabled?: boolean;
}

export interface Brand {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
}

/** A navigation department grouping several category links (used by the header/footer). */
export interface NavGroup {
  name: string;
  slug: string;
  items: Array<{ name: string; slug: string }>;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  /**
   * The long description — populated only by `getProductBySlug`.
   *
   * Null on anything that came from a listing loader, which does not fetch the
   * column: it is over a third of the catalogue by weight and only the product
   * page shows it. If you need it somewhere new, fetch that product by slug
   * rather than adding the column back to every list.
   */
  description: string | null;
  /** Shown on the product page, and matched by the storefront's search. */
  short_description: string | null;
  price: number;
  compare_at_price: number | null;
  currency: string;
  images: string[];
  category_slug: string;
  category_name: string;
  brand_slug: string | null;
  brand_name: string | null;
  rating: number;
  review_count: number;
  /** Real warehouse quantity — checkout validates against this. */
  stock_quantity: number;
  /** Merchandising flag: is the product listed for sale. */
  in_stock: boolean;
  is_featured: boolean;
  is_new: boolean;
  tags: string[];
  /**
   * Last edit, straight from the database trigger. Drives <lastmod> in the
   * sitemap so crawlers re-fetch what actually changed. Optional because the
   * bundled sample and imported catalogues carry no timestamps.
   */
  updated_at?: string | null;
  /**
   * Delivery window in days for this specific product, where the supplier
   * stated one — their dispatch time plus their shipping to Bahrain.
   *
   * Per-product because it genuinely differs: a UK line is dispatched in a day
   * and then takes 5–15 working days to arrive, which the store's blanket
   * "1–2 days" does not describe. Null means the supplier said nothing, and
   * the page falls back to the site default rather than inventing a figure.
   */
  lead_days_min?: number | null;
  lead_days_max?: number | null;
}

/** A single line in the shopping cart (persisted client-side). */
export interface CartItem {
  productId: string;
  slug: string;
  name: string;
  price: number;
  currency: string;
  image: string;
  brand: string | null;
  quantity: number;
}

/*
 * StockIssue / StockCheckResult removed along with checkStock().
 *
 * That was the original demo gate: it refused an order whose stock_quantity was
 * 0, which described a shop with a warehouse. This one buys from the supplier
 * after the customer pays, so a sale is gated by the `in_stock` switch alone
 * (see orders.ts). Nothing had called it for some time; leaving it in only
 * invited someone to wire quantity back into checkout by mistake.
 */
