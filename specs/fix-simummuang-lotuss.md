# Fix Si Mum Muang + Lotus's Scrapers

## Section 1 — Product

### Goal
Fix two broken scrapers that return empty arrays:
1. **Si Mum Muang** (`simummuang.ts`) — API endpoint was wrong (`/api/pricing` → 404). Correct endpoint is `/api/app/products` which is **PUBLIC, no auth needed**. Confirmed working with real data.
2. **Lotus's** (`lotuss.ts`) — Prices are loaded client-side via RBAC-gated BFF that returns 503 from server-side. Confirmed **impossible without browser**. Implement graceful fallback with documentation.

### Out of Scope
- NO Playwright/Puppeteer/browser automation
- NO changes to DIT, EPPO, Makro scrapers
- NO mock/fabricated data
- NO Lotus's auth bypass attempts

### Acceptance Criteria
1. Si Mum Muang scraper returns real price data (≥5 products matched)
2. Lotus's scraper returns `[]` gracefully without crashing, with console warning documenting why
3. All scrapers still run via cron endpoint without errors
4. `pnpm build` and `pnpm lint` pass
5. Existing tests still pass

---

## Section 2 — Engineering Handoff

### Research Findings (verified live via curl)

#### Si Mum Muang API — FULLY ACCESSIBLE
- **Base URL:** `https://api.simummuangmarket.com/api`
- **Products endpoint:** `GET /app/products?page=1&limit=100`
- **NO auth token needed** — the old scraper was hitting `/api/pricing` (404) and `/api/products` (401). The correct public path is `/app/products`.
- **Pagination:** `page` (1-indexed) + `limit` (max ~100). 967 total products, 10 pages at limit=100.
- **Filter:** `isShow=true` returns only 11 featured products. Do NOT use this filter — we need all products.
- **Rate limit:** 2 seconds between requests (project constraint).

**Response shape (verified):**
```json
{
  "message": "lists successfully",
  "data": {
    "data": [
      {
        "_id": "6989b7a19dedd7cd1b2e81a8",
        "th": { "name": "ฝรั่งกิมจู" },
        "en": { "name": "Kim Choo Guava" },
        "prod_unit_id": {
          "th": { "name": "กิโลกรัม" },
          "en": { "name": "kg" }
        },
        "prod_category_id": {
          "th": { "name": "ผลไม้" },
          "en": { "name": "fruit" }
        },
        "price": {
          "small": { "min": 20, "max": 25 },
          "medium": { "min": 25, "max": 30 },
          "large": { "min": 35, "max": 38 }
        },
        "isShow": true,
        "isActive": true
      }
    ],
    "total": 967,
    "totalPages": 10,
    "currentPage": 1
  },
  "statusCode": 200
}
```

**Price structure:** Three size tiers (small/medium/large), each with min/max. Many products have `{min:0, max:0}` for some tiers — these are "no data", not free.

**Matching challenge:** API names don't exactly match seed canonical names. Examples:
- API: "ต้นคะน้า" → Seed: "ผักคะน้า"
- API: "ผักบุ้งจีน" → Seed: "ผักบุ้ง"
- API: "ถั่วฝักยาว เนื้อ" → Seed: "ถั่วฝักยาว"
- API: "พริกขี้หนูสวนม้ง(เชียงใหม่)" → Seed: "พริกขี้หนู"
- API: "มะเขือเทศสีดา" → Seed: "มะเขือเทศ"
- API: "แตงกวา" → Seed: "แตงกวา" (exact match)

**Domain note:** Si Mum Muang is a wholesale produce market (vegetables, fruits, some dried goods). It does NOT sell meat, rice, oil, eggs, fuel, or seafood. Only vegetable/fruit tracked products will match.

#### Lotus's API — CONFIRMED BLOCKED
- **BFF endpoint** (`api-o2o.lotuss.com/lotuss-mobile-bff/product/v2/products`) → **503 Service Temporarily Unavailable**
- **Product page SSR** (`lotuss.com/th/product/{id}`) → `productDetailSSR: {}`, price shows `฿0.00`
- **`_next/data` homepage** → has `displayPrices` field but empty; has `storeID: "8210"` but no actual prices
- **Strapi backend** (`lotuss-strapi-backend-th.prod.o2o.it-lotus.com`) → times out from server-side
- **Conclusion:** Prices are loaded entirely client-side via JS API calls that are RBAC/Cloudflare gated. Server-side scraping is impossible without Playwright.

### Target Files

| File | Action | Max Lines |
|------|--------|-----------|
| `src/lib/scrapers/simummuang.ts` | **REWRITE** | ≤300 |
| `src/lib/scrapers/lotuss.ts` | **SIMPLIFY** (graceful fallback) | ≤100 |
| `src/lib/scrapers/__tests__/simummuang.test.ts` | **CREATE** | ≤60 |
| `src/lib/scrapers/__tests__/lotuss.test.ts` | **CREATE** | ≤40 |

### Step-by-Step Edits

#### Step 1: Rewrite `src/lib/scrapers/simummuang.ts`

**Delete** the entire current file content and replace with a new implementation:

**Constants:**
```typescript
const SIMUMMUANG_API = "https://api.simummuangmarket.com/api/app/products";
const RATE_LIMIT_MS = 2000;
const PAGE_LIMIT = 100;
```

**Type definitions for the API response:**
```typescript
interface SmmPriceTier {
  min: number;
  max: number;
}
interface SmmPrice {
  small: SmmPriceTier;
  medium: SmmPriceTier;
  large: SmmPriceTier;
}
interface SmmProduct {
  th?: { name?: string };
  en?: { name?: string };
  prod_unit_id?: { th?: { name?: string } };
  price?: SmmPrice;
  isShow?: boolean;
  isActive?: boolean;
}
interface SmmResponse {
  data: {
    data: SmmProduct[];
    total: number;
    totalPages: number;
    currentPage: number;
  };
  statusCode: number;
}
```

**Product matching map** — map seed canonical Thai names to API search substrings. Only include products Si Mum Muang actually sells (vegetables + fruits):
```typescript
const PRODUCT_MATCH_MAP: Record<string, string[]> = {
  "ผักคะน้า": ["คะน้า"],
  "ผักบุ้ง": ["ผักบุ้ง"],
  "ถั่วฝักยาว": ["ถั่วฝักยาว"],
  "แตงกวา": ["แตงกวา"],
  "มะเขือเทศ": ["มะเขือเทศ"],
  "พริกขี้หนู": ["พริกขี้หนู"],
  "ผักกวางตุ้งฮุง": ["กวางตุ้ง"],
  "ส้ม": ["ส้ม"],
  "มะม่วง": ["มะม่วง"],
  "กล้วยน้ำว้า": ["กล้วย"],
  "แตงโม": ["แตงโม"],
};
```
**IMPORTANT:** These are the ONLY tracked products that can match. Do not add meat/rice/oil/eggs — Si Mum Muang doesn't sell them. The `sourceProductName` in the output MUST be the canonical name (the map key), NOT the API name — this is what the seed mappings expect.

**Price extraction logic:**
- Use the **medium tier** as the representative wholesale price.
- If medium has no data (min=0 AND max=0), fall back to **large tier**.
- If large also has no data, fall back to **small tier**.
- If all tiers are zero, skip the product.
- Use `min` of the chosen tier (lowest wholesale price).
- Rationale: medium min = most common tradeable grade at entry price. This is the wholesale reference price.

```typescript
function extractPrice(price: SmmPrice | undefined): number | null {
  if (!price) return null;
  // Prefer medium, fall back to large, then small
  for (const tier of [price.medium, price.large, price.small]) {
    if (tier && tier.min > 0) return tier.min;
  }
  return null;
}
```

**Unit mapping:**
- API returns `prod_unit_id.th.name` (e.g., "กิโลกรัม", "ลูก")
- Map to our format: "กิโลกรัม" → "บาท/กก.", "ลูก" → "บาท/ลูก", default → `บาท/${unit}`

**Pagination logic:**
- Fetch page 1 first to get `totalPages`.
- Loop through all pages (up to `totalPages`), collecting all products.
- 2-second sleep between requests.
- Per-page try/catch — if one page fails, continue with what we have.

**Main scrape() flow:**
1. Fetch page 1 (`?page=1&limit=100`).
2. Read `totalPages` from response.
3. Fetch remaining pages (2..totalPages), sleeping 2s between each.
4. Collect all `SmmProduct` items into a single array.
5. For each entry in `PRODUCT_MATCH_MAP`, find matching products using substring match on `th.name`.
6. For each match, extract price. If price found, push `ScrapedPrice` with canonical name.
7. If multiple products match the same tracked name, pick the one with the lowest price (cheapest wholesale).
8. Return results.

**Error handling:**
- Top-level try/catch → return `[]` on fatal error.
- Per-page try/catch → skip failed page, continue.
- Log `[SimumMuang] Fetched X products across Y pages, matched Z tracked products`.

#### Step 2: Simplify `src/lib/scrapers/lotuss.ts`

**Delete** the entire current file content. Replace with a minimal, well-documented graceful fallback:

```typescript
import type { Scraper, ScrapedPrice } from "./types";

/**
 * Lotus's (โลตัส) — BLOCKED scraper.
 *
 * Lotus's prices are loaded entirely client-side via RBAC-gated BFF API calls
 * that return 503 from server-side HTTP. The BFF endpoint
 * (api-o2o.lotuss.com/lotuss-mobile-bff/product/v2/products) requires browser
 * session cookies + Cloudflare clearance tokens. The Next.js SSR pages return
 * `productDetailSSR: {}` with price = ฿0.00. The Strapi backend
 * (lotuss-strapi-backend-th.prod.o2o.it-lotus.com) times out from server-side.
 *
 * Without Playwright/browser automation (excluded by project constraint), real
 * price data cannot be obtained. This scraper returns [] gracefully.
 *
 * Verified blocked: 2026-08-12 via direct curl testing.
 */
export const lotussScraper: Scraper = {
  sourceSlug: "lotuss",
  async scrape(): Promise<ScrapedPrice[]> {
    console.log(
      "[Lotus's] Prices require browser session (BFF returns 503 server-side). Returning empty."
    );
    return [];
  },
};
```

#### Step 3: Create `src/lib/scrapers/__tests__/simummuang.test.ts`

Follow the same pattern as `makro.test.ts` — empty-safe network tests:
```typescript
import { describe, it, expect } from "vitest";
import { simummuangScraper } from "../simummuang";

describe("simummuangScraper", () => {
  it("sourceSlug is 'simummuang'", () => {
    expect(simummuangScraper.sourceSlug).toBe("simummuang");
  });

  it("returns scraped prices from real API", async () => {
    const results = await simummuangScraper.scrape();
    expect(Array.isArray(results)).toBe(true);
  }, 60_000);

  it("all prices are positive numbers", async () => {
    const results = await simummuangScraper.scrape();
    for (const r of results) {
      expect(r.price).toBeGreaterThan(0);
    }
  }, 60_000);

  it("all items have non-empty unit strings", async () => {
    const results = await simummuangScraper.scrape();
    for (const r of results) {
      expect(r.unit).toBeTruthy();
      expect(r.unit.length).toBeGreaterThan(0);
    }
  }, 60_000);

  it("provinceCode is null (national wholesale)", async () => {
    const results = await simummuangScraper.scrape();
    for (const r of results) {
      expect(r.provinceCode).toBeNull();
    }
  }, 60_000);
});
```

#### Step 4: Create `src/lib/scrapers/__tests__/lotuss.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { lotussScraper } from "../lotuss";

describe("lotussScraper", () => {
  it("sourceSlug is 'lotuss'", () => {
    expect(lotussScraper.sourceSlug).toBe("lotuss");
  });

  it("returns empty array (blocked, graceful fallback)", async () => {
    const results = await lotussScraper.scrape();
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(0);
  });
});
```

### Edge Cases

| Case | Expected Behavior |
|------|-------------------|
| API returns 0 products | Return `[]`, log warning |
| All price tiers are 0 | Skip product, don't include in results |
| Multiple products match same tracked name | Pick lowest price |
| API timeout on one page | Skip page, continue with collected data |
| API completely down | Return `[]`, log error |
| Product has no `th.name` | Skip silently |
| Product has no `prod_unit_id` | Use default unit "บาท/กก." |
| `limit=100` returns fewer than 100 | Continue to next page anyway |

### Test Matrix

| Layer | Test | File |
|-------|------|------|
| Unit | sourceSlug check | `simummuang.test.ts`, `lotuss.test.ts` |
| Integration | Real API returns data | `simummuang.test.ts` (60s timeout) |
| Integration | All prices > 0 | `simummuang.test.ts` |
| Integration | All units non-empty | `simummuang.test.ts` |
| Integration | provinceCode is null | `simummuang.test.ts` |
| Regression | Lotus's returns [] | `lotuss.test.ts` |
| Build | `pnpm build` exit 0 | — |
| Lint | `pnpm lint` exit 0 | — |

### Verification Exit Criteria

- [ ] `pnpm build` exits 0 — run `pnpm build` in project root
- [ ] `pnpm lint` exits 0 — run `pnpm lint` in project root
- [ ] `npx vitest run src/lib/scrapers/__tests__/simummuang.test.ts` — all tests pass (60s timeout each for network tests)
- [ ] `npx vitest run src/lib/scrapers/__tests__/lotuss.test.ts` — all tests pass (instant)
- [ ] `npx vitest run src/lib/scrapers/__tests__/makro.test.ts` — existing tests still pass (no regression)
- [ ] Manual verification: Si Mum Muang scraper returns ≥5 real products with Thai names and positive prices — run `npx tsx -e "import {simummuangScraper} from './src/lib/scrapers/simummuang'; simummuangScraper.scrape().then(r => console.log(r.length, 'products:', r.map(p => p.sourceProductName + ' ' + p.price + ' ' + p.unit).join(', ')))"`
- [ ] Manual verification: Lotus's scraper returns `[]` with console warning
