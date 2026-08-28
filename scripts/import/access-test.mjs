/**
 * Can we reach a source from *this* machine, and by which route?
 *
 * A diagnostic, not an import — nothing is written and nothing is published.
 * It answers the question that decides the hosting bill: does this site need a
 * real browser on a residential connection (noon), or will a plain HTTP fetch
 * from any datacentre do (measured true for Cult Beauty on 27 Aug 2026)?
 *
 * The two are worth thousands of pounds a year apart, so it is measured on the
 * machine in question rather than assumed. Run it before committing to a host.
 *
 *   SITE=cultbeauty node scripts/import/access-test.mjs
 *   SITE=noon HEADED=1 node scripts/import/access-test.mjs   # xvfb-run on Linux
 *
 * Env: SITE (required), LIMIT (default 5), HEADED, SKIP_BROWSER
 *
 * Success means the page came back AND parsed into a usable product record. A
 * 200 full of bot-challenge HTML is a failure, so the check is the data, not
 * the status code.
 */
import { DEFAULT_UA, getSite, toPage } from "./sites/index.mjs";
import { discoverProducts } from "./discover.mjs";

const SITE = process.env.SITE;
const LIMIT = Number(process.env.LIMIT || 5);
const HEADED = process.env.HEADED === "1";
const SKIP_BROWSER = process.env.SKIP_BROWSER === "1";
const NAV_TIMEOUT = 30_000;

if (!SITE) {
  console.error("Set SITE=<key>. Known: noon, cultbeauty");
  process.exit(2);
}
const site = getSite(SITE);

const out = [];
const log = (s) => {
  console.log(s);
  out.push(s);
};

async function egressIp() {
  try {
    const { ip } = await (
      await fetch("https://api.ipify.org?format=json", { signal: AbortSignal.timeout(10_000) })
    ).json();
    const info = await (
      await fetch(`https://ipinfo.io/${ip}/json`, { signal: AbortSignal.timeout(10_000) })
    ).json();
    return `${ip} · ${info.org ?? "?"} · ${info.city ?? "?"}, ${info.country ?? "?"}`;
  } catch {
    return "(could not determine)";
  }
}

/** Usable = parsed into a record with a name and a price. */
const usable = (record) => Boolean(record?.name && record.price > 0);

async function viaPlainHttp(url) {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": DEFAULT_UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-GB,en;q=0.9",
      },
      signal: AbortSignal.timeout(NAV_TIMEOUT),
    });
    const html = await res.text();
    const record = site.parse(toPage({ url, html }));
    return {
      ok: res.ok && usable(record),
      detail: `HTTP ${res.status}, ${html.length}b${record ? ` · ${record.price} ${record.currency}` : " · no product data"}`,
    };
  } catch (e) {
    return {
      ok: false,
      detail: (e?.name === "TimeoutError" ? "timeout / dropped" : String(e?.message ?? e)).slice(0, 45),
    };
  }
}

async function viaBrowser(page, url) {
  try {
    const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
    await page.waitForTimeout(1500); // let any client-side rendering settle
    const record = site.parse(toPage({ url, html: await page.content() }));
    return {
      ok: usable(record),
      detail: `HTTP ${res?.status() ?? "?"}${record ? ` · ${record.price} ${record.currency}` : " · no product data"}`,
    };
  } catch (e) {
    return { ok: false, detail: String(e?.message ?? e).split("\n")[0].slice(0, 45) };
  }
}

function table(title, rows) {
  const pass = rows.filter((r) => r.ok).length;
  return [
    "",
    `### ${title} — ${pass}/${rows.length} usable`,
    "",
    "| # | Result | Detail |",
    "| - | ------ | ------ |",
    ...rows.map((r, i) => `| ${i + 1} | ${r.ok ? "PASS" : "FAIL"} | ${r.detail} |`),
  ].join("\n");
}

log(`Source    : ${site.label} (${site.key})`);
log(`Declares  : transport=${site.transport}, discovery=${site.discover.kind}`);
log(`Egress IP : ${await egressIp()}`);

/* ---- Discovery is itself part of the test: a blocked sitemap is a blocker. ---- */
let urls = [];
try {
  urls = await discoverProducts(site, { max: LIMIT, log });
  log(`Discovery : OK — ${urls.length} product URL(s)`);
} catch (e) {
  log(`Discovery : FAILED — ${e.message}`);
}

if (!urls.length) {
  log("\n**Verdict: could not discover any product URLs from this IP.**");
} else {
  const plain = [];
  for (const u of urls) plain.push(await viaPlainHttp(u));
  log(table("Plain HTTP (no browser)", plain));

  let browsed = null;
  if (!SKIP_BROWSER) {
    try {
      const { chromium } = await import("playwright");
      const browser = await chromium.launch({ headless: !HEADED });
      const ctx = await browser.newContext({
        userAgent: DEFAULT_UA,
        locale: "en-GB",
        viewport: { width: 1366, height: 900 },
      });
      const page = await ctx.newPage();
      browsed = [];
      for (const u of urls) {
        browsed.push(await viaBrowser(page, u));
        await page.waitForTimeout(1500); // the importer's politeness delay
      }
      await browser.close();
      log(table(`Playwright Chromium (${HEADED ? "headed" : "headless"})`, browsed));
    } catch (e) {
      log(`\nBrowser run skipped — ${String(e.message).split("\n")[0]}`);
    }
  }

  const httpOk = plain.filter((r) => r.ok).length;
  const browserOk = browsed?.filter((r) => r.ok).length ?? 0;
  const verdict = httpOk
    ? "Plain HTTP works from this IP — no browser needed here. Re-run on the host you intend to use before concluding it works there too."
    : browserOk
      ? "Needs a real browser from this IP, but a browser works — hostable here, at browser cost."
      : "Blocked from this IP. Needs a residential connection or a scraping service.";
  log(`\n**Verdict: ${verdict}**`);
}

// Surface the tables on the CI summary page, not just in the log.
if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFileSync } = await import("node:fs");
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, out.join("\n") + "\n");
}
