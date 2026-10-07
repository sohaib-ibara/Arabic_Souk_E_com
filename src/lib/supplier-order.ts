import { toCsv } from "./csv";
import type { OrderItemRow } from "./admin-orders";

/**
 * Turning orders into a purchase request, one per supplier.
 *
 * This shop owns no stock. An order arrives, and somebody then has to buy
 * those items from noon or Cult Beauty and forward them. Until now that was
 * done by opening each line's "Buy from supplier" link in turn, which is fine
 * for a two-line order and not fine for a day's worth.
 *
 * Two shapes, one file format:
 *
 *   one order   from the order screen, while looking at it
 *   one day     from the orders list, which is how the work actually arrives:
 *               nobody buys one order at a time, they buy the morning's
 *               orders in one go
 *
 * The day version AGGREGATES. Three orders for the same lipstick is one line
 * reading quantity 3, not three lines a human has to add up — with the order
 * numbers kept in a column so a delivery can still be reconciled. That is the
 * whole reason the day version is worth having over downloading each order.
 *
 * WHAT THESE FILES DELIBERATELY DO NOT CARRY, because they leave the building:
 *
 *   The customer.  No name, no email, no phone, no delivery address. Goods
 *                  come to us and we forward them, so the supplier has no use
 *                  for any of it, and a spreadsheet of customers' addresses
 *                  emailed to a third party is a data-protection incident
 *                  waiting for someone to forward it once more.
 *
 *   Our price.     What we charge is our margin over what they charge. A
 *                  supplier reading their own price next to our retail one is
 *                  reading our markup. The `unit_price` column is THEIR price.
 *
 * One file per supplier, never a combined one: a request is a thing you send
 * to somebody, and noon has no business seeing what we buy from Cult Beauty.
 */

/** One line of a request: what to buy, how many, at what the supplier quoted. */
export interface SupplierLine {
  name: string;
  sku: string | null;
  url: string | null;
  quantity: number;
  /** The supplier's own price each, null when we have never been quoted one. */
  unitPrice: number | null;
  currency: string | null;
  /**
   * Which of our orders this line is for — one for a single-order request,
   * several once a day's orders are aggregated. Kept so a part-delivery can
   * be traced back to the customer waiting for it.
   */
  orders: string[];
}

export interface SupplierRequest {
  /** The vendor `key` — "noon", "cultbeauty". */
  key: string;
  /** What to call them in the UI and in the filename. */
  name: string;
  lines: SupplierLine[];
  /** Units to buy, which is not the number of lines. */
  units: number;
  /**
   * What this should cost at the supplier's prices, and whether that total
   * covers everything. A line we hold no price for is still a line to buy, so
   * it is included in the request and excluded from the total — a figure that
   * silently omits an item is worse than one that says it did.
   */
  total: number;
  currency: string | null;
  missingPrices: number;
}

export interface SupplierSplit {
  requests: SupplierRequest[];
  /**
   * Lines belonging to no supplier: products added by hand, and products
   * deleted from the catalogue since the order was placed. Surfaced rather
   * than dropped — they still have to be fulfilled by somebody.
   */
  unsourced: OrderItemRow[];
}

/** An order reduced to what a purchase request needs from it. */
export interface PurchaseSource {
  orderNumber: string;
  items: OrderItemRow[];
}

/**
 * Split one or many orders by who we buy from, merging identical products.
 *
 * `vendorNames` maps a vendor key to its display name. A key with no vendor
 * row still gets a request, under its own key: the products exist and have to
 * be bought whether or not somebody has configured the supplier.
 */
export function splitBySupplier(
  orders: PurchaseSource[],
  vendorNames: Map<string, string>,
): SupplierSplit {
  const bySource = new Map<string, Map<string, SupplierLine>>();
  const unsourced: OrderItemRow[] = [];

  for (const order of orders) {
    for (const item of order.items) {
      if (!item.source) {
        unsourced.push(item);
        continue;
      }

      /*
        What counts as "the same product" across orders.

        The product id, when there is one — two orders for the same catalogue
        row are one thing to buy. Falling back to the supplier's own code, and
        then to the name, because a product deleted from the catalogue still
        has to be bought and still has a name on the order line. Never the
        name alone when an id exists: two suppliers can sell a product under
        exactly the same name, and merging those would order the wrong one.
      */
      const identity = item.productId ?? item.sourceSku ?? item.name;

      let lines = bySource.get(item.source);
      if (!lines) {
        lines = new Map();
        bySource.set(item.source, lines);
      }

      const existing = lines.get(identity);
      if (existing) {
        existing.quantity += item.quantity;
        if (!existing.orders.includes(order.orderNumber)) {
          existing.orders.push(order.orderNumber);
        }
        // A price learnt on one line is better than a blank on another: the
        // product is the same, and the later sync may simply not have reached
        // the row the first line read.
        if (existing.unitPrice == null && item.supplierPrice != null) {
          existing.unitPrice = item.supplierPrice;
          existing.currency = item.supplierCurrency;
        }
        continue;
      }

      lines.set(identity, {
        name: item.name,
        sku: item.sourceSku,
        url: item.sourceUrl,
        quantity: item.quantity,
        unitPrice: item.supplierPrice,
        currency: item.supplierCurrency,
        orders: [order.orderNumber],
      });
    }
  }

  const requests: SupplierRequest[] = [...bySource.entries()]
    .map(([key, lineMap]) => {
      const lines = [...lineMap.values()];
      const priced = lines.filter((l) => l.unitPrice != null);
      return {
        key,
        name: vendorNames.get(key) ?? key,
        lines,
        units: lines.reduce((n, l) => n + l.quantity, 0),
        // Rounded at the end, not per line: summing rounded lines drifts.
        total: Math.round(priced.reduce((n, l) => n + l.unitPrice! * l.quantity, 0) * 1000) / 1000,
        currency: priced[0]?.currency ?? lines[0]?.currency ?? null,
        missingPrices: lines.length - priced.length,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return { requests, unsourced };
}

/**
 * The request as CSV.
 *
 * Our order numbers sit in a column on every row rather than in a banner
 * above the table, because a header line that is not part of the data stops
 * the file being a spreadsheet: the supplier opens it, sorts a column, and
 * the banner sorts with it. A repeated value is the cost of a file anybody
 * can open.
 */
export function supplierCsv(request: SupplierRequest): string {
  return toCsv([
    ["orders", "product", "supplier_sku", "supplier_url", "quantity", "unit_price", "currency", "line_total"],
    ...request.lines.map((l) => [
      // Space-separated: order numbers contain no spaces, so this needs no
      // quoting and still splits cleanly for anyone who wants the list back.
      l.orders.join(" "),
      l.name,
      l.sku ?? "",
      l.url ?? "",
      l.quantity,
      l.unitPrice ?? "",
      l.currency ?? "",
      l.unitPrice == null ? "" : Math.round(l.unitPrice * l.quantity * 1000) / 1000,
    ]),
  ]);
}

/**
 * A filename somebody can find again in a downloads folder six weeks later.
 *
 * Supplier first, because the question being answered is "what did we send
 * noon"; then what the request covers — an order number, or a date.
 */
export function supplierCsvFilename(request: SupplierRequest, covers: string): string {
  const slug = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${slug(request.name) || request.key}-${slug(covers) || "orders"}.csv`;
}
