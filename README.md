# Arabic Souk — Premium Beauty Store (Bahrain)

A modern, SEO-friendly, mobile-responsive e-commerce storefront for beauty products,
built with **Next.js (App Router)**, **TypeScript**, **Tailwind CSS v4** and **Supabase**.

This is the **demo / phase 1** build. It presents a full, real-looking catalogue that
customers can browse and add to their bag — and a checkout that runs a **live stock
check** and reports items as **out of stock** (by design, since the demo catalogue
carries zero inventory). Wiring in real stock + payments is the next phase.

> **Brand:** Arabic Souk (arabicsouk.com). All brand text/colours live in
> `src/lib/config.ts` and `src/app/globals.css`.

---

## ✨ Features

- **Storefront**: home, shop-all with filters + sort + search, category pages, rich
  product detail pages, slide-out cart drawer, full cart page, checkout.
- **Cart**: client-side, persisted to `localStorage`, with a live item count + drawer.
- **Out-of-stock checkout flow**: `POST /api/checkout` validates the cart against
  inventory and returns the unavailable items — the requested demo behaviour.
- **Real imagery**: curated, verified Unsplash product photography with a graceful
  monogram fallback if any image ever fails to load.
- **SEO**: per-page metadata, Open Graph, `sitemap.xml`, `robots.txt`, canonical URLs,
  and JSON-LD structured data (Organization, WebSite + SearchAction, Product,
  BreadcrumbList).
- **Responsive & accessible**: mobile-first layouts, keyboard focus states, semantic
  markup, `aria` labels, reduced-motion support.
- **Supabase-first data layer** with a **bundled sample-data fallback**, so the site
  renders fully even before the database is connected.

## 🧱 Tech stack

| Concern      | Choice                              |
| ------------ | ----------------------------------- |
| Framework    | Next.js 16 (App Router, RSC)        |
| Language     | TypeScript                          |
| Styling      | Tailwind CSS v4 (CSS-first theme)   |
| Database     | Supabase (Postgres + RLS)           |
| Fonts        | Playfair Display + Inter (next/font)|
| Images       | next/image + Unsplash               |

---

## 🚀 Getting started

```bash
npm install
cp .env.local.example .env.local   # optional for local dev — see below
npm run dev                        # http://localhost:3000
```

The site works **with or without** Supabase credentials:

- **No credentials** → it serves the bundled sample catalogue (`src/lib/sample-data.ts`).
- **With credentials** → it serves your Supabase catalogue and falls back to the sample
  data only if a query fails or returns nothing.

### Environment variables (`.env.local`)

```bash
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR-ANON-PUBLIC-KEY
NEXT_PUBLIC_SITE_URL=http://localhost:3000   # your domain in production
```

---

## 🗄️ Supabase setup

1. Open your Supabase project → **SQL Editor**.
2. Run **`supabase/migrations/0001_init.sql`** — creates `categories`, `brands`,
   `products` (+ `orders` / `order_items` for the next phase), indexes, an
   `updated_at` trigger, and public-read **Row Level Security** policies.
3. Run **`supabase/seed.sql`** — inserts the 6 categories, 6 brands and 24 products
   (safe to re-run; every row upserts on its unique slug).
4. Add your `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to `.env.local`.

`supabase/seed.sql` is generated from the sample catalogue so the two never drift.
Regenerate it any time with:

```bash
node scripts/gen-seed.ts
```

### Data model

- **categories** — `name, slug, description, image_url, sort_order`
- **brands** — `name, slug, logo_url`
- **products** — `name, slug, description, price (BHD, 3-decimals), compare_at_price,
  images (jsonb), category_id, brand_id, rating, review_count, stock_quantity,
  in_stock, is_featured, is_new, tags`
- **orders / order_items** — scaffolded for the next phase (no public RLS policy;
  service-role only).

> **Note on the demo flow:** seed products have `in_stock = true` (listed for sale) but
> `stock_quantity = 0` (no real inventory). Cards therefore look buyable, but the
> checkout stock check reports them as out of stock. Set real `stock_quantity` in
> Supabase and in-stock orders will pass the same check.

---

## 🔎 SEO checklist

- Titles/descriptions per page via the Metadata API (`%s | Arabic Souk` template).
- `app/sitemap.ts` → `/sitemap.xml` (home, shop, every category + product).
- `app/robots.ts` → `/robots.txt` (disallows `/cart`, `/checkout`, `/api`).
- JSON-LD: Organization + WebSite (layout), Product + BreadcrumbList (product pages).
- Canonical URLs, Open Graph + Twitter cards, semantic headings, alt text.
- Cart/checkout are `noindex`; filtered shop permutations are `noindex, follow`.

Set `NEXT_PUBLIC_SITE_URL` to your production domain so canonical/OG/sitemap URLs are absolute.

---

## 📁 Project structure

```
src/
  app/
    layout.tsx            Root layout: fonts, metadata, header/footer, cart, JSON-LD
    page.tsx              Home
    shop/                 Shop-all (filters, sort, search)
    category/[slug]/      Category listing
    product/[slug]/       Product detail (+ generateStaticParams, JSON-LD)
    cart/ · checkout/     Bag + checkout (out-of-stock flow)
    api/checkout/route.ts Stock-validation endpoint
    sitemap.ts · robots.ts · not-found.tsx
  components/             ui/ · layout/ · home/ · product/ · cart/ · checkout/ · shop/ · seo/
  lib/
    config.ts             Brand + site config (rename here)
    data.ts               Data access (Supabase-first, sample fallback)
    sample-data.ts        Bundled demo catalogue
    supabase/             Server + browser clients
    types.ts · format.ts · cn.ts
supabase/
  migrations/0001_init.sql
  seed.sql                (generated)
scripts/gen-seed.ts
```

---

## 🎨 Rebranding

1. `src/lib/config.ts` — name, tagline, contact, socials, shipping, currency.
2. `src/app/globals.css` — the `@theme` color tokens (`--color-brand`, `--color-gold`, …).
3. `src/lib/config.ts` → `primaryNav` — the category slugs shown in the nav.

## 🛣️ Next phase

- Real inventory + order creation + payment (BENEFIT / card / Apple Pay).
- Customer accounts, wishlists, reviews (Supabase Auth).
- Arabic + RTL localisation.
- Admin dashboard for catalogue & orders.
```
