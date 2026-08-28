/**
 * Fetching a supplier page, by whichever transport its adapter declares.
 *
 * This lives on its own because two commands need it — a full capture and the
 * daily sync — and they have to behave *identically*. The browser flags below
 * are not cosmetic: they are what gets past noon's Akamai challenge, and a copy
 * of them that drifted by one argument would fail in a way that looks like the
 * site changed rather than like our code did.
 *
 *   const net = await openFetcher(site, { headless: false });
 *   const html = await net.grab(url);
 *   await net.close();
 */
import { DEFAULT_UA } from "./sites/index.mjs";

export async function openFetcher(site, { headless = false, ua = DEFAULT_UA } = {}) {
  if (site.transport !== "browser") {
    return {
      page: null,
      async grab(url) {
        const res = await fetch(url, {
          headers: {
            "User-Agent": ua,
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-GB,en;q=0.9",
          },
          signal: AbortSignal.timeout(30_000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      },
      async close() {},
    };
  }

  const { chromium } = await import("playwright");
  /*
    --disable-http2: noon's HTTP/2 stack returns ERR_HTTP2_PROTOCOL_ERROR to
    automation, so we force HTTP/1.1. Headed evades bot checks better than
    headless, which is why it is the default here despite being awkward on a
    scheduled machine.
  */
  const browser = await chromium.launch({
    headless,
    args: ["--disable-http2", "--disable-blink-features=AutomationControlled"],
  });
  const ctx = await browser.newContext({
    userAgent: ua,
    locale: "en-US",
    viewport: { width: 1366, height: 900 },
  });
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });
  const page = await ctx.newPage();
  page.setDefaultNavigationTimeout(45_000);

  return {
    page,
    async grab(url) {
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1800);
      return page.content();
    },
    async close() {
      await browser.close();
    },
  };
}

/** Run `worker` over `items`, `n` at a time, pausing `delayMs` between each. */
export async function pooled(items, n, delayMs, worker) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  if (n <= 1) {
    for (const item of items) {
      await worker(item);
      await sleep(delayMs);
    }
    return;
  }
  const queue = [...items];
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (queue.length) {
        await worker(queue.shift());
        await sleep(delayMs);
      }
    }),
  );
}
