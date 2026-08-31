# Daily supplier sync — where it can run

The client wants the catalogue to track its suppliers automatically: new
products appear, and changes to products we already hold (price, availability)
follow. This records **where that job can run**, because the answer is not
obvious, it differs per supplier, and it was decided by measurement rather than
by argument.

The short version, as of 27 Aug 2026:

| Source | Needs a browser? | Runs in a datacentre? | Where the sync can live |
| ------ | ---------------- | --------------------- | ----------------------- |
| **Cult Beauty** | ❌ no — plain HTTP | ✅ **yes, measured** | Anywhere. Vercel Cron, Railway, GitHub Actions. Free. |
| **noon** | ✅ yes — **Camoufox, not Chrome** | ❌ no — blocked | An office machine on a home connection. Free. `SITE=noon npm run sync` |

They are not the same problem and should not get the same solution.

---

## Cult Beauty — the easy case

Measured 27 Aug 2026 from the office connection in Lahore and from three
separate GitHub Actions runners, which happened to land on three Azure IPs in
three US regions:

| Egress | Plain HTTP | Headless browser |
| ------ | ---------- | ---------------- |
| `20.57.206.149` · Azure, San Jose | 5/5 | 5/5 |
| `64.236.141.182` · Azure, Chicago | 5/5 | 5/5 |
| `172.172.159.182` · Azure, Dulles | 5/5 | 5/5 |
| Office ISP, Lahore | 5/5 | — |

**Thirty fetches, zero failures**, and the plain-HTTP column is the one that
matters: no browser was involved at all. Raw output in
[docs/source-access-results.md](source-access-results.md), appended by each CI run.

These are the same class of datacentre IP that noon refused twenty times out of
twenty. Cult Beauty does not care.

One limit worth stating: all three were Azure, because that is what GitHub
Actions runs on. Vercel is AWS and Railway is GCP. Nothing measured here
suggests they would differ, but nothing measured here proves they don't —
re-run the probe on whichever host is chosen.

Three things make it easy:

1. **No bot challenge.** Cloudflare and Fastly sit in front of it, but neither
   is configured to challenge. A plain `fetch` returns the full page.
2. **It publishes a product sitemap** — 10,588 URLs, regenerated daily, listed
   in `robots.txt`. Discovery is one download, so "what is new since yesterday"
   is a set difference rather than a crawl.
3. **Its offers carry `availability`**, which noon's do not. We can sync stock,
   not just price.

Reproduce with:

```bash
SITE=cultbeauty npm run import:access
```

`robots.txt` permits `/p/` product pages and `/c/` category pages for all
crawlers; only search, sort and facet URLs are disallowed, and the importer
touches none of them. That is a materially better position than noon — but it
is permission to *crawl*, not permission to republish. The copyright position in
[NOON_IMPORT.md](NOON_IMPORT.md) applies here unchanged: the images and copy
belong to Cult Beauty and the brands.

### It ships to Bahrain — but not everything

From their own Bahrain delivery page:

- **Standard** £6.95, 5–15 business days, free over £40
- **Priority** £36, 2–4 business days, free over £150
- **Duties and local taxes are paid by the recipient on arrival**

That last line has to be priced in. This store buys from the supplier *after*
the customer pays, so an unabsorbed duty becomes either a surprise bill at the
customer's door or a loss on the order.

**Seventeen brands cannot be shipped to Bahrain at all** — Charlotte Tilbury,
La Mer, Too Faced, ghd, Paula's Choice, Le Labo, Aveda, Escentric Molecules and
others — nor can any CBD product. Listing one means taking money for something
that cannot be delivered. The importer refuses them at the door
(`canFulfil()` in [the adapter](../scripts/import/sites/cultbeauty.mjs)); the
list is theirs and will drift, so re-read the page on any full re-import.

---

## noon — the hard case

Two connections, two fetch methods, five real product URLs each time. Success
means the page came back **and** carried the JSON-LD `Product` block the
importer reads — a 200 full of bot-challenge HTML is a failure, so the check is
for the data, not the status code.

|                                            | Plain HTTP        | Real browser (Playwright)   |
| ------------------------------------------ | ----------------- | --------------------------- |
| **Residential** (office ISP, Lahore PK)     | dropped mid-request | ✅ **worked** — 717/814 products captured, July 2026 |
| **Datacentre** (GitHub Actions → Azure, US) | 403 × 5           | ❌ 403 × 5 headed, HTTP2 reset × 5 headless |

Raw CI output: `RESULT.md` on the `test/noon-access` branch. Twenty attempts
from the datacentre IP, zero usable responses. Headless vs headed made no
difference from there, which is the finding that settles it — the block is not
about how convincing the client looks. noon sits behind Akamai Bot Manager
(`lb-akamai.noon.com`, `wildcard.noon.com.edgekey.net`).

### The mechanism is a JavaScript challenge, not a TLS fingerprint

An earlier version of this document said Akamai "fingerprints at the TLS/HTTP2
layer". That was wrong, and the difference matters.

`curl_cffi`, which replays Chrome's exact TLS ClientHello, was tested from the
residential connection across four browser profiles: **20 attempts, 20 × 403**.
A perfect TLS handshake is not enough. The 403 body says why:

```
server: AkamaiGHost
set-cookie: bm_s=...                                            ← Bot Manager
<script src="/C7WSBL9wjHg3VaeHMSVB8N7Q/..." defer></script>     ← sensor JS
```

Akamai serves a **sensor script** that must be executed to earn the cookie
proving the client is a browser. No HTTP client can do that however well it
imitates a handshake, so **a real browser is mandatory for noon** — it is not a
cost optimisation that can be traded away, and any residential-proxy budget has
to assume browser-sized traffic.

### Automation tells, measured 27 Aug 2026

Whether the browser also has to *hide* that it is automated is still open, but
the tells are measured (`bot.sannysoft.com`, headed, same machine):

| Approach | `navigator.webdriver` | WebGL vendor | Cores |
| -------- | --------------------- | ------------ | ----- |
| Plain Playwright Chromium | `true` ⚠️ | Google Inc. (Intel) | 8 |
| Real Chrome + persistent profile | `true` ⚠️ | Google Inc. (Intel) | 8 |
| `puppeteer-extra-plugin-stealth` | `false` ✅ | Intel Inc. | 4 |

Two things worth keeping: the stealth plugin genuinely removes the biggest tell,
and **using real Chrome instead of bundled Chromium does not** — CDP sets
`navigator.webdriver` either way unless something patches it.

Note that `navigator.webdriver` was `true` during the July capture that
succeeded, so Akamai was not rejecting on it then.

### ⚠️ The residential connection stopped working, 27 Aug 2026

The row above claiming the office connection works is **no longer
reproducible**. A headed browser — the exact setup that captured 717 products in
July — now gets Akamai's "Access Denied" on noon's *homepage*, on both of this
machine's egress IPs (`59.103.127.14` Cyber Internet, `39.37.188.105` PTCL,
which it alternates between). Six attempts, correlated to the IP each one left
on, zero passes. Plain HTTP escalated further: from `403` to no response at all.

**This measurement is confounded and should not be trusted yet.** Roughly forty
requests were sent to noon in the hour before it, most rejected, which is
exactly the pattern that earns a rate-limit block. It cannot currently be told
apart from a permanent block earned by the July scraping.

Re-test after a day of silence, with **one** attempt rather than forty, before
concluding anything. Until then, treat the free office-machine option for noon
as unproven rather than either working or dead.

#### Solved 31 Aug 2026 — it was never the IP. It was Chrome.

The section below concluded the address was on a list. That was wrong, and one
ten-second check disproved it: **noon loads normally in the operator's own
Chrome**, from the same machine, at the same time our scraper is refused.

So it is not *where* the request comes from. It is *what is making it*:

| Client | Result |
| ------ | ------ |
| Playwright bundled Chromium | 453 bytes · Access Denied |
| Real Chrome binary (`channel: "chrome"`) | 299 bytes · Access Denied |
| rebrowser-playwright (CDP `Runtime.enable` patched) | 453 bytes · Access Denied |
| A human's Chrome | ✅ loads |
| **Camoufox** (patched Firefox) | ✅ **573KB homepage, 2.1MB product page** |

All three failures drive Chrome over **CDP**, and Akamai's sensor reads it.
Note what it is *not*: `navigator.webdriver` was masked in every attempt, and
was `true` during the July capture that worked.

Camoufox is Firefox patched at the C++ level. No Chrome, no CDP, so the entire
detection family misses. It passed on the first attempt, cold, with no warm
session — and our existing adapter parsed the result with **zero changes**:
sku, brand, price, availability, rating, breadcrumb category and the delivery
window, all intact.

Worth stating plainly, because three fixes in a row were wrong before this one:
each of those was a variation of the same tool. The question that broke the
deadlock was "can we use something other than Playwright".

**What this does not change:** datacentre IPs are still refused, measured 20/20
and independently of the browser. noon runs from a machine on a home
connection, not from CI.

**What it was worth.** A ten-product refresh found six of nine prices had moved
since July — Elvive down 50%, NIVEA down 23%, Panthederm **up 24%**. That last
direction is the expensive one: the shop was selling below what noon now
charges.

#### Re-tested 29 Aug 2026 — still blocked, and no longer confounded

Two days of silence, then **one** attempt: headed browser, homepage and one
product page, from `39.37.188.105` (PTCL).

```
homepage   454 bytes · Akamai Access Denied
product    504 bytes · Akamai Access Denied
```

That removes the rate-limit explanation. A block that survives two days of
total silence and answers a single request with 454 bytes is not a cooldown —
it is the IP being on a list. The July scraping earned it.

**So the free office-machine route for noon is closed, not merely unproven.**
noon now needs either rotating residential proxies or a paid scraping API with
its own IP pool; both are recurring costs and a client decision. Its 301 live
products are unaffected — they are already in the catalogue — but they will not
update until one of those is in place.

A note that applies whichever way it lands: a daily crawl is itself the pattern
that gets an IP flagged. Rotating residential proxies exist because any single
address eventually burns.

### What this rules out for noon

- **GitHub Actions** — measured, blocked.
- **Any VPS or cloud VM**, free or paid, self-administered or not — same
  datacentre IP ranges. A deployable probe for Railway specifically is on the
  `test/railway-access` branch; Oracle Free, Render, Hetzner and AWS are the
  same class and not worth testing individually.
- **Dropping the browser** — a JavaScript challenge, not a TLS one, so no HTTP
  client can substitute.

Owning the server changes nothing; noon never sees who owns it, only where the
traffic comes from. **None of this applies to Cult Beauty**, which was measured
working from exactly the datacentre that refuses noon.

### ⚠️ Its delivery window is to Saudi Arabia, not Bahrain

noon states delivery per product, in the JSON-LD we already capture:

```json
"deliveryTime": {
  "handlingTime": { "minValue": 0, "maxValue": 2, "unitCode": "DAY" },
  "transitTime":  { "minValue": 5, "maxValue": 6, "unitCode": "DAY" }
}
```

703 of the 717 parseable products in the July capture carry it, and it varies
per product — 270 are 0–3 days (noon Express), 331 are 5–8, a handful reach
18–21.

**`shippingDestination` is `SA` on every one of them.** That is noon delivering
to a Saudi address. The Saudi→Bahrain leg is on top and noon states it nowhere,
so the stored window is short of the truth by however long that leg takes.

It is recorded as noon gives it, on purpose, until the client says how goods
actually cross. The scope is spelled out in `supplier_dispatch_note`, which
0012 grants to nobody, so staff see the caveat in the admin and customers never
see the raw supplier wording:

```
noon: dispatch 0–2 days + transit 5–6 days, to an address in SA.
Excludes SA→BH, which noon does not state.
```

Five products state dispatch but no transit. They get **no** window rather than
a 0–2 day one — a dispatch time passed off as a delivery time is worse than the
site default. Add the Bahrain leg in `fulfilment` in
[the adapter](../scripts/import/sites/noon.mjs) once the number is known.

---

## How a product is identified

Every product carries the supplier it came from and that supplier's own code
for it: `products.source` and `products.source_sku`, unique together
(migration `0010`). The same pair exists on `staging_products`.

The key is the supplier's code, **not** the URL, and that is the whole point. A
retailer renaming a product changes its URL but never its code — keying on the
URL would make every rename look like a brand-new product and quietly duplicate
the row on the next sync. `source_url` stays for what it is actually for: a
link staff click to buy the item.

That pair is what lets a nightly run answer the only three questions it has:

| Question | Answered by |
| -------- | ----------- |
| Have I seen this before? | a lookup on `(source, source_sku)` |
| Did its price or stock change? | comparing against the row found there |
| Which supplier do I buy it from? | `source` |

Both columns are **staff-only**. Which suppliers we use and their product codes
is the sourcing list — the same commercial secret `source_url` is protected as.
Since migration `0008` dropped the blanket table grant, a new column is private
by default; do not add these to that grant list or to `PUBLIC_PRODUCT_COLUMNS`
in [src/lib/data.ts](../src/lib/data.ts).

The 301 existing products backfill from their `source_url` inside the
migration. Checked against the live database first: all 301 parse, all 301
codes are distinct, and every one matches what the noon adapter's `skuFromUrl`
produces — which matters, because if the two disagreed the first sync would
treat the whole catalogue as new.

## How a source is added

Everything that differs between retailers lives in one adapter under
[`scripts/import/sites/`](../scripts/import/sites/); no other script names a
source. An adapter declares how to reach the site, how to find its products, how
to recognise a product URL, and how to turn one page into a normalised record.

Prices stay in the source's own currency. Converting to BHD is a pricing
decision — an FX rate plus a margin — and it belongs with the other pricing
rules, not scattered through parsers.

Before committing to a host, run the probe **on that host**:

```bash
SITE=<key> npm run import:access
```

Ten minutes of checking beats assuming. This document exists because an earlier
version of that assumption was wrong.

### Categories

The two sources differ in a way that shows why the adapter split was needed:

- **noon** puts the category in every product's breadcrumb. Free.
- **Cult Beauty**'s breadcrumb is the *brand* path, so a product page never
  states its category. The mapping has to be built from the other direction —
  crawl the category pages, record which product ids appear on each:

  ```bash
  SITE=cultbeauty npm run import:categories
  ```

  Written once and reused; aisles do not change daily. A product seen on no
  crawled shelf gets no category and goes to the review queue rather than being
  guessed into the wrong aisle.

Its departments were chosen to line up with noon's — Makeup, Skin Care, Hair
Care, Fragrance, Personal Care — so both sources feed one storefront taxonomy
instead of two parallel ones.

#### Capture from the shelves, not the sitemap

This one is worth stating plainly, because measuring it changed the design.

The obvious pipeline is: discover every product from the sitemap, then look its
category up in the map. Tried that — **only 6 of 39 products came back
categorised**. The reason is arithmetic. Shelves are deep (one fragrance
subcategory alone reports 772 items), the page size is capped at 46 and
`productsPerPage` is ignored, so a shelf crawl covers a fraction of a
10,541-product catalogue. Everything else lands in the review queue.

So capture walks the shelves instead. `map-categories.mjs` records each
product's URL alongside its category, and `capture.mjs` drives straight off that
list:

```bash
DISCOVER=shelves   # default when a map exists — every result is categorised
DISCOVER=sitemap   # the whole catalogue, for change detection
```

Which is the better shape anyway: the store carries selected aisles, not all of
Cult Beauty, so fetching from the aisles it carries means fewer requests *and*
no uncategorised products. The sitemap keeps its job — spotting what is new
across the whole catalogue — and is no longer asked to do one it is bad at.

---

## If a sync runs on an office machine, it needs a heartbeat

This applies to noon, and to Cult Beauty only if it is ever hosted that way.

An office PC fails in ways a cloud host does not: someone reboots it, Windows
Update restarts overnight, the internet drops, a plug gets pulled. None of that
announces itself. Without a heartbeat the store quietly keeps serving last
month's prices and stock, and the first person to notice is a customer ordering
something the supplier no longer sells.

So every run records that it ran, and the admin dashboard shows it — *"Last
synced 2 hours ago · 4 price changes, 1 new product"* — turning a silent failure
into a visible one.

---

## Running the sync

```bash
SITE=cultbeauty npm run sync                  # dry run — reports, writes nothing
SITE=cultbeauty CONFIRM_SYNC=1 npm run sync   # applies
```

Cult Beauty runs itself: `.github/workflows/daily-sync.yml`, 02:20 UTC (05:20
Bahrain), on GitHub Actions. It needs two repository secrets —
`NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

**noon is deliberately not in that workflow.** A job that goes green every
morning while fetching nothing is worse than no job, because the shop then looks
synced. noon needs a browser on a residential connection; run the same command
on the office machine via Task Scheduler.

### What a run will and will not change

| | |
| --- | --- |
| New product upstream | staged `pending`; hidden even after promotion |
| Price moved | **recorded only** — the shop's price is not touched |
| Name, description, images | recorded only |
| Availability changed | recorded only, and called out in the run summary |
| Delivery window moved | **written straight to the live product** |

Price is recorded rather than applied because the prices on the shop are not the
supplier's. noon's came in at SAR×0.1 and staff have corrected them by hand
since — the implied rate across the live catalogue runs 0.048 to 0.133, not a
flat 0.1. A sync that followed the supplier would erase that work nightly, and
would need the markup rule that is still open below.

Delivery is the exception because it is the supplier's own fact about its own
logistics, nobody edits it here, and a stale one is a promise we break.

### Two identity traps, both hit in testing

**jsonb reorders keys.** The adapter writes `{min, max}`; Postgres returns
`{"max":…,"min":…}`. Comparing windows with `JSON.stringify` therefore reported
a delivery change on 58 of 60 unchanged products on the first run — which would
have marked the whole catalogue changed every night and buried the price moves
that matter. Compare values, not serialisations.

**A product's URL id is not its SKU.** Cult Beauty's `/p/…/10449360/` parses to
sku `10302495`, because the adapter picks a variant and the variant carries its
own code; roughly 40% of that catalogue is multi-variant. Classifying by
URL-derived SKU alone meant those products never matched staging, so they looked
new on every run — re-fetched nightly, never diffed for price, and consuming the
whole `NEW_LIMIT` budget forever so real new products were never reached. The
sync indexes staging by **both** URL and SKU, and re-decides new-vs-changed
*after* parsing.

### Rotation, not a full crawl

`NEW_LIMIT` (default 40) caps how many new products one run adopts; the rest
wait for tomorrow. `REFRESH_LIMIT` (default 60, 120 in CI) re-checks known
products **stalest first**, so everything comes round without fetching 3,526
pages nightly at someone else's expense.

---

## Still open (client decisions)

- **Markup rule** — nothing may follow a supplier price automatically without
  one, and it now has to handle two currencies (noon SAR, Cult Beauty GBP) plus
  Cult Beauty's shipping and the duties its customers pay on arrival.
- **Which categories, from which supplier, and a cap** on how many products one
  run may add. Cult Beauty alone offers 10,541 products; the store holds 301.
- **⚠️ The two taxonomies do not meet.** Of the 62 distinct categories in the
  first 177-product Cult Beauty capture, **58 do not exist in our database** —
  only 16 of those 177 products would land in a category that the storefront
  already has. Cult Beauty files by concern (`mature-skin`, `night-time`,
  `active`), noon by product type (`creams-moisturizers`, `treatment-serums`).
  Promoting as-is puts 161 products in no category: reachable from search and
  `/shop`, absent from every category page and the nav. Either the Cult Beauty
  categories get created — roughly tripling the nav — or they get mapped onto
  the existing 28, which is a merchandising decision, not a technical one.
- **New products: auto-publish or review queue?** The staging table and manual
  promote step already exist ([NOON_IMPORT.md](NOON_IMPORT.md)). That document's
  rights and copyright position applies to anything a daily sync brings in, and
  applies *more* sharply when nobody is looking at each row.
- **Variants.** One Cult Beauty URL can sell several sizes at different prices.
  The importer takes the page default and records the count; whether the others
  should become their own products is a merchandising decision.
