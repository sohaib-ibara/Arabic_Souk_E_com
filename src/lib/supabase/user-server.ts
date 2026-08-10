import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Cookie-aware Supabase client for Server Components / Route Handlers that need
 * the SIGNED-IN customer's session. Unlike getSupabaseServer() (anonymous, no
 * cookies), this reads the Supabase auth cookie so requests carry the user's
 * JWT — which is what makes per-user RLS ("see only my own orders") work.
 *
 * Kept in its own file because it imports next/headers (server-only); never
 * import this from a client component.
 *
 * Returns null when Supabase env vars are absent, so callers can degrade.
 */
export async function getSupabaseUserServer(): Promise<SupabaseClient | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;

  const cookieStore = await cookies();
  return createServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        // During a Server Component render the cookie store is read-only and
        // this throws — safe to swallow, because proxy.ts refreshes the auth
        // cookie on navigation. It only succeeds (and matters) inside Route
        // Handlers / Server Actions, which are allowed to set cookies.
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          /* read-only context — ignore */
        }
      },
    },
  });
}
