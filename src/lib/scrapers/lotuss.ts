import type { Scraper, ScrapedPrice } from "./types";
import { fetchHtml, fetchJson, parsePrice } from "./types";

/**
 * Lotus's (โลตัส) — REAL scraper attempt.
 *
 * Pipeline:
 *   1. Detect the Next.js build ID from https://www.lotuss.com/th HTML
 *      (`"buildId":"<id>"`).
 *   2. Fetch `https://www.lotuss.com/_next/data/{buildId}/th.json` and walk
 *      the pageProps for `productIds` arrays (shelf data embeds product ID
 *      strings).
 *   3. POST the collected IDs to the Lotus's mobile BFF products endpoint
 *      with a per-request `guest-id` UUID and `channel: web`.
 *
 * The BFF is RBAC-gated (403) and frequently returns 503 — in that case the
 * scraper logs and returns [] without fabricating data. A 2-second rate limit
 * is applied between BFF requests (same pattern as the Makro scraper's sleep).
 */

const LOTUSS_BASE = "https://www.lotuss.com";
const LOTUSS_BFF = "https://api-o2o.lotuss.com/lotuss-mobile-bff";

const RATE_LIMIT_MS = 2000; // 2 seconds between BFF requests
const CHUNK_SIZE = 20; // product IDs per BFF request

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function uuid(): string {
  return crypto.randomUUID();
}

async function detectBuildId(): Promise<string> {
  const html = await fetchHtml(`${LOTUSS_BASE}/th`);
  const match = html.match(/"buildId":"([^"]+)"/);
  if (!match?.[1]) throw new Error("Could not detect Lotus's build ID from homepage");
  return match[1];
}

/**
 * Recursively collect every `productIds` array (arrays of product ID strings)
 * found in the homepage pageProps payload. Shelves on the Lotus's homepage
 * embed these arrays under arbitrary key names, so a deep walk is required.
 */
function collectProductIds(node: unknown, found: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const item of node) collectProductIds(item, found);
    return found;
  }
  if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    if (Array.isArray(obj.productIds)) {
      for (const id of obj.productIds) {
        if (typeof id === "string" && id.trim()) found.push(id.trim());
      }
    }
    for (const value of Object.values(obj)) collectProductIds(value, found);
  }
  return found;
}

interface LotusProductItem {
  /** Defensive — the exact BFF shape is only visible behind RBAC auth. */
  name?: unknown;
  productName?: unknown;
  title?: unknown;
  price?: unknown;
  sellingPrice?: unknown;
  displayPrice?: unknown;
  unit?: unknown;
  salesUnit?: unknown;
  packSize?: unknown;
  displayUnit?: unknown;
}

/** Normalize one BFF product item to a ScrapedPrice, or null if unparseable. */
function toScrapedPrice(item: LotusProductItem): ScrapedPrice | null {
  if (!item || typeof item !== "object") return null;
  const name = String(item.name ?? item.productName ?? item.title ?? "").trim();
  if (!name) return null;

  let price: number | null = null;
  for (const raw of [item.sellingPrice, item.price, item.displayPrice]) {
    if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
      price = raw;
      break;
    }
    if (typeof raw === "string") {
      const num = parsePrice(raw.replace(/,/g, ""));
      if (num > 0) {
        price = num;
        break;
      }
    }
  }
  if (price === null) return null;

  const unit = String(
    item.displayUnit ?? item.salesUnit ?? item.unit ?? item.packSize ?? "",
  ).trim();
  return {
    sourceProductName: name,
    price,
    unit: unit ? (unit.startsWith("บาท") ? unit : `บาท/${unit}`) : "บาท/ชิ้น",
    provinceCode: null, // national reference (online pricing)
    sourceDate: new Date(),
  };
}

/** Parse the BFF products response into ScrapedPrice[]. */
function parseBffResponse(payload: unknown): ScrapedPrice[] {
  let items: LotusProductItem[] = [];
  if (Array.isArray(payload)) {
    items = payload as LotusProductItem[];
  } else if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    const data = obj.data ?? obj.items ?? obj.result ?? obj.products;
    if (Array.isArray(data)) items = data as LotusProductItem[];
  }

  const results: ScrapedPrice[] = [];
  for (const item of items) {
    const parsed = toScrapedPrice(item);
    if (parsed) results.push(parsed);
  }
  return results;
}

export const lotussScraper: Scraper = {
  sourceSlug: "lotuss",
  async scrape(): Promise<ScrapedPrice[]> {
    try {
      // 1. Detect build ID from the homepage HTML.
      const buildId = await detectBuildId();

      // 2. Collect product IDs from the homepage pageProps.
      const pageData = await fetchJson<unknown>(
        `${LOTUSS_BASE}/_next/data/${buildId}/th.json`,
      );
      const productIds = [...new Set(collectProductIds(pageData))];
      if (productIds.length === 0) {
        console.log("[Lotus's] No product IDs found on homepage, returning empty");
        return [];
      }

      // 3. Fetch product details from the BFF in chunks, rate-limited.
      const results: ScrapedPrice[] = [];
      for (let i = 0; i < productIds.length; i += CHUNK_SIZE) {
        const chunk = productIds.slice(i, i + CHUNK_SIZE);
        try {
          const payload = await fetchJson<unknown>(
            `${LOTUSS_BFF}/product/v2/products`,
            {
              method: "POST",
              headers: {
                Accept: "application/json",
                "guest-id": uuid(),
                channel: "web",
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ productIds: chunk }),
            },
          );
          results.push(...parseBffResponse(payload));
        } catch {
          console.log(
            "[Lotus's] API requires authentication (RBAC), returning empty",
          );
          return [];
        }
        await sleep(RATE_LIMIT_MS);
      }

      return results;
    } catch {
      console.log("[Lotus's] API requires authentication, returning empty");
      return [];
    }
  },
};
