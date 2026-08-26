import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Proof that this browser is the one that just placed a given order.
 *
 * A guest has no account, so the per-user RLS policy that normally scopes an
 * order read has nothing to match on. Rather than loosening that policy, the
 * checkout route hands back a short-lived signed token naming the order, and
 * the confirmation page trades it for exactly that one row.
 *
 * It has to be signed. The cookie carrying it is httpOnly, which stops page
 * scripts reading it, but a client can still put whatever it likes in a request
 * header — so an unsigned order id would let anyone read any order by guessing.
 *
 * Deliberately short-lived and single-purpose: it proves "you just checked out",
 * not "you own this order". Anything longer-lived belongs behind an account.
 */

export const ORDER_COOKIE = "as_order";

/** Long enough to pay by card and come back; short enough to be worthless later. */
export const ORDER_TOKEN_MAX_AGE = 60 * 60 * 2; // 2 hours

function secret(): string | null {
  return process.env.ADMIN_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || null;
}

function sign(payloadB64: string, key: string): string {
  return createHmac("sha256", key).update(payloadB64).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Mint a token for one order id, or null when no secret is configured. */
export function createOrderToken(orderId: string): string | null {
  const key = secret();
  if (!key) return null;
  const payload = { oid: orderId, exp: Math.floor(Date.now() / 1000) + ORDER_TOKEN_MAX_AGE };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${payloadB64}.${sign(payloadB64, key)}`;
}

/** The order id a valid, unexpired token names — otherwise null. */
export function readOrderToken(token: string | undefined): string | null {
  const key = secret();
  if (!key || !token) return null;

  const [payloadB64, sig] = token.split(".");
  if (!payloadB64 || !sig) return null;
  if (!safeEqual(sig, sign(payloadB64, key))) return null;

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return typeof payload.oid === "string" ? payload.oid : null;
  } catch {
    return null;
  }
}
