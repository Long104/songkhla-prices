# Feature Spec: Browserless Lotus's Scraper & Category Expansion

## Section 1: Product

### Goal & Scope
Integrate Browserless.io cloud rendering API into Lotus's (`lotuss.ts`) scraper using the proven text-split search parser across all essential categories (fresh food, staples, household, personal care, baby care, pet care, canned goods, coffee, etc.). Populate real scraped Lotus's prices into PostgreSQL database and match them with tracked products.

### Out of Scope
- Local Puppeteer / Playwright installation (Browserless HTTP fetch only).
- Live store-specific geolocation scraping beyond Lotus's main online catalog.

### User Stories & Acceptance Criteria
1. **Browserless Integration (`browserless.ts`)**: As a scraper service, `fetchRenderedHtml` accepts optional `gotoOptions` and `waitForTimeout` and sends them in the body payload to `https://chrome.browserless.io/content?token=${BROWSERLESS_API_KEY}`.
2. **Lotus Scraper Search-Based Extraction (`lotuss.ts`)**: As a scraper service, Lotus's scraper searches for all terms (`หมู`, `ไก่`, `ผัก`, `ปลา`, `ข้าว`, `ไข่`, `น้ำมัน`, `ทิชชู่`, `น้ำยาล้างจาน`, `ผงซักฟอก`, `สบู่`, `แชมพู`, `ยาสีฟัน`, `ผ้าอ้อม`, `อาหารแมว`, `ปลากระป๋อง`, `กาแฟ`) via Lotus's search endpoint `https://www.lotuss.com/th/search/<term>`, uses `waitUntil: networkidle2` and `waitForTimeout: 3000` via Browserless, and parses prices using text-splitting on `฿`.
3. **Database Population & Real Lotus Prices**: Scraped Lotus prices match existing DB products and insert fresh price records into `prices` table, updating `updated_at` / price histories.
4. **Localization & Seed Integrity**: All categories and products are properly seeded and localized in `th.json` and `en.json`.

---

## Section 2: Engineering Handoff

### Domain Invariant & Edge Cases
**Potential Gap / Edge Case**: Search results text splitting can capture leading/trailing promotion banners or product unit strings (e.g. `100g/ชิ้น`) into the product title.
**Handling**: Strip prefix text matching `ซื้อครบลดเพิ่ม|ซื้อเยอะ\s*ราคาส่ง|ผลลัพธ์สำหรับ[^\n]*|แสดงสินค้า[^\n]*` and unit strings `[0-9.]+\/[ก-ฮa-zA-Z]+`, ensuring title length is between 3 and 100 characters and price > 0.

### 1. Target Files & Folder Structure
- `src/lib/scrapers/browserless.ts` (MODIFY): Add options parameter supporting `gotoOptions` and `waitForTimeout`.
- `src/lib/scrapers/lotuss.ts` (MODIFY): Implement search-term loop using `SEARCH_TERMS` and cheerio text splitting parser.
- `src/lib/scrapers/__tests__/lotuss.test.ts` (MODIFY/UPDATE): Unit test verifying `lotussScraper` correctly fetches and parses HTML output.
- `src/scripts/populate-lotuss-prices.ts` or `src/db/seed.ts` (MODIFY/NEW): Script/DB helper to execute scraper and persist Lotus's scraped prices into PostgreSQL `prices` table.

### 2. Implementation Specifications

#### A. `src/lib/scrapers/browserless.ts`
```typescript
export async function fetchRenderedHtml(
  url: string,
  options?: {
    gotoOptions?: { waitUntil?: string; timeout?: number };
    waitForTimeout?: number;
  }
): Promise<string | null> {
  const apiKey = process.env.BROWSERLESS_API_KEY;
  if (!apiKey) {
    console.warn("BROWSERLESS_API_KEY is missing.");
    return null;
  }

  try {
    const response = await fetch(`https://chrome.browserless.io/content?token=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        gotoOptions: options?.gotoOptions ?? { waitUntil: "networkidle2", timeout: 30000 },
        waitForTimeout: options?.waitForTimeout ?? 3000,
        rejectResourceTypes: ["image", "media", "font"],
      }),
    });

    if (!response.ok) {
      console.warn(`Browserless fetch failed for ${url}: ${response.statusText}`);
      return null;
    }

    return await response.text();
  } catch (error) {
    console.error(`Browserless fetch error for ${url}:`, error);
    return null;
  }
}
```

#### B. `src/lib/scrapers/lotuss.ts`
```typescript
import * as cheerio from "cheerio";
import { fetchRenderedHtml } from "./browserless";
import type { Scraper, ScrapedPrice } from "./types";
import { parsePrice } from "./types";

const SEARCH_TERMS = [
  "หมู", "ไก่", "ผัก", "ปลา", "ข้าว", "ไข่", "น้ำมัน", 
  "ทิชชู่", "น้ำยาล้างจาน", "ผงซักฟอก", "สบู่", "แชมพู", "ยาสีฟัน",
  "ผ้าอ้อม", "อาหารแมว", "ปลากระป๋อง", "กาแฟ"
];

export const lotussScraper: Scraper = {
  sourceSlug: "lotuss",
  async scrape(): Promise<ScrapedPrice[]> {
    const allPrices: ScrapedPrice[] = [];
    const today = new Date();

    for (const term of SEARCH_TERMS) {
      const url = `https://www.lotuss.com/th/search/${encodeURIComponent(term)}`;
      const html = await fetchRenderedHtml(url, {
        gotoOptions: { waitUntil: "networkidle2", timeout: 35000 },
        waitForTimeout: 3000
      });
      if (!html) continue;

      const $ = cheerio.load(html);
      const text = $("body").text();
      const parts = text.split("฿");

      for (let i = 1; i < parts.length; i++) {
        const prevChunk = parts[i - 1].slice(-80).trim();
        const priceMatch = parts[i].match(/^([0-9,]+(?:\.[0-9]{2})?)/);
        if (!priceMatch) continue;

        const price = parsePrice(priceMatch[1]);
        if (price <= 0) continue;

        let title = prevChunk
          .replace(/^.*?(?:ซื้อครบลดเพิ่ม|ซื้อเยอะ\s*ราคาส่ง|ผลลัพธ์สำหรับ[^\n]*|แสดงสินค้า[^\n]*)/g, "")
          .replace(/[0-9.]+\/[ก-ฮa-zA-Z]+/g, "")
          .trim();

        if (title.length >= 3 && title.length < 100) {
          allPrices.push({
            sourceProductName: title,
            price,
            unit: "บาท/ชิ้น",
            provinceCode: null,
            sourceDate: today,
          });
        }
      }
    }
    return allPrices;
  }
};
```

#### C. Real Prices DB Population
- Add DB insertion / matching logic in DB runner or `seed.ts` or standalone script to populate scraped real prices into `prices` table for source `lotuss`.

### 3. Verification Exit Criteria
- [ ] `src/lib/scrapers/browserless.ts` supports custom `gotoOptions` and `waitForTimeout`. — `npx vitest run src/lib/scrapers/__tests__/lotuss.test.ts`
- [ ] `src/lib/scrapers/lotuss.ts` implements search loop across all 17 search terms and parses text split prices. — `npx vitest run src/lib/scrapers/__tests__/lotuss.test.ts`
- [ ] Scraped Lotus prices can be saved/populated in database. — `pnpm build`
- [ ] `pnpm build` completes with zero TypeScript errors or linter warnings. — `pnpm build`
