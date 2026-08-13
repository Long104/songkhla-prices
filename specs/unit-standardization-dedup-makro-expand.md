# Feature Spec: Unit Standardization to บาท/กก., Latest-Price Deduplication & Makro Catalog Expansion

## Section 1: Product

### Goal & Scope
1. **Unit Standardization to บาท/กก. (per kg)**: Fix price mismatch where Lotus's reports บาท/ชิ้น (per pack, e.g., ฿39 / 150g), while DIT and Makro report บาท/กก. (per kg). Extract package net weight from product names to compute normalized per-kg prices (`normalized_price` and `normalized_unit`) for direct price comparison.
2. **Makro Scraper & Seed Expansion**: Expand Makro product category mappings from 22 products to cover all 65+ tracked products across Pork, Chicken, Vegetables, Fruit, Household, Personal Care, and Pet Care categories.
3. **Latest-Price Deduplication**: Ensure price queries return only the latest reported price per source per product (`DISTINCT ON (product_id, source_id)` ordered by `source_date DESC, scraped_at DESC`). Clean up existing historical duplicate rows in the database.
4. **UI Comparison Display**: Update `PriceTable` and `ProductCard` to display the normalized price (บาท/กก.) as primary, original price/weight breakdown as secondary, and preserve count units (บาท/ฟอง, บาท/ตัว, บาท/ขวด) without invalid conversion.

### Out of Scope
- Modifying DIT, EPPO, or Si Mum Muang scraper core fetching logic.
- Automated weight extraction for count-based items (eggs, whole bottles, whole animals) — count units remain as-is.
- Multi-currency conversion or non-Thai grocery units.

### User Stories / Acceptance Criteria
- **US1 (Standardized Units)**: As a shopper, when comparing ฿39/ชิ้น (150g pack) against ฿180/กก., I see ฿260.00/กก. (เทียบจาก ฿39.00 / 150 กรัม) so I can compare unit rates directly.
- **US2 (Makro Product Coverage)**: As a buyer, when viewing pork, chicken, household, or personal care products, I see prices from Makro alongside Lotus's and DIT.
- **US3 (Deduplicated Prices)**: As a user, I see only one price row per source (the latest date) rather than duplicate rows from past days.
- **US4 (Count & Liquid Units)**: Count items (บาท/ฟอง, บาท/ตัว, บาท/ขวด) and liquid items (บาท/ลิตร) preserve their natural units without forcing invalid conversion to บาท/กก.

---

## Section 2: Engineering Handoff

### 1. Target Files & Structure
- `src/lib/unit-normalizer.ts` (NEW): Weight parser and price normalization logic.
- `src/lib/unit-normalizer.test.ts` (NEW): Comprehensive unit test suite for weight parsing and unit conversion.
- `src/db/queries.ts`: Update `getProductsWithCheapestPrice`, `getRecentPriceChanges`, and product price details queries with `DISTINCT ON` and normalized price calculation.
- `src/lib/scrapers/makro.ts`: Expand `PRODUCT_CATEGORY_MAP` with verified categories for pork, chicken, vegetables, fruits, household, personal care, pet food.
- `src/db/seed.ts`: Update `makroMappings` to map newly added Makro products to canonical product slugs.
- `src/db/cleanup-duplicates.ts` (NEW): One-off DB script to delete historical duplicate price records keeping latest per (product_id, source_id).
- `src/components/price-table.tsx`: Display primary normalized price + secondary original price/weight breakdown.
- `src/components/product-card.tsx`: Display normalized prices for range and cheapest price calculations.
- `src/app/[locale]/product/[slug]/page.tsx`: Update price fetching logic to apply latest-price deduplication and normalization.
- `src/messages/th.json` & `src/messages/en.json`: Add translation strings for unit comparison secondary hints.

### 2. Imports & Dependencies
- Reuse existing packages: `drizzle-orm` (`sql`, `and`, `eq`, `desc`), `next-intl` (`useTranslations`), `lucide-react`.
- No new external npm packages required.

### 3. Schema & Database Changes
- Schema remains backward-compatible without breaking migrations.
- Normalization is computed on-the-fly and during query resolution to maintain flexibility across historical and scraped records.
- Cleanup query to deduplicate existing DB rows:
```sql
DELETE FROM prices
WHERE id NOT IN (
  SELECT DISTINCT ON (product_id, source_id) id
  FROM prices
  ORDER BY product_id, source_id, source_date DESC, scraped_at DESC
);
```

### 4. Step-by-Step Edits

#### Step 4.1: Unit Normalizer Utility (`src/lib/unit-normalizer.ts`)
Implement `extractWeightFromTitle(title: string): { weightKg: number; rawText: string } | null`
- Matches patterns:
  - `(\d+(?:\.\d+)?)\s*(?:กก\.?|กิโลกรัม|kg\.?)` -> kg
  - `(\d+(?:\.\d+)?)\s*(?:กรัม|g\.|ก\.(?![ก/]))` -> g / 1000
  - `(\d+(?:\.\d+)?)\s*(?:มล\.|ml\.?)` -> ml / 1000 (for g equivalent if applicable)
  - Accounts for multipliers like `x 10` or `150g x 2`.
Implement `normalizePriceAndUnit(rawPrice: number, rawUnit: string, productName: string)`
- Returns `{ normalizedPrice: number, normalizedUnit: string, originalPrice: number, originalUnit: string, weightText: string | null }`.
- If unit is `บาท/กก.`, returns normalizedPrice = rawPrice, normalizedUnit = `บาท/กก.`.
- If unit is `บาท/ชิ้น` or `บาท/แพ็ค` or `บาท/ถุง`:
  - Parses weight from `productName`. If found (e.g. 150g -> 0.15kg), computes `normalizedPrice = Math.round((rawPrice / 0.15) * 100) / 100` and `normalizedUnit = "บาท/กก."`, `weightText = "150 กรัม"`.
  - If weight NOT found, returns original price/unit, `normalizedUnit = rawUnit`, `weightText = null`.
- If unit is `บาท/ฟอง`, `บาท/ตัว`, `บาท/ขวด`, keep unit as-is without conversion.
- If unit is `บาท/ลิตร`, keep unit as-is.

#### Step 4.2: Makro Scraper Expansion (`src/lib/scrapers/makro.ts`)
Expand `PRODUCT_CATEGORY_MAP`:
```ts
// Pork
"หมูสามชั้น": ["meat/pork", "fresh-food/pork", "fresh-food/meat-poultry"],
"หมูสะโพก": ["meat/pork", "fresh-food/pork"],
"หมูสับ": ["meat/pork", "fresh-food/pork"],
"ซี่โครงหมู": ["meat/pork", "fresh-food/pork"],
"หมูคอสไลซ์": ["meat/pork", "fresh-food/pork"],
"หมูบด": ["meat/pork", "fresh-food/pork"],
// Chicken
"ไก่สด": ["meat/poultry", "fresh-food/poultry"],
"ไก่บด": ["meat/poultry", "fresh-food/poultry"],
"ไก่ย่าง": ["meat/poultry", "fresh-food/poultry"],
"ปีกไก่": ["meat/poultry", "fresh-food/poultry"],
"อกไก่": ["meat/poultry", "fresh-food/poultry"],
"น่องไก่": ["meat/poultry", "fresh-food/poultry"],
// Beef
"เนื้อวัว": ["meat/beef", "fresh-food/beef"],
"เนื้อวัวสไลซ์": ["meat/beef", "fresh-food/beef"],
// Vegetables
"ผักคะน้า": ["fruit-vegetables/vegetables/fresh-vegetables", "fresh-food/vegetables"],
"ผักบุ้ง": ["fruit-vegetables/vegetables/fresh-vegetables", "fresh-food/vegetables"],
"พริกขี้หนู": ["fruit-vegetables/vegetables/fresh-vegetables", "fresh-food/vegetables"],
"มะเขือเทศ": ["fruit-vegetables/vegetables/fresh-vegetables", "fresh-food/vegetables"],
"แตงกวา": ["fruit-vegetables/vegetables/fresh-vegetables", "fresh-food/vegetables"],
"ถั่วฝักยาว": ["fruit-vegetables/vegetables/fresh-vegetables", "fresh-food/vegetables"],
"ผักกวางตุ้งฮุง": ["fruit-vegetables/vegetables/fresh-vegetables", "fresh-food/vegetables"],
// Fruit
"ส้ม": ["fruit-vegetables/fruits", "fresh-food/fruits"],
"มะม่วง": ["fruit-vegetables/fruits", "fresh-food/fruits"],
"กล้วยน้ำว้า": ["fruit-vegetables/fruits", "fresh-food/fruits"],
"แตงโม": ["fruit-vegetables/fruits", "fresh-food/fruits"],
// Household
"ผงซักฟอก": ["household/laundry", "dry-grocery/household"],
"น้ำยาล้างจาน": ["household/dishwashing", "dry-grocery/household"],
"น้ำยาถูพื้น": ["household/floor-cleaning", "dry-grocery/household"],
"น้ำยาล้างห้องน้ำ": ["household/toilet-cleaning", "dry-grocery/household"],
"ทิชชู่": ["household/tissue", "dry-grocery/household"],
// Personal Care
"สบู่ก้อน": ["personal-care/body-wash", "dry-grocery/personal-care"],
"แชมพู": ["personal-care/hair-care/shampoo", "dry-grocery/personal-care"],
"ยาสีฟัน": ["personal-care/oral-care/toothpaste", "dry-grocery/personal-care"],
"ครีมอาบน้ำ": ["personal-care/body-wash", "dry-grocery/personal-care"],
"ผ้าอนามัย": ["personal-care/sanitary", "dry-grocery/personal-care"],
// Pet Care
"อาหารแมว": ["pet-care/cat-food", "dry-grocery/pet-care"],
"อาหารสุนัข": ["pet-care/dog-food", "dry-grocery/pet-care"]
```

#### Step 4.3: Database Seed Update (`src/db/seed.ts`)
Update `makroMappings` array to include all 65+ products, associating them with canonical `productSlug` and exact `sourceProductName`.

#### Step 4.4: DB Deduplication & Query Updates (`src/db/queries.ts` & `src/db/cleanup-duplicates.ts`)
In `queries.ts`:
- Modify queries to wrap price selections with `DISTINCT ON (prices.product_id, prices.source_id)` ordered by `prices.product_id`, `prices.source_id`, `prices.source_date DESC`, `prices.scraped_at DESC`.
- Integrate `normalizePriceAndUnit` into cheapest price calculations and product comparison table results.

#### Step 4.5: UI Updates (`src/components/price-table.tsx` & `src/components/product-card.tsx`)
In `PriceTable`:
- Display `normalizedPrice` (฿/กก.) as the primary large price text.
- If normalized from a package price (e.g. ฿39 / 150g -> ฿260/กก.), display secondary line: `(เทียบจาก ฿39.00 / 150 กรัม)` in Thai or `(from ฿39.00 / 150g)` in English.
- If units are incomparable (e.g., บาท/กก. vs บาท/ฟอง or unknown weight), render `UnitWarningBadge`.

---

### 5. Domain Model & Invariants
- **Source Invariant**: Source names and slugs (`dit`, `makro`, `lotuss`, `simummuang`, `eppo`) must match database seed constants.
- **Price Deduplication Invariant**: For any given (product_id, source_id) pair, exactly one price row (the latest by `source_date`) is presented in comparisons.
- **Unit Integrity Invariant**: Count items (eggs, bottles, whole units) MUST NOT be artificially converted to per-kg.

---

### 6. Test Matrix & Executable Test Contracts

#### Test Matrix
| Layer | Test Target | Scenario | Expected Outcome |
|---|---|---|---|
| Unit | `unit-normalizer.ts` | 150g pack at ฿39 | Normalized: ฿260.00/กก., secondary text extracted |
| Unit | `unit-normalizer.ts` | 1.5 kg pack at ฿270 | Normalized: ฿180.00/กก. |
| Unit | `unit-normalizer.ts` | Egg pack at ฿120 (30 eggs) | Unit preserved as บาท/ฟอง (or ฿4/ฟอง) |
| Integration | `queries.ts` | Fetch prices with 4 historical DIT entries | Only 1 row returned (latest `source_date`) |
| Scraper | `makro.ts` | Run Makro scraper on expanded categories | Returns scraped prices across pork, chicken, household categories |

#### Executable Test Contracts
File: `src/lib/__tests__/unit-normalizer.test.ts`
```ts
import { describe, it, expect } from "vitest";
import { normalizePriceAndUnit, extractWeightFromTitle } from "../unit-normalizer";

describe("unitNormalizer", () => {
  it("extracts grams and calculates per-kg price", () => {
    const res = normalizePriceAndUnit(39, "บาท/ชิ้น", "หมูสามชั้น 150 กรัม");
    expect(res.normalizedPrice).toBe(260);
    expect(res.normalizedUnit).toBe("บาท/กก.");
    expect(res.weightText).toBe("150 กรัม");
  });

  it("extracts kg and keeps per-kg price", () => {
    const res = normalizePriceAndUnit(180, "บาท/กก.", "หมูสามชั้น 1 กิโลกรัม");
    expect(res.normalizedPrice).toBe(180);
    expect(res.normalizedUnit).toBe("บาท/กก.");
  });

  it("preserves count units without converting to per-kg", () => {
    const res = normalizePriceAndUnit(4, "บาท/ฟอง", "ไข่ไก่ เบอร์ 2");
    expect(res.normalizedPrice).toBe(4);
    expect(res.normalizedUnit).toBe("บาท/ฟอง");
    expect(res.weightText).toBeNull();
  });
});
```

---

### 7. Edge Matrix
- **Edge Case 1**: Product title has no weight specified (e.g. "หมูสามชั้น สด"). `normalizedUnit` remains `บาท/ชิ้น`, and UI displays warning badge `หน่วยต่างกัน`.
- **Edge Case 2**: Multiple price rows have identical `source_date`. Resolution: sort tie-breaker by `scraped_at DESC`.
- **Edge Case 3**: Makro category slug returns 404. Scraper catches per-category error and continues with remaining categories.

---

### 8. Verification Exit Criteria
- [ ] Unit tests pass: `pnpm test` runs `src/lib/__tests__/unit-normalizer.test.ts` with 100% pass rate.
- [ ] Database deduplication: Running cleanup script removes old duplicate DIT prices and leaves 1 latest price per (product_id, source_id).
- [ ] Makro Scraper Expansion: Makro scraper emits products for pork, chicken, household, and personal care categories.
- [ ] UI verification: Product comparison page displays ฿/กก. as primary normalized price and original package breakdown as secondary when comparing items.
- [ ] Next.js Build: `pnpm build` succeeds with zero TypeScript errors or linter errors.
