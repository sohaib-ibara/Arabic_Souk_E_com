"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser Supabase client. Not used by the demo cart (which is localStorage
 * only), but wired up for the next phase (auth, wishlists, live inventory).
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
