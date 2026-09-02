"use client";

import { useEffect, useSyncExternalStore } from "react";

/**
 * One thing at a time.
 *
 * The storefront had grown four independent attention-grabbers, each with its
 * own timer and none aware of the others: the WhatsApp greeting at 4s, the
 * welcome offer at 8s, the register prompt at 35s, and now a cart nudge. On a
 * normal visit they simply piled up — a bubble, then a modal over it, then a
 * full-screen overlay over that. Every one of them individually defensible, and
 * together the reason people install blockers.
 *
 * So they queue. Two slots, because a corner bubble and a centred modal are
 * different kinds of interruption and a modal covers the corner anyway:
 *
 *   corner   the bubbles above the WhatsApp button
 *   center   modals and full-screen overlays
 *
 * Rules, in order:
 *
 *   1. One occupant per slot.
 *   2. A modal blanks the corner. Showing a bubble underneath a dimmed overlay
 *      is just litter the shopper cannot reach.
 *   3. After anything closes, nothing else appears for QUIET_MS. Back-to-back
 *      prompts read as one long prompt, which is the thing being avoided.
 *   4. Ties go to the higher priority, then to whoever asked first.
 *
 * A module singleton rather than a context: this is UI-wide policy with one
 * instance per page, contexts would have to wrap components that are mounted in
 * different subtrees, and `useSyncExternalStore` keeps it out of the render
 * cycle entirely — no setState-in-effect, no cascade.
 */

export type NudgeSlot = "corner" | "center";

/** Long enough that two prompts don't read as one, short enough not to feel broken. */
const QUIET_MS = 20_000;

interface Waiting {
  slot: NudgeSlot;
  priority: number;
}

/** Insertion order is the tie-break, which Map preserves. */
const waiting = new Map<string, Waiting>();
const listeners = new Set<() => void>();

let quiet = false;
let quietTimer: ReturnType<typeof setTimeout> | null = null;

function notify() {
  for (const l of listeners) l();
}

function beQuiet() {
  quiet = true;
  if (quietTimer) clearTimeout(quietTimer);
  quietTimer = setTimeout(() => {
    quiet = false;
    quietTimer = null;
    notify();
  }, QUIET_MS);
}

function winner(slot: NudgeSlot): string | null {
  let best: string | null = null;
  let bestPriority = -Infinity;
  for (const [id, w] of waiting) {
    if (w.slot !== slot) continue;
    if (w.priority > bestPriority) {
      best = id;
      bestPriority = w.priority;
    }
  }
  return best;
}

function granted(id: string): boolean {
  const w = waiting.get(id);
  if (!w) return false;
  if (quiet) return false;
  // Rule 2: a modal owns the screen while it is up.
  if (w.slot === "corner" && winner("center") !== null) return false;
  return winner(w.slot) === id;
}

function claim(id: string, slot: NudgeSlot, priority: number) {
  const had = waiting.get(id);
  if (had && had.slot === slot && had.priority === priority) return;
  waiting.set(id, { slot, priority });
  notify();
}

function drop(id: string) {
  if (!waiting.delete(id)) return;
  // Only a nudge that actually had the floor earns the shop a quiet spell;
  // one that gave up while waiting never interrupted anybody.
  beQuiet();
  notify();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Ask for a slot, and learn whether you have it.
 *
 * `wants` is the component's own decision — its timer has fired, it is not
 * dismissed, it has something to say. This hook only answers whether now is a
 * good moment for the shopper.
 *
 * Priorities are relative and deliberately coarse. Higher wins.
 */
export function useNudgeSlot(
  id: string,
  slot: NudgeSlot,
  priority: number,
  wants: boolean,
): boolean {
  useEffect(() => {
    if (wants) claim(id, slot, priority);
    else drop(id);
    return () => drop(id);
  }, [id, slot, priority, wants]);

  return useSyncExternalStore(
    subscribe,
    () => granted(id),
    // The server has no queue and shows no nudges, so nothing is ever granted
    // during SSR. Returning `false` keeps the first client render identical to
    // the server's and avoids a hydration mismatch.
    () => false,
  );
}
