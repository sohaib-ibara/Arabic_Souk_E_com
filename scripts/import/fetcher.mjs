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
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { readFileSync, rmSync } from "node:fs";
import { DEFAULT_UA } from "./sites/index.mjs";

/**
 * Camoufox — a patched Firefox, driven through a small Python helper.
 *
 * This is the only transport that gets past noon. Chrome cannot: Playwright's
 * Chromium, the real Chrome binary and rebrowser-patched Chromium were all
 * refused from an IP where a human's Chrome works, because they drive Chrome
 * over CDP and Akamai's sensor reads that. Camoufox is patched at the C++
 * level and is not Chrome, so the whole detection family misses.
 *
 * See camoufox-fetch.py for why this talks over a pipe rather than using
 * Camoufox's own Playwright server (the two Playwright versions are locked
 * together and ours differ).
 */
async function openCamoufox({ headless, settleMs }) {
  const script = new URL("./camoufox-fetch.py", import.meta.url).pathname.replace(
    /^\/([A-Za-z]:)/,
    "$1",
  );
  const proc = spawn("python", [script], {
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      ...(headless ? { CAMOUFOX_HEADLESS: "1" } : {}),
      ...(settleMs ? { CAMOUFOX_SETTLE_MS: String(settleMs) } : {}),
    },
  });

  const lines = createInterface({ input: proc.stdout });
  /* One reply per request, in order — a queue of resolvers is enough. */
  const waiting = [];
  lines.on("line", (line) => {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return; // Camoufox writes progress chatter; ignore anything not JSON
    }
    const next = waiting.shift();
    if (next) next(msg);
  });

  let stderr = "";
  proc.stderr.on("data", (d) => (stderr += d.toString().slice(0, 2000)));

  const reply = () => new Promise((resolve) => waiting.push(resolve));

  // Launching the browser takes a few seconds; a failure here is usually a
  // missing install, so say that rather than timing out mysteriously.
  const ready = await Promise.race([
    reply(),
    new Promise((_, rej) =>
      setTimeout(
        () => rej(new Error(`Camoufox did not start in 120s. ${stderr.slice(-400)}`)),
        120_000,
      ),
    ),
  ]);
  if (!ready?.ready) throw new Error(`Camoufox failed to start: ${stderr.slice(-400)}`);

  return {
    /*
      No Playwright page — the browser lives in the Python process, so nothing
      here can be driven with page.evaluate(). `links` below is the substitute:
      discovery that would have scrolled a page asks the helper to do it.
    */
    page: null,
    async grab(url) {
      proc.stdin.write(url + "\n");
      const msg = await reply();
      if (!msg?.ok) throw new Error(msg?.error ?? "camoufox: no response");
      const html = readFileSync(msg.file, "utf8");
      rmSync(msg.file, { force: true }); // one page at a time; don't accumulate MBs
      return html;
    },
    /**
     * Every href on a listing page, after the helper has scrolled it to the end.
     *
     * This is what lets a Camoufox source discover products it has never seen.
     * Without it noon could only ever refresh the URLs already on file, so a
     * product noon added yesterday would never be found.
     */
    async links(url) {
      proc.stdin.write(`LIST ${url}\n`);
      const msg = await reply();
      if (!msg?.ok) throw new Error(msg?.error ?? "camoufox: no response");
      return Array.isArray(msg.links) ? msg.links : [];
    },
    async close() {
      try {
        proc.stdin.write("QUIT\n");
        proc.stdin.end();
      } catch {
        /* already gone */
      }
      if (ready.dir) rmSync(ready.dir, { recursive: true, force: true });
      proc.kill();
    },
  };
}

export async function openFetcher(site, { headless = false, ua = DEFAULT_UA, settleMs } = {}) {
  if (site.transport === "camoufox") return openCamoufox({ headless, settleMs });

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
