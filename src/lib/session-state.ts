"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * Whether the visitor has a customer session.
 *
 * Asked from the browser, never during render on the server. Reading the cookie
 * in the store layout would opt every page underneath it out of static
 * generation - all 332 product pages going from prerendered to
 * rendered-per-request, to decide whether to offer somebody an account. See
 * /api/auth/session-state.
 *
 * Two shapes because there are two callers with different needs: the register
 * prompt asks once, at the moment it is about to appear, and the signup tab
 * needs to keep knowing for as long as it is on screen.
 */

/** Unknown counts as signed in. Showing a signup prompt to a member is the
 *  mistake worth avoiding; withholding one from a guest costs an email. */
export async function fetchSignedIn(): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/session-state", { cache: "no-store" });
    if (!res.ok) return true;
    return Boolean((await res.json()).signedIn);
  } catch {
    return true;
  }
}

/** Signing in and out both happen here, and both land somewhere else. */
const AUTH_PATHS = ["/login", "/register", "/account"];
const isAuthPath = (path: string | null) =>
  Boolean(path && AUTH_PATHS.some((a) => path.startsWith(a)));

/**
 * `null` until the answer is in.
 *
 * Re-asked when the visitor crosses an auth route in either direction, which is
 * the only way the answer changes: both sign-in and sign-out `router.replace`
 * to a different path while this component stays mounted, so a session opened
 * mid-visit would otherwise never be noticed. Every other navigation reuses
 * what is already known rather than costing a request per page view.
 */
export function useSignedIn(): boolean | null {
  const pathname = usePathname();
  const [known, setKnown] = useState<boolean | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);

  const crossedAuth = isAuthPath(pathname) || isAuthPath(checkedAt);
  const stale = checkedAt === null || (crossedAuth && checkedAt !== pathname);

  useEffect(() => {
    if (!stale) return;
    let cancelled = false;
    fetchSignedIn().then((signedIn) => {
      if (cancelled) return;
      setKnown(signedIn);
      setCheckedAt(pathname);
    });
    return () => {
      cancelled = true;
    };
  }, [stale, pathname]);

  return known;
}
