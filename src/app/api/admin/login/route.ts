import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  adminConfigured,
  isAllowedEmail,
  createSessionToken,
  ADMIN_COOKIE,
  sessionMaxAge,
} from "@/lib/admin-auth";

const clean = (v: unknown, max = 320): string =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

/**
 * Verifies an email + password against Supabase Auth, confirms the email is an
 * allowed admin, and issues a signed admin session cookie. The password is only
 * ever handled server-side here.
 */
export async function POST(req: Request) {
  if (!adminConfigured()) {
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }

  const obj = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const email = clean(obj.email);
  const password = typeof obj.password === "string" ? obj.password : "";
  if (!email || !password) {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }

  // Verify credentials against Supabase Auth using the public anon key.
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    return NextResponse.json({ ok: false, error: "invalid_credentials" }, { status: 401 });
  }
  if (!isAllowedEmail(data.user.email)) {
    return NextResponse.json({ ok: false, error: "not_authorized" }, { status: 403 });
  }

  const token = createSessionToken(data.user.email!);
  if (!token) {
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: sessionMaxAge,
  });
  return res;
}
