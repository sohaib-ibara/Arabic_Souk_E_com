import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseUserServer } from "@/lib/supabase/user-server";

/**
 * Where a confirmation email lands.
 *
 * This route did not exist, and that is half of why "the signup mail doesn't
 * work". The other half is in the Supabase dashboard — see docs/AUTH_EMAIL.md.
 *
 * `@supabase/ssr` puts both the browser and server clients in the PKCE flow
 * (it hard-codes `flowType: "pkce"`, it isn't a choice we made). In that flow
 * the link in the email does not sign anyone in by itself: it verifies the
 * token with Supabase, which then redirects here with a one-time `code`, and
 * that code has to be exchanged for a session by a server that can set
 * cookies. With nowhere to exchange it, a shopper who confirmed their address
 * was bounced onto the site still signed out, with nothing to explain why.
 *
 * A Route Handler, not a page, because the exchange writes the auth cookies
 * and a Server Component render cannot (see the note in user-server.ts).
 *
 * `next` is carried through so somebody who was part-way to checkout when they
 * registered is returned there rather than to the account page. It is checked
 * to be a path on this site: an open redirect on a link we email out is a
 * phishing primitive, and this is exactly the sort of URL that gets forwarded.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  // Supabase reports a refused or expired link here rather than by failing the
  // exchange, so read it before anything else.
  const error = searchParams.get("error_description") ?? searchParams.get("error");
  if (error) return NextResponse.redirect(`${origin}/login?confirm=failed`);

  if (!code) return NextResponse.redirect(`${origin}/login?confirm=failed`);

  const supabase = await getSupabaseUserServer();
  if (!supabase) return NextResponse.redirect(`${origin}/login?confirm=failed`);

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    // Overwhelmingly this is a link that has already been used or has expired
    // — both of which the sign-in page can offer a way out of.
    return NextResponse.redirect(`${origin}/login?confirm=expired`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}

/**
 * A path on this site, or the account page.
 *
 * Only a relative path is accepted, and `//host` is rejected too — the browser
 * reads that as protocol-relative and would leave the site.
 */
function safeNext(value: string | null): string {
  if (!value) return "/account";
  if (!value.startsWith("/") || value.startsWith("//")) return "/account";
  return value;
}
