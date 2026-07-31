import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Admin gate for the monitoring dashboard, backed by Supabase Auth.
 *
 * The admin account lives in Supabase (Authentication → Users). Login verifies
 * the email + password against Supabase server-side (see the login route), then
 * confirms the email is in the `ADMIN_EMAILS` allowlist and issues a short-lived
 * HMAC-signed session cookie. We mint our own signed cookie (rather than storing
 * Supabase tokens) so the gate is stateless and fast, with no dependency on
 * token refresh or middleware.
 *
 * The cookie is `base64url(payload).hmac`, payload = { email, exp }. It's
 * httpOnly, so client JS can't read it, and tamper-proof via the HMAC.
 */

export const ADMIN_COOKIE = "as_admin";
export const sessionMaxAge = 60 * 60 * 8; // 8 hours

/** Allowed admin emails, from `ADMIN_EMAILS` (comma-separated, case-insensitive). */
export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return adminEmails().includes(email.trim().toLowerCase());
}

/** Secret used to sign session cookies. Falls back to the service-role key so
 *  no extra env var is required, but can be set explicitly. */
function sessionSecret(): string | null {
  return process.env.ADMIN_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || null;
}

/** True when everything needed to sign in an admin is configured. */
export function adminConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      adminEmails().length > 0 &&
      sessionSecret(),
  );
}

function sign(payloadB64: string, secret: string): string {
  return createHmac("sha256", secret).update(payloadB64).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Mint a signed session token for a verified admin email (null if no secret). */
export function createSessionToken(email: string): string | null {
  const secret = sessionSecret();
  if (!secret) return null;
  const payload = { email: email.toLowerCase(), exp: Math.floor(Date.now() / 1000) + sessionMaxAge };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${payloadB64}.${sign(payloadB64, secret)}`;
}

function verifyToken(token: string): { email: string } | null {
  const secret = sessionSecret();
  if (!secret) return null;
  const [payloadB64, sig] = token.split(".");
  if (!payloadB64 || !sig) return null;
  if (!safeEqual(sig, sign(payloadB64, secret))) return null;
  try {
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (!isAllowedEmail(payload.email)) return null;
    return { email: String(payload.email) };
  } catch {
    return null;
  }
}

/** The signed-in admin's email for this request, or null. */
export async function getAdminEmail(): Promise<string | null> {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!token) return null;
  return verifyToken(token)?.email ?? null;
}

/** True when the request carries a valid admin session. */
export async function isAdmin(): Promise<boolean> {
  return (await getAdminEmail()) !== null;
}
