import { getSupabaseAdmin } from "./supabase/server";

/**
 * Marketing opt-ins.
 *
 * Reached only from the server: the table is RLS-locked with no policies, so
 * the service-role key is the one way in and it must never reach a browser.
 *
 * See migration 0017 for why the list is stored but not yet sent to. In short:
 * addresses are the part that cannot be recovered later, and an export beats a
 * half-built campaign tool.
 */

export interface NewsletterState {
  ok: boolean;
  /** Shown to the subscriber. Null before the form has been used. */
  message: string | null;
  error: boolean;
}

export const emptyNewsletterState: NewsletterState = {
  ok: false,
  message: null,
  error: false,
};

/** Missing table, i.e. migration 0017 has not been run yet. */
const MISSING_TABLE = "PGRST205";
/** Unique violation on lower(email) — they are already subscribed. */
const DUPLICATE = "23505";

/*
  Deliberately loose.

  This is a marketing list, not an authentication flow: the cost of rejecting a
  real address is a lost subscriber, and the cost of accepting a bad one is a
  bounce. Anything with an @, a dot after it and no spaces gets through, and
  reality decides the rest.
*/
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function subscribeToNewsletter(
  rawEmail: string,
  context: { source?: string; page?: string } = {},
): Promise<NewsletterState> {
  const email = rawEmail.trim().toLowerCase().slice(0, 320);

  if (!email) {
    return { ok: false, error: true, message: "Enter your email address." };
  }
  if (!LOOKS_LIKE_EMAIL.test(email)) {
    return { ok: false, error: true, message: "That doesn't look like an email address." };
  }

  const sb = getSupabaseAdmin();
  if (!sb) {
    // The key is missing, which is a deployment problem, not the shopper's.
    // Say so plainly rather than thanking them for something we did not keep.
    return {
      ok: false,
      error: true,
      message: "We can't sign you up right now. Please try again shortly.",
    };
  }

  const { error } = await sb.from("newsletter_subscribers").insert({
    email,
    source: context.source?.slice(0, 40) ?? null,
    page: context.page?.slice(0, 200) ?? null,
  });

  if (error) {
    /*
      Already on the list is a success as far as the subscriber is concerned.
      Telling them "that address is already registered" is both useless to them
      and a small disclosure — it confirms to anyone who asks whether a given
      person is a customer here.
    */
    if (error.code === DUPLICATE) {
      return { ok: true, error: false, message: "You're on the list." };
    }
    if (error.code === MISSING_TABLE) {
      console.warn(
        "[newsletter] newsletter_subscribers is missing — run supabase/migrations/0017_newsletter_subscribers.sql",
      );
    } else {
      console.error("[newsletter] insert failed:", error.message);
    }
    return {
      ok: false,
      error: true,
      message: "We couldn't save that. Please try again shortly.",
    };
  }

  return { ok: true, error: false, message: "You're on the list." };
}

export interface Subscriber {
  id: string;
  email: string;
  source: string | null;
  page: string | null;
  subscribed_at: string;
  unsubscribed_at: string | null;
}

export interface SubscriberList {
  ready: boolean;
  message: string | null;
  rows: Subscriber[];
  total: number;
  /** How many came from each surface, so the interruptions can be judged. */
  bySource: Record<string, number>;
}

export async function listSubscribers(limit = 500): Promise<SubscriberList> {
  const empty: SubscriberList = { ready: false, message: null, rows: [], total: 0, bySource: {} };

  const sb = getSupabaseAdmin();
  if (!sb) {
    return { ...empty, message: "SUPABASE_SERVICE_ROLE_KEY isn't set, so the list can't be read." };
  }

  const { data, error, count } = await sb
    .from("newsletter_subscribers")
    .select("*", { count: "exact" })
    .order("subscribed_at", { ascending: false })
    .limit(limit);

  if (error) {
    return {
      ...empty,
      message:
        error.code === MISSING_TABLE
          ? "Not installed yet — run supabase/migrations/0017_newsletter_subscribers.sql."
          : error.message,
    };
  }

  const rows = (data ?? []) as Subscriber[];
  const bySource: Record<string, number> = {};
  for (const r of rows) {
    const key = r.source ?? "unknown";
    bySource[key] = (bySource[key] ?? 0) + 1;
  }

  return { ready: true, message: null, rows, total: count ?? rows.length, bySource };
}
