# Noon Import Pipeline (experimental — `feature/noon-import`)

Firecrawl + Claude pipeline that scrapes product data from noon and lands it in a
**review-only staging table**. Nothing reaches the live store automatically.

```
Firecrawl (fetch/render)  →  Claude (structured extraction)  →  staging_products
                                                                     │  (human review)
                                                          approve ↓  │
                                                        promote-staging.ts
                                                                     ↓
                                                              products (live)
```

## ⚠️ Read this first — legal / rights

This branch exists because it was explicitly requested. Before using it, understand:

- **Scraping noon.com breaches its Terms of Service.** noon also runs bot protection,
  so scraping is brittle and may be blocked.
- **Product images and descriptions are copyrighted** by noon and by the brands
  (Chanel, Dior, etc.). Re-publishing them on a commercial store you operate is
  **copyright infringement** and a real takedown / legal-liability risk **for the store
  owner** — not for the tool.
- **Prices are SAR** (the `saudi-en` site) and change constantly; they are not valid
  for a Bahrain/BHD store without conversion and review.

**Recommended use:** treat scraped data as **market research** — category taxonomy,
brand list, attributes, and price bands to decide what to stock and how to structure the
catalogue. For the **live** catalogue, use rights-cleared assets: brand/distributor
media (brands provide official images to authorized retailers), a supplier feed, licensed
stock, or your own photography. The staging table and the manual promote step exist so a
human decides, per product, what is safe to publish.

By approving and promoting a row you assert you have the right to use its content.

---

# Method A — local browser capture (NO API keys) ⭐ recommended

noon blocks server-side scrapers (plain HTTP, cloud fetchers, and headless
requests are dropped at the network layer). The free way through is a **real
browser running on your own machine / IP**, which noon trusts. This method uses
Playwright locally and needs **no API keys** — not even Firecrawl or Anthropic:

```
local Chromium (your IP)  →  raw capture file  →  parse (deterministic)  →  seed-noon.sql / imported-data.ts
```

Every noon product page embeds a JSON-LD `Product` block (name, brand, price,
images, description, rating), so extraction is plain parsing — no LLM/API call.

### One-time setup

```bash
npm install            # installs playwright (devDependency)
npx playwright install chromium
```

### Step 1 — capture (opens a real browser window)

```bash
CONFIRM_SCRAPE=1 npm run import:browser
# options: TARGET_URL=… MAX_PRODUCTS=15 DELAY_MS=1000

# Capture ALL categories at once — pass multiple listings in TARGET_URLS
# (comma-separated). MAX_PRODUCTS is then the per-listing cap:
CONFIRM_SCRAPE=1 MAX_PRODUCTS=15 \
TARGET_URLS="https://www.noon.com/saudi-en/beauty/makeup-16142/,\
https://www.noon.com/saudi-en/beauty/skin-care-16813/,\
https://www.noon.com/saudi-en/beauty/hair-care/,\
https://www.noon.com/saudi-en/beauty/fragrance/,\
https://www.noon.com/saudi-en/beauty/personal-care-16343/bath-and-body/,\
https://www.noon.com/saudi-en/beauty/makeup-16142/makeup-brushes-and-tools/brushes-and-applicators-26364/" \
npm run import:browser
```

Walks each listing, opens every product, and writes the raw structured data to
`scripts/import/.noon-capture.json` (gitignored — never committed). Run **headed**
(the default — a real visible browser) so noon doesn't block it; `HEADLESS=1`
usually gets `ERR_HTTP2_PROTOCOL_ERROR`. `LIST_ONLY=1` gathers product URLs
without scraping, handy for checking a listing yields products first.

### Step 2 — build the catalogue files

```bash
node scripts/import/build-imported-data.mjs
# options: SAR_TO_BHD=0.1  MAX_IMAGES=4
```

Produces two artifacts from the capture:

- **`src/lib/imported-data.ts`** — typed `Product[]` / `Brand[]`. The storefront
  serves these automatically when Supabase returns no rows (local demo mode).
- **`supabase/seed-noon.sql`** — paste into the **Supabase SQL editor** and Run
  (authenticated by your dashboard login; **no keys**). Replaces the sample
  products/brands with the noon catalogue. This is what makes it live when the
  store reads from Supabase (Supabase wins over the local file).

Prices are converted SAR→BHD at `SAR_TO_BHD` (≈0.1) and every product is
`stock_quantity=0` — the out-of-stock checkout flow is preserved. To revert to
the sample catalogue, re-run `supabase/seed.sql`.

---

# Method B — Firecrawl + Claude → staging (needs API keys)

The original pipeline, kept for when you want server-side scraping at scale with
a review/approve gate in a staging table. Needs Firecrawl + Anthropic +
Supabase service-role keys.

## Prerequisites

- Apply the staging migration: run `supabase/migrations/0002_staging.sql` in the Supabase
  SQL editor. `staging_products` has **no public RLS policy** — only the service-role key
  can read/write it.
- A [Firecrawl](https://firecrawl.dev) API key and an Anthropic API key.
- Your Supabase **service-role** key (Project Settings → API). It bypasses RLS — keep it
  server-side only, **never** prefix it with `NEXT_PUBLIC_` and never commit it.

## Environment (add to `.env.local`)

```bash
FIRECRAWL_API_KEY=fc-...
ANTHROPIC_API_KEY=sk-ant-...
SUPABASE_SERVICE_ROLE_KEY=eyJ... # server-side only; bypasses RLS

# optional
TARGET_URL=https://www.noon.com/saudi-en/noon-premium-beauty/
MAX_PRODUCTS=20
REQUEST_DELAY_MS=1500
ANTHROPIC_MODEL=claude-opus-4-8   # or claude-haiku-4-5 for cheaper bulk extraction
PRICE_CONVERSION_RATE=0.1         # SAR→BHD, used by promote (approx; verify!)
```

> For a Bahrain store, `https://www.noon.com/bahrain-en/...` is more relevant than
> `saudi-en` (BHD pricing) — set `TARGET_URL` accordingly. The IP/copyright concerns are
> identical either way.

## Step 1 — scrape into staging

The scraper refuses to run without `CONFIRM_SCRAPE=1` (acknowledging the notice above):

```bash
CONFIRM_SCRAPE=1 node scripts/import/firecrawl-noon.ts
# or: CONFIRM_SCRAPE=1 npm run import:noon
```

It discovers product URLs (Firecrawl `map`), scrapes each (Firecrawl `scrape` → markdown),
extracts structured fields with Claude (JSON-schema structured outputs), and upserts rows
into `staging_products` with `status='pending'`. Re-running updates existing rows
(unique on `source_url`).

## Step 2 — review

In Supabase → Table editor → `staging_products`:

- Inspect each row. For every product you **have the right to publish**, set
  `status = 'approved'`. Set `status = 'rejected'` for the rest. Add `review_notes` freely.
- This is the gate. Un-reviewed (`pending`) rows are never promoted.

## Step 3 — promote approved rows to the live store

Publishes only `status='approved'` rows, only with `CONFIRM_PUBLISH=1`:

```bash
CONFIRM_PUBLISH=1 PRICE_CONVERSION_RATE=0.1 node scripts/import/promote-staging.ts
# or: CONFIRM_PUBLISH=1 npm run import:promote
```

For each approved row it: finds/creates the brand, maps the category, generates a unique
slug, converts the price by `PRICE_CONVERSION_RATE`, inserts into `products`, and marks the
staging row `promoted`. **Promoted products start with `stock_quantity=0`** (out of stock)
so they behave like the rest of the demo until you set real inventory — and so nothing
sells before you've confirmed pricing and rights.

## Notes & limits

- **Costs:** Firecrawl and Anthropic both bill per request. `MAX_PRODUCTS` caps volume;
  raise it deliberately. `claude-haiku-4-5` is much cheaper for bulk extraction.
- **Brittleness:** noon's markup and anti-bot change; extraction quality varies. Spot-check
  staging rows.
- **Not wired into the app build.** These scripts are excluded from the Next.js tsconfig and
  never imported by the storefront. Deleting this branch removes the whole feature cleanly.
