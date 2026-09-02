# Deployment — how the shop gets to production

The short version: **pushing to `main` deploys the shop.** That is done by
[`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml), not by
Vercel watching the repository.

---

## Why it is not just Vercel watching the repository

It was, until 2 Sep 2026, when the repo was made private.

Vercel's **Hobby** plan only builds a commit whose **author** owns the Vercel
project, and it will not let you add contributors to a private repository. Every
push after that produced a deployment that never ran:

> Deployment Blocked — the deployment was blocked because the commit author did
> not have contributing access to the project on Vercel. The Hobby Plan does not
> support collaboration for private repositories.

The failure mode is the dangerous kind. Nothing went red. GitHub accepted the
push, Vercel accepted the webhook, and the live site went on quietly serving a
build from before the change. Two merges landed on `main` and neither reached a
single visitor.

The three identities involved:

| | |
| --- | --- |
| Vercel account | `sohaib-9939`, Hobby plan |
| GitHub repository | `sohaib-ibara/Arabic_Souk_E_com`, private |
| Author of every commit | `Sohaib909 <sohaibrafiq991@gmail.com>` |

While the repo was public that mismatch did not matter. Now it does.

**A deploy made with a token is authorised by whoever owns the token**, so the
commit author is never consulted. That is the fix, and unlike the alternatives
it keeps working whatever the repo's visibility is, whoever writes the commit,
and whoever joins the project later.

### What was rejected, and why

| Option | Why not |
| --- | --- |
| Flip the repo public to deploy, then private again | Works, but it is four manual steps on **every** release and one of them is easy to forget — and forgetting it leaves the repo public. |
| Change the commit author to the Vercel account owner | Only works while one person commits, and breaks silently the moment somebody else does. |
| Upgrade to Pro | Fixes it, and is where a commercial client site belongs — Hobby is licensed for non-commercial use. Worth doing on its own merits; it is not needed to unblock deploys. |

---

## What it does

| Branch | Result |
| --- | --- |
| `main` | Production. The live shop. |
| `feat/**`, `fix/**`, `chore/**` | A preview URL, printed in the job summary. |
| anything else (`test/**`) | Nothing. Those branches carry CI evidence, not an application. |

Every run finishes by **fetching the deployed site and checking that `/` and
`/shop` actually answer**. A build can succeed and the site still be broken — a
missing environment variable, a table that is not there yet, a route that throws
on first render. Without that check a green tick means "it compiled", which is
not the question anybody is asking. With it, green means the shop is up.

---

## One-time setup

**One secret. About three minutes, and no terminal.**

It was three secrets in the first draft — the token plus the account and project
ids — because that is what Vercel's CI documentation asks for. The only way to
read those two ids was to install the CLI and link the project locally, which is
a lot of ceremony for two numbers that are printed in the dashboard URL. The
workflow looks them up itself now, by project name.

### 1. Create a token

1. Open **https://vercel.com/account/tokens**
2. **Create Token**
3. Name: `github-actions-arabic-souk`
4. Scope: your account (`sohaib-9939`)
5. Expiration: **No expiration** — an expiring token means deploys stop one day
   for no visible reason. If you prefer a limit, put the date in a calendar.
6. **Create**, then copy the value. Vercel shows it exactly once.

> Paste it straight into GitHub in the next step. Not into chat, email or a
> ticket: a token that has passed through any of those has to be treated as
> public and replaced. It can deploy to your projects and read their
> environment variables.

### 2. Put it in GitHub

**https://github.com/sohaib-ibara/Arabic_Souk_E_com/settings/secrets/actions**
→ **New repository secret**

| Field | Value |
| --- | --- |
| Name | `VERCEL_TOKEN` |
| Secret | the token from step 1 |

The name is case-sensitive and must match exactly.

### 3. Stop Vercel deploying on its own

Otherwise every push makes two deployments: this workflow's, and a blocked one
from Vercel's integration cluttering the dashboard.

Vercel → `arabic-souk-e-com` → **Settings → Git → Disconnect**.

The project stays, along with its domains and its environment variables. Only
the automatic build-on-push goes away, which is the part this workflow replaces.

### 4. Check it

Push anything, or **Actions → deploy → Run workflow**.

Watch the last step, *Check the deployment actually serves*. Green there means
the shop answered.

### If you ever want the faster path

Setting `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` as secrets too skips the lookup
— one HTTP call shorter, and it is the method Vercel documents. Both are in the
dashboard: Project → Settings → General for the project id, Account Settings →
General for the account id. Entirely optional; the workflow works without them.

---

## Environment variables

They stay **in Vercel**, and are not copied into GitHub.

`vercel pull` fetches them at the start of every run, so Supabase, Stripe and the
mail credentials have one home — Vercel → Project → Settings → Environment
Variables. Adding a variable there is enough; nothing in this repo needs
changing.

This matters more than it looks. 291 product pages are prerendered from Supabase
**at build time**, so a build that runs without the keys does not fail. It
succeeds, and ships an empty catalogue.

---

## When something goes wrong

| Symptom | Cause |
| --- | --- |
| Job fails at *Check the token is set* | `VERCEL_TOKEN` is missing or misspelled. |
| `Project not found` at *Find the project* | The token belongs to a different account, or the project was renamed — update `VERCEL_PROJECT_NAME` in the workflow. |
| `Error: Not authorized` | The token was revoked, expired, or belongs to a different account than the project. Make a new one. |
| Build succeeds, smoke check fails | The site deployed but does not serve. Check Vercel → the deployment → Runtime Logs. Usually a missing environment variable or a migration that has not been run. |
| Deployment appears, live site unchanged | You were looking at a preview. Only `main` deploys to production. |
| Two deployments per push, one blocked | Step 3 was skipped — Vercel's Git integration is still connected. |

---

## Database migrations are not part of this

The workflow ships **code**. It does not touch Supabase.

Anything in `supabase/migrations/` has to be pasted into the Supabase SQL editor
by a human, and code that expects a table which is not there yet will deploy
perfectly and misbehave at runtime. Run the migration first, then merge.

Outstanding at the time of writing: `0017_newsletter_subscribers.sql`,
`0018_two_decimal_prices.sql`, `0019_home_bestsellers.sql`, and
`scripts/round-prices.mjs --apply`.
