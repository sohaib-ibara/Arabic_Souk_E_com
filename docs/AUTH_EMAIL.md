# Signup confirmation email

Registering a customer account sends a confirmation link. When that link never
arrives, or arrives and does nothing, there are two separate causes and they
need fixing in two different places. One is in this repository. The other is in
the Supabase dashboard and cannot be done from code.

## What was wrong in the code (fixed)

`@supabase/ssr` puts every client in the **PKCE** flow — it hard-codes
`flowType: "pkce"` in both `createBrowserClient` and `createServerClient`, so
it is not a setting we chose or can opt out of.

In that flow the link in the email does not sign anybody in by itself. It
verifies the token with Supabase, and Supabase then redirects to a URL of our
choosing with a one-time `code` attached. That code has to be exchanged for a
session by a server that is allowed to set cookies.

Two pieces were missing:

- **No `emailRedirectTo`.** `signUp` was called without one, so Supabase used
  the project's Site URL — a single value in the dashboard, which was
  `http://localhost:3000`. Every confirmation link mailed to a real customer
  pointed at their own machine.
- **Nowhere to exchange the code.** There was no route to hand it to. Even a
  correctly addressed link would have returned the shopper to the site still
  signed out, with nothing to explain why.

Now: `src/components/auth/register-form.tsx` passes
`emailRedirectTo: <origin>/auth/callback`, derived from the origin the person
actually registered on, and `src/app/auth/callback/route.ts` exchanges the
code and sets the session. A link that has expired or already been used sends
them to `/login?confirm=expired`, which says so and offers a new one.

## What has to be done in the Supabase dashboard

**This is the part that stops the mail arriving at all, and no code change can
fix it.**

### 1. Add the redirect URLs to the allow-list

Supabase refuses any `emailRedirectTo` it has not been told about, and falls
back to the Site URL — which is how you end up back at localhost even after
the code fix.

**Authentication → URL Configuration**

- **Site URL**: `https://arabic-souk-e-com.vercel.app`
- **Redirect URLs** — add all three:
  - `https://arabic-souk-e-com.vercel.app/auth/callback`
  - `https://*-sohaib-9939s-projects.vercel.app/auth/callback` (preview builds)
  - `http://localhost:3000/auth/callback` (local development)

### 2. Replace the built-in email sender

Supabase's own sender is for testing. It is rate-limited to a **handful of
messages per hour across the whole project**, and everything past the limit is
dropped silently — no error at signup, no message in the inbox. It is the most
likely reason a signup "didn't send" while an earlier test did.

**Authentication → Emails → SMTP Settings → Enable custom SMTP**

The same Gmail app password this app already uses for order confirmations
works here. It is in `.env.local` as `SMTP_USER` / `SMTP_PASS` — take it from
there, not from anyone's message history.

| Field | Value |
| --- | --- |
| Host | `smtp.gmail.com` |
| Port | `465` |
| Username | the `SMTP_USER` value |
| Password | the `SMTP_PASS` value (an app password, not the account password) |
| Sender email | the same address as the username |
| Sender name | `Arabic Souk` |

Gmail will not let you send as an address it does not own, so the sender
address has to match the authenticated mailbox or a verified alias.

Once custom SMTP is on, raise **Rate Limits → Emails per hour** from the
default. Gmail's own limit is the real ceiling — a few hundred a day on a
free account, 2,000 on Workspace.

### 3. Check it

Register with a real address you can open, on the deployed site. The link
should arrive within a minute or two and land you signed in on `/account`.

If it does not arrive: **Authentication → Logs** shows every send attempt and
the reason for a failure, which is more use than guessing.

## Notes

- The confirmation link is **single use** and expires. Following it twice gives
  `/login?confirm=expired`, which is correct behaviour, not a bug.
- The signup form deliberately shows the same "check your email" screen whether
  or not the address already has an account. Supabase declines to distinguish
  the two — telling a stranger which addresses are registered is a way of
  enumerating your customers.
- Order confirmation emails are unrelated to any of this. They are sent by this
  application over SMTP directly (`src/lib/email.ts`) and were never affected.
