# Sample CSVs for the admin tools

Ready-to-upload test files, written against **real slugs in the live catalogue**
so the previews show real products and real before/after numbers.

Every panel previews first and writes nothing until you press the second button.
Numbers below were dry-run against the database on 11 Aug 2026 — if someone has
edited these products since, the counts shift but the shape of the result is the
same.

> No product has a SKU yet, so these sheets match on **`slug`**. `id` (UUID) and
> `sku` are also accepted; the panel tells you which column it matched on.

---

## Pricing — `/admin/pricing`

### `01-price-update.csv` → **Bulk price update**

Deliberately contains one of every outcome so you can see all four counters move.

| Line | Slug | Store price | Sheet | Outcome |
| --- | --- | --- | --- | --- |
| 2 | `absolut-repair-shampoo-300ml` | 12.820 | 11.900 | change −0.920 |
| 3 | `apple-pro-…-cream-500ml` | 13.000 | 12.500 | change −0.500 |
| 4 | `barony-ceramic-hair-straightener-pink` | 13.022 | 13.022 | already correct |
| 5 | `intensive-moisturising-lotion-…-236ml` | 13.200 | 14.000 | change +0.800 |
| 6 | `womn-dry-fresh-liquid-powder-50-ml` | — | *(blank)* | skipped — "Missing price" |
| 7 | `this-slug-does-not-exist` | — | 9.999 | not found |

**Expected:** Rows read **5** · Will change **3** · Already correct **1** ·
1 unreadable row · 1 product not found. Matched on "slug" / "price".

Rows read is 5, not 6 — an unreadable row never becomes a row.

### `02-price-restore.csv`
Puts the three changed prices back. Run it after `01` to leave the catalogue as
you found it. Preview should read **5 rows, 0 changes, 5 already correct** if the
restore has already happened (or if you never applied `01`).

### `03-price-floors.csv` → **Price validation (margin guard)**

Read-only — it never writes. Uses cheap products, so it doesn't collide with the
price-update test. A product **passes** when store price ≥ floor.

**Expected:** Rows read **7** · Passed **3** · Below floor **3** · 1 not found.

Violations, worst first:

| Product | Store | Floor | Short by |
| --- | --- | --- | --- |
| `moisturising-lip-care-blackberry-…` | 0.858 | 1.200 | 0.342 |
| `labello-lip-care-…-cherry-shine-4-8g` | 0.750 | 0.900 | 0.150 |
| `classic-with-wings-…-40-pads` | 0.889 | 1.000 | 0.111 |

`lip-therapy-rosy-lip-balm-20grams` is priced at exactly its floor (0.575) and
**passes** — the rule is ≥, not >.

---

## Stock — `/admin/inventory`

Run these in order; `05` is written to produce variance against `04`.

### `04-stock-update.csv` → **Bulk stock update**

All twelve sample products start at 0 on hand.

**Expected:** Rows read **6** · Will change **4** · Already correct **1** ·
Net units **+37** · 1 unreadable row (line 7, blank quantity) · 1 not found.

| Slug | 0 → | Note |
| --- | --- | --- |
| `absolut-repair-shampoo-300ml` | 24 | |
| `apple-pro-…-cream-500ml` | 12 | |
| `barony-ceramic-hair-straightener-pink` | 3 | below the threshold of 5 → **Running low** |
| `intensive-moisturising-lotion-…` | 0 | no change |
| `womn-dry-fresh-liquid-powder-50-ml` | −2 | shows as **buy 2** → **Need buying** |

After applying, the filter chips at the top of `/admin/inventory` should show
1 under *Running low* and 1 under *Need buying*, and every change appears in the
ledger as **Bulk stock update**.

### `05-stock-take.csv` → **Stock take**

Run **after** `04`. Same idea, but the panel frames it as variance and logs the
corrections as a stock count rather than an adjustment.

**Expected:** Rows read **4** · Variances **3** · Already correct **1** ·
Net units **+2**.

| Slug | System | Counted | Variance |
| --- | --- | --- | --- |
| `absolut-repair-shampoo-300ml` | 24 | 22 | −2 |
| `apple-pro-…-cream-500ml` | 12 | 12 | — |
| `barony-ceramic-hair-straightener-pink` | 3 | 5 | +2 |
| `womn-dry-fresh-liquid-powder-50-ml` | −2 | 0 | +2 |

### `06-stock-reset.csv`
Sets all five back to 0 so the catalogue is clean again. The ledger keeps every
movement — that's the point of it — so the history stays visible on each
product's inventory page.

---

## Making your own

Header names are flexible; the first recognised column of each kind wins.

| Column | Accepted header names |
| --- | --- |
| Product | `id`, `product_id`, `productid`, `slug`, `sku`, `handle` |
| Price | `price`, `new_price`, `unit_price`, `min_price`, `minimum_price`, `floor`, `floor_price`, `cost`, `cost_price`, `supplier_price` |
| Quantity | `quantity`, `qty`, `stock`, `stock_quantity`, `on_hand`, `counted`, `count`, `new_quantity` |

Quoted fields, embedded commas, CRLF endings and Excel's UTF-8 BOM are all
handled. Quantities must be whole numbers.
