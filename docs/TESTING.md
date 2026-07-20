# Arabic Souk — End-to-End Testing Guide

How to verify the storefront works, that **products come from Supabase**, and that the
**out-of-stock checkout flow** behaves as designed.

---

## 0. Prerequisites

```bash
npm install
# .env.local must contain your Supabase URL + anon key + site URL
npm run check:supabase   # confirms the DB is connected and seeded
npm run dev              # http://localhost:3000
```

`check:supabase` should print `categories: 6`, `brands: 6`, `products: 24` and
`✅ Supabase is connected and seeded`. If any table shows `0 rows`, run the migration
and seed first (see README → Supabase setup).

---

## 1. Automated checks (run before every hand-off)

| Command | Passes when |
| --- | --- |
| `npm run check:supabase` | DB connected, 3 tables populated |
| `npm run lint` | exits 0, no errors |
| `npm run build` | compiles, generates 24 `/product/*` pages, 0 type errors |

> During `npm run build`, the 24 product pages are generated **from your Supabase data**
> (`generateStaticParams` reads the DB). If the build lists 24 product routes, the DB
> integration is working at build time too.

---

## 2. Confirm the data really comes from Supabase

Two independent ways to be sure you're seeing live data, not the sample fallback:

1. **Console signal (dev):** with `npm run dev` running, watch the terminal. If you ever
   see `[data] Supabase "products" ... using sample data`, the app fell back (empty table
   or query error). **No warning = data is coming from Supabase.**
2. **Live edit test:**
   - In Supabase → Table editor → `products`, rename any product (e.g. append " (LIVE)").
   - Reload that product page in the browser (dev mode / or after `npm run build`).
   - The new name should appear → proves the page is rendering DB data.
   - Revert the change afterwards.

---

## 3. Manual E2E scenarios

Do these on desktop **and** a mobile viewport (DevTools → device toolbar, e.g. iPhone SE
375px). Each step lists the **expected** result.

### 3.1 Home
- Visit `/`. Hero, value-props, category grid, **Bestsellers**, promo banner, **New
  arrivals**, brands, newsletter all render with real images.
- Announcement bar shows free-delivery threshold in BHD.
- Header shows **Arabic Souk** wordmark.

### 3.2 Navigation & mobile menu
- Desktop: category links + "Shop all" in the header navigate correctly.
- Mobile (`<1024px`): tap ☰ → slide-in menu opens; category links work; menu closes.
- Tap the search icon → search bar expands; submit `serum` → lands on `/shop?search=serum`.

### 3.3 Category browse
- `/category/skincare` shows only skincare products; heading + description present.
- Change **Sort by** → URL updates (`?sort=price-asc`) and order changes.

### 3.4 Search
- Search `oud` → results page shows "Oud Royale Eau de Parfum".
- Search `zzzzz` → graceful "No products found" empty state.

### 3.5 Product detail
- Open any product. Gallery thumbnails switch the main image.
- Brand, title, star rating, price (BHD, 3 decimals), "In stock — ready to ship",
  quantity stepper, Add to bag / Buy it now, assurances, description, details, related
  products all render.
- Quantity stepper clamps between 1 and 10.

### 3.6 Add to cart
- **Product card (desktop):** hover → "Add to bag" appears → click → drawer opens, count +1.
- **Product card (mobile):** "Add to bag" is always visible → tap works.
- **PDP:** set qty 3 → Add to bag → drawer shows qty 3.
- Reload the page → cart persists (localStorage).

### 3.7 Cart drawer
- Opens from header bag icon and after adding.
- Free-delivery progress message updates with subtotal.
- +/- adjust quantity; ✕ removes a line; subtotal recalculates.
- "Checkout" → `/checkout`; "View full bag" → `/cart`; Esc / overlay closes it.

### 3.8 Cart page (`/cart`)
- Line items, quantity steppers, remove, and Order summary (Subtotal / Delivery / Total).
- Delivery shows **Free** at/above the threshold, otherwise the flat fee.
- Empty the cart → empty-state with "Start shopping".

### 3.9 ⭐ Checkout out-of-stock flow (the key demo)
- With items in the bag, go to `/checkout`.
- Fill the contact + address fields; click **Place order**.
- **Expected:** a notice appears at the top — *"Sorry — some items are out of stock"* —
  listing each item, and the order does **not** complete. Affected items are also flagged
  in the order summary. This is by design (seed `stock_quantity = 0`).
- Direct API check:
  ```bash
  curl -i -X POST http://localhost:3000/api/checkout \
    -H "Content-Type: application/json" \
    -d '{"items":[{"productId":"<a product id from your DB>","quantity":1}]}'
  ```
  Expect **HTTP 409** and `{"ok":false,"error":"out_of_stock","issues":[…]}`.

### 3.10 Verify the "happy path" (optional)
Prove the check is real, not hardcoded:
- In Supabase, set one product's `stock_quantity` to e.g. `10`.
- Add **only that product** to the bag → Place order.
- **Expected:** no out-of-stock notice for it; the API returns `200 {"ok":true}`
  (order creation + payment come in the next phase).
- Reset `stock_quantity` back to `0` afterwards.

---

## 4. SEO verification
- View source on `/` and a product page — `<title>`, `<meta name="description">`,
  `og:*`, `<link rel="canonical">` present.
- `/robots.txt` disallows `/cart`, `/checkout`, `/api/` and links the sitemap.
- `/sitemap.xml` lists home, `/shop`, all categories and all 24 products.
- Paste a product URL into Google's **Rich Results Test** → `Product`, `Offer`,
  `AggregateRating`, `BreadcrumbList` detected with no errors.
- Lighthouse (DevTools) → SEO ≥ 95, Accessibility ≥ 95 on home + product.

---

## 5. Responsive breakpoints
Check no horizontal scroll and sensible layout at: **375px** (mobile), **768px**
(tablet), **1280px** (desktop). Product grid: 2 cols mobile → 3 tablet → 4 desktop.

---

## 6. Regression checklist (quick tick-list)

- [ ] `check:supabase` green · `lint` clean · `build` OK
- [ ] Home renders with images and Arabic Souk branding
- [ ] Category / search / sort work
- [ ] Add to cart (card + PDP) and persistence
- [ ] Cart drawer + cart page totals correct
- [ ] Checkout shows out-of-stock notice + API returns 409
- [ ] robots.txt / sitemap.xml / JSON-LD valid
- [ ] Mobile 375px: nav drawer, cart drawer, no overflow
