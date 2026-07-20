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

/** Result of a server-side stock validation at checkout. */
export interface StockIssue {
  productId: string;
  name: string;
  requested: number;
  available: number;
  reason: "out_of_stock" | "insufficient" | "not_found";
}

export interface StockCheckResult {
  ok: boolean;
  issues: StockIssue[];
}
