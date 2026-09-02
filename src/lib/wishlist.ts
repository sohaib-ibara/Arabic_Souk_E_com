"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Saved for later.
 *
 * Most browsing is not "I will buy this now", it is "I like this, not today".
 * Without somewhere to put that, the only two options a shopper has are buy it
 * or lose it — and in a catalogue of 332 products, losing it is what happens.
 *
 * On the device, not the account. Most visits here are guests, and asking
 * someone to make an account before they can remember a lipstick is the surest
 * way to get neither. It survives closing the tab, which is the whole point,
 * and it does not survive changing device — an honest trade for needing no
 * sign-in at all.
 *
 * Slugs only. The name and price of a saved product are looked up fresh when
 * the list is shown, so a saved item cannot quietly go stale, and nothing about
 * the catalogue is duplicated into storage where it would drift.
 */

const KEY = "arabicsouk.wishlist.v1";

/** Generous, but bounded: storage is shared with the cart and this is a list, not an archive. */
const MAX = 100;

const listeners = new Set<() => void>();

/*
  The snapshot must be referentially stable between changes or
  useSyncExternalStore re-renders forever. So the parsed array is cached and
  only replaced when the list actually changes.
*/
let cache: string[] | null = null;

function load(): string[] {
  if (cache) return cache;
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    cache = Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === "string") : [];
  } catch {
    // Blocked or corrupt storage reads as an empty list, never as a crash on a
    // product page.
    cache = [];
  }
  return cache;
}

function save(next: string[]) {
  cache = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private browsing: the list lives for this page and no longer */
  }
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  /*
    Another tab counts. Someone with the shop open twice who saves something in
    one window should not see the other window disagree, and `storage` is the
    only signal that crosses tabs.
  */
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    cache = null;
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** Empty during SSR: the server has no idea what this device saved. */
const EMPTY: string[] = [];

export function useWishlist() {
  const slugs = useSyncExternalStore(subscribe, load, () => EMPTY);

  const toggle = useCallback((slug: string) => {
    const current = load();
    save(
      current.includes(slug)
        ? current.filter((s) => s !== slug)
        : [slug, ...current].slice(0, MAX),
    );
  }, []);

  const remove = useCallback((slug: string) => {
    save(load().filter((s) => s !== slug));
  }, []);

  return { slugs, toggle, remove, count: slugs.length };
}
