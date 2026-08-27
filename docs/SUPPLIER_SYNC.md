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
| **noon** | ✅ yes, mandatory | ❌ no — blocked | A machine on a residential connection, or a paid scraping service. |

They are not the same problem and should not get the same solution.

---

## Cult Beauty — the easy case

Measured 27 Aug 2026, twice: from the office connection in Lahore, and from a
GitHub Actions runner on a Microsoft Azure IP (`20.57.206.149`, AS8075, San
Jose). Both **5/5 usable product pages over plain HTTP with no browser at all**,
and the browser run passed 5/5 as well.

That Azure result is the one that matters. It is the same class of datacentre IP
that noon refused twenty times out of twenty. Cult Beauty does not care.

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

---

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

## Still open (client decisions)

- **Markup rule** — nothing may follow a supplier price automatically without
  one, and it now has to handle two currencies (noon SAR, Cult Beauty GBP) plus
  Cult Beauty's shipping and the duties its customers pay on arrival.
- **Which categories, from which supplier, and a cap** on how many products one
  run may add. Cult Beauty alone offers 10,541 products; the store holds 301.
- **New products: auto-publish or review queue?** The staging table and manual
  promote step already exist ([NOON_IMPORT.md](NOON_IMPORT.md)). That document's
  rights and copyright position applies to anything a daily sync brings in, and
  applies *more* sharply when nobody is looking at each row.
- **Variants.** One Cult Beauty URL can sell several sizes at different prices.
  The importer takes the page default and records the count; whether the others
  should become their own products is a merchandising decision.
