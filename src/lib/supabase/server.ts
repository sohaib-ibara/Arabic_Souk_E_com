import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** True when Supabase env vars are configured. */
export function hasSupabaseEnv(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

/**
 * Read-only Supabase client for use in Server Components and Route Handlers.
 * The storefront only performs public reads (products/categories/brands), so
 * the anon key with public read RLS policies is sufficient — no cookies/auth.
 *
 * Returns `null` when env vars are absent so callers can fall back to the
 * bundled sample data and keep the site rendering in the demo phase.
 */
export function getSupabaseServer(): SupabaseClient | null {
  if (!hasSupabaseEnv()) return null;
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/**
 * Privileged Supabase client for server-side writes that must bypass RLS —
 * currently recording checkout demand into `demand_signals`. The service-role
 * key has full database access, so this MUST only ever run on the server:
 * never import it into a client component, and never expose the key with a
 * `NEXT_PUBLIC_` prefix.
 *
 * Returns `null` when the URL or `SUPABASE_SERVICE_ROLE_KEY` is absent, so the
 * feature degrades gracefully — the storefront keeps working and demand
 * recording simply no-ops until the key is set in `.env.local`.
 */
export function getSupabaseAdmin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
