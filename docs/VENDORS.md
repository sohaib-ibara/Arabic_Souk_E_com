# Vendors, provisioning and prices

From the 1 September client call. Four things were asked for, and they only
make sense together:

1. Vendors as first-class rows, some scraped, some arriving by API later.
2. Switches at three levels: vendor, vendor + category, single product.
3. The storefront layout must not move when a switch is thrown.
4. Every price shown in BHD, rounded to something that looks like a price.

Implemented by `supabase/migrations/0014_vendor_provisioning.sql` and
`/admin/vendors`.

## The four switches

| Level | Where | Stored as |
|---|---|---|
| Whole vendor | `/admin/vendors` → **Turn on / Turn off** | `vendors.is_enabled` |
| One category, one vendor | `/admin/vendors?vendor=…` → Categories | `vendor_categories.is_enabled` |
| **A whole category, shop-wide** | `/admin/categories` | `categories.is_enabled` |
| One product | `/admin/products` → List / Hide | `products.is_published` |

They combine with AND. A product is on the shop only when its category is on,
its vendor is on, that vendor is on for that category, and the product itself
is listed.

### The two category switches are not the same thing

This catches people, so it is worth being blunt:

- **`/admin/vendors` → Categories** decides *whose* products fill a category.
  Turning noon off inside skin care leaves Cult Beauty's products there, under
  the same heading — that is the 1 Sep requirement, and it is why switching one
  vendor off still leaves products on the shelf.
- **`/admin/categories`** decides whether the category exists at all. Turning it
  off removes the heading, the menu entry, the page and every product in it,
  whoever supplies them.

Reach for the first to change the mix, the second to stop selling a section.

**No row in `vendor_categories` means enabled.** Only an explicit `false` hides
anything. That way a newly imported product in a category nobody has configured
follows the vendor's own switch instead of vanishing until someone notices a
missing row.

## Why the storefront never sees a vendor

`products.source` is staff-only and always has been — it is the sourcing list,
and migrations 0007, 0008 and 0010 each went out of their way to keep it off
the anon grant.

But provisioning makes visibility *depend* on the vendor, per product. Filtering
by vendor at read time would have meant granting `source` to the storefront and
undoing all of that.

So the three switches are resolved in the database into a single public
boolean, **`products.is_listed`**, maintained by trigger. The storefront filters
on that one column and learns nothing about who supplies what.

```
is_listed = is_published
        AND (no vendor OR vendor.is_enabled)
        AND (no vendor OR no category OR that vendor is not switched off there)
```

Three triggers keep it current — one on `products`, one on `vendors`, one on
`vendor_categories` — so a switch thrown anywhere is reflected for every reader
at once, including the sitemap and any script. Nothing resolves visibility in
TypeScript.

### The layout does not move

Categories are **not** per-vendor. They come from the `categories` table and are
rendered whether or not anything is in them. Turning Cult Beauty on inside
"skin care" adds its products to the same grid noon's already occupy; turning
noon off there leaves Cult's behind, in the same place, under the same heading.

## Prices

Each vendor carries its own rule:

```
shelf price = supplier price
            × fx_rate_to_bhd
            × (1 + markup_percent/100)
            + surcharge_bhd          (per item, for shipping and duty)
            → snapped to the retail ladder
```

`/admin/vendors` has two separate operations, and the difference matters:

- **Recompute from &lt;currency&gt;** — rebuilds the price from what the vendor
  charges. Needs `products.source_price`, which arrives with a sync.
- **Only round existing BHD prices** — leaves the arithmetic alone and just
  snaps the current price onto the ladder. This is the one that reaches the 301
  noon products already on the shop, whose prices were corrected by hand and
  have no supplier price behind them.

Both preview before they write, both skip `price_locked` rows, and both run as
a single SQL statement so the preview cannot disagree with the write.

### The rounding ladder

Endings: **.19 .29 .49 .69 .89 .99**. A price moves **up** to the next rung,
unless it has only just passed one (within 0.05), in which case it drops back.

Reproduces all six of the client's worked examples:

| in | out | | in | out |
|---|---|---|---|---|
| 6.38 | 6.49 | | 7.12 | 7.19 |
| 6.52 | 6.49 | | 7.26 | 7.29 |
| 6.63 | 6.69 | | 7.41 | 7.49 |

⚠ **Worth confirming with the client.** Their message said the endings were
".49, .59, .69, .79, .89, .99" and that the rule was "closest". Their own
examples contradict both: .59 is in that list but 6.63 goes to 6.69, and
"closest" would send 6.38 to 6.39. The examples were implemented, because they
are the specific thing the client checked. If they meant the prose, the ladder
in `public.attractive_price` is one array literal.

Rounding up by default is also the commercially safe direction — the error is
always in the shop's favour, never below landed cost.

### Prices a human set

`products.price_locked` marks a price somebody typed. Both operations skip
those rows and say how many they skipped, so a negotiated price is never
quietly overwritten by an exchange-rate change.

## Staging is not the catalogue

The sync writes `staging_products`. Nothing in the admin or the storefront
reads that table, which is why a vendor can show **177 waiting in staging, none
in the catalogue**. Between the two sits one deliberate step:

`/admin/vendors` → the vendor → **Products from staging** → check, then bring in.

Everything it creates arrives with `is_published = false`. Nothing reaches a
shopper until someone lists it *and* the vendor is switched on. A product
already in the catalogue keeps whatever the admin decided; only its supplier
price, stock and delivery window are refreshed.

### Categories on import

`src/lib/category-aliases.ts` maps a supplier's shelf names onto ours. Cult
Beauty's are not a taxonomy — 58 of its 62 shelves have no equivalent here, and
many are campaigns (`halloween`, `spotlight`, `goody-bag`, `our-customers-love`)
that say nothing about what the product is.

Only unambiguous shelves are mapped. Of the 177 staged Cult products:

| | count |
|---|---|
| shelf name already matches one of ours | 16 |
| resolved by the alias map | 93 |
| **arrive uncategorised** | **68** |

An uncategorised product is imported anyway and flagged in the admin. It will
not appear under any category until someone sets one, which is the honest
outcome — guessing would file a serum in the lipstick aisle and nobody would
notice until a customer did.

The map is **provisional**, pending the client's decision on which Cult
categories the shop carries. Every line is a guess an admin can overrule per
product in `/admin/products`.

## Adding a vendor

1. Add the row in `/admin/vendors`. **`key` must match the adapter key** in
   `scripts/import/sites/` — that is what ties products to the vendor, and it
   cannot be changed afterwards.
2. Set currency, rate, markup, surcharge. Saving the rule changes no price.
3. Import products (they arrive unlisted).
4. Preview a reprice, apply it.
5. Turn the vendor on.

New vendors are created **off**. A vendor that has just been added has not been
priced or reviewed and must not reach the shop because someone created a row.

### Its images need a host entry

`next/image` refuses a hostname that is not in `next.config.ts`, and it throws
**while rendering** — so one product from an unlisted host takes down the whole
category page, not just its own card. Listing the first Cult Beauty products
did exactly that: their images are on THG's CDN, and `/category/bath-body`
returned "Something went wrong".

Before listing anything from a new vendor:

```sql
select images from products where source = '<key>' limit 1;
```

and add that hostname to `images.remotePatterns`. Known so far:

| vendor | hosts |
|---|---|
| noon | `*.nooncdn.com` |
| Cult Beauty | `*.thcdn.com`, `*.thgimages.com` |

### API vendors

`vendors.kind` is `scrape | api | manual`. Nothing branches on it yet — it is
there so that adding a vendor who hands us a feed is a row rather than a schema
change. Whatever fetches that feed still has to write `staging_products` with
the vendor's `key` as `source`; everything downstream is then identical.

## Seeded state

| vendor | on? | currency | rate | why |
|---|---|---|---|---|
| noon | **yes** | SAR | 0.100000 | 301 products are live; the migration must not take the shop down |
| cultbeauty | no | GBP | 0.476000 | 177 products in staging, awaiting category and pricing decisions |

**Both rates are starting values, not quotes.** Check them against a real rate
before repricing anything from them.

## Gotchas

- **Run the migration before deploying.** If the code ships first, `is_listed`
  is missing, `loadProducts` logs loudly and falls back to filtering on
  `is_published` — vendor switches unenforced, but the real catalogue still
  served rather than 628 sample products.
- **`PUBLIC_PRODUCT_COLUMNS` in `src/lib/data.ts` must list `is_listed`.**
  Selected without the grant takes the catalogue down with a 403; granted
  without being selected serves hidden products.
- **Switching every vendor off empties the shop, deliberately.** `loadProducts`
  distinguishes "matched nothing" from "table is empty" so it returns an empty
  catalogue rather than falling back to sample data.
- **`vendors` and `vendor_categories` have RLS on and no policies.** Only the
  service role reads them. Rates and markups are the commercial core.
