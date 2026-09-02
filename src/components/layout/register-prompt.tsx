"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCart } from "@/components/cart/cart-provider";
import { useNudgeSlot } from "@/lib/nudge-queue";
import { CloseIcon } from "@/components/ui/icons";
import { siteConfig } from "@/lib/config";

/**
 * Invites a guest to create an account, once, after they've shown interest.
 *
 * The client wants customer records even though checkout works without one. The
 * risk in that is obvious — a popup asking for a password is the fastest way to
 * lose a shopper — so every rule here exists to make it appear at most once to
 * someone who is already engaged, and never again if they say no.
 *
 * When it will NOT appear:
 *   · to anyone signed in
 *   · anywhere under /checkout, /login, /register or /account — mid-payment or
 *     already-registering are the two worst possible moments to ask
 *   · while the cart drawer is open, so it can't land on top of it
 *   · within DISMISS_DAYS of being dismissed
 *   · more than once in a session, however long the visit
 *   · before the visitor has read two pages AND spent ENGAGE_MS on the site —
 *     an immediate popup interrupts a first impression rather than building on
 *     one, and asks before there is any reason to say yes
 *
 * The email is handed to /register prefilled, with `next` set to the page they
 * were on, so accepting costs one field and returns them where they left off.
 */

/** localStorage; survives the tab closing, which a sessionStorage flag would not. */
const KEY = "as_register_prompt";
/** sessionStorage: per tab, and reset when the visit ends. */
const VIEWS_KEY = "as_pageviews";
const SHOWN_KEY = "as_register_prompt_shown";
const START_KEY = "as_visit_started";
/**
 * `?signup-preview=1` shows it immediately, ignoring every gate.
 *
 * The gates are what make this bearable to a real shopper, and they also make
 * it near-impossible to demonstrate — you cannot show a client a popup that
 * requires two pages, thirty-five seconds and a fortnight since the last
 * dismissal. This is the way to look at it on demand. It only ever opens a
 * dialog the visitor can close, so there is nothing to abuse.
 */
const PREVIEW_PARAM = "signup-preview";
const DISMISS_DAYS = 14;
const ENGAGE_MS = 35_000;
const MIN_PAGE_VIEWS = 2;

const SUPPRESSED = ["/checkout", "/login", "/register", "/account"];

type Stored = { dismissedAt?: number };

/**
 * Pages seen this visit.
 *
 * In sessionStorage rather than a ref, because a ref only survives client-side
 * navigation. Opening a product page in a new tab, or any full page load,
 * remounts the app and resets it — so a visitor browsing that way stayed on
 * "1 page" forever and the prompt could never fire. Measured: it never fired.
 */
function bumpPageViews(): number {
  try {
    const n = Number(window.sessionStorage.getItem(VIEWS_KEY) ?? "0") + 1;
    window.sessionStorage.setItem(VIEWS_KEY, String(n));
    return n;
  } catch {
    return 1;
  }
}

const readPageViews = (): number => {
  try {
    return Number(window.sessionStorage.getItem(VIEWS_KEY) ?? "0");
  } catch {
    return 0;
  }
};

/**
 * Milliseconds since this visit began, across page loads and navigations.
 *
 * Time has to accumulate over the visit rather than per page. Measuring it per
 * page meant a single timer, set on first load, firing while the visitor was
 * still on page one — it failed the two-page check and, because navigating
 * doesn't change the effect's dependencies, no replacement was ever scheduled.
 * Anyone who read the homepage for more than 35 seconds before clicking could
 * never see the prompt at all.
 */
function visitElapsedMs(): number {
  try {
    const started = Number(window.sessionStorage.getItem(START_KEY) ?? "0");
    if (!started) {
      window.sessionStorage.setItem(START_KEY, String(Date.now()));
      return 0;
    }
    return Date.now() - started;
  } catch {
    return 0;
  }
}

/** Shown once per visit, across full page loads as well as client navigation. */
const shownAlready = (): boolean => {
  try {
    return window.sessionStorage.getItem(SHOWN_KEY) === "1";
  } catch {
    return false;
  }
};

const markShown = () => {
  try {
    window.sessionStorage.setItem(SHOWN_KEY, "1");
  } catch {
    /* private mode — the in-memory ref still guards this page load */
  }
};

function suppressedUntilPassed(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return false;
    const { dismissedAt } = JSON.parse(raw) as Stored;
    if (!dismissedAt) return false;
    return Date.now() - dismissedAt < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    // A blocked or corrupt localStorage must not turn into a popup on every
    // page load — the quiet failure is the right one here.
    return true;
  }
}

/**
 * Is there a customer session?
 *
 * Asked at the last moment rather than on mount, so a visitor who never reaches
 * the engagement bar never causes the request at all. A failure answers "yes",
 * because staying quiet is the safe way to be wrong about this.
 */
async function isSignedIn(): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/session-state", { cache: "no-store" });
    if (!res.ok) return true;
    return Boolean((await res.json()).signedIn);
  } catch {
    return true;
  }
}

export function RegisterPrompt() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const shownThisSession = useRef(false);
  const views = useRef(0);
  const cardRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { isOpen: cartOpen } = useCart();

  const preview = searchParams.get(PREVIEW_PARAM) === "1";
  const blocked = !preview && (SUPPRESSED.some((p) => pathname?.startsWith(p)) || cartOpen);

  /*
    `open` is this component's own decision; `shown` is whether the shop has a
    free moment for it. Second in the centre slot, behind the welcome offer:
    that one gives the shopper something, this one asks them for something.

    Waiting costs nothing. `open` stays true, so the prompt appears the moment
    the slot frees rather than being spent on a moment it never got.
  */
  const shown = useNudgeSlot("register-prompt", "center", 2, open) || preview;

  // Count pages viewed. Runs on mount and on every client-side route change,
  // and persists across full page loads.
  useEffect(() => {
    views.current = bumpPageViews();
  }, [pathname]);

  const remember = useCallback(() => {
    try {
      window.localStorage.setItem(KEY, JSON.stringify({ dismissedAt: Date.now() } satisfies Stored));
    } catch {
      /* private mode — the session guard still stops a repeat this visit */
    }
  }, []);

  const dismiss = useCallback(() => {
    setOpen(false);
    remember();
  }, [remember]);

  /* ---- Decide whether to show, once the engagement bar is cleared ---- */
  useEffect(() => {
    // Preview needs no timer — it is derived straight from the URL at render.
    if (preview) return;
    if (blocked || shownThisSession.current || shownAlready() || suppressedUntilPassed()) return;

    let cancelled = false;

    /** Claim the one-per-visit slot, confirm no session, then show. */
    async function reveal() {
      if (shownThisSession.current || shownAlready()) return;
      // Read from storage, not the ref: on a fresh page load the ref is only
      // as old as this mount.
      if (readPageViews() < MIN_PAGE_VIEWS) return;
      // No elapsed-time check here on purpose. The timer below is already
      // scheduled for exactly the time still owed, so it cannot fire early —
      // and exit intent must not be held to the same bar. Someone leaving after
      // two pages in twenty seconds is precisely who this is the last chance
      // with; a duplicate check here silently disabled that path.
      // Claimed before awaiting so the timer and exit-intent paths can't both
      // get through while the session check is in flight. Only recorded to
      // storage once it actually opens — a failed session check reads as
      // "signed in", and marking here would silence the rest of the visit on
      // the strength of one dropped request.
      shownThisSession.current = true;
      if (await isSignedIn()) return;
      if (cancelled) return;
      // markShown() deliberately NOT called here. Wanting to open and being
      // allowed to are now different things, and recording the visit's one
      // showing on a prompt the queue then held back would silence it for the
      // rest of the visit without the shopper ever seeing it. It is recorded
      // when it actually appears -- see the effect below.
      setOpen(true);
    }

    /*
      Scheduled against time already spent on the site, and re-scheduled on
      every navigation. A visitor who lingers on one page then clicks through
      has already served the wait, so this fires straight away rather than
      starting the clock over.
    */
    const timer = window.setTimeout(reveal, Math.max(0, ENGAGE_MS - visitElapsedMs()));

    /*
      Exit intent, desktop only. Someone leaving anyway is the one moment where
      interrupting costs nothing — there is no reading to break into. Requires
      the same page-view bar, so it can't fire on a bounce from the landing page.
    */
    const onLeave = (e: MouseEvent) => {
      if (e.clientY > 0) return;
      void reveal();
    };
    document.addEventListener("mouseout", onLeave);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.removeEventListener("mouseout", onLeave);
    };
    // `pathname` matters as much as `blocked`. Without it the effect runs once
    // and never again — `blocked` is a boolean that stays false across a whole
    // browsing session — so the one timer it set could expire before the
    // second page was ever opened, and nothing would reschedule it.
  }, [blocked, pathname, preview]);

  /* ---- Dismissal: Escape, click outside ---- */
  useEffect(() => {
    if (!shown) return;
    closeRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    const onClick = (e: MouseEvent) => {
      if (!cardRef.current?.contains(e.target as Node)) dismiss();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [shown, dismiss]);

  // Spend the once-a-visit budget only once it is genuinely on screen.
  useEffect(() => {
    if (shown && !preview) markShown();
  }, [shown, preview]);

  // Navigating away with it open should close it, not drag it to the next page.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    if (open) setOpen(false);
  }

  // `preview` opens it from the URL alone, with no state and no gates.
  if (!shown || blocked) return null;

  function accept(e: React.FormEvent) {
    e.preventDefault();
    // Treated as a dismissal too: whether they finish signing up or not, they
    // have answered, and asking again would be nagging.
    remember();
    setOpen(false);
    const params = new URLSearchParams();
    if (email.trim()) params.set("email", email.trim());
    if (pathname) params.set("next", pathname);
    router.push(`/register?${params.toString()}`);
  }

  return (
    <div
      /* Above the page but below the cart drawer's own layer; the cart is a
         blocking surface and this never shares the screen with it anyway. */
      className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 p-4 sm:items-center"
      aria-hidden={false}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="register-prompt-title"
        className="relative w-full max-w-md rounded-2xl border border-line bg-cream p-6 shadow-2xl sm:p-8"
      >
        <button
          ref={closeRef}
          type="button"
          onClick={dismiss}
          aria-label="Close"
          className="absolute right-4 top-4 text-muted transition-colors hover:text-ink"
        >
          <CloseIcon width={20} height={20} />
        </button>

        <h2 id="register-prompt-title" className="pr-8 font-serif text-2xl">
          Save your details for next time
        </h2>
        <p className="mt-2 text-sm text-muted">
          You can always check out as a guest. An account just means your delivery details are
          already filled in, your orders are all in one place, and you can track them without
          hunting for an order number.
        </p>

        <form onSubmit={accept} className="mt-5 flex flex-col gap-2 sm:flex-row">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email"
            aria-label="Email address"
            className="w-full rounded-full border border-line bg-white px-4 py-3 text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-brand"
          />
          <button
            type="submit"
            className="shrink-0 rounded-full bg-ink px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-brand"
          >
            Continue
          </button>
        </form>

        <button
          type="button"
          onClick={dismiss}
          className="mt-3 text-xs text-muted underline underline-offset-2 hover:text-ink"
        >
          No thanks, I&rsquo;ll keep shopping
        </button>

        <p className="mt-4 text-xs text-muted">
          We deliver across {siteConfig.country}. We&rsquo;ll never share your details.
        </p>
      </div>
    </div>
  );
}
