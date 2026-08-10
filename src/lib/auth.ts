import { getSupabaseUserServer } from "./supabase/user-server";

export interface SessionUser {
  id: string;
  email: string;
  fullName: string | null;
  phone: string | null;
}

/**
 * The currently signed-in customer, or null. Reads the Supabase auth cookie via
 * the cookie-aware server client and validates it with getUser() (which checks
 * the token against Supabase, not just decodes it).
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await getSupabaseUserServer();
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  return {
    id: user.id,
    email: user.email ?? "",
    fullName: typeof meta.full_name === "string" ? meta.full_name : null,
    phone: typeof meta.phone === "string" ? meta.phone : null,
  };
}
