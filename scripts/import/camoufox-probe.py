"""
Does Camoufox get past noon from THIS machine?

Diagnostic only — two page loads, nothing written, nothing published. Its whole
job is to answer one question that decides where the noon sync can live.

Camoufox is measured working from a home connection. Datacentre IPs were
measured refused 20/20 — but every one of those attempts used a Chrome-based
client, and Chrome is refused from the home connection too. So the combination
that matters, Camoufox from a datacentre, has never actually been tried. If it
passes, noon automates in CI exactly like Cult Beauty. If it does not, noon
stays on a machine with a home connection.

On Linux CI there is no display, so headless="virtual" runs a real headed
browser inside Xvfb. Plain headless is a detectable state of its own and would
confound the result.

Env: HEADLESS=virtual|1|0  (default: virtual on Linux, 0 elsewhere)
"""

import os
import re
import sys
import time
import urllib.request

from camoufox.sync_api import Camoufox

DENY = re.compile(r"Access Denied|Reference #|errors\.edgesuite", re.I)

PAGES = [
    ("homepage", "https://www.noon.com/saudi-en/"),
    ("product", "https://www.noon.com/saudi-en/backstage-makeup-set-gift-set-pink/N70145873V/p/"),
]

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


def egress_ip():
    try:
        with urllib.request.urlopen("https://api.ipify.org?format=json", timeout=15) as r:
            return r.read().decode().strip()
    except Exception:  # noqa: BLE001 — a probe that cannot name its IP is still useful
        return "unknown"


def main():
    raw = os.environ.get("HEADLESS", "virtual" if sys.platform.startswith("linux") else "0")
    headless = "virtual" if raw == "virtual" else raw == "1"

    print(f"Egress   : {egress_ip()}")
    print(f"Headless : {headless!r}")
    print(f"Platform : {sys.platform}\n")

    passed = 0
    with Camoufox(headless=headless, humanize=True, os="windows", locale="en-US") as browser:
        page = browser.new_page()
        page.set_default_navigation_timeout(60000)
        for label, url in PAGES:
            try:
                page.goto(url, wait_until="domcontentloaded")
                time.sleep(6)
                html = page.content()
                denied = bool(DENY.search(html))
                has_ld = "application/ld+json" in html
                ok = (not denied) and has_ld
                passed += ok
                verdict = "DENIED" if denied else ("PASSED" if has_ld else "no JSON-LD")
                print(f"{label:<10}{len(html):>9} bytes   {verdict}")
            except Exception as exc:  # noqa: BLE001
                print(f"{label:<10}    error   {str(exc)[:90]}")
            time.sleep(6)

    print()
    if passed == len(PAGES):
        print("VERDICT: Camoufox reaches noon from this machine.")
        print("         If this ran in CI, the noon sync can be automated there.")
    else:
        print(f"VERDICT: blocked here ({passed}/{len(PAGES)} passed).")
        print("         noon must run from a machine on a residential connection.")
    # Non-zero on failure so a CI job reflects the answer in its status.
    sys.exit(0 if passed == len(PAGES) else 1)


if __name__ == "__main__":
    main()
