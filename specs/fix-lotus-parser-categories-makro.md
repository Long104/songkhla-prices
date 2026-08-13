# Spec: Fix Lotus's Parser, Restructure Categories, Expand Makro

## Section 1 — Product

### Goal
Fix 3 user-reported bugs: (1) Lotus's scraper produces garbage prices from non-product ฿ symbols; (2) Makro scraper misses pork/chicken; (3) category structure lumps all meat under one category instead of splitting หมู/ไก่/เนื้อวัว. Also add missing products (ไก่บด, ซี่โครงหมู, หมูคอ, ปีกไก่, อกไก่, น่องไก่, หมูบด).

### Out of Scope
- DIT, EPPO, SiMumMuang scraper core logic unchanged.
- No new DB columns, no schema migrations (tables stay the same).
- The 8 "extra" categories already in seed but not in UI CATEGORIES array (household, personal-care, baby, pet, frozen, snacks, coffee-tea, canned-goods) — not adding them to UI in this task.

### Acceptance Criteria
1. All existing `lotuss` prices DELETED from DB before re-scrape.
2. Lotus's scraper outputs ONLY prices between ฿5–฿500, matched to exact tracked product names.
3. Source display name shows "โลตัส" (not "โลตัสราคากลางทั่วประเทศ").
4. Meat category split into: หมู (pork), ไก่ (chicken), เนื้อวัว (beef).
5. Seafood category split into: ปลา (fish), กุ้ง (shrimp), หอย&ปู (shellfish-crab).
6. New products added: ไก่บด, ซี่โครงหมู, หมูคอสไลซ์, ปีกไก่, อกไก่, น่องไก่, หมูบด.
7. Makro scraper tracks pork/chicken products.
8. Home page CATEGORIES array and category page VALID_SLUGS updated with new slugs.
9. `pnpm seed`, `pnpm build`, `pnpm lint`, `pnpm vitest run` all pass.

---

## Section 2 — Engineering Handoff

### 0. ADR & Tradeoffs

**Context**: The Lotus's scraper currently uses generic search terms ("หมู", "ไก่") and splits page text by "฿", grabbing every baht symbol including phone numbers, cart totals, and footer years. The cron route does EXACT string match on `sourceProductName` against `product_source_mappings`. The scraper outputs raw cleaned text as the product name, which rarely matches the canonical tracked name exactly — resulting in either unmapped prices (silently dropped) or garbage matches (wrong product mapped to wrong price).

**Chosen Architecture**: Rewrite Lotus's scraper to search per tracked-product (like Makro), parse the rendered HTML for the product name + nearest price, filter ฿5–฿500, and output the canonical tracked name as `sourceProductName`. This guarantees the cron's exact-match logic succeeds.

**Discarded Alternatives**:
- *DOM selector parsing*: Lotus's is a Next.js CSR app; class names are auto-generated and unstable across deploys. Text-based parsing is more resilient.
- *__NEXT_DATA__ JSON extraction*: The script tag structure is opaque without live inspection and may change. Text parsing with product-name anchoring is more robust.

### 1. Target Files

| File | Action | Summary |
|------|--------|---------|
| `src/db/seed.ts` | MODIFY | Replace meat/seafood categories, add new products, update all mappings, add nameTh/nameEn to source UPDATE |
| `src/lib/scrapers/lotuss.ts` | REWRITE | Per-product search, price-range filter, canonical name output |
| `src/lib/scrapers/makro.ts` | MODIFY | Add pork/chicken entries to PRODUCT_CATEGORY_MAP |
| `src/messages/th.json` | MODIFY | Add pork/chicken/beef/fish/shrimp/shellfish-crab category keys |
| `src/messages/en.json` | MODIFY | Same new category keys |
| `src/app/[locale]/page.tsx` | MODIFY | Update CATEGORIES array |
| `src/app/[locale]/category/[slug]/page.tsx` | MODIFY | Update VALID_SLUGS array |
| `src/lib/scrapers/__tests__/lotuss.test.ts` | REWRITE | Test new parser: filter > ฿500, phone numbers, exact name output |
| `src/db/cleanup-lotuss.ts` | CREATE | One-time script: DELETE prices WHERE source = lotuss |

### 2. Import Definitions & Dependencies

- `cheerio` (already in package.json) — HTML parsing in Lotus's scraper
- `fetchRenderedHtml` from `./browserless` — Browserless cloud rendering
- `drizzle-orm` (`eq`, `inArray`) — DB queries in cleanup script
- `@/db/schema` — table references
- `@/db` — `getDb()` connection

No new packages needed.

### 3. Database Changes (No Schema Migration)

No new columns or tables. The seed script handles data migration via `onConflictDoNothing()` + explicit UPDATE statements.

**Critical**: `onConflictDoNothing()` on `products` will NOT update `categoryId` for existing product rows. Must add explicit UPDATE statements after the product insert to reassign products from old categories to new ones.

**Critical**: `onConflictDoNothing()` on `sources` will NOT update `nameTh`/`nameEn`. The current seed only updates `priceType` and `type`. Must add `nameTh` and `nameEn` to the UPDATE set to fix "โลตัสราคากลางทั่วประเทศ" → "โลตัส".

### 4. Step-by-Step Edits

#### Step 1: Create `src/db/cleanup-lotuss.ts`

One-time cleanup script that deletes all Lotus's prices:

```typescript
import { getDb } from "@/db";
import { eq } from "drizzle-orm";
import { prices, sources } from "@/db/schema";

async function main() {
  const db = getDb();
  if (!db) {
    console.error("Database not available: DATABASE_URL is not set.");
    process.exit(1);
  }

  const [lotussSource] = await db
    .select({ id: sources.id })
    .from(sources)
    .where(eq(sources.slug, "lotuss"))
    .limit(1);

  if (!lotussSource) {
    console.log("Lotus's source not found — nothing to clean.");
    process.exit(0);
  }

  const deleted = await db
    .delete(prices)
    .where(eq(prices.sourceId, lotussSource.id))
    .returning({ id: prices.id });

  console.log(`Deleted ${deleted.length} Lotus's price rows.`);
  console.log("Cleanup completed successfully.");
}

main().catch((err) => {
  console.error("Cleanup failed:", err);
  process.exit(1);
});
```

Usage: `DATABASE_URL=... npx tsx src/db/cleanup-lotuss.ts`

#### Step 2: Update `src/db/seed.ts`

**2a. Update `sourceSeeds`** — no change needed, already correct. But update the UPDATE loop:

In the source update loop (around line 417-421), change:
```typescript
// BEFORE:
await db
  .update(sources)
  .set({ priceType: s.priceType, type: s.type })
  .where(eq(sources.slug, s.slug));

// AFTER:
await db
  .update(sources)
  .set({ priceType: s.priceType, type: s.type, nameTh: s.nameTh, nameEn: s.nameEn })
  .where(eq(sources.slug, s.slug));
```

**2b. Replace `categorySeeds`** — replace `meat` and `seafood` entries:

Remove these two entries:
```typescript
{ slug: "meat", nameTh: "เนื้อสัตว์", nameEn: "Meat", icon: "🥩", sortOrder: 1 },
{ slug: "seafood", nameTh: "อาหารทะเล", nameEn: "Seafood", icon: "🐟", sortOrder: 9 },
```

Add these six entries (same sortOrder positions, sub-order within):
```typescript
{ slug: "pork", nameTh: "หมู", nameEn: "Pork", icon: "🥓", sortOrder: 1 },
{ slug: "chicken", nameTh: "ไก่", nameEn: "Chicken", icon: "🍗", sortOrder: 2 },
{ slug: "beef", nameTh: "เนื้อวัว", nameEn: "Beef", icon: "🥩", sortOrder: 3 },
// ... (vegetables through fruit shift +2 from old sortOrder)
{ slug: "fish", nameTh: "ปลา", nameEn: "Fish", icon: "🐟", sortOrder: 10 },
{ slug: "shrimp", nameTh: "กุ้ง", nameEn: "Shrimp", icon: "🦐", sortOrder: 11 },
{ slug: "shellfish-crab", nameTh: "หอย & ปู", nameEn: "Shellfish & Crab", icon: "🦀", sortOrder: 12 },
```

IMPORTANT: Increment sortOrder for ALL categories after the insertion point. The full new categorySeeds array with correct sortOrder:

```typescript
const categorySeeds = [
  { slug: "pork", nameTh: "หมู", nameEn: "Pork", icon: "🥓", sortOrder: 1 },
  { slug: "chicken", nameTh: "ไก่", nameEn: "Chicken", icon: "🍗", sortOrder: 2 },
  { slug: "beef", nameTh: "เนื้อวัว", nameEn: "Beef", icon: "🥩", sortOrder: 3 },
  { slug: "vegetables", nameTh: "ผัก", nameEn: "Vegetables", icon: "🥬", sortOrder: 4 },
  { slug: "rice", nameTh: "ข้าว", nameEn: "Rice", icon: "🍚", sortOrder: 5 },
  { slug: "eggs", nameTh: "ไข่ & นม", nameEn: "Eggs & Dairy", icon: "🥚", sortOrder: 6 },
  { slug: "oil", nameTh: "น้ำมัน & ไขมัน", nameEn: "Oil & Fat", icon: "🛢️", sortOrder: 7 },
  { slug: "seasoning", nameTh: "เครื่องปรุง", nameEn: "Seasoning", icon: "🧂", sortOrder: 8 },
  { slug: "fuel", nameTh: "น้ำมันเชื้อเพลิง", nameEn: "Fuel", icon: "⛽", sortOrder: 9 },
  { slug: "fruit", nameTh: "ผลไม้", nameEn: "Fruit", icon: "🍎", sortOrder: 10 },
  { slug: "fish", nameTh: "ปลา", nameEn: "Fish", icon: "🐟", sortOrder: 11 },
  { slug: "shrimp", nameTh: "กุ้ง", nameEn: "Shrimp", icon: "🦐", sortOrder: 12 },
  { slug: "shellfish-crab", nameTh: "หอย & ปู", nameEn: "Shellfish & Crab", icon: "🦀", sortOrder: 13 },
  { slug: "beverages", nameTh: "เครื่องดื่ม", nameEn: "Beverages", icon: "🥤", sortOrder: 14 },
  { slug: "noodles", nameTh: "ก๋วยเตี๋ยว & บะหมี่", nameEn: "Noodles", icon: "🍜", sortOrder: 15 },
  { slug: "bakery", nameTh: "เบเกอรี่", nameEn: "Bakery", icon: "🍞", sortOrder: 16 },
  { slug: "household", nameTh: "ของใช้ในบ้าน", nameEn: "Household", icon: "🧹", sortOrder: 17 },
  { slug: "personal-care", nameTh: "ของใช้ส่วนตัว", nameEn: "Personal Care", icon: "🧴", sortOrder: 18 },
  { slug: "baby", nameTh: "ของใช้เด็ก", nameEn: "Baby Care", icon: "🍼", sortOrder: 19 },
  { slug: "pet", nameTh: "อาหาร & ของใช้สัตว์เลี้ยง", nameEn: "Pet Care", icon: "🐱", sortOrder: 20 },
  { slug: "frozen", nameTh: "อาหารแช่แข็ง", nameEn: "Frozen Foods", icon: "🧊", sortOrder: 21 },
  { slug: "snacks", nameTh: "ขนมขบเคี้ยว", nameEn: "Snacks", icon: "🍿", sortOrder: 22 },
  { slug: "coffee-tea", nameTh: "กาแฟ & ชา", nameEn: "Coffee & Tea", icon: "☕", sortOrder: 23 },
  { slug: "canned-goods", nameTh: "อาหารกระป๋อง & ของแห้ง", nameEn: "Canned Goods", icon: "🥫", sortOrder: 24 },
];
```

**2c. Update `productSeeds`** — change categorySlug assignments and add new products:

Replace the old meat products section:
```typescript
// REMOVE these (old meat assignments):
{ slug: "pork-belly", nameTh: "หมูสามชั้น", nameEn: "Pork Belly", categorySlug: "meat" },
{ slug: "pork-shoulder", nameTh: "หมูสะโพก", nameEn: "Pork Shoulder", categorySlug: "meat" },
{ slug: "pork-mince", nameTh: "หมูสับ", nameEn: "Minced Pork", categorySlug: "meat" },
{ slug: "chicken-whole", nameTh: "ไก่สด", nameEn: "Whole Chicken", categorySlug: "meat" },
{ slug: "chicken-grilled", nameTh: "ไก่ย่าง", nameEn: "Grilled Chicken", categorySlug: "meat" },
{ slug: "beef", nameTh: "เนื้อวัว", nameEn: "Beef", categorySlug: "meat" },
```

Add these (new pork/chicken/beef assignments + new products):
```typescript
// pork
{ slug: "pork-belly", nameTh: "หมูสามชั้น", nameEn: "Pork Belly", categorySlug: "pork" },
{ slug: "pork-shoulder", nameTh: "หมูสะโพก", nameEn: "Pork Shoulder", categorySlug: "pork" },
{ slug: "pork-mince", nameTh: "หมูสับ", nameEn: "Minced Pork", categorySlug: "pork" },
{ slug: "pork-ribs", nameTh: "ซี่โครงหมู", nameEn: "Pork Ribs", categorySlug: "pork" },
{ slug: "pork-neck", nameTh: "หมูคอสไลซ์", nameEn: "Pork Neck Slices", categorySlug: "pork" },
{ slug: "pork-ground", nameTh: "หมูบด", nameEn: "Ground Pork", categorySlug: "pork" },
// chicken
{ slug: "chicken-whole", nameTh: "ไก่สด", nameEn: "Whole Chicken", categorySlug: "chicken" },
{ slug: "chicken-ground", nameTh: "ไก่บด", nameEn: "Ground Chicken", categorySlug: "chicken" },
{ slug: "chicken-grilled", nameTh: "ไก่ย่าง", nameEn: "Grilled Chicken", categorySlug: "chicken" },
{ slug: "chicken-wings", nameTh: "ปีกไก่", nameEn: "Chicken Wings", categorySlug: "chicken" },
{ slug: "chicken-breast", nameTh: "อกไก่", nameEn: "Chicken Breast", categorySlug: "chicken" },
{ slug: "chicken-drumstick", nameTh: "น่องไก่", nameEn: "Chicken Drumstick", categorySlug: "chicken" },
// beef
{ slug: "beef", nameTh: "เนื้อวัว", nameEn: "Beef", categorySlug: "beef" },
{ slug: "beef-sliced", nameTh: "เนื้อวัวสไลซ์", nameEn: "Sliced Beef", categorySlug: "beef" },
```

Replace the old seafood products section:
```typescript
// REMOVE these (old seafood assignments):
{ slug: "mackerel", nameTh: "ปลาทู", nameEn: "Short Mackerel", categorySlug: "seafood" },
{ slug: "black-tiger-shrimp", nameTh: "กุ้งกุลาดำ", nameEn: "Black Tiger Shrimp", categorySlug: "seafood" },
{ slug: "white-shrimp", nameTh: "กุ้งขาว", nameEn: "White Shrimp", categorySlug: "seafood" },
{ slug: "squid", nameTh: "ปลาหมึก", nameEn: "Squid", categorySlug: "seafood" },
{ slug: "blue-crab", nameTh: "ปูม้า", nameEn: "Blue Crab", categorySlug: "seafood" },
{ slug: "green-mussel", nameTh: "หอยแมลงภั่ง", nameEn: "Green Mussel", categorySlug: "seafood" },
{ slug: "saba-fish", nameTh: "ปลาสำเตร็ง", nameEn: "Saba Fish", categorySlug: "seafood" },
{ slug: "tilapia", nameTh: "ปลานิล", nameEn: "Tilapia", categorySlug: "seafood" },
```

Add these (new fish/shrimp/shellfish-crab assignments):
```typescript
// fish
{ slug: "mackerel", nameTh: "ปลาทู", nameEn: "Short Mackerel", categorySlug: "fish" },
{ slug: "tilapia", nameTh: "ปลานิล", nameEn: "Tilapia", categorySlug: "fish" },
{ slug: "saba-fish", nameTh: "ปลาสำเตร็ง", nameEn: "Saba Fish", categorySlug: "fish" },
{ slug: "squid", nameTh: "ปลาหมึก", nameEn: "Squid", categorySlug: "fish" },
// shrimp
{ slug: "black-tiger-shrimp", nameTh: "กุ้งกุลาดำ", nameEn: "Black Tiger Shrimp", categorySlug: "shrimp" },
{ slug: "white-shrimp", nameTh: "กุ้งขาว", nameEn: "White Shrimp", categorySlug: "shrimp" },
// shellfish-crab
{ slug: "blue-crab", nameTh: "ปูม้า", nameEn: "Blue Crab", categorySlug: "shellfish-crab" },
{ slug: "green-mussel", nameTh: "หอยแมลงภั่ง", nameEn: "Green Mussel", categorySlug: "shellfish-crab" },
```

**2d. Add product-category migration UPDATE after product insert** (after line 453):

```typescript
// Reassign products to new categories (onConflictDoNothing doesn't update categoryId)
for (const p of productSeeds) {
  const categoryId = categoryIdBySlug.get(p.categorySlug);
  if (categoryId) {
    await db
      .update(products)
      .set({ categoryId, nameTh: p.nameTh, nameEn: p.nameEn })
      .where(eq(products.slug, p.slug));
  }
}
console.log(`  Updated category assignments for ${productSeeds.length} products`);
```

**2e. Update mapping arrays** — add new products to `MOCK_PRODUCT_SLUGS`, `lotussMappings`, `makroMappings`:

Add to `MOCK_PRODUCT_SLUGS` (for SiMumMuang):
```typescript
"pork-ribs",
"pork-neck",
"pork-ground",
"chicken-ground",
"chicken-wings",
"chicken-breast",
"chicken-drumstick",
"beef-sliced",
```

Add to `makroMappings`:
```typescript
{ sourceSlug: "makro", productSlug: "pork-ribs", sourceProductName: "ซี่โครงหมู" },
{ sourceSlug: "makro", productSlug: "pork-ground", sourceProductName: "หมูบด" },
{ sourceSlug: "makro", productSlug: "chicken-ground", sourceProductName: "ไก่บด" },
{ sourceSlug: "makro", productSlug: "chicken-wings", sourceProductName: "ปีกไก่" },
{ sourceSlug: "makro", productSlug: "chicken-breast", sourceProductName: "อกไก่" },
{ sourceSlug: "makro", productSlug: "chicken-drumstick", sourceProductName: "น่องไก่" },
```

Add to `lotussMappings`:
```typescript
{ sourceSlug: "lotuss", productSlug: "pork-shoulder", sourceProductName: "หมูสะโพก" },
{ sourceSlug: "lotuss", productSlug: "pork-ribs", sourceProductName: "ซี่โครงหมู" },
{ sourceSlug: "lotuss", productSlug: "pork-neck", sourceProductName: "หมูคอสไลซ์" },
{ sourceSlug: "lotuss", productSlug: "pork-ground", sourceProductName: "หมูบด" },
{ sourceSlug: "lotuss", productSlug: "chicken-ground", sourceProductName: "ไก่บด" },
{ sourceSlug: "lotuss", productSlug: "chicken-wings", sourceProductName: "ปีกไก่" },
{ sourceSlug: "lotuss", productSlug: "chicken-breast", sourceProductName: "อกไก่" },
{ sourceSlug: "lotuss", productSlug: "chicken-drumstick", sourceProductName: "น่องไก่" },
{ sourceSlug: "lotuss", productSlug: "beef-sliced", sourceProductName: "เนื้อวัวสไลซ์" },
{ sourceSlug: "lotuss", productSlug: "mackerel", sourceProductName: "ปลาทู" },
// (keep existing lotussMappings, just ADD these)
```

#### Step 3: Rewrite `src/lib/scrapers/lotuss.ts`

Complete rewrite. The new scraper searches per tracked product name, finds prices in the rendered HTML, filters by range, and outputs the canonical tracked name.

```typescript
import * as cheerio from "cheerio";
import { fetchRenderedHtml } from "./browserless";
import type { Scraper, ScrapedPrice } from "./types";
import { parsePrice } from "./types";

/**
 * Tracked Lotus's products mapped to their search terms.
 * The key is the EXACT sourceProductName used in product_source_mappings.
 * The value is the search term for lotuss.com/th/search/.
 */
const LOTUS_TRACKED_PRODUCTS: Record<string, string> = {
  // Pork
  "หมูสามชั้น": "หมูสามชั้น",
  "หมูสะโพก": "หมูสะโพก",
  "หมูสับ": "หมูสับ",
  "ซี่โครงหมู": "ซี่โครงหมู",
  "หมูคอสไลซ์": "หมูคอสไลซ์",
  "หมูบด": "หมูบด",
  // Chicken
  "ไก่สด": "ไก่สด",
  "ไก่บด": "ไก่บด",
  "ไก่ย่าง": "ไก่ย่าง",
  "ปีกไก่": "ปีกไก่",
  "อกไก่": "อกไก่",
  "น่องไก่": "น่องไก่",
  // Beef
  "เนื้อวัว": "เนื้อวัว",
  "เนื้อวัวสไลซ์": "เนื้อวัวสไลซ์",
  // Vegetables
  "ผักคะน้า": "ผักคะน้า",
  "ผักบุ้ง": "ผักบุ้ง",
  "พริกขี้หนู": "พริกขี้หนู",
  "มะเขือเทศ": "มะเขือเทศ",
  "แตงกวา": "แตงกวา",
  "ถั่วฝักยาว": "ถั่วฝักยาว",
  // Fish/Seafood
  "ปลาทู": "ปลาทู",
  // Rice
  "ข้าวหอมมะลิ": "ข้าวหอมมะลิ",
  "ข้าวขาว": "ข้าวขาว",
  // Eggs
  "ไข่ไก่": "ไข่ไก่",
  // Oil
  "น้ำมันปาล์ม": "น้ำมันปาล์ม",
  "น้ำมันถั่วเหลือง": "น้ำมันถั่วเหลือง",
  // Seasoning
  "น้ำตาลทราย": "น้ำตาลทราย",
  // Household
  "ผงซักฟอก": "ผงซักฟอก",
  "น้ำยาล้างจาน": "น้ำยาล้างจาน",
  // Personal Care
  "แชมพู": "แชมพู",
  "ยาสีฟัน": "ยาสีฟัน",
};

/** Minimum plausible grocery price (filters phone numbers, footer years) */
const MIN_PRICE = 5;
/** Maximum plausible grocery price per unit at Lotus's */
const MAX_PRICE = 500;

export const lotussScraper: Scraper = {
  sourceSlug: "lotuss",
  async scrape(): Promise<ScrapedPrice[]> {
    const allPrices: ScrapedPrice[] = [];
    const today = new Date();

    for (const [trackedName, searchTerm] of Object.entries(LOTUS_TRACKED_PRODUCTS)) {
      try {
        const url = `https://www.lotuss.com/th/search/${encodeURIComponent(searchTerm)}`;
        const html = await fetchRenderedHtml(url, {
          gotoOptions: { waitUntil: "networkidle2", timeout: 35000 },
          waitForTimeout: 3000,
        });
        if (!html) continue;

        const $ = cheerio.load(html);
        const bodyText = $("body").text();

        // Find all ฿-prefixed prices in the body text
        const pricePattern = /฿([0-9,]+(?:\.[0-9]{2})?)/g;
        let match: RegExpExecArray | null;
        const candidates: number[] = [];

        while ((match = pricePattern.exec(bodyText)) !== null) {
          const price = parsePrice(match[1]);
          if (price < MIN_PRICE || price > MAX_PRICE) continue;

          // Check if the tracked product name appears within 200 chars
          // BEFORE this price occurrence (same product card)
          const priceStart = match.index;
          const windowStart = Math.max(0, priceStart - 200);
          const precedingText = bodyText.slice(windowStart, priceStart);

          if (precedingText.includes(trackedName)) {
            candidates.push(price);
          }
        }

        if (candidates.length === 0) continue;

        // Keep the cheapest matching price (likely the base variant)
        const cheapest = Math.min(...candidates);
        allPrices.push({
          sourceProductName: trackedName, // EXACT canonical name — matches product_source_mappings
          price: cheapest,
          unit: "บาท/ชิ้น",
          provinceCode: null,
          sourceDate: today,
        });
      } catch (error) {
        console.error(`[Lotus's] Error scraping "${trackedName}":`, error);
      }
    }

    return allPrices;
  },
};
```

**Key design decisions**:
1. **Per-product search**: Each tracked product gets its own search call. This means the page contains mostly relevant products.
2. **Price window**: Only accepts a price if the tracked name appears within 200 chars before the ฿ symbol. This filters cart totals and footer numbers that don't have product names nearby.
3. **Price range filter**: ฿5–฿500 filters phone numbers (4 digits like 1509), copyright years, and abnormally high values.
4. **Canonical name output**: `sourceProductName: trackedName` — exact match with `product_source_mappings`, so the cron route will always find the mapping.
5. **Cheapest variant**: When multiple valid prices exist for the same product, keep the cheapest (base variant).

#### Step 4: Update `src/lib/scrapers/makro.ts`

Add new entries to `PRODUCT_CATEGORY_MAP` (after line 122):

```typescript
"ซี่โครงหมู": ["meat/pork"],
"หมูบด": ["meat/pork"],
"ไก่บด": ["meat/poultry"],
"อกไก่": ["meat/poultry"],
"ปีกไก่": ["meat/poultry"],
"น่องไก่": ["meat/poultry"],
```

NOTE: The existing code already has `"หมูสับ": ["meat/pork"]`, `"หมูสามชั้น": ["meat/pork"]`, `"ไก่สด": ["meat/poultry"]`, `"เนื้อวัว": ["meat/beef"]`. The user reports Makro only tracks beef — the Engineer should verify whether the Makro category slugs `meat/pork` and `meat/poultry` actually return products. If they return 0 products (found=0), the Engineer should try alternative slugs like `fresh-food/meat-poultry` or search-based approach. Document findings.

#### Step 5: Update `src/messages/th.json`

Replace the `categories` section:
```json
"categories": {
  "pork": "หมู",
  "chicken": "ไก่",
  "beef": "เนื้อวัว",
  "vegetables": "ผัก",
  "rice": "ข้าว",
  "eggs": "ไข่ & นม",
  "oil": "น้ำมัน & ไขมัน",
  "seasoning": "เครื่องปรุง",
  "fuel": "น้ำมันเชื้อเพลิง",
  "fruit": "ผลไม้",
  "fish": "ปลา",
  "shrimp": "กุ้ง",
  "shellfish-crab": "หอย & ปู",
  "beverages": "เครื่องดื่ม",
  "noodles": "ก๋วยเตี๋ยว & บะหมี่",
  "bakery": "เบเกอรี่",
  "household": "ของใช้ในบ้าน",
  "personal-care": "ของใช้ส่วนตัว",
  "baby": "ของใช้เด็ก",
  "pet": "อาหาร & ของใช้สัตว์เลี้ยง",
  "frozen": "อาหารแช่แข็ง",
  "snacks": "ขนมขบเคี้ยว",
  "coffee-tea": "กาแฟ & ชา",
  "canned-goods": "อาหารกระป๋อง & ของแห้ง"
}
```

#### Step 6: Update `src/messages/en.json`

Replace the `categories` section:
```json
"categories": {
  "pork": "Pork",
  "chicken": "Chicken",
  "beef": "Beef",
  "vegetables": "Vegetables",
  "rice": "Rice",
  "eggs": "Eggs & Dairy",
  "oil": "Oil & Fat",
  "seasoning": "Seasoning",
  "fuel": "Fuel",
  "fruit": "Fruit",
  "fish": "Fish",
  "shrimp": "Shrimp",
  "shellfish-crab": "Shellfish & Crab",
  "beverages": "Beverages",
  "noodles": "Noodles",
  "bakery": "Bakery",
  "household": "Household",
  "personal-care": "Personal Care",
  "baby": "Baby Care",
  "pet": "Pet Care",
  "frozen": "Frozen Foods",
  "snacks": "Snacks",
  "coffee-tea": "Coffee & Tea",
  "canned-goods": "Canned Goods"
}
```

#### Step 7: Update `src/app/[locale]/page.tsx`

Replace the `CATEGORIES` constant (lines 16-29):
```typescript
const CATEGORIES = [
  { slug: "pork", icon: "🥓" },
  { slug: "chicken", icon: "🍗" },
  { slug: "beef", icon: "🥩" },
  { slug: "vegetables", icon: "🥬" },
  { slug: "rice", icon: "🍚" },
  { slug: "eggs", icon: "🥚" },
  { slug: "oil", icon: "🛢️" },
  { slug: "seasoning", icon: "🧂" },
  { slug: "fuel", icon: "⛽" },
  { slug: "fruit", icon: "🍎" },
  { slug: "fish", icon: "🐟" },
  { slug: "shrimp", icon: "🦐" },
  { slug: "shellfish-crab", icon: "🦀" },
  { slug: "beverages", icon: "🥤" },
  { slug: "noodles", icon: "🍜" },
  { slug: "bakery", icon: "🍞" },
];
```

#### Step 8: Update `src/app/[locale]/category/[slug]/page.tsx`

Replace `VALID_SLUGS` (line 15):
```typescript
const VALID_SLUGS = [
  "pork", "chicken", "beef",
  "vegetables", "rice", "eggs", "oil", "seasoning", "fuel", "fruit",
  "fish", "shrimp", "shellfish-crab",
  "beverages", "noodles", "bakery",
];
```

#### Step 9: Rewrite `src/lib/scrapers/__tests__/lotuss.test.ts`

```typescript
import { describe, it, expect, vi } from "vitest";
import { lotussScraper } from "../lotuss";
import * as browserless from "../browserless";

vi.mock("../browserless", () => ({
  fetchRenderedHtml: vi.fn(),
}));

describe("lotussScraper", () => {
  it("extracts valid product prices within ฿5–฿500 range", async () => {
    const mockHtml = `
      <html><body>
        หมูสามชั้น 150 กรัม ฿39.00 ซื้อครบลดเพิ่ม
        หมูสามชั้น 300 กรัม ฿69.00
      </body></html>
    `;
    vi.spyOn(browserless, "fetchRenderedHtml").mockResolvedValue(mockHtml);

    const results = await lotussScraper.scrape();

    const porkBelly = results.find((r) => r.sourceProductName === "หมูสามชั้น");
    expect(porkBelly).toBeDefined();
    expect(porkBelly?.price).toBe(39); // cheapest variant
    expect(porkBelly?.unit).toBe("บาท/ชิ้น");
  });

  it("filters out prices above ฿500 (phone numbers, cart totals)", async () => {
    const mockHtml = `
      <html><body>
        หมูสามชั้น ฿45.00
        โทร. 02-150-9999 ฿1509
        ราคากลางทั่วประเทศ ฿1339
      </body></html>
    `;
    vi.spyOn(browserless, "fetchRenderedHtml").mockResolvedValue(mockHtml);

    const results = await lotussScraper.scrape();

    const porkBelly = results.find((r) => r.sourceProductName === "หมูสามชั้น");
    expect(porkBelly).toBeDefined();
    expect(porkBelly?.price).toBe(45); // only the valid price
    expect(porkBelly?.price).not.toBe(1509);
    expect(porkBelly?.price).not.toBe(1339);
  });

  it("outputs canonical tracked name as sourceProductName", async () => {
    const mockHtml = `<html><body>หมูสามชั้นสไลซ์ 150 กรัม ฿39.00</body></html>`;
    vi.spyOn(browserless, "fetchRenderedHtml").mockResolvedValue(mockHtml);

    const results = await lotussScraper.scrape();

    // Must be exact "หมูสามชั้น" not the raw scraped title
    const exact = results.find((r) => r.sourceProductName === "หมูสามชั้น");
    expect(exact).toBeDefined();
  });

  it("returns empty when no valid prices found", async () => {
    const mockHtml = `<html><body>ไม่มีสินค้า ฿0 หรือ ฿9999</body></html>`;
    vi.spyOn(browserless, "fetchRenderedHtml").mockResolvedValue(mockHtml);

    const results = await lotussScraper.scrape();
    expect(results.length).toBe(0);
  });

  it("handles browserless returning null gracefully", async () => {
    vi.spyOn(browserless, "fetchRenderedHtml").mockResolvedValue(null);
    const results = await lotussScraper.scrape();
    expect(results.length).toBe(0);
  });
});
```

### 5. Assertion & Testing Requirements

**Unit Tests** (vitest, `src/lib/scrapers/__tests__/lotuss.test.ts`):
- Valid product price extraction within range
- Filter prices > ฿500 (phone numbers, cart totals)
- Canonical name output (not raw scraped title)
- Empty result when no valid prices
- Graceful null handling from Browserless

**Integration** (manual, after seed + scrape):
- `pnpm seed` succeeds
- `npx tsx src/db/cleanup-lotuss.ts` deletes old prices
- Cron scrape populates clean Lotus's prices
- No Lotus's price > ฿500 in DB
- Makro returns pork/chicken prices

### 6. Verification Commands

```bash
# 1. Build
pnpm build

# 2. Lint
pnpm lint

# 3. Tests
pnpm vitest run

# 4. Seed (requires DATABASE_URL in .env.local)
pnpm seed

# 5. Cleanup old Lotus's prices
npx tsx src/db/cleanup-lotuss.ts

# 6. Verify category restructure (psql or tsx script)
# Expected: 6 new categories (pork, chicken, beef, fish, shrimp, shellfish-crab)
# Expected: 0 products in old "meat" and "seafood" categories

# 7. Run scrapers to verify clean data
curl -X POST http://localhost:3000/api/cron/scrape \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json"
```

### Verification Exit Criteria (Engineer MUST self-verify ALL before reporting DONE)

- [ ] `pnpm build` exits 0 — run it, paste exit code
- [ ] `pnpm lint` exits 0 — run it, paste exit code
- [ ] `pnpm vitest run` all tests pass — paste pass/fail count
- [ ] `pnpm seed` exits 0 — paste last 3 log lines
- [ ] DB has 6 new categories (pork, chicken, beef, fish, shrimp, shellfish-crab) and old categories (meat, seafood) have 0 products — paste query result
- [ ] DB source nameTh for lotuss is "โลตัส" (not "โลตัสราคากลางทั่วประเทศ") — paste query result
- [ ] `npx tsx src/db/cleanup-lotuss.ts` runs and deletes old prices — paste log output
- [ ] Home page (`/th`) renders with new category cards (pork, chicken, beef, fish, shrimp, shellfish-crab) — screenshot or curl HTML check
- [ ] Category page `/th/category/pork` returns 200 (not 404) — curl status code
- [ ] Lotus's scraper test: mock HTML with ฿1509 and ฿39 → only ฿39 is accepted — vitest output
