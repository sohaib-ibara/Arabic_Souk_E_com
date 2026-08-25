export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  sort_order: number;
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
  description: string | null;
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
