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
sits behind Akamai Bot Manager (`lb-akamai.noon.com`, `wildcard.noon.com.edgekey.net`).

### Correction, 27 Aug 2026 — the mechanism is a JavaScript challenge

This document previously said Akamai "fingerprints at the TLS/HTTP2 layer".
That was wrong, and the difference matters.

`curl_cffi`, which replays Chrome's exact TLS ClientHello, was tested from the
residential connection across four browser profiles: **20 attempts, 20 × 403**.
A perfect TLS fingerprint is not enough. The 403 body says why:

```
server: AkamaiGHost
set-cookie: bm_s=...                        ← Bot Manager
<script src="/C7WSBL9wjHg3VaeHMSVB8N7Q/..." defer></script>   ← sensor JS
```

Akamai serves a **sensor script** that must be executed to earn the cookie
proving the client is a browser. No HTTP client can do that however well it
imitates a handshake, so **a real browser is mandatory** — it is not a cost
optimisation that can be traded away, and any residential-proxy budget has to
assume browser-sized traffic.

### Automation tells, measured 27 Aug 2026

Whether the browser also has to *hide* that it is automated is still open, but
the tells are now measured (`bot.sannysoft.com`, headed, same machine):

| Approach | `navigator.webdriver` | WebGL vendor | Cores |
| -------- | --------------------- | ------------ | ----- |
| Plain Playwright Chromium | `true` ⚠️ | Google Inc. (Intel) | 8 |
| Real Chrome + persistent profile | `true` ⚠️ | Google Inc. (Intel) | 8 |
| `puppeteer-extra-plugin-stealth` | `false` ✅ | Intel Inc. | 4 |

Two things worth keeping: the stealth plugin genuinely removes the biggest
tell, and **using real Chrome instead of bundled Chromium does not** — CDP sets
`navigator.webdriver` either way unless something patches it.

Note that `navigator.webdriver` was `true` during the July capture that
succeeded, so Akamai was not rejecting on it then.

## ⚠️ The residential connection stopped working, 27 Aug 2026

The row above claiming the office connection works is **no longer reproducible**.
A headed browser — the exact setup that captured 717 products in July — now gets
Akamai's "Access Denied" on noon's *homepage*, on both of this machine's two
egress IPs (`59.103.127.14` Cyber Internet, `39.37.188.105` PTCL, which it
alternates between). Six attempts, correlated to the IP each one left on, zero
passes. Plain HTTP escalated further: from `403` to no response at all.

**This measurement is confounded and should not be trusted yet.** Roughly forty
requests were sent to noon in the hour before it, most of them rejected, which
is exactly the pattern that earns a rate-limit block. It cannot currently be
told apart from a permanent block earned by the July scraping.

Re-test after a day of silence, with **one** attempt rather than forty, before
concluding anything. Until then, treat the free office-machine option as
unproven rather than either working or dead.

A note that applies whichever way it lands: a daily crawl is itself the pattern
that gets an IP flagged. Rotating residential proxies exist because any single
address eventually burns.

## What this rules out

- **GitHub Actions** — measured, blocked.
- **Any VPS or cloud VM**, free or paid, self-administered or not — same
  datacentre IP ranges. A deployable probe for Railway specifically is on the
  `test/railway-access` branch; Oracle Free, Render, Hetzner and AWS are the
  same class and not worth testing individually.
- **Dropping the browser** — not a TLS problem but a JavaScript challenge, so
  no HTTP client can substitute. See the correction above.

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
