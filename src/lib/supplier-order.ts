import { toCsv } from "./csv";
import type { OrderItemRow } from "./admin-orders";

/**
 * Turning an order into a purchase request, one per supplier.
 *
 * This shop owns no stock. An order arrives, and somebody then has to buy
 * those items from noon or Cult Beauty and forward them. Until now that was
 * done by opening each line's "Buy from supplier" link in turn, which is fine
 * for a two-line order and not fine for a day's worth.
 *
 * WHAT THIS DELIBERATELY DOES NOT PUT IN THE FILE, because the file is sent
 * out of the building:
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

/**
 * Split an order's lines by who we buy them from.
 *
 * `vendorNames` maps a vendor key to its display name. A key with no vendor
 * row still gets a request, under its own key: the products exist and have to
 * be bought whether or not somebody has configured the supplier.
 */
export function splitBySupplier(
  items: OrderItemRow[],
  vendorNames: Map<string, string>,
): SupplierSplit {
  const bySource = new Map<string, OrderItemRow[]>();
  const unsourced: OrderItemRow[] = [];

  for (const item of items) {
    if (!item.source) {
      unsourced.push(item);
      continue;
    }
    const list = bySource.get(item.source);
    if (list) list.push(item);
    else bySource.set(item.source, [item]);
  }

  const requests: SupplierRequest[] = [...bySource.entries()]
    .map(([key, rows]) => {
      const lines: SupplierLine[] = rows.map((r) => ({
        name: r.name,
        sku: r.sourceSku,
        url: r.sourceUrl,
        quantity: r.quantity,
        unitPrice: r.supplierPrice,
        currency: r.supplierCurrency,
      }));

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
 * Our order number is on every row rather than in a banner above the table,
 * because a header line that is not part of the data stops the file being a
 * spreadsheet: the supplier opens it, sorts a column, and the banner sorts
 * with it. One repeated value is the cost of a file anybody can open.
 */
export function supplierCsv(orderNumber: string, request: SupplierRequest): string {
  return toCsv([
    ["order", "product", "supplier_sku", "supplier_url", "quantity", "unit_price", "currency", "line_total"],
    ...request.lines.map((l) => [
      orderNumber,
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
 * noon", and the order number second so two requests never collide.
 */
export function supplierCsvFilename(orderNumber: string, request: SupplierRequest): string {
  const slug = request.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${slug || request.key}-${orderNumber}.csv`;
}
