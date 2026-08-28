import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";

/**
 * Whether the caller has a customer session. Nothing else.
 *
 * Exists so the browser can find that out without the server having to read a
 * cookie while rendering. Reading one in a layout opts every page underneath it
 * out of static generation — all 301 product pages would go from prerendered to
 * rendered-per-request to decide whether to offer someone an account. Asking
 * from the client afterwards keeps them static.
 *
 * Returns a bare boolean about the caller's *own* session, so it discloses
 * nothing they don't already know, and takes no parameters, so it can't be used
 * to probe anyone else's.
 */
export async function GET() {
  const user = await getSessionUser();
  return NextResponse.json(
    { signedIn: Boolean(user) },
    // Never cached: a shared or CDN-cached answer here would tell one visitor
    // about another's session.
    { headers: { "Cache-Control": "no-store, private" } },
  );
}
