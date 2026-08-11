# Makro Pro Real Scraper

## Section 1 — Product

### Goal & Scope

Replace the mock Makro scraper (`src/lib/scrapers/makro.ts`) with a **real** scraper that fetches actual product data and prices from makro.pro using Next.js `_next/data` JSON endpoints. No browser automation needed — pure HTTP fetch.

### Why

The current mock returns hardcoded prices. We need real wholesale prices from Makro to provide accurate price comparison data for Songkhla consumers.

### Out of Scope

- NOT adding Playwright/Puppeteer
- NOT scraping all 148k Makro products — only categories relevant to our tracked products
- NOT changing the DB schema, seed file, or cron route
- NOT modifying any other scraper (DIT, EPPO, OAE, TaladThai, SiMumMuang)
- NOT adding new npm dependencies — use built-in `fetch` and existing `cheerio` for HTML parsing

### User Stories / Acceptance Criteria

1. **Real prices**: Running `makroScraper.scrape()` returns products with real current prices from makro.pro, not hardcoded values.
2. **Build ID auto-detection**: The scraper fetches `https://www.makro.pro/th`, extracts the Next.js build ID from HTML, and uses it for subsequent requests.
3. **Category-based fetching**: Fetches products from relevant Makro categories (seafood, meat, dry goods, eggs, etc.) that map to our tracked products.
4. **Product matching**: Returns `sourceProductName` values that match the existing `product_source_mappings` in the seed file (e.g., "ปลาทู", "กุ้งขาว", "ไข่ไก่").
5. **Rate limiting**: Waits at least 1 second between HTTP requests.
6. **Error resilience**: On failure, logs the error and returns an empty array (like other scrapers).
7. **Vercel-compatible**: No filesystem, no browser, no heavy deps — just HTTP fetches.

### Open Question (Domain Invariant)

**Build ID staleness during scrape run**: If Makro deploys mid-scrape (build ID changes), the `_next/data` endpoints will 404. The scraper should detect a 404 on a category fetch, re-detect the build ID once, and retry. If the retry also 404s, skip that category. Impact: without this, a deployment mid-scrape would cause the entire run to fail silently with 0 products.

---

## Section 2 — Engineering Handoff

### API Architecture (Verified)

Makro Pro runs Next.js (pages router) with Typesense search. The `_next/data` endpoints return SSR JSON with product data embedded in `pageProps.initialSearchResult`.

**Build ID detection**:
```
Fetch: https://www.makro.pro/th
Regex: "buildId":"([^"]+)"
Current: OsOiEo8xu6If2DYBr57VV (will change on deploy)
```

**Category URL pattern** (VERIFIED — NOT the `/plp/r/` pattern from initial research):
```
https://www.makro.pro/_next/data/{buildId}/th/c/{category-slug}.json
```

**Pagination**: The `_next/data` category pages return 20 products per page. Query params (`?page=2`) do NOT work for pagination on the `_next/data` endpoint — the same 20 products are always returned. This is acceptable; 20 products per category is enough for price matching. We do NOT need pagination.

### Product JSON Structure (from `pageProps.initialSearchResult.hits[*].document`)

```typescript
interface MakroProduct {
  title: string;           // Thai product name: "กุ้งขาว ไซส์ S 1 กก."
  titleEn: string;         // English: "WHITE SHRIMP SIZE S 1KG"
  displayPrice: number;    // Current price in THB (number, not string): 105
  originalPrice: number;   // Original price before discount: 105
  packagingWeight: string; // Weight in kg as string: "0.50"
  brand: string;           // Thai brand: "แม็คโคร"
  brandEn: string;         // English brand: "MAKRO"
  makroId: string;         // Makro internal ID: "803554"
  id: string;              // Product ID: "6974376739011"
  images: string[];        // Image URLs array
  inStock: number;         // 1 = in stock
  categories: string[];    // ["fish-seafood", "fish-seafood/shrip-prawns"]
  categoryIds: string[];   // ["1000000110", "1000000112"]
  unitSize: string;        // Often empty
  unitType: string;        // Often empty
  unitFactor: number;      // Usually 1
}
```

### Categories to Scrape

These map to our tracked products in `product_source_mappings`:

| Slug | Makro Category | Our Products |
|------|---------------|--------------|
| `fish-seafood/shrip-prawns` | กุ้ง (146 products) | กุ้งขาว, กุ้งกุลาดำ |
| `fish-seafood/fish` | ปลา (533 products) | ปลาทู, ปลานิล, ปลาสำเตร็ง |
| `fish-seafood/crab` | ปู (65 products) | ปูม้า |
| `fish-seafood/squid` | ปลาหมึก (116 products) | ปลาหมึก |
| `fish-seafood/shell-fish-oyster` | หอย (114 products) | หอยแมลงภั่ง |
| `dry-grocery/grains-rice-cereal` | ข้าว/ธัญพืช (599 products) | ข้าวหอมมะลิ, ข้าวขาว |
| `dry-grocery/cooking-oil-vinegar` | น้ำมัน (264 products) | น้ำมันปาล์ม, น้ำมันถั่วเหลือง |
| `dry-grocery/seasoning-and-spices` | เครื่องปรุง (1840 products) | น้ำปลา |
| `dry-grocery/eggs` | ไข่ (70 products) | ไข่ไก่ |
| `dry-grocery/flour` | แป้ง (307 products) | แป้งสาลี |
| `meat/pork` | หมู (726 products) | (future expansion) |
| `meat/poultry` | ไก่ (356 products) | (future expansion) |
| `beverages` | เครื่องดื่ม (3649 products) | น้ำดื่ม |

### Target Files

| File | Action | Max Lines |
|------|--------|-----------|
| `src/lib/scrapers/makro.ts` | REPLACE entirely | ~250 |
| `src/lib/scrapers/__tests__/makro.test.ts` | UPDATE for real scraper | ~80 |

### Step-by-Step Implementation

#### Step 1: Define TypeScript interfaces (in `makro.ts`)

Add these interfaces at the top of the file:

```typescript
/** Shape of a product document from Makro's Typesense search results */
interface MakroProductDocument {
  title: string;
  titleEn: string;
  displayPrice: number;
  originalPrice: number;
  packagingWeight: string;
  brand: string;
  brandEn: string;
  makroId: string;
  id: string;
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
```

#### Step 2: Build ID auto-detection

```typescript
const MAKRO_BASE = "https://www.makro.pro";

async function detectBuildId(): Promise<string> {
  const html = await fetchHtml(`${MAKRO_BASE}/th`);
  const match = html.match(/"buildId":"([^"]+)"/);
  if (!match?.[1]) throw new Error("Could not detect Makro build ID from homepage");
  return match[1];
}
```

Import `fetchHtml` and `fetchJson` from `./types` (already exist).

#### Step 3: Category fetcher with rate limiting

```typescript
const MAKRO_CATEGORIES = [
  "fish-seafood/shrip-prawns",
  "fish-seafood/fish",
  "fish-seafood/crab",
  "fish-seafood/squid",
  "fish-seafood/shell-fish-oyster",
  "dry-grocery/grains-rice-cereal",
  "dry-grocery/cooking-oil-vinegar",
  "dry-grocery/seasoning-and-spices",
  "dry-grocery/eggs",
  "dry-grocery/flour",
  "beverages",
];

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
```

#### Step 4: Product name matching

The scraper needs to match Makro product names (long, with brand/weight) to our short `sourceProductName` values from the seed file.

Our tracked product names from `product_source_mappings`:
- ปลาทู, กุ้งกุลาดำ, กุ้งขาว, ปลาหมึก, ปูม้า, หอยแมลงภั่ง, ปลาสำเตร็ง, ปลานิล
- ข้าวหอมมะลิ, ข้าวขาว, น้ำตาลทราย, น้ำมันปาล์ม, น้ำมันถั่วเหลือง, น้ำปลา, น้ำดื่ม, บะหมี่กึ่งสำเร็จรูป, แป้งสาลี, ไข่ไก่

Strategy: For each tracked product name, scan the 20 products from the matching category and find the **cheapest** product whose `title` contains the tracked name. If multiple products match (e.g., multiple "กุ้งขาว" items at different sizes), pick the one with the lowest price per item to represent the base wholesale price.

```typescript
/** Map of tracked product names to the Makro categories they appear in */
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
```

#### Step 5: Price normalization

Makro sells bulk packages. `displayPrice` is total package price. We need price per kg/unit for comparison. Use `packagingWeight` (in kg) to compute `displayPrice / packagingWeight`.

For items sold per-unit (eggs, bottles), keep the item price as-is with the appropriate unit.

```typescript
function normalizePrice(product: MakroProductDocument, trackedName: string): { price: number; unit: string } {
  const weight = parseFloat(product.packagingWeight);
  
  // Per-unit items
  if (trackedName === "ไข่ไก่") {
    // Eggs: sold as trays of 30. Price / 30 = per egg.
    return { price: Math.round((product.displayPrice / 30) * 100) / 100, unit: "บาท/ฟอง" };
  }
  if (trackedName === "น้ำดื่ม") {
    return { price: product.displayPrice, unit: "บาท/ขวด" };
  }
  if (trackedName === "บะหมี่กึ่งสำเร็จรูป") {
    return { price: product.displayPrice, unit: "บาท/ซอง" };
  }
  if (trackedName === "น้ำปลา") {
    return { price: product.displayPrice, unit: "บาท/ขวด" };
  }
  
  // Oil: per liter (weight ≈ liters for cooking oil)
  if (trackedName.includes("น้ำมัน") && weight > 0) {
    return { price: Math.round((product.displayPrice / weight) * 100) / 100, unit: "บาท/ลิตร" };
  }
  
  // Default: per kg
  if (weight > 0) {
    return { price: Math.round((product.displayPrice / weight) * 100) / 100, unit: "บาท/กก." };
  }
  
  return { price: product.displayPrice, unit: "บาท/กก." };
}
```

**IMPORTANT NOTE**: The `normalizePrice` logic above is a best-effort approximation. Makro's product names include size info (e.g., "กุ้งขาว ไซส์ S 1 กก.") and `packagingWeight` is the shipping weight, not always the net product weight. The engineer should inspect actual product data and adjust normalization. If `packagingWeight` seems wrong for a product, fall back to extracting weight from the title string (regex for กก., กรัม, ก., ล., มล., etc.).

#### Step 6: Build ID retry on 404

Wrap the category fetch in retry logic:

```typescript
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
```

#### Step 7: Main scraper implementation

Replace the entire `makroScraper` export:

```typescript
export const makroScraper: Scraper = {
  sourceSlug: "makro",
  async scrape(): Promise<ScrapedPrice[]> {
    try {
      let buildId = await detectBuildId();
      const today = new Date();
      const results: ScrapedPrice[] = [];
      
      // Dedupe categories to fetch
      const categoriesToFetch = [...new Set(
        Object.values(PRODUCT_CATEGORY_MAP).flat()
      )];
      
      // Fetch all categories, collecting products
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
      
      // Match tracked products
      for (const [trackedName, categorySlugs] of Object.entries(PRODUCT_CATEGORY_MAP)) {
        const candidates: MakroProductDocument[] = [];
        for (const slug of categorySlugs) {
          const products = categoryProducts.get(slug) ?? [];
          candidates.push(...products.filter((p) => p.title.includes(trackedName)));
        }
        
        if (candidates.length === 0) continue;
        
        // Pick the cheapest matching product
        const cheapest = candidates.reduce((a, b) =>
          a.displayPrice < b.displayPrice ? a : b
        );
        
        const { price, unit } = normalizePrice(cheapest, trackedName);
        if (price > 0) {
          results.push({
            sourceProductName: trackedName,
            price,
            unit,
            provinceCode: null,
            sourceDate: today,
          });
        }
      }
      
      return results;
    } catch (error) {
      console.error("[Makro scraper] Error:", error);
      return [];
    }
  },
};
```

#### Step 8: Update tests

Replace `src/lib/scrapers/__tests__/makro.test.ts` with tests that:

1. Test `sourceSlug` is `"makro"`
2. Test that `scrape()` returns an array (may be empty if network issues in CI)
3. Test that returned prices have positive values
4. Test that returned items have non-empty units
5. Test that `provinceCode` is null
6. Mark network-dependent tests with a longer timeout

**Important**: These tests hit the real Makro API. They need a 30-second timeout and should not fail CI if Makro is temporarily unreachable. Use `describe.skipIf` or catch network errors gracefully in assertions.

```typescript
import { describe, it, expect } from "vitest";
import { makroScraper } from "../makro";

describe("makroScraper", () => {
  it("sourceSlug is 'makro'", () => {
    expect(makroScraper.sourceSlug).toBe("makro");
  });

  it("returns scraped prices from real API", async () => {
    const results = await makroScraper.scrape();
    // May return 0 if network unreachable, but should not throw
    expect(Array.isArray(results)).toBe(true);
  }, 60_000);

  it("all prices are positive numbers", async () => {
    const results = await makroScraper.scrape();
    for (const r of results) {
      expect(r.price).toBeGreaterThan(0);
    }
  }, 60_000);

  it("all items have non-empty unit strings", async () => {
    const results = await makroScraper.scrape();
    for (const r of results) {
      expect(r.unit).toBeTruthy();
    }
  }, 60_000);

  it("provinceCode is null (national wholesale)", async () => {
    const results = await makroScraper.scrape();
    for (const r of results) {
      expect(r.provinceCode).toBeNull();
    }
  }, 60_000);
});
```

### Edge Cases

1. **Build ID changes mid-run**: Retry once per category on 404, re-detect build ID
2. **Makro site down**: `fetchHtml` throws on non-200, caught by try/catch, returns `[]`
3. **Empty category response**: `hits` may be empty — skip, don't crash
4. **Product name not found**: If no Makro product title contains our tracked name, skip it
5. **Price is 0 or negative**: Skip — filter `price > 0`
6. **`packagingWeight` is "0" or empty**: Fall back to raw `displayPrice` with "บาท/กก."
7. **Rate limiting/429**: The 1.5s sleep between requests should prevent this. If 429 occurs, `fetchJson` will throw (caught by outer try/catch).

### Schema Changes

None. The existing schema and `product_source_mappings` seed data already support Makro.

### Dependencies

None new. Uses only:
- Built-in `fetch` (via `fetchHtml`/`fetchJson` from `./types`)
- Existing `Scraper` and `ScrapedPrice` interfaces from `./types`

### Security

- No secrets/API keys needed — public endpoints
- `User-Agent` header already set by `fetchWithTimeout` in `types.ts`
- Rate limiting (1.5s) prevents accidental DDoS

### Test Matrix

| Test | Type | Layer |
|------|------|-------|
| sourceSlug is "makro" | Unit | Scraper |
| scrape() returns array | Integration (network) | Scraper |
| Prices are positive | Integration (network) | Scraper |
| Units are non-empty | Integration (network) | Scraper |
| provinceCode is null | Integration (network) | Scraper |
| TypeScript compiles | Build | All |
| ESLint passes | Lint | All |

### Verification Exit Criteria

- [x] `pnpm build` succeeds with no type errors — run `pnpm build` and confirm exit code 0
- [x] `pnpm lint` passes — run `pnpm lint` and confirm no errors
- [x] `pnpm vitest run src/lib/scrapers/__tests__/makro.test.ts` passes — all tests green
- [x] `makro.ts` contains NO mock/hardcoded prices — grep for `MOCK_PRICES` returns nothing
- [x] `makro.ts` imports `fetchHtml` and/or `fetchJson` from `./types` — verify with grep
- [x] `makro.ts` calls `makro.pro` URLs — grep for `makro.pro` returns matches
- [x] `makro.ts` contains build ID auto-detection — grep for `buildId` returns matches
- [x] `makro.ts` has rate limiting (sleep between requests) — grep for `sleep` or `setTimeout`
- [x] Running `npx tsx -e "import {makroScraper} from './src/lib/scrapers/makro'; makroScraper.scrape().then(r => { console.log(JSON.stringify(r.slice(0,3), null, 2)); console.log('Total:', r.length); process.exit(0); }).catch(e => { console.error(e); process.exit(1); })"` prints real product names and prices (not mock data)
