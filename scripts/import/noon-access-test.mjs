/**
 * Does noon answer from a datacentre IP?
 *
 * A diagnostic, not an import — it fetches ten product pages we already hold
 * and reports whether each method got usable data back. Nothing is written
 * anywhere and nothing is published.
 *
 * We already know two things from testing on a residential connection:
 * a real browser works, and plain HTTP is dropped mid-request. What we don't
 * know is whether that holds on a datacentre IP such as a CI runner or a VPS —
 * which is the difference between free hosting and a paid scraping service.
 *
 *   HEADED=1  run Chromium headed (needs xvfb-run on Linux)
 *   LIMIT=n   how many URLs to try (default 10)
 *
 * Success means the page came back AND carried the JSON-LD product block the
 * importer reads. A 200 full of bot-challenge HTML is a failure, so the check
 * is for the data, not the status code.
 */
import { chromium } from "playwright";

const HEADED = process.env.HEADED === "1";
const LIMIT = Number(process.env.LIMIT || 10);
const NAV_TIMEOUT = 30_000;

const URLS = [
  "https://www.noon.com/saudi-en/trenz-double-ended-foundation-brush-t06/Z5BBD445F74C71C77388AZ/p/",
  "https://www.noon.com/saudi-en/whitening-and-fade-spots-skin-care-set-of-4-pieces-night-cream-day-cream-lightening-lotion-whitening-serum-50-50-50-80grams/N70049153V/p/",
  "https://www.noon.com/saudi-en/absolut-repair-shampoo-300ml/N53449216A/p/",
  "https://www.noon.com/saudi-en/backstage-makeup-set-gift-set-pink/N70145873V/p/",
  "https://www.noon.com/saudi-en/make-up-fixing-spray-clear/N53367356A/p/",
].slice(0, LIMIT);

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

/** The importer needs this block; anything else is a page we can't use. */
const hasProductData = (html) =>
  html.includes("application/ld+json") && /"@type"\s*:\s*"Product"/.test(html);

async function egressIp() {
  try {
    const r = await fetch("https://api.ipify.org?format=json", { signal: AbortSignal.timeout(10_000) });
    const { ip } = await r.json();
    const info = await (
      await fetch(`https://ipinfo.io/${ip}/json`, { signal: AbortSignal.timeout(10_000) })
    ).json();
    return `${ip} · ${info.org ?? "?"} · ${info.city ?? "?"}, ${info.country ?? "?"}`;
  } catch {
    return "(could not determine)";
  }
}

async function viaPlainHttp(url) {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(NAV_TIMEOUT),
    });
    const html = await res.text();
    return { ok: res.ok && hasProductData(html), detail: `HTTP ${res.status}, ${html.length}b` };
  } catch (e) {
    return { ok: false, detail: (e?.name === "TimeoutError" ? "timeout / dropped" : String(e?.message ?? e)).slice(0, 40) };
  }
}

async function viaBrowser(page, url) {
  try {
    const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
    // Give any client-side rendering a moment before judging the page.
    await page.waitForTimeout(1500);
    const html = await page.content();
    return { ok: hasProductData(html), detail: `HTTP ${res?.status() ?? "?"}, ${html.length}b` };
  } catch (e) {
    return { ok: false, detail: String(e?.message ?? e).split("\n")[0].slice(0, 40) };
  }
}

function table(title, rows) {
  const pass = rows.filter((r) => r.ok).length;
  const lines = [
    "",
    `### ${title} — ${pass}/${rows.length} usable`,
    "",
    "| # | Result | Detail |",
    "| - | ------ | ------ |",
    ...rows.map((r, i) => `| ${i + 1} | ${r.ok ? "PASS" : "FAIL"} | ${r.detail} |`),
  ];
  return lines.join("\n");
}

const out = [];
const log = (s) => {
  console.log(s);
  out.push(s);
};

log(`Egress IP : ${await egressIp()}`);
log(`Mode      : ${HEADED ? "headed (xvfb)" : "headless"}`);
log(`URLs      : ${URLS.length}`);

/* ---- 1. plain HTTP, no browser ---- */
const plain = [];
for (const u of URLS) plain.push(await viaPlainHttp(u));
log(table("Plain HTTP (no browser)", plain));

/* ---- 2. real browser ---- */
const browser = await chromium.launch({ headless: !HEADED });
const context = await browser.newContext({
  userAgent: UA,
  locale: "en-US",
  viewport: { width: 1366, height: 900 },
});
const page = await context.newPage();
const browsed = [];
for (const u of URLS) {
  browsed.push(await viaBrowser(page, u));
  await page.waitForTimeout(1500); // same politeness delay as the importer
}
await browser.close();
log(table(`Playwright Chromium (${HEADED ? "headed" : "headless"})`, browsed));

const verdict =
  browsed.filter((r) => r.ok).length > 0
    ? "Browser works from this IP — CI/VPS hosting is viable."
    : plain.filter((r) => r.ok).length > 0
      ? "Plain HTTP works but the browser didn't — unexpected, worth a re-run."
      : "Blocked from this IP. Needs a residential connection or a scraping service.";
log(`\n**Verdict: ${verdict}**`);

// Surface the same tables on the run's summary page, not just in the log.
if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFileSync } = await import("node:fs");
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, out.join("\n") + "\n");
}
