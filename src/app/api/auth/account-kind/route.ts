import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { isAllowedEmail } from "@/lib/admin-auth";

/**
 * Reports whether the **currently signed-in** customer session belongs to an
 * administrator account.
 *
 * Deliberately takes no email parameter: it only ever describes a session that
 * has already authenticated, so it can't be used to probe which addresses are
 * on the admin allowlist. `ADMIN_EMAILS` is a server-only variable and must
 * never be shipped to the browser, which is why this check can't live in the
 * login form itself.
 */
export async function POST() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ isAdmin: false });
  return NextResponse.json({ isAdmin: isAllowedEmail(user.email) });
}
