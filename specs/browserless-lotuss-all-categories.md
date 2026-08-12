# Feature Spec: Browserless Lotus's Scraper & Category Expansion

## Section 1: Product

### Goal & Scope
Integrate Browserless.io cloud rendering API into Lotus's (`lotuss.ts`) scraper to fetch real product prices, and expand the platform's dataset from 12 categories / 51 products to 20 categories / ~75 products covering household items, personal care, baby care, pet care, frozen food, snacks, coffee & tea, and canned goods.

### Out of Scope
- Local Puppeteer / Playwright installation (Browserless HTTP fetch only).
- Live store-specific geolocation scraping beyond Lotus's main online catalog.
- Automatic recurring cron schedule change beyond standard `/api/cron/scrape` endpoint behavior.

### User Stories & Acceptance Criteria
1. **Browserless Integration**: As a platform operator, I want Lotus's price scraper to call Browserless.io's `/content` endpoint using `BROWSERLESS_API_KEY` so that fully rendered product HTML is retrieved and scraped.
2. **Category & Product Expansion**: As a consumer, I want to view prices for 8 new categories (Household, Personal Care, Baby Care, Pet Care, Frozen Foods, Snacks, Coffee & Tea, Canned Goods) across Lotus's, Makro, and government/wholesale sources where applicable.
3. **Multilingual UI Support**: As a user browsing in Thai or English, I expect all 20 category names and new products to be localized in `th.json` and `en.json`.
4. **Data Integrity & Live Verification**: Running `npm run seed` and scraping populates real prices for Lotus's in PostgreSQL.

---

## Section 2: Engineering Handoff

### 1. Target Files & Folder Structure
- `src/lib/scrapers/browserless.ts` (NEW): Utility for making POST requests to Browserless API.
- `src/lib/scrapers/lotuss.ts` (MODIFY): Real Cheerio-based scraper using Browserless HTML rendering.
- `src/db/seed.ts` (MODIFY): Add 8 new categories (total 20), ~24 new products (total ~75), and update `productSourceMappings` for Lotus's, Makro, and Si Mum Muang.
- `src/lib/scrapers/makro.ts` (MODIFY): Map new household, personal care, and pet care products to Makro category slugs.
- `src/messages/th.json` & `src/messages/en.json` (MODIFY): Add translations for the 8 new categories.
- `src/lib/scrapers/__tests__/lotuss.test.ts` (MODIFY): Update unit tests to mock Browserless responses and verify parsing.

### 2. Import Definitions & Dependencies
- `cheerio` (already in package.json): used for parsing rendered HTML.
- `process.env.BROWSERLESS_API_KEY`: API token for Browserless.

### 3. Browserless Fetch Utility (`src/lib/scrapers/browserless.ts`)
- **API Endpoint**: `POST https://chrome.browserless.io/content?token=${BROWSERLESS_API_KEY}`
- **Request Headers**: `Content-Type: application/json`
- **Request Body**:
  ```json
  {
    "url": "https://www.lotuss.com/th/category/...",
    "waitForSelector": ".product-card, div[class*='productCard'], div[data-testid='product-card']",
    "timeout": 30000
  }
  ```
- **Error Handling**: If `BROWSERLESS_API_KEY` is missing or fetch returns non-200, return `null` and log a structured warning.

### 4. Lotus's Scraper Design (`src/lib/scrapers/lotuss.ts`)
- **Categories to scrape via Browserless** (4-5 URL endpoints max to preserve rate limits):
  1. `https://www.lotuss.com/th/category/fresh-food` (meat, vegetables, fruit, seafood)
  2. `https://www.lotuss.com/th/category/pantry-staples` (rice, oil, seasoning, noodles, canned goods)
  3. `https://www.lotuss.com/th/category/household` (household cleaning, tissue)
  4. `https://www.lotuss.com/th/category/personal-care` (soap, shampoo, toothpaste, baby, pet)
- **Parsing Logic (Cheerio)**:
  - Extract product elements: search selectors such as `[data-testid='product-card']`, `.product-card`, or links matching `/th/product/`.
  - Title extraction: inner text of product name heading/span.
  - Price extraction: numeric text from price span (e.g. `฿129` -> `129.00`).
  - Unit normalization: infer `บาท/กก.`, `บาท/ขวด`, `บาท/ถุง`, `บาท/กล่อง`, `บาท/ชิ้น`, `บาท/แพ็ค` from title or unit badges.
  - Match extracted products to tracked canonical product source mappings.

### 5. Schema & Seed Expansion (`src/db/seed.ts`)
Add 8 new categories:
1. `household` (ของใช้ในบ้าน / Household) icon: 🧹
2. `personal-care` (ของใช้ส่วนตัว / Personal Care) icon: 🧴
3. `baby` (ของใช้เด็ก / Baby Care) icon: 🍼
4. `pet` (อาหาร & ของใช้สัตว์เลี้ยง / Pet Care) icon: 🐱
5. `frozen` (อาหารแช่แข็ง / Frozen Foods) icon: 🧊
6. `snacks` (ขนมขบเคี้ยว / Snacks) icon: 🍿
7. `coffee-tea` (กาแฟ & ชา / Coffee & Tea) icon: ☕
8. `canned-goods` (อาหารกระป๋อง & ของแห้ง / Canned Goods) icon: 🥫

Add ~24 new products across new & existing categories:
- Household: ผงซักฟอก (detergent), น้ำยาล้างจาน (dish-soap), น้ำยาถูพื้น (floor-cleaner), น้ำยาล้างห้องน้ำ (toilet-cleaner), ทิชชู่ (toilet-paper)
- Personal Care: สบู่ก้อน (bar-soap), แชมพู (shampoo), ยาสีฟัน (toothpaste), ครีมอาบน้ำ (body-wash), ผ้าอนามัย (sanitary-pads)
- Baby: ผ้าอ้อมเด็ก (baby-diaper), นมผง (baby-formula), สบู่เด็ก (baby-soap)
- Pet: อาหารแมว (cat-food), อาหารสุนัข (dog-food), ทรายแมว (cat-litter)
- Frozen: ไส้กรอก (sausage), นักเก็ตไก่ (chicken-nuggets), อาหารพร้อมทานแช่แข็ง (frozen-ready-meal)
- Snacks: มันฝรั่งทอด (potato-chips), บิสกิต (biscuits), คุกกี้ (cookies)
- Coffee & Tea: กาแฟ 3in1 (coffee-3in1), กาแฟคั่วบด (ground-coffee), ชาเขียว (green-tea)
- Canned Goods: ปลากระป๋อง (canned-fish), ผลไม้กระป๋อง (canned-fruit), ผักกาดดอง (pickled-mustard)

Update product source mappings for Lotus's, Makro, and Si Mum Muang for these new items.

### 6. Executable Test Contracts & Verification Exit Criteria
- `- [ ]` `src/lib/scrapers/browserless.ts` makes POST request to browserless content API with correct JSON payload and token query param. — `vitest run src/lib/scrapers/__tests__/lotuss.test.ts`
- `- [ ]` `npm run seed` executes without errors and inserts 20 categories and ~75 products into PostgreSQL. — `pnpm seed`
- `- [ ]` Lotus's scraper successfully parses rendered HTML and emits `ScrapedPrice` objects. — `vitest run src/lib/scrapers/__tests__/lotuss.test.ts`
- `- [ ]` All 20 category keys exist in `src/messages/th.json` and `src/messages/en.json`. — `pnpm build`
- `- [ ]` Full project build succeeds cleanly without TypeScript or linting errors. — `pnpm build`
