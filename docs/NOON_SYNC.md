# Daily noon sync — where it can run

The client wants the catalogue to track noon automatically: new products appear,
and changes to products we already hold (price, availability) follow. This
records **where that job can run**, because the answer is not obvious and it was
decided by measurement rather than by argument.

The short version: **noon blocks on IP reputation. A real browser only helps from
a residential connection. Nothing hosted in a datacentre gets through.**

## What was measured

Two connections, two fetch methods, five real product URLs from our own
catalogue each time. Success means the page came back **and** carried the JSON-LD
`Product` block the importer reads — a 200 full of bot-challenge HTML is a
failure, so [`noon-access-test.mjs`](../scripts/import/noon-access-test.mjs)
checks for the data, not the status code.

|                                            | Plain HTTP        | Real browser (Playwright)   |
| ------------------------------------------ | ----------------- | --------------------------- |
| **Residential** (office ISP, Lahore PK)     | dropped mid-request | ✅ **works** — 717/814 products captured, July 2026 |
| **Datacentre** (GitHub Actions → Azure, US) | 403 × 5           | ❌ 403 × 5 headed, HTTP2 reset × 5 headless |

Raw CI output: `RESULT.md` on the `test/noon-access` branch, written by
[`.github/workflows/noon-access-test.yml`](../.github/workflows/noon-access-test.yml).
Twenty attempts from the datacentre IP, zero usable responses.

Headless vs headed made no difference from the datacentre, which is the finding
that settles it — the block is not about how convincing the client looks. noon
sits behind Akamai Bot Manager (`lb-akamai.noon.com`, `wildcard.noon.com.edgekey.net`),
which fingerprints at the TLS/HTTP2 layer and decides before the request is served.

## What this rules out

- **GitHub Actions** — measured, blocked.
- **Any VPS or cloud VM**, free or paid, self-administered or not — same
  datacentre IP ranges. Oracle Free, Railway, Render, Hetzner, AWS: not worth
  testing individually.
- **Dropping the browser** — plain HTTP fails on both connections.

Owning the server changes nothing; noon never sees who owns it, only where the
traffic comes from.

## What remains

1. **A machine on the office connection.** Free, and already proven — it is how
   the current 301 products were captured. An always-on PC runs
   [`browser-noon.mjs`](../scripts/import/browser-noon.mjs) on a nightly
   scheduled task and writes results up to Supabase. Outbound only: no ports
   opened, no public IP, nothing exposed. The site stays on Vercel; only the
   fetch step is local.
2. **A scraping service on its residential-proxy tier.** Paid, and it must be the
   residential tier — the cheap datacentre tier is exactly what was measured
   failing. Price a free trial before quoting the client.

Option 1 first. If it proves unreliable, switching costs no application code:
change detection, staging, review and publishing are all provider-independent, so
only the fetch step differs.

Before committing to a specific machine, re-run the probe **on that machine** —
our proof came from one particular connection, and ten minutes of checking beats
assuming.

```bash
LIMIT=5 node scripts/import/noon-access-test.mjs      # add HEADED=1 for a visible window
```

## If it runs on an office machine, it needs a heartbeat

An office PC fails in ways a cloud host does not: someone reboots it, Windows
Update restarts overnight, the internet drops, a plug gets pulled. None of that
announces itself. Without a heartbeat the store quietly keeps serving last
month's prices and stock, and the first person to notice is a customer ordering
something noon no longer sells.

So every run records that it ran, and the admin dashboard shows it — *"Last
synced 2 hours ago · 4 price changes, 1 new product"* — turning a silent failure
into a visible one.

## Still open (client decisions)

- **Markup rule** — nothing may follow a noon price automatically without one.
  Prices there are SAR on the `saudi-en` site; the store sells in BHD.
- **New products: auto-publish or review queue?** The staging table and manual
  promote step already exist ([NOON_IMPORT.md](NOON_IMPORT.md)); the rights and
  copyright position in that document applies unchanged to anything a daily sync
  brings in, and applies *more* sharply when nobody is looking at each row.
- **Which categories, and a cap** on how many products a single run may add.
