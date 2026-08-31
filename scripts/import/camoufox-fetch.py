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
    ← stdin   a URL, or the word QUIT
    → stdout  {"ok": true, "file": "...", "bytes": N}
              {"ok": false, "error": "..."}

The HTML goes to a file rather than down the pipe: a noon product page is over
2MB, and pushing that through a line-delimited stream invites buffering bugs
for no benefit.

Env:
  CAMOUFOX_HEADLESS=1   run headless (default headed — headed is what was proven)
  CAMOUFOX_SETTLE_MS    ms to wait after domcontentloaded (default 6000)
"""

import json
import os
import sys
import tempfile
import time

from camoufox.sync_api import Camoufox

HEADLESS = os.environ.get("CAMOUFOX_HEADLESS") == "1"
SETTLE_MS = int(os.environ.get("CAMOUFOX_SETTLE_MS", "6000"))


# Windows defaults stdout to cp1252, which raises on any character outside it.
# json.dumps escapes non-ASCII by default so the protocol itself is safe, but a
# stray print or traceback would kill the helper mid-run for no good reason.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")


def emit(obj):
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()


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
