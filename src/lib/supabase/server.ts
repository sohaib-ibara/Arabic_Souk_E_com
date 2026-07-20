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
