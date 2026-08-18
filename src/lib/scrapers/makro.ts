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
export interface MakroProductDocument {
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

export interface MakroSearchHit {
  document: MakroProductDocument;
}

export interface MakroSearchResult {
  found: number;
  hits: MakroSearchHit[];
  page: number;
}

export interface MakroCategoryPageProps {
  initialSearchResult: MakroSearchResult;
}

export interface MakroCategoryResponse {
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

// Categories to scrape are derived from PRODUCT_CATEGORY_MAP (Step 4) — 15
// unique slugs: seafood ×5, dry grocery ×5, beverages ×1, meat ×3 (pork,
// poultry, beef), vegetables ×1.

const RATE_LIMIT_MS = 1500; // 1.5 seconds between requests

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ---------- Search API fetcher (Plan A fallback) ---------- */

async function fetchSearchProducts(
  buildId: string,
  query: string,
): Promise<MakroProductDocument[]> {
  const url = `${MAKRO_BASE}/_next/data/${buildId}/th/c/search.json?q=${encodeURIComponent(query)}`;
  try {
    const data = await fetchJson<MakroCategoryResponse>(url);
    const searchResult = data?.pageProps?.initialSearchResult;
    if (!searchResult || (searchResult.hits ?? []).length === 0) return [];

    // Search API doesn't paginate, but we still guard against unexpected page numbers
    if (searchResult.page !== 1) return [];

    return searchResult.hits.map((h) => h.document);
  } catch (error) {
    // On 404, we should propagate to the retry logic (build ID re-detection)
    if (error instanceof Error && error.message.includes("404")) {
      throw error;
    }
    // On any other error (malformed, network, etc.), log and return empty
    console.error(`[Makro] Failed to fetch search query '${query}':`, error);
    return [];
  }
}

async function fetchSearchProductsWithBuildIdRetry(
  buildId: string,
  query: string,
  retryCount = 0,
): Promise<{ products: MakroProductDocument[]; newBuildId: string }> {
  try {
    const products = await fetchSearchProducts(buildId, query);
    return { products, newBuildId: buildId };
  } catch (error) {
    if (retryCount === 0 && error instanceof Error && error.message.includes("404")) {
      console.log("[Makro] Build ID may have changed (search), re-detecting...");
      const newId = await detectBuildId();
      return fetchSearchProductsWithBuildIdRetry(newId, query, 1);
    }
    throw error;
  }
}

const MAX_PAGES = 3;

async function fetchCategoryProducts(
  buildId: string,
  categorySlug: string,
): Promise<MakroProductDocument[]> {
  const products: MakroProductDocument[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = page === 1
      ? `${MAKRO_BASE}/_next/data/${buildId}/th/c/${categorySlug}.json`
      : `${MAKRO_BASE}/_next/data/${buildId}/th/c/${categorySlug}.json?page=${page}`;
    try {
      const data = await fetchJson<MakroCategoryResponse>(url);
      const searchResult = data?.pageProps?.initialSearchResult;
      if (!searchResult || (searchResult.hits ?? []).length === 0) break;

      // Guard: if API returns a page number different from the one we
      // requested, it's ignoring pagination. Stop fetching further pages.
      if (searchResult.page !== page) break;

      products.push(...searchResult.hits.map((h) => h.document));
    } catch (error) {
      // On 404, we should propagate to the retry logic (build ID re-detection)
      if (error instanceof Error && error.message.includes("404")) {
        throw error;
      }
      // On any other error (malformed, network, etc.), log and continue
      console.error(`[Makro] Failed to fetch category ${categorySlug} page ${page}:`, error);
    }
  }
  return products;
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
  // Meat
  "หมูสับ": ["meat/pork"],
  "หมูสามชั้น": ["meat/pork"],
  "หมูสะโพก": ["meat/pork"],
  "ซี่โครงหมู": ["meat/pork"],
  "หมูคอสไลซ์": ["meat/pork"],
  "หมูบด": ["meat/pork"],
  "ไก่สด": ["meat/poultry"],
  "ไก่บด": ["meat/poultry"],
  "ไก่ย่าง": ["meat/poultry"],
  "ปีกไก่": ["meat/poultry"],
  "อกไก่": ["meat/poultry"],
  "น่องไก่": ["meat/poultry"],
  "เนื้อวัว": ["meat/beef"],
  "เนื้อวัวสไลซ์": ["meat/beef"],
  // Vegetables
  "ผักคะน้า": ["fruit-vegetables/vegetables/fresh-vegetables"],
  "ผักบุ้ง": ["fruit-vegetables/vegetables/fresh-vegetables"],
  "พริกขี้หนู": ["fruit-vegetables/vegetables/fresh-vegetables"],
  "มะเขือเทศ": ["fruit-vegetables/vegetables/fresh-vegetables"],
  "แตงกวา": ["fruit-vegetables/vegetables/fresh-vegetables"],
  "ถั่วฝักยาว": ["fruit-vegetables/vegetables/fresh-vegetables"],
  "ผักกวางตุ้งฮุง": ["fruit-vegetables/vegetables/fresh-vegetables"],
  // Fruit
  "ส้ม": ["fruit-vegetables/fruits"],
  "มะม่วง": ["fruit-vegetables/fruits"],
  "กล้วยน้ำว้า": ["fruit-vegetables/fruits"],
  "แตงโม": ["fruit-vegetables/fruits"],
  // Household
  "ผงซักฟอก": ["household/laundry"],
  "น้ำยาล้างจาน": ["household/dishwashing"],
  "น้ำยาถูพื้น": ["household/floor-cleaning"],
  "น้ำยาล้างห้องน้ำ": ["household/toilet-cleaning"],
  "ทิชชู่": ["household/tissue"],
  // Personal Care
  "สบู่ก้อน": ["personal-care/body-wash"],
  "แชมพู": ["personal-care/hair-care/shampoo"],
  "ยาสีฟัน": ["personal-care/oral-care/toothpaste"],
  "ครีมอาบน้ำ": ["personal-care/body-wash"],
  "ผ้าอนามัย": ["personal-care/sanitary"],
  // Pet Care
  "อาหารแมว": ["pet-care/cat-food"],
  "อาหารสุนัข": ["pet-care/dog-food"],
};

/**
 * Fold Thai sara-am to its precomposed form. Makro serves น+้+ํ+า (U+0E4D
 * U+0E32), which NFC leaves untouched; the seed mappings use น+้+ำ (U+0E33).
 */
const nfc = (s: string): string => s.normalize("NFC").replace(/\u0E4D\u0E32/g, "\u0E33");

/**
 * Substring match between a Makro title and a tracked product name. The
 * ปลาร้า exclusion stops "น้ำปลาร้า" (fermented fish) from matching "น้ำปลา".
 *
 * Special handling for "หมูคอสไลซ์": matches "หมูคอ" or "สันคอ" but NOT
 * generic "หมูสไลซ์" that lacks any neck-related keyword.
 *
 * `title` and `trackedName` are expected to already be NFC-folded (callers
 * pass `nfc(...)`), so no extra normalization happens here.
 *
 * Special handling for "หมูสะโพก": matches reversed "สะโพกหมู" (e.g.
 * "เซพแพ็ค สะโพกหมู 6 กก./แพ็ค") but forward-order "หมูสะโพก" still works via
 * the strict fallthrough (unlike "หมูสับ" which rejects non-alias strict matches).
 */
export function matchesName(title: string, trackedName: string): boolean {
  // Phase 1: Strict match (if title contains the name, it's a candidate)
  const strictMatch = title.includes(trackedName);

  // Phase 2: Alias-based matching for specific products
  if (trackedName === "หมูคอสไลซ์") {
    // Must contain a neck-related keyword. "คอหมู" is a contiguous substring
    // (reversed Thai word order, e.g. "คอหมูสําเร็จย่าง 1 กก."); "คอไก่" must
    // NOT match because it lacks the หมู prefix.
    if (title.includes("สันคอ") || title.includes("หมูคอ") || title.includes("คอหมู")) return true;
    // If we found a strict match but no neck keyword, reject (prevent generic "หมูสไลซ์")
    if (strictMatch) return false;
    return false;
  }

  if (trackedName === "หมูสับ") {
    if (title.includes("หมูบดอนามัย") || title.includes("เนื้อหมูบด")) return true;
    // If we found a strict match but not an alias, reject (prevent "หมูบด" mapping)
    if (strictMatch) return false;
  }

  if (trackedName === "หมูสะโพก") {
    // Reversed Thai word order: Makro titles use "สะโพกหมู" (e.g.
    // "เซพแพ็ค สะโพกหมู 6 กก./แพ็ค"). The bigram embeds หมู, so
    // "สะโพกไก่" cannot match. Forward-order strict match still accepted
    // via the fallthrough below.
    if (title.includes("สะโพกหมู")) return true;
  }

  if (trackedName === "ไก่สด") {
    // Makro sells only frozen whole chicken — titles use "ไก่ทั้งตัว"
    // (e.g. "ไก่ทั้งตัวพร้อมเครื่องในแช่แข็ง 1.8-2.0 กก./ตัว"). Chicken
    // parts (e.g. "สะโพกไก่") must NOT match: the bigram does not embed
    // "ทั้งตัว". Strict "ไก่สด" titles still work via the fallthrough below.
    if (title.includes("ไก่ทั้งตัว")) return true;
  }

  // Fallback to strict match result
  if (strictMatch) {
    if (trackedName === "น้ำปลา" && title.includes("ปลาร้า")) return false;
    return true;
  }

  return false;
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

/**
 * Detect wholesale case/multipack listings (ลัง = case, "x N" title
 * multiplier, or unitSize/unitFactor indicating >1 sellable units per pack).
 * These per-kg prices undercut every retail pack and misrepresent the
 * shelf price users compare against.
 */
function isBulkCase(p: MakroProductDocument): boolean {
  const title = nfc(p.title);
  if (title.includes("ลัง")) return true;
  const mult = title.match(/[x×]\s*(\d+)/i);
  if (mult && parseInt(mult[1], 10) > 1) return true;
  const unitCount = p.unitSize.match(/^(\d+)\s*unit/i);
  if (unitCount && parseInt(unitCount[1], 10) > 1) return true;
  return p.unitFactor > 1;
}

/** Cut-grade modifiers mark a cheaper product tier (see lotuss.ts). */
const isCutGrade = (title: string): boolean => title.includes("หนัง") || title.includes("ติดมัน");

/**
 * Representative-price policy: cheapest single-pack, plain-grade candidate.
 * Wholesale cases and cut-grade variants are excluded ONLY when better
 * candidates exist — if a dimension excludes everything (product sold only
 * as cases / only skin-on that day), fall back to that dimension's full
 * pool rather than dropping the product.
 */
function pickRepresentative<T extends { price: number; product: MakroProductDocument }>(
  normalized: T[],
): T {
  let pool = normalized.filter((n) => !isBulkCase(n.product));
  if (pool.length === 0) pool = normalized; // only cases exist — keep wholesale price
  let preferred = pool.filter((n) => !isCutGrade(nfc(n.product.title)));
  if (preferred.length === 0) preferred = pool; // only cut-grade — keep it
  return preferred.reduce((a, b) => (b.price < a.price ? b : a));
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
      const matchedNames = new Set<string>();

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

      // Pass 1 — category matching: pick the cheapest matching product (lowest
      // normalized price per kg/unit) as the base wholesale price.
      for (const [trackedName, categorySlugs] of Object.entries(PRODUCT_CATEGORY_MAP)) {
        try {
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

          const cheapest = pickRepresentative(normalized);

          results.push({
            sourceProductName: trackedName,
            price: cheapest.price,
            unit: cheapest.unit,
            provinceCode: null, // national wholesale reference
            sourceDate: today,
            productTitle: nfc(cheapest.product.title),
            productUrl: `https://www.makro.pro/th/p/${cheapest.product.makroId}-${cheapest.product.id}`,
          });
          matchedNames.add(trackedName);
        } catch (itemErr) {
          console.error(`[Makro] Error processing product "${trackedName}":`, itemErr);
        }
      }

      // Pass 2 — search fallback: the category top-20 listing rotates, so any
      // tracked product with zero category candidates may still be findable
      // via the site search API. Search the tracked name verbatim (both word
      // orders return the same relevant hits) and match with the same rules.
      const zeroCandidateNames: string[] = [];
      for (const trackedName of Object.keys(PRODUCT_CATEGORY_MAP)) {
        if (matchedNames.has(trackedName)) continue; // avoid duplicate rows

        try {
          const { products, newBuildId } = await fetchSearchProductsWithBuildIdRetry(buildId, trackedName);
          buildId = newBuildId;
          // Throttle EVERY search fetch (spec: RATE_LIMIT_MS between calls),
          // regardless of whether candidates were found.
          await sleep(RATE_LIMIT_MS);

          const candidates = products.filter((p) => matchesName(nfc(p.title), nfc(trackedName)));
          if (candidates.length > 0) {
            const normalized = candidates
              .map((p) => ({ ...normalizePrice(p, trackedName), product: p }))
              .filter((n) => n.price > 0);

            if (normalized.length > 0) {
              const cheapest = pickRepresentative(normalized);
              results.push({
                sourceProductName: trackedName,
                price: cheapest.price,
                unit: cheapest.unit,
                provinceCode: null,
                sourceDate: today,
                productTitle: nfc(cheapest.product.title),
                productUrl: `https://www.makro.pro/th/p/${cheapest.product.makroId}-${cheapest.product.id}`,
              });
              continue; // found via search — not zero-candidate
            }
          }
        } catch (searchErr) {
          console.error(`[Makro] Search fallback failed for "${trackedName}":`, searchErr);
        }
        zeroCandidateNames.push(trackedName);
      }

      if (zeroCandidateNames.length > 0) {
        console.log(`[Makro] No candidates for: ${zeroCandidateNames.join(", ")}`);
      }

      return results;
    } catch (error) {
      console.error("[Makro scraper] Error:", error);
      return [];
    }
  },
};
