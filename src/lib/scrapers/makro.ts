import type { Scraper, ScrapedPrice } from "./types";
import { fetchHtml, fetchJson } from "./types";

/**
 * Makro Pro (makro.pro) — REAL scraper.
 *
 * Makro Pro is a Next.js (pages router) site backed by Typesense search.
 * Category pages are server-rendered; the `_next/data` endpoints return the
 * first 20 products of a category embedded in
 * `pageProps.initialSearchResult.hits[*].document`. Query params (pagination)
 * are ignored — always page 1 — which is enough for price matching.
 *
 * The build ID changes on every deploy, so it is re-detected from the
 * homepage HTML before scraping and re-detected once per category if a 404
 * indicates a mid-run deploy.
 *
 * NOTE (verified Aug 2026): Makro titles encode the Thai vowel sara-am in a
 * non-canonical order — น+้+ํ+า (U+0E4D U+0E32) instead of the canonical
 * น+้+ำ (U+0E33). NFC does NOT fix this (class-0 marks are never reordered),
 * so matching explicitly folds both spellings to the precomposed form.
 */

/* ---------- Step 1: Typesense response types ---------- */

/** Shape of a product document from Makro's Typesense search results. */
interface MakroProductDocument {
  title: string;
  titleEn: string;
  displayPrice: number;
  originalPrice: number;
  packagingWeight: number; // number in the real API (shipping weight, kg)
  brand: string;
  brandEn: string;
  makroId: number | string;
  id: number | string;
  images: string[];
  inStock: number;
  categories: string[];
  unitSize: string;
  unitType: string;
  unitFactor: number;
}

interface MakroSearchHit {
  document: MakroProductDocument;
}

interface MakroSearchResult {
  found: number;
  hits: MakroSearchHit[];
  page: number;
}

interface MakroCategoryPageProps {
  initialSearchResult: MakroSearchResult;
}

interface MakroCategoryResponse {
  pageProps: MakroCategoryPageProps;
}

/* ---------- Step 2: Build ID auto-detection ---------- */

const MAKRO_BASE = "https://www.makro.pro";

async function detectBuildId(): Promise<string> {
  const html = await fetchHtml(`${MAKRO_BASE}/th`);
  const match = html.match(/"buildId":"([^"]+)"/);
  if (!match?.[1]) throw new Error("Could not detect Makro build ID from homepage");
  return match[1];
}

/* ---------- Step 3: Category fetcher with rate limiting ---------- */

// Categories to scrape are derived from PRODUCT_CATEGORY_MAP (Step 4) — the
// same 11 slugs: seafood ×5, dry grocery ×5, beverages ×1.

const RATE_LIMIT_MS = 1500; // 1.5 seconds between requests

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchCategoryProducts(
  buildId: string,
  categorySlug: string,
): Promise<MakroProductDocument[]> {
  const url = `${MAKRO_BASE}/_next/data/${buildId}/th/c/${categorySlug}.json`;
  const data = await fetchJson<MakroCategoryResponse>(url);
  const hits = data?.pageProps?.initialSearchResult?.hits ?? [];
  return hits.map((h) => h.document);
}

/* ---------- Step 4: Product name matching ---------- */

/** Map of tracked product names to the Makro categories they appear in. */
const PRODUCT_CATEGORY_MAP: Record<string, string[]> = {
  "ปลาทู": ["fish-seafood/fish"],
  "กุ้งกุลาดำ": ["fish-seafood/shrip-prawns"],
  "กุ้งขาว": ["fish-seafood/shrip-prawns"],
  "ปลาหมึก": ["fish-seafood/squid"],
  "ปูม้า": ["fish-seafood/crab"],
  "หอยแมลงภั่ง": ["fish-seafood/shell-fish-oyster"],
  "ปลาสำเตร็ง": ["fish-seafood/fish"],
  "ปลานิล": ["fish-seafood/fish"],
  "ข้าวหอมมะลิ": ["dry-grocery/grains-rice-cereal"],
  "ข้าวขาว": ["dry-grocery/grains-rice-cereal"],
  "น้ำตาลทราย": ["dry-grocery/seasoning-and-spices"],
  "น้ำมันปาล์ม": ["dry-grocery/cooking-oil-vinegar"],
  "น้ำมันถั่วเหลือง": ["dry-grocery/cooking-oil-vinegar"],
  "น้ำปลา": ["dry-grocery/seasoning-and-spices"],
  "น้ำดื่ม": ["beverages"],
  "บะหมี่กึ่งสำเร็จรูป": ["dry-grocery/seasoning-and-spices"],
  "แป้งสาลี": ["dry-grocery/flour"],
  "ไข่ไก่": ["dry-grocery/eggs"],
};

/**
 * Fold Thai sara-am to its precomposed form. Makro serves น+้+ํ+า (U+0E4D
 * U+0E32), which NFC leaves untouched; the seed mappings use น+้+ำ (U+0E33).
 */
const nfc = (s: string): string => s.normalize("NFC").replace(/\u0E4D\u0E32/g, "\u0E33");

/**
 * Substring match between a Makro title and a tracked product name. The
 * ปลาร้า exclusion stops "น้ำปลาร้า" (fermented fish) from matching "น้ำปลา".
 */
function matchesName(title: string, trackedName: string): boolean {
  if (!title.includes(trackedName)) return false;
  if (trackedName === "น้ำปลา" && title.includes("ปลาร้า")) return false;
  return true;
}

/* ---------- Step 5: Price normalization ---------- */

/**
 * Extract net weight in kg (or liters) from a Makro title. Titles encode
 * size as "1 กก.", "500 ก.", "5 ล.", "630 มล." plus bulk multipliers
 * ("500 ก. x 10"). Per-piece weights inside ranges ("55-85 ก./ชิ้น") are
 * excluded.
 */
function extractTitleWeight(title: string): number | null {
  const mult = title.match(/[x×]\s*(\d+)/i);
  const multiplier = mult ? parseInt(mult[1], 10) : 1;

  const kg = title.match(/(\d+(?:\.\d+)?)\s*(?:กก\.?|กิโลกรัม|kg\.?)/i);
  if (kg) return parseFloat(kg[1]) * multiplier;

  const g = title.match(/(\d+(?:\.\d+)?)\s*(?:กรัม|g\.|ก\.(?![ก/]))/i);
  if (g) return (parseFloat(g[1]) * multiplier) / 1000;

  const l = title.match(/(\d+(?:\.\d+)?)\s*(?:ลิตร|[ลl]\.?)/i);
  if (l) return parseFloat(l[1]) * multiplier;

  const ml = title.match(/(\d+(?:\.\d+)?)\s*(?:มล\.|ml\.?)/i);
  if (ml) return (parseFloat(ml[1]) * multiplier) / 1000;

  return null;
}

/** Egg count per pack from the title ("30 ฟอง", "30 ฟอง x 5"; fallback 30). */
function extractEggCount(title: string): number {
  const mult = title.match(/[x×]\s*(\d+)/i);
  const multiplier = mult ? parseInt(mult[1], 10) : 1;
  const fong = title.match(/(\d+(?:\.\d+)?)\s*ฟอง/);
  if (fong) return Math.round(parseFloat(fong[1]) * multiplier);
  return 30;
}

/**
 * Convert a Makro package price to a comparable per-kg/per-unit price.
 * Title-encoded size is preferred over `packagingWeight`, which is the
 * shipping weight (e.g. "กุ้งขาว ไซส์ S 1 กก." ships at 0.50 kg).
 */
function normalizePrice(
  product: MakroProductDocument,
  trackedName: string,
): { price: number; unit: string } {
  const title = nfc(product.title);
  const round = (n: number) => Math.round(n * 100) / 100;

  // Eggs: trays/packs — divide the pack price by the number of eggs in it.
  if (trackedName === "ไข่ไก่") {
    const count = extractEggCount(title);
    return { price: round(product.displayPrice / count), unit: "บาท/ฟอง" };
  }

  // Per-unit items: keep the item price as-is.
  if (trackedName === "น้ำดื่ม") return { price: product.displayPrice, unit: "บาท/ขวด" };
  if (trackedName === "บะหมี่กึ่งสำเร็จรูป") return { price: product.displayPrice, unit: "บาท/ซอง" };
  if (trackedName === "น้ำปลา") return { price: product.displayPrice, unit: "บาท/ขวด" };

  // Oil: density ≈ 1, so weight in kg ≈ volume in liters.
  if (nfc(trackedName).includes("น้ำมัน")) {
    const liters = extractTitleWeight(title) ?? (product.packagingWeight > 0 ? product.packagingWeight : null);
    if (liters && liters > 0) return { price: round(product.displayPrice / liters), unit: "บาท/ลิตร" };
    return { price: product.displayPrice, unit: "บาท/ลิตร" };
  }

  // Default: per kg.
  const weightKg = extractTitleWeight(title) ?? (product.packagingWeight > 0 ? product.packagingWeight : null);
  if (weightKg && weightKg > 0) return { price: round(product.displayPrice / weightKg), unit: "บาท/กก." };
  return { price: product.displayPrice, unit: "บาท/กก." };
}

/* ---------- Step 6: Build ID retry on 404 ---------- */

async function fetchWithBuildIdRetry(
  buildId: string,
  categorySlug: string,
  retryCount = 0,
): Promise<{ products: MakroProductDocument[]; newBuildId: string }> {
  try {
    const products = await fetchCategoryProducts(buildId, categorySlug);
    return { products, newBuildId: buildId };
  } catch (error) {
    if (retryCount === 0 && error instanceof Error && error.message.includes("404")) {
      console.log("[Makro] Build ID may have changed, re-detecting...");
      const newId = await detectBuildId();
      return fetchWithBuildIdRetry(newId, categorySlug, 1);
    }
    throw error;
  }
}

/* ---------- Step 7: Main scraper ---------- */

export const makroScraper: Scraper = {
  sourceSlug: "makro",
  async scrape(): Promise<ScrapedPrice[]> {
    try {
      let buildId = await detectBuildId();
      const today = new Date();
      const results: ScrapedPrice[] = [];

      // Dedupe categories to fetch.
      const categoriesToFetch = [...new Set(Object.values(PRODUCT_CATEGORY_MAP).flat())];

      // Fetch all categories, collecting products.
      const categoryProducts = new Map<string, MakroProductDocument[]>();
      for (const slug of categoriesToFetch) {
        try {
          const { products, newBuildId } = await fetchWithBuildIdRetry(buildId, slug);
          buildId = newBuildId;
          categoryProducts.set(slug, products);
        } catch (error) {
          console.error(`[Makro] Failed to fetch category ${slug}:`, error);
        }
        await sleep(RATE_LIMIT_MS);
      }

      // Match tracked products: pick the cheapest matching product (lowest
      // normalized price per kg/unit) as the base wholesale price.
      for (const [trackedName, categorySlugs] of Object.entries(PRODUCT_CATEGORY_MAP)) {
        const candidates: MakroProductDocument[] = [];
        for (const slug of categorySlugs) {
          const products = categoryProducts.get(slug) ?? [];
          candidates.push(...products.filter((p) => matchesName(nfc(p.title), nfc(trackedName))));
        }

        if (candidates.length === 0) continue;

        const normalized = candidates
          .map((p) => ({ ...normalizePrice(p, trackedName), product: p }))
          .filter((n) => n.price > 0);

        if (normalized.length === 0) continue;

        const cheapest = normalized.reduce((a, b) => (b.price < a.price ? b : a));

        results.push({
          sourceProductName: trackedName,
          price: cheapest.price,
          unit: cheapest.unit,
          provinceCode: null, // national wholesale reference
          sourceDate: today,
        });
      }

      return results;
    } catch (error) {
      console.error("[Makro scraper] Error:", error);
      return [];
    }
  },
};
