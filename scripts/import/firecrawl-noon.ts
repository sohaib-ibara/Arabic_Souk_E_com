import { readFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

/**
 * Noon → staging importer  (feature/noon-import)
 *
 * Pipeline:  Firecrawl (fetch/render)  →  Claude (structured extraction)  →  Supabase staging_products
 *
 * ⚠️  LEGAL / RIGHTS — READ docs/NOON_IMPORT.md BEFORE RUNNING.
 * Scraping noon.com is against its Terms of Service, and product images and
 * descriptions are copyrighted by noon and the brands. This tool writes to a
 * REVIEW-ONLY staging table; it does NOT publish to the live store. Promoting
 * scraped images/copy to a live commercial storefront is your decision and your
 * legal liability — replace them with rights-cleared assets before go-live.
 *
 * Nothing runs unless you set CONFIRM_SCRAPE=1 (acknowledging the above).
 *
 * Env (in .env.local or the environment):
 *   FIRECRAWL_API_KEY            required
 *   ANTHROPIC_API_KEY            required
 *   NEXT_PUBLIC_SUPABASE_URL     required
 *   SUPABASE_SERVICE_ROLE_KEY    required (writes bypass RLS — never expose client-side)
 *   TARGET_URL                   default: noon Saudi premium-beauty listing
 *   MAX_PRODUCTS                 default: 20
 *   REQUEST_DELAY_MS             default: 1500 (politeness between fetches)
 *   ANTHROPIC_MODEL              default: claude-opus-4-8
 */

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = { ...(process.env as Record<string, string>) };
  for (const file of [".env.local", ".env"]) {
    try {
      const raw = readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
      for (const line of raw.split("\n")) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
        if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    } catch {
      /* file optional */
    }
  }
  return env;
}

const env = loadEnv();
const CONFIRM = env.CONFIRM_SCRAPE === "1";
const FIRECRAWL_API_KEY = env.FIRECRAWL_API_KEY;
const ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY;
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const TARGET_URL = env.TARGET_URL || "https://www.noon.com/saudi-en/noon-premium-beauty/";
const MAX_PRODUCTS = Number(env.MAX_PRODUCTS || 20);
const REQUEST_DELAY_MS = Number(env.REQUEST_DELAY_MS || 1500);
const MODEL = env.ANTHROPIC_MODEL || "claude-opus-4-8";

const BANNER = `
────────────────────────────────────────────────────────────────────────────
  noon → staging importer  ·  REVIEW-ONLY
  Scraping noon.com breaches its ToS; its images & copy are copyrighted.
  Data lands in staging_products for review, NOT the live store.
  See docs/NOON_IMPORT.md. Publishing scraped assets is your legal liability.
────────────────────────────────────────────────────────────────────────────`;

function requireEnv() {
  const missing = [
    ["FIRECRAWL_API_KEY", FIRECRAWL_API_KEY],
    ["ANTHROPIC_API_KEY", ANTHROPIC_API_KEY],
    ["NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL],
    ["SUPABASE_SERVICE_ROLE_KEY", SERVICE_KEY],
  ].filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) {
    console.error(`Missing env: ${missing.join(", ")}`);
    process.exit(1);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---- Firecrawl REST (version-independent) --------------------------------
async function firecrawl<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`https://api.firecrawl.dev/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Firecrawl ${path} → HTTP ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

async function discoverProductUrls(): Promise<string[]> {
  const data = await firecrawl<{ links?: string[]; data?: { links?: string[] } }>("map", {
    url: TARGET_URL,
    limit: 500,
  });
  const links = data.links ?? data.data?.links ?? [];
  // noon product-detail URLs contain '/p/'. De-dup and cap.
  const products = Array.from(new Set(links.filter((u) => /\/p\//.test(u))));
  return products.slice(0, MAX_PRODUCTS);
}

async function scrapeMarkdown(url: string): Promise<string> {
  const data = await firecrawl<{ data?: { markdown?: string } }>("scrape", {
    url,
    formats: ["markdown"],
    onlyMainContent: true,
  });
  return data.data?.markdown ?? "";
}

// ---- Claude structured extraction ----------------------------------------
const PRODUCT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: { type: "string" },
    brand: { type: "string" }, // "" if unknown
    price: { type: "number" }, // 0 if unknown
    currency: { type: "string" }, // e.g. "SAR"
    short_description: { type: "string" },
    description: { type: "string" },
    category: {
      type: "string",
      enum: ["skincare", "makeup", "fragrance", "hair", "bath-body", "tools", "other"],
    },
    images: { type: "array", items: { type: "string" } },
    in_stock: { type: "boolean" },
    rating: { type: "number" },
    review_count: { type: "integer" },
  },
  required: [
    "name", "brand", "price", "currency", "short_description",
    "description", "category", "images", "in_stock", "rating", "review_count",
  ],
} as const;

interface Extracted {
  name: string; brand: string; price: number; currency: string;
  short_description: string; description: string; category: string;
  images: string[]; in_stock: boolean; rating: number; review_count: number;
}

async function extractProduct(
  anthropic: Anthropic,
  markdown: string,
  url: string,
): Promise<Extracted | null> {
  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2000,
    output_config: { format: { type: "json_schema", schema: PRODUCT_SCHEMA } },
    messages: [
      {
        role: "user",
        content:
          "Extract the single main beauty product from this scraped product page. " +
          "Use \"\" for unknown strings, 0 for unknown numbers, [] for no images. " +
          "Prices are numbers in the page's currency. Images must be absolute URLs. " +
          `Choose the closest category from the allowed list.\n\nSource: ${url}\n\n---\n${markdown.slice(0, 24000)}`,
      },
    ],
  });
  const text = res.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") return null;
  try {
    return JSON.parse(text.text) as Extracted;
  } catch {
    return null;
  }
}

// ---- Main -----------------------------------------------------------------
async function main() {
  console.log(BANNER);
  if (!CONFIRM) {
    console.error(
      "\nRefusing to run. Set CONFIRM_SCRAPE=1 to acknowledge the ToS/copyright notice above.",
    );
    process.exit(2);
  }
  requireEnv();

  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY! });
  const sb = createClient(SUPABASE_URL!, SERVICE_KEY!, {
    auth: { persistSession: false },
  });

  console.log(`\nDiscovering product URLs from ${TARGET_URL} …`);
  const urls = await discoverProductUrls();
  console.log(`Found ${urls.length} product URL(s) (capped at MAX_PRODUCTS=${MAX_PRODUCTS}).`);

  let ok = 0;
  let fail = 0;
  for (const [i, url] of urls.entries()) {
    try {
      const md = await scrapeMarkdown(url);
      if (!md) throw new Error("empty markdown");
      const product = await extractProduct(anthropic, md, url);
      if (!product || !product.name) throw new Error("extraction failed");

      const { error } = await sb.from("staging_products").upsert(
        {
          source: "noon",
          source_url: url,
          raw: product,
          name: product.name,
          brand: product.brand || null,
          price: product.price || null,
          currency: product.currency || null,
          short_description: product.short_description || null,
          description: product.description || null,
          category: product.category || null,
          images: product.images ?? [],
          in_stock: product.in_stock,
          rating: product.rating || null,
          review_count: product.review_count || 0,
          status: "pending",
        },
        { onConflict: "source,source_url" },
      );
      if (error) throw error;
      ok++;
      console.log(`  [${i + 1}/${urls.length}] ✓ ${product.name}`);
    } catch (e) {
      fail++;
      console.log(`  [${i + 1}/${urls.length}] ✗ ${url} — ${(e as Error).message}`);
    }
    await sleep(REQUEST_DELAY_MS);
  }

  console.log(`\nDone. ${ok} staged, ${fail} failed.`);
  console.log(
    "Review rows in Supabase (staging_products), set status='approved' on the ones you have the right to use,\n" +
      "then run:  CONFIRM_PUBLISH=1 node scripts/import/promote-staging.ts",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
