# noon access probe — Railway

Throwaway diagnostic. Answers one question: **does noon serve requests from
Railway's IP addresses?** Reads five product pages we already hold, writes
nothing, publishes nothing, and never touches the database.

Delete this directory once the hosting decision is made.

## Why it exists

We have measured, from a real browser:

| From | Result |
| ---- | ------ |
| Office connection (residential ISP) | ✅ works — 717 products captured, July 2026 |
| GitHub Actions (Azure datacentre) | ❌ 403, headless and headed alike, 20/20 |
| r.jina.ai (third-party, datacentre) | ❌ 403 |

Railway is the same class of IP, so the expectation is failure — but the team
lead asked for Railway specifically, and a measurement beats an inference.

## Run it

1. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**
2. Pick this repository, branch **`test/railway-access`**
3. Settings → **Root Directory**: leave blank. **Dockerfile Path**: `railway-probe/Dockerfile`
4. Settings → Networking → **Generate Domain**
5. Open the generated URL. The probe runs once on boot; refresh until it says
   `status: complete`

**Delete the Railway project afterwards** so it doesn't accrue charges.

## Reading it

Success means the page came back **and** carried the JSON-LD `Product` block the
importer reads. A 200 full of bot-challenge HTML is a failure, so the check is
for the data, not the status code.

The output also prints the egress IP and who operates it, which is the part that
actually decides the outcome.
