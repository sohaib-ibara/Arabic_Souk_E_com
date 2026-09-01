"""
Fetch pages with Camoufox, driven line-by-line from Node.

WHY THIS EXISTS
Every Chrome-based approach we tried is refused by noon: Playwright's bundled
Chromium, the real Chrome binary, and rebrowser-patched Chromium — all from an
IP where a human's Chrome loads the site fine. They share one thing, CDP, and
that is what Akamai's sensor catches. Camoufox is Firefox patched at the C++
level, so none of that applies. It passed first try.

WHY A SUBPROCESS RATHER THAN camoufox's PLAYWRIGHT SERVER
Camoufox ships `python -m camoufox server`, which is the obvious route. It does
not work here: Playwright's client and server are version-locked, Python has
1.60 and Node has 1.61, and connecting gives `ws disconnected code=1006`.
Pinning the two together would mean this pipeline could not upgrade either
without the other. Talking over stdin/stdout costs nothing and decouples them.

PROTOCOL — one JSON object per line, both directions.
    → stdout  {"ready": true, "dir": "..."}      once, when the browser is up
    ← stdin   a URL, or "LIST <url>", or the word QUIT
    → stdout  {"ok": true, "file": "...", "bytes": N}          for a URL
              {"ok": true, "links": [...], "scrolls": N}       for LIST
              {"ok": false, "error": "..."}

The HTML goes to a file rather than down the pipe: a noon product page is over
2MB, and pushing that through a line-delimited stream invites buffering bugs
for no benefit.

LIST exists because noon publishes no product sitemap. Finding a product noon
has just added means scrolling a category page the way a shopper would, and
only this process has a browser noon will talk to. Without it the sync can
refresh what we already hold but can never grow — which is not what was asked
for.

Env:
  CAMOUFOX_HEADLESS=1   run headless (default headed — headed is what was proven)
  CAMOUFOX_SETTLE_MS    ms to wait after domcontentloaded (default 6000)
  CAMOUFOX_MAX_SCROLLS  scroll steps per listing page (default 40)
  CAMOUFOX_SCROLL_MS    pause between scroll steps (default 700)
  CAMOUFOX_MIN_LINKS    below this a listing is retried once (default 20)
"""

import json
import os
import sys
import tempfile
import time

from camoufox.sync_api import Camoufox

HEADLESS = os.environ.get("CAMOUFOX_HEADLESS") == "1"
SETTLE_MS = int(os.environ.get("CAMOUFOX_SETTLE_MS", "6000"))
MAX_SCROLLS = int(os.environ.get("CAMOUFOX_MAX_SCROLLS", "40"))
SCROLL_MS = int(os.environ.get("CAMOUFOX_SCROLL_MS", "700"))
# Below this, a listing page is assumed to be a challenge rather than a grid.
MIN_LINKS = int(os.environ.get("CAMOUFOX_MIN_LINKS", "20"))
# How many settle waits to allow before giving up on the challenge clearing.
SETTLE_TRIES = int(os.environ.get("CAMOUFOX_SETTLE_TRIES", "6"))


# Windows defaults stdout to cp1252, which raises on any character outside it.
# json.dumps escapes non-ASCII by default so the protocol itself is safe, but a
# stray print or traceback would kill the helper mid-run for no good reason.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")


def emit(obj):
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()


def _hrefs(page):
    """
    Every href on the page, or nothing if the DOM went away mid-read.

    Akamai's interstitial redirects to the real page while we are querying it,
    which kills the execution context and raises. That is a normal step in
    getting through, not an error worth reporting, so it reads as "no links
    yet" and the caller tries again.
    """
    try:
        found = page.eval_on_selector_all("a[href]", "els => els.map(e => e.href)")
    except Exception:  # noqa: BLE001 — navigation mid-eval; see above
        return []
    return [h for h in found if h]


def _settle(page):
    """
    Wait for a listing page to become a listing page.

    On a cold session the first thing served is the bot challenge, whose only
    link is akamai.com/privacy. It clears on its own within a few seconds and
    redirects; until it does there is nothing worth scrolling. Polling for real
    links is more reliable than any fixed sleep, because the wait is however
    long the challenge takes rather than however long we guessed.
    """
    for _ in range(SETTLE_TRIES):
        if len(_hrefs(page)) >= MIN_LINKS:
            return True
        time.sleep(SETTLE_MS / 1000)
    return False


def _scroll_and_collect(page):
    """One pass: scroll to the end, gathering hrefs as the grid fills."""
    seen = set()
    stalls = 0
    scrolls = 0
    for _ in range(MAX_SCROLLS):
        before = len(seen)
        seen.update(_hrefs(page))
        scrolls += 1
        if len(seen) == before:
            stalls += 1
            if stalls >= 3:
                break
        else:
            stalls = 0
        try:
            page.evaluate("window.scrollBy(0, window.innerHeight * 1.5)")
        except Exception:  # noqa: BLE001 — same navigation race as _hrefs
            pass
        time.sleep(SCROLL_MS / 1000)

    seen.update(_hrefs(page))
    return sorted(seen), scrolls


def collect_links(page, url):
    """
    Every href on a listing page, after scrolling it to the end.

    noon's grid loads lazily, so a single snapshot returns the first screenful
    and nothing else. Scrolling stops when three consecutive steps add no new
    links rather than after a fixed count: a short category should not cost
    forty scrolls, and a long one should not be truncated at some guess.

    Getting past the challenge is the hard part, and it is why _settle exists.
    Measured on a cold session: one href, akamai.com/privacy. After a single
    product page had been fetched in the same session, the same URL gave 885
    hrefs and 74 products. So a near-empty result means "not through yet", and
    the reload below is the second attempt at the same question.
    """
    page.goto(url, wait_until="domcontentloaded")
    time.sleep(SETTLE_MS / 1000)
    _settle(page)

    links, scrolls = _scroll_and_collect(page)

    if len(links) < MIN_LINKS:
        page.reload(wait_until="domcontentloaded")
        time.sleep(SETTLE_MS / 1000)
        _settle(page)
        again, more = _scroll_and_collect(page)
        if len(again) > len(links):
            links, scrolls = again, scrolls + more

    return links, scrolls


def main():
    out_dir = tempfile.mkdtemp(prefix="camoufox-html-")
    n = 0

    # humanize adds human-like cursor movement between actions; os= keeps the
    # spoofed platform coherent with the user agent and font stack. Both are
    # part of what made the first attempt pass, so neither is decoration.
    with Camoufox(headless=HEADLESS, humanize=True, os="windows", locale="en-US") as browser:
        page = browser.new_page()
        page.set_default_navigation_timeout(60000)
        emit({"ready": True, "dir": out_dir})

        for line in sys.stdin:
            url = line.strip()
            if not url or url == "QUIT":
                break
            try:
                if url.startswith("LIST "):
                    links, scrolls = collect_links(page, url[5:].strip())
                    emit({"ok": True, "links": links, "scrolls": scrolls})
                    continue
                page.goto(url, wait_until="domcontentloaded")
                # The JSON-LD is server-rendered, but the sensor script wants a
                # moment to run and the page to settle before content() is a
                # faithful snapshot.
                time.sleep(SETTLE_MS / 1000)
                html = page.content()
                n += 1
                path = os.path.join(out_dir, f"{n}.html")
                with open(path, "w", encoding="utf-8") as fh:
                    fh.write(html)
                emit({"ok": True, "file": path, "bytes": len(html)})
            except Exception as exc:  # noqa: BLE001 — the caller decides what a failure means
                emit({"ok": False, "error": str(exc)[:200]})


if __name__ == "__main__":
    main()
