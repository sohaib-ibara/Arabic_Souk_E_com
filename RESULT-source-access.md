## cultbeauty · plain HTTP from a datacentre
Source    : Cult Beauty (UK) (cultbeauty)
Declares  : transport=http, discovery=sitemap
Egress IP : 20.57.206.149 · AS8075 Microsoft Corporation · San Jose, US
  sitemap-product-0.xml.gz → 10588 URLs
  10588 sitemap URLs → 10541 product URLs
Discovery : OK — 5 product URL(s)

### Plain HTTP (no browser) — 5/5 usable

| # | Result | Detail |
| - | ------ | ------ |
| 1 | PASS | HTTP 200, 506996b · 28.8 GBP |
| 2 | PASS | HTTP 200, 531465b · 23.2 GBP |
| 3 | PASS | HTTP 200, 528745b · 23.2 GBP |
| 4 | PASS | HTTP 200, 511355b · 23.2 GBP |
| 5 | PASS | HTTP 200, 559129b · 25.6 GBP |

**Verdict: Plain HTTP works from this IP — no browser needed here. Re-run on the host you intend to use before concluding it works there too.**

## cultbeauty · headless browser from a datacentre
Source    : Cult Beauty (UK) (cultbeauty)
Declares  : transport=http, discovery=sitemap
Egress IP : 20.57.206.149 · AS8075 Microsoft Corporation · San Jose, US
  sitemap-product-0.xml.gz → 10588 URLs
  10588 sitemap URLs → 10541 product URLs
Discovery : OK — 5 product URL(s)

### Plain HTTP (no browser) — 5/5 usable

| # | Result | Detail |
| - | ------ | ------ |
| 1 | PASS | HTTP 200, 506996b · 28.8 GBP |
| 2 | PASS | HTTP 200, 531465b · 23.2 GBP |
| 3 | PASS | HTTP 200, 528745b · 23.2 GBP |
| 4 | PASS | HTTP 200, 511355b · 23.2 GBP |
| 5 | PASS | HTTP 200, 559129b · 25.6 GBP |

### Playwright Chromium (headless) — 5/5 usable

| # | Result | Detail |
| - | ------ | ------ |
| 1 | PASS | HTTP 200 · 28.8 GBP |
| 2 | PASS | HTTP 200 · 23.2 GBP |
| 3 | PASS | HTTP 200 · 23.2 GBP |
| 4 | PASS | HTTP 200 · 23.2 GBP |
| 5 | PASS | HTTP 200 · 25.6 GBP |

**Verdict: Plain HTTP works from this IP — no browser needed here. Re-run on the host you intend to use before concluding it works there too.**
