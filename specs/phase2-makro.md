# Songkhla Grocery Price Comparison — Phase 2: Makro Pro + Retail/Wholesale Mode + Catalog Expansion

## Section 1 — Product

### Goal & Scope

Phase 2 expands the price comparison app with three capabilities:

1. **Makro Pro source** — Add Makro Pro (makro.pro) as a WHOLESALE data source. Makro Pro's API is behind Cloudflare and requires business authentication (confirmed via research). This scraper will be MOCK data with realistic Thai wholesale prices, following the same pattern as existing mock scrapers (OAE, Talad Thai, Si Mum Muang). It adds real seafood coverage that no existing source provides.

2. **Retail vs Wholesale Mode** — Users toggle between "ปลีก (Retail)" and "ส่ง (Wholesale)" to compare apples-to-apples. Default is Retail (for families). Sources are classified by price type. Price comparison tables only show prices from sources matching the selected mode.

3. **Expanded Product Catalog** — Four new categories: Seafood (อาหารทะเล), Beverages (เครื่องดื่ม), Noodles (ก๋วยเตี๋ยว/บะหมี่), Bakery (เบเกอรี่). Total products grow from 35 to ~55.

### Out of Scope (NOT Building)

- Real Makro Pro API integration (API is inaccessible — Cloudflare + auth wall)
- Real Lotus's / Big C / Tops scraping (future phase)
- Price history charts or trends
- User accounts
- Shopping basket
- Price alerts / notifications
- Per-unit normalization (still using UnitWarningBadge approach from Phase 1)
- Admin dashboard

### User Stories / Acceptance Criteria

1. **Toggle price mode** — User sees a prominent toggle on the home page (default: ปลีก/Retail). Tapping ส่ง/Wholesale switches all price comparisons to wholesale sources. Selection persists across pages via cookie.
2. **Browse seafood** — User sees a new "อาหารทะเล" category card on the home page. Tapping it shows 8 seafood products (ปลาทู, กุ้งกุลาดำ, กุ้งขาว, ปลาหมึก, ปูม้า, หอยแมลงภั่ง, ปลาสำเตร็ง, ปลานิล).
3. **Compare seafood prices** — In wholesale mode, seafood products show prices from Makro + Talad Thai + Si Mum Muang. In retail mode, seafood products show "no data" (no retail source covers seafood yet) with a friendly empty state.
4. **Browse new categories** — Beverages (3 products), Noodles (3 products), Bakery (2 products) each appear as category cards and function the same as existing categories.
5. **Filter respects mode** — On the product detail page (e.g. หมูสามชั้น), Retail mode shows DIT + OAE prices; Wholesale mode shows Makro + Talad Thai + Si Mum Muang prices. The cheapest badge is calculated within the selected mode only.
6. **Home page updates** — "Today's price updates" section respects the selected mode — only shows prices from sources matching the mode.
7. **Category page respects mode** — Product cards on category pages show cheapest price within the selected mode only.
8. **i18n** — All new text (toggle labels, category names, empty states) appears in both Thai and English.

### Domain Invariant Gap (Mandatory)

**Gap: Wholesale unit variety is wider than retail.** Retail sources (DIT, EPPO) consistently use per-kg, per-litre, per-egg, per-cylinder units. Wholesale sources use bulk packaging: Makro sells by the case (กล่อง/ลัง), Talad Thai by the sack (กระสอบ), Si Mum Muang by the basket (ตะกร้า). Even with all mock data using "บาท/กก." for consistency, REAL wholesale data will introduce units like "บาท/กล่อง 5 กก." or "บาท/ลัง 10 กก." that are not directly comparable to "บาท/กก." without per-unit-weight calculation.

**Impact**: When real wholesale data replaces mock data, the comparison table will show "Makro: 480 บาท/กล่อง 5 กก." next to "Talad Thai: 90 บาท/กก." for the same seafood product. The user sees 480 > 90 and assumes Makro is more expensive, but per-kg it's 96 vs 90 — Makro is actually cheaper. This ERODES trust in the wholesale mode.

**Decision for Phase 2**: All mock wholesale prices use "บาท/กก." for per-weight products and consistent retail-equivalent units for packaged goods. The existing UnitWarningBadge remains. Document in code comments that real Makro data will need a `unitNormalization` layer before display. Do NOT build normalization now — it's Phase 3.

---

## Section 2 — Engineering Handoff

### 0. Architectural Decision Record (ADR) & Scaling Tradeoffs

**Context**: Adding price-type filtering to an existing Next.js + Drizzle + Postgres app. Need to support two modes (retail/wholesale) across all price-displaying pages without duplicating UI or query logic.

**Chosen Architecture**: `priceType` column on `sources` table (NOT `prices` table). Each source is classified as `retail` or `wholesale`. Queries filter by JOIN-ing to sources and adding `WHERE sources.price_type = ?`. Cookie-based mode persistence (same pattern as existing province selector).

**Discarded Alternatives**:
- *priceType on prices table*: More flexible but requires updating the cron insert path, the unique constraint, and every scraper's `ScrapedPrice` interface. Overkill for Phase 2 where each source is exclusively one type. If a future source reports both types, we can add a `price_type` column to `prices` then.
- *Separate pages/routes for retail/wholesale*: Duplicates all UI components and routes. Violates DRY. The toggle + filter approach reuses 100% of existing UI.

### 1. Target Files & Folder Structure

**Files to MODIFY (8 files):**

| File | Change |
|------|--------|
| `src/db/schema.ts` | Add `priceType` column to `sources` table |
| `src/db/seed.ts` | Add makro source, new categories, new products, priceType values, new mappings |
| `src/db/queries.ts` | Add `priceTypeFilter` helper, update 3 query functions to accept and filter by priceType |
| `src/lib/scrapers/index.ts` | Register makro scraper |
| `src/messages/th.json` | Add new category names, toggle labels, mode descriptions |
| `src/messages/en.json` | Same as above in English |
| `src/app/[locale]/page.tsx` | Read priceType cookie, pass to queries, render toggle, add new categories to grid |
| `src/app/[locale]/category/[slug]/page.tsx` | Read priceType cookie, pass to queries, add new valid slugs |
| `src/app/[locale]/product/[slug]/page.tsx` | Read priceType cookie, filter prices by priceType |

**Files to CREATE (2 files):**

| File | Purpose |
|------|---------|
| `src/lib/scrapers/makro.ts` | Makro Pro mock scraper (wholesale seafood + dry goods) |
| `src/components/price-type-toggle.tsx` | Client component for ปลีก/ส่ง toggle (cookie-based) |

### 2. Import Definitions & Dependencies

No new npm dependencies. All work uses existing stack:
- `drizzle-orm` — schema changes, query filters
- `next-intl` — i18n strings
- `lucide-react` — icons for toggle (Store for wholesale, ShoppingBasket for retail)
- `shadcn/ui` — Select or custom toggle buttons
- `cheerio` — NOT needed (mock scraper has no HTML to parse)

### 3. Database Schema Changes

**File: `src/db/schema.ts`**

Add to `sources` table definition (after `type` column, before `createdAt`):

```typescript
/**
 * Whether this source's prices are retail (ขายปลีก) or wholesale (ขายส่ง).
 * Used by the UI toggle to filter comparisons apples-to-apples.
 * "retail" | "wholesale"
 */
priceType: varchar("price_type", { length: 20 }).notNull().default("retail"),
```

**Migration approach**: Since the project uses `drizzle-kit push` (no migrations directory exists), the engineer should:
1. Add the column to schema.ts
2. Run `npx drizzle-kit push` to apply to the running Docker Postgres
3. The `DEFAULT 'retail'` ensures all existing rows get "retail" automatically
4. Then run `pnpm seed` to upsert sources with correct priceType values + add new seed data

**IMPORTANT**: The existing `type` column ("government" | "wholesale") on sources is NOT the same as `priceType`. `type` describes the source organization (government agency vs wholesale market). `priceType` describes the price data type (retail prices vs wholesale prices). Both columns coexist.

### 4. Step-by-Step Edits

#### Step 1: Schema — Add priceType column to sources

**File**: `src/db/schema.ts`, in the `sources` table definition.

After line 25 (`type: varchar("type", { length: 20 }).notNull(),`), insert:

```typescript
  /**
   * Whether this source's prices are retail (ขายปลีก) or wholesale (ขายส่ง).
   * UI toggle filters comparisons by this field.
   * "retail" | "wholesale"
   */
  priceType: varchar("price_type", { length: 20 }).notNull().default("retail"),
```

Then run: `npx drizzle-kit push`

#### Step 2: Update seed.ts — Sources with priceType + new source

**File**: `src/db/seed.ts`

Update `sourceSeeds` array (replace the entire array):

```typescript
const sourceSeeds = [
  {
    slug: "dit",
    nameTh: "กรมการค้าภายใน",
    nameEn: "Department of Internal Trade",
    url: "https://www.dit.go.th",
    type: "government",
    priceType: "retail",
  },
  {
    slug: "oae",
    nameTh: "สำนักงานเศรษฐกิจการเกษตร",
    nameEn: "Office of Agricultural Economics",
    url: "https://www.oae.go.th",
    type: "government",
    priceType: "wholesale",
  },
  {
    slug: "taladthai",
    nameTh: "ตลาดไท",
    nameEn: "Talad Thai",
    url: "https://www.taladthai.com",
    type: "wholesale",
    priceType: "wholesale",
  },
  {
    slug: "simummuang",
    nameTh: "ตลาดสี่มุมเมือง",
    nameEn: "Si Mum Muang Market",
    url: "https://www.simummuangmarket.com",
    type: "wholesale",
    priceType: "wholesale",
  },
  {
    slug: "eppo",
    nameTh: "สำนักงานนโยบายและแผนพลังงาน",
    nameEn: "Energy Policy and Planning Office",
    url: "https://www.eppo.go.th",
    type: "government",
    priceType: "retail",
  },
  {
    slug: "makro",
    nameTh: "แมคโคร",
    nameEn: "Makro Pro",
    url: "https://www.makro.pro",
    type: "wholesale",
    priceType: "wholesale",
  },
];
```

**IMPORTANT**: Since `onConflictDoNothing()` won't update existing rows, the seed must do an explicit UPDATE for priceType on existing sources. Add this AFTER the sources insert:

```typescript
// Update priceType for existing sources (onConflictDoNothing won't update)
for (const s of sourceSeeds) {
  await db
    .update(sources)
    .set({ priceType: s.priceType })
    .where(eq(sources.slug, s.slug));
}
```

Add `eq` to the drizzle-orm import at top of seed.ts.

#### Step 3: Update seed.ts — New categories

Add to `categorySeeds` array (after fruit, sortOrder 8):

```typescript
  { slug: "seafood", nameTh: "อาหารทะเล", nameEn: "Seafood", icon: "🐟", sortOrder: 9 },
  { slug: "beverages", nameTh: "เครื่องดื่ม", nameEn: "Beverages", icon: "🥤", sortOrder: 10 },
  { slug: "noodles", nameTh: "ก๋วยเตี๋ยว & บะหมี่", nameEn: "Noodles", icon: "🍜", sortOrder: 11 },
  { slug: "bakery", nameTh: "เบเกอรี่", nameEn: "Bakery", icon: "🍞", sortOrder: 12 },
```

#### Step 4: Update seed.ts — New products

Add to `productSeeds` array (after the fruit section):

```typescript
  // seafood
  { slug: "mackerel", nameTh: "ปลาทู", nameEn: "Short Mackerel", categorySlug: "seafood" },
  { slug: "black-tiger-shrimp", nameTh: "กุ้งกุลาดำ", nameEn: "Black Tiger Shrimp", categorySlug: "seafood" },
  { slug: "white-shrimp", nameTh: "กุ้งขาว", nameEn: "White Shrimp", categorySlug: "seafood" },
  { slug: "squid", nameTh: "ปลาหมึก", nameEn: "Squid", categorySlug: "seafood" },
  { slug: "blue-crab", nameTh: "ปูม้า", nameEn: "Blue Crab", categorySlug: "seafood" },
  { slug: "green-mussel", nameTh: "หอยแมลงภั่ง", nameEn: "Green Mussel", categorySlug: "seafood" },
  { slug: "saba-fish", nameTh: "ปลาสำเตร็ง", nameEn: "Saba Fish", categorySlug: "seafood" },
  { slug: "tilapia", nameTh: "ปลานิล", nameEn: "Tilapia", categorySlug: "seafood" },
  // beverages
  { slug: "drinking-water", nameTh: "น้ำดื่ม", nameEn: "Drinking Water", categorySlug: "beverages" },
  { slug: "soda", nameTh: "น้ำอัดลม", nameEn: "Soda", categorySlug: "beverages" },
  { slug: "fruit-juice", nameTh: "น้ำผลไม้", nameEn: "Fruit Juice", categorySlug: "beverages" },
  // noodles
  { slug: "instant-noodles", nameTh: "บะหมี่กึ่งสำเร็จรูป", nameEn: "Instant Noodles", categorySlug: "noodles" },
  { slug: "rice-noodles", nameTh: "เส้นหมี่", nameEn: "Rice Noodles", categorySlug: "noodles" },
  { slug: "glass-noodles", nameTh: "วุ้นเส้น", nameEn: "Glass Noodles", categorySlug: "noodles" },
  // bakery
  { slug: "bread", nameTh: "ขนมปัง", nameEn: "Bread", categorySlug: "bakery" },
  { slug: "wheat-flour", nameTh: "แป้งสาลี", nameEn: "Wheat Flour", categorySlug: "bakery" },
```

#### Step 5: Update seed.ts — Product-source mappings for Makro

Add a `makroMappings` array that maps Makro's source product names to canonical product slugs. Makro sells wholesale quantities but for consistency with other mock sources, we use the Thai product name as-is.

```typescript
const makroMappings: MappingSeed[] = [
  // seafood (Makro's primary differentiator)
  { sourceSlug: "makro", productSlug: "mackerel", sourceProductName: "ปลาทู" },
  { sourceSlug: "makro", productSlug: "black-tiger-shrimp", sourceProductName: "กุ้งกุลาดำ" },
  { sourceSlug: "makro", productSlug: "white-shrimp", sourceProductName: "กุ้งขาว" },
  { sourceSlug: "makro", productSlug: "squid", sourceProductName: "ปลาหมึก" },
  { sourceSlug: "makro", productSlug: "blue-crab", sourceProductName: "ปูม้า" },
  { sourceSlug: "makro", productSlug: "green-mussel", sourceProductName: "หอยแมลงภั่ง" },
  { sourceSlug: "makro", productSlug: "saba-fish", sourceProductName: "ปลาสำเตร็ง" },
  { sourceSlug: "makro", productSlug: "tilapia", sourceProductName: "ปลานิล" },
  // dry goods (Makro also covers these in bulk)
  { sourceSlug: "makro", productSlug: "jasmine-rice", sourceProductName: "ข้าวหอมมะลิ" },
  { sourceSlug: "makro", productSlug: "white-rice", sourceProductName: "ข้าวขาว" },
  { sourceSlug: "makro", productSlug: "sugar", sourceProductName: "น้ำตาลทราย" },
  { sourceSlug: "makro", productSlug: "palm-oil", sourceProductName: "น้ำมันปาล์ม" },
  { sourceSlug: "makro", productSlug: "soybean-oil", sourceProductName: "น้ำมันถั่วเหลือง" },
  { sourceSlug: "makro", productSlug: "fish-sauce", sourceProductName: "น้ำปลา" },
  { sourceSlug: "makro", productSlug: "drinking-water", sourceProductName: "น้ำดื่ม" },
  { sourceSlug: "makro", productSlug: "instant-noodles", sourceProductName: "บะหมี่กึ่งสำเร็จรูป" },
  { sourceSlug: "makro", productSlug: "wheat-flour", sourceProductName: "แป้งสาลี" },
  { sourceSlug: "makro", productSlug: "chicken-egg", sourceProductName: "ไข่ไก่" },
];
```

Also add new products to `MOCK_PRODUCT_SLUGS` for OAE, Talad Thai, Si Mum Muang (they should also cover seafood/new categories for wholesale comparison):

Add to `MOCK_PRODUCT_SLUGS`:
```typescript
  // seafood
  "mackerel",
  "black-tiger-shrimp",
  "white-shrimp",
  "squid",
  "blue-crab",
  "green-mussel",
  "saba-fish",
  "tilapia",
  // beverages
  "drinking-water",
  "soda",
  "fruit-juice",
  // noodles
  "instant-noodles",
  "rice-noodles",
  "glass-noodles",
  // bakery
  "bread",
  "wheat-flour",
```

Then add the makro mappings to `mappingSeeds`:
```typescript
const mappingSeeds: MappingSeed[] = [...ditMappings, ...eppoMappings, ...mockMappings, ...makroMappings];
```

#### Step 6: Create Makro scraper (MOCK)

**File**: `src/lib/scrapers/makro.ts`

Follow the exact pattern of `oae.ts` / `taladthai.ts` / `simummuang.ts`. Realistic Thai wholesale prices. Makro is a cash-and-carry wholesaler, so prices are slightly above wholesale market prices but below retail.

```typescript
import type { Scraper, ScrapedPrice } from "./types";

/**
 * Makro Pro (makro.pro) — MOCK DATA.
 *
 * REAL source status: makro.pro is a Next.js app behind Cloudflare with a
 * Strapi backend at siammakro.cloud. All API endpoints require business
 * authentication (CP Axtra account). No public API exists. Server-side fetch
 * is blocked by Cloudflare bot protection.
 *
 * MOCK: values below are realistic Makro wholesale prices as of Aug 2026.
 * Makro is a cash-and-carry wholesaler — prices are above wholesale market
 * (Talad Thai / Si Mum Muang) but below retail (DIT). Primary differentiator:
 * Makro has comprehensive seafood coverage that no other source provides.
 *
 * Replace with real API integration once CP Axtra partnership credentials
 * are obtained.
 */
const MOCK_PRICES: Array<{ name: string; price: number; unit: string }> = [
  // seafood (Makro's key differentiator)
  { name: "ปลาทู", price: 85, unit: "บาท/กก." },
  { name: "กุ้งกุลาดำ", price: 365, unit: "บาท/กก." },
  { name: "กุ้งขาว", price: 195, unit: "บาท/กก." },
  { name: "ปลาหมึก", price: 170, unit: "บาท/กก." },
  { name: "ปูม้า", price: 190, unit: "บาท/กก." },
  { name: "หอยแมลงภั่ง", price: 65, unit: "บาท/กก." },
  { name: "ปลาสำเตร็ง", price: 75, unit: "บาท/กก." },
  { name: "ปลานิล", price: 62, unit: "บาท/กก." },
  // dry goods (bulk sizes)
  { name: "ข้าวหอมมะลิ", price: 42, unit: "บาท/กก." },
  { name: "ข้าวขาว", price: 33, unit: "บาท/กก." },
  { name: "น้ำตาลทราย", price: 24, unit: "บาท/กก." },
  { name: "น้ำมันปาล์ม", price: 47, unit: "บาท/ลิตร" },
  { name: "น้ำมันถั่วเหลือง", price: 63, unit: "บาท/ลิตร" },
  { name: "น้ำปลา", price: 32, unit: "บาท/ขวด 700 มล." },
  { name: "น้ำดื่ม", price: 4.5, unit: "บาท/ขวด" },
  { name: "บะหมี่กึ่งสำเร็จรูป", price: 5.5, unit: "บาท/ซอง" },
  { name: "แป้งสาลี", price: 27, unit: "บาท/กก." },
  { name: "ไข่ไก่", price: 4.0, unit: "บาท/ฟอง" },
];

export const makroScraper: Scraper = {
  sourceSlug: "makro",
  async scrape(): Promise<ScrapedPrice[]> {
    const today = new Date();
    return MOCK_PRICES.map((p) => ({
      sourceProductName: p.name,
      price: p.price,
      unit: p.unit,
      provinceCode: null, // national wholesale reference
      sourceDate: today,
    }));
  },
};
```

#### Step 7: Register Makro scraper

**File**: `src/lib/scrapers/index.ts`

Add import and registration:

```typescript
import { ditScraper } from "./dit";
import { oaeScraper } from "./oae";
import { taladthaiScraper } from "./taladthai";
import { simummuangScraper } from "./simummuang";
import { eppoScraper } from "./eppo";
import { makroScraper } from "./makro";
import type { Scraper } from "./types";

export const scrapers: Scraper[] = [
  ditScraper,
  oaeScraper,
  taladthaiScraper,
  simummuangScraper,
  eppoScraper,
  makroScraper,
];
```

#### Step 8: Update mock scrapers to include new products

**File**: `src/lib/scrapers/oae.ts` — Add seafood + new category prices to `MOCK_PRICES`:

```typescript
  // seafood (OAE tracks agricultural/marine wholesale)
  { name: "ปลาทู", price: 78, unit: "บาท/กก." },
  { name: "กุ้งกุลาดำ", price: 350, unit: "บาท/กก." },
  { name: "กุ้งขาว", price: 185, unit: "บาท/กก." },
  { name: "ปลาหมึก", price: 160, unit: "บาท/กก." },
  { name: "ปูม้า", price: 180, unit: "บาท/กก." },
  { name: "หอยแมลงภั่ง", price: 58, unit: "บาท/กก." },
  { name: "ปลาสำเตร็ง", price: 70, unit: "บาท/กก." },
  { name: "ปลานิล", price: 55, unit: "บาท/กก." },
```

**File**: `src/lib/scrapers/taladthai.ts` — Add same seafood products at Talad Thai prices (slightly below Makro, this is a wholesale market):

```typescript
  // seafood
  { name: "ปลาทู", price: 80, unit: "บาท/กก." },
  { name: "กุ้งกุลาดำ", price: 355, unit: "บาท/กก." },
  { name: "กุ้งขาว", price: 188, unit: "บาท/กก." },
  { name: "ปลาหมึก", price: 163, unit: "บาท/กก." },
  { name: "ปูม้า", price: 183, unit: "บาท/กก." },
  { name: "หอยแมลงภั่ง", price: 60, unit: "บาท/กก." },
  { name: "ปลาสำเตร็ง", price: 72, unit: "บาท/กก." },
  { name: "ปลานิล", price: 57, unit: "บาท/กก." },
```

**File**: `src/lib/scrapers/simummuang.ts` — Add same seafood products at Si Mum Muang prices:

```typescript
  // seafood
  { name: "ปลาทู", price: 82, unit: "บาท/กก." },
  { name: "กุ้งกุลาดำ", price: 358, unit: "บาท/กก." },
  { name: "กุ้งขาว", price: 190, unit: "บาท/กก." },
  { name: "ปลาหมึก", price: 165, unit: "บาท/กก." },
  { name: "ปูม้า", price: 185, unit: "บาท/กก." },
  { name: "หอยแมลงภั่ง", price: 62, unit: "บาท/กก." },
  { name: "ปลาสำเตร็ง", price: 73, unit: "บาท/กก." },
  { name: "ปลานิล", price: 58, unit: "บาท/กก." },
```

#### Step 9: Update queries.ts — Add priceType filter

**File**: `src/db/queries.ts`

Add a helper function (after `provincePriceFilter`):

```typescript
/**
 * SQL filter matching prices from sources of the given price type.
 * "retail" shows only retail sources; "wholesale" shows only wholesale.
 */
export function priceTypeFilter(priceType: string): SQL {
  return eq(sources.priceType, priceType);
}
```

Update `getProductsWithCheapestPrice` — add `priceType` parameter and filter:

Change signature from:
```typescript
export async function getProductsWithCheapestPrice(
  db: Db,
  productRows: Array<{ id: number; slug: string; nameTh: string; nameEn: string | null }>,
  provinceId: number | null
): Promise<ProductWithCheapestPrice[]> {
```
To:
```typescript
export async function getProductsWithCheapestPrice(
  db: Db,
  productRows: Array<{ id: number; slug: string; nameTh: string; nameEn: string | null }>,
  provinceId: number | null,
  priceType: string = "retail"
): Promise<ProductWithCheapestPrice[]> {
```

In the inner query, change the `.where(...)` from:
```typescript
.where(and(eq(prices.productId, p.id), provincePriceFilter(provinceId)));
```
To:
```typescript
.where(and(eq(prices.productId, p.id), provincePriceFilter(provinceId), priceTypeFilter(priceType)));
```

Update `getRecentPriceChanges` — add `priceType` parameter:

Change signature from:
```typescript
export async function getRecentPriceChanges(
  db: Db,
  provinceId: number | null,
  limit = 8
): Promise<PriceChangeItem[]> {
```
To:
```typescript
export async function getRecentPriceChanges(
  db: Db,
  provinceId: number | null,
  limit = 8,
  priceType: string = "retail"
): Promise<PriceChangeItem[]> {
```

In the main query `.where(...)`, add `priceTypeFilter(priceType)`:
```typescript
.where(and(eq(prices.sourceDate, latest.d), provincePriceFilter(provinceId), priceTypeFilter(priceType)));
```

Also update the `latest.d` subquery to respect priceType — add a JOIN to sources and filter:
```typescript
const [latest] = await db
  .select({ d: max(prices.sourceDate) })
  .from(prices)
  .innerJoin(sources, eq(prices.sourceId, sources.id))
  .where(priceTypeFilter(priceType));
```

#### Step 10: Create PriceTypeToggle component

**File**: `src/components/price-type-toggle.tsx`

Client component, follows the same pattern as `province-selector.tsx`. Uses cookie + localStorage for persistence. Dispatches a custom event so client-side re-renders can react (same as province).

```typescript
"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export function PriceTypeToggle() {
  const t = useTranslations("priceType");
  const [priceType, setPriceType] = useState("retail");

  useEffect(() => {
    const saved = localStorage.getItem("priceType");
    if (saved === "retail" || saved === "wholesale") setPriceType(saved);
  }, []);

  const handleChange = (value: string) => {
    setPriceType(value);
    localStorage.setItem("priceType", value);
    document.cookie = `priceType=${value}; path=/; max-age=31536000`;
    window.dispatchEvent(new Event("price-type-change"));
  };

  return (
    <div className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 p-0.5">
      <button
        onClick={() => handleChange("retail")}
        className={cn(
          "rounded-full px-3 py-1 text-xs font-medium transition-colors",
          priceType === "retail"
            ? "bg-green-600 text-white"
            : "text-zinc-500 hover:text-zinc-700"
        )}
      >
        {t("retail")}
      </button>
      <button
        onClick={() => handleChange("wholesale")}
        className={cn(
          "rounded-full px-3 py-1 text-xs font-medium transition-colors",
          priceType === "wholesale"
            ? "bg-blue-600 text-white"
            : "text-zinc-500 hover:text-zinc-700"
        )}
      >
        {t("wholesale")}
      </button>
    </div>
  );
}
```

#### Step 11: Update home page

**File**: `src/app/[locale]/page.tsx`

1. Read priceType cookie:
```typescript
const priceType = cookieStore.get("priceType")?.value ?? "retail";
```

2. Pass priceType to query functions:
```typescript
const [countRows, changeRows] = await Promise.all([
  getCategoryProductCounts(db),
  getRecentPriceChanges(db, provinceId, 8, priceType),
]);
```

3. Add new categories to the `CATEGORIES` array:
```typescript
const CATEGORIES = [
  { slug: "meat", icon: "🥩" },
  { slug: "vegetables", icon: "🥬" },
  { slug: "rice", icon: "🍚" },
  { slug: "eggs", icon: "🥚" },
  { slug: "oil", icon: "🛢️" },
  { slug: "seasoning", icon: "🧂" },
  { slug: "fuel", icon: "⛽" },
  { slug: "fruit", icon: "🍎" },
  { slug: "seafood", icon: "🐟" },
  { slug: "beverages", icon: "🥤" },
  { slug: "noodles", icon: "🍜" },
  { slug: "bakery", icon: "🍞" },
];
```

4. Import and render `PriceTypeToggle` — place it in the hero section, next to the province selector:
```tsx
import { PriceTypeToggle } from "@/components/price-type-toggle";
// ...
<div className="mt-5 flex items-center justify-center gap-2">
  <MapPin className="h-4 w-4 text-green-600" />
  <span className="text-sm font-medium text-zinc-600">{tc("province")}:</span>
  <ProvinceSelector />
  <PriceTypeToggle />
</div>
```

#### Step 12: Update category page

**File**: `src/app/[locale]/category/[slug]/page.tsx`

1. Add new slugs to `VALID_SLUGS`:
```typescript
const VALID_SLUGS = ["meat", "vegetables", "rice", "eggs", "oil", "seasoning", "fuel", "fruit", "seafood", "beverages", "noodles", "bakery"];
```

2. Update `generateStaticParams` — it already maps from `VALID_SLUGS`, so it auto-updates.

3. Read priceType cookie:
```typescript
const priceType = cookieStore.get("priceType")?.value ?? "retail";
```

4. Pass priceType to `getProductsWithCheapestPrice`:
```typescript
productList = await getProductsWithCheapestPrice(db, result, provinceId, priceType);
```

#### Step 13: Update product page

**File**: `src/app/[locale]/product/[slug]/page.tsx`

1. Read priceType cookie:
```typescript
const priceType = cookieStore.get("priceType")?.value ?? "retail";
```

2. Filter prices by priceType. Update the rawPrices query to JOIN sources and filter by priceType:

Change the prices query to add `eq(sources.priceType, priceType)`:
```typescript
const rawPrices = await db
  .select({
    sourceSlug: sources.slug,
    sourceNameTh: sources.nameTh,
    sourceNameEn: sources.nameEn,
    sourceType: sources.type,
    price: prices.price,
    unit: prices.unit,
    sourceDate: prices.sourceDate,
    provinceId: prices.provinceId,
  })
  .from(prices)
  .innerJoin(sources, eq(prices.sourceId, sources.id))
  .where(and(
    eq(prices.productId, productRow.id),
    provincePriceFilter(provinceId),
    eq(sources.priceType, priceType),
  ));
```

#### Step 14: Update i18n messages

**File**: `src/messages/th.json` — Add new sections:

In `"categories"` object, add:
```json
    "seafood": "อาหารทะเล",
    "beverages": "เครื่องดื่ม",
    "noodles": "ก๋วยเตี๋ยว & บะหมี่",
    "bakery": "เบเกอรี่"
```

Add new top-level `"priceType"` object:
```json
  "priceType": {
    "retail": "ปลีก",
    "wholesale": "ส่ง",
    "retailHint": "ราคาขายปลีกสำหรับผู้บริโภคทั่วไป",
    "wholesaleHint": "ราคาขายส่งสำหรับร้านค้าและธุรกิจ"
  }
```

**File**: `src/messages/en.json` — Same structure:

In `"categories"` object, add:
```json
    "seafood": "Seafood",
    "beverages": "Beverages",
    "noodles": "Noodles",
    "bakery": "Bakery"
```

Add new top-level `"priceType"` object:
```json
  "priceType": {
    "retail": "Retail",
    "wholesale": "Wholesale",
    "retailHint": "Retail prices for individual consumers",
    "wholesaleHint": "Wholesale prices for businesses"
  }
```

### 5. Component States

| Component | Loading | Error | Empty | Success-edge |
|-----------|---------|-------|-------|-------------|
| PriceTypeToggle | N/A (instant client state) | N/A | N/A | Switch updates cookie + triggers reload |
| Product page (wholesale, no data) | — | — | "No prices for this product yet" empty state with category link | — |
| Category page (seafood, retail mode) | — | — | Shows products with "No price data yet" cards | — |
| Home (wholesale mode) | — | — | "No new prices today" empty state | Shows wholesale source prices |

### 6. Edge Cases

| Edge Case | Expected Behavior |
|-----------|-------------------|
| priceType cookie missing | Default to "retail" (safe for families) |
| priceType cookie invalid value | Default to "retail" |
| Seafood product in retail mode | Show empty state "No prices yet" — no retail source covers seafood |
| Fuel product in wholesale mode | Show empty state — EPPO is retail-only |
| All sources for a product are same type | Toggle still works, just shows/hides all prices |
| User toggles mode mid-session | Cookie updates, page reloads (or re-fetches) to show correct prices |
| New source added without priceType | Schema default "retail" applies automatically |

### 7. Test Matrix

| Layer | Test | Ownership |
|-------|------|-----------|
| Unit | priceTypeFilter returns correct SQL | Engineer |
| Unit | Makro scraper returns 18 ScrapedPrice items with valid prices | Engineer |
| Unit | Mock scrapers (oae, taladthai, simummuang) return seafood items | Engineer |
| Integration | DB schema has price_type column after push | Engineer |
| Integration | Seed inserts makro source with priceType "wholesale" | Engineer |
| Integration | Seed updates existing sources' priceType correctly | Engineer |
| Integration | getProductsWithCheapestPrice filters by priceType | Engineer |
| Integration | getRecentPriceChanges filters by priceType | Engineer |
| Build | `pnpm build` passes with no TypeScript errors | Engineer |
| Build | `pnpm lint` passes | Engineer |
| Manual | Home page shows 12 category cards | QA |
| Manual | Toggle switches prices on product page | QA |
| Manual | Seafood category shows 8 products | QA |
| Manual | TH/EN i18n for all new strings | QA |

### 8. Executable Test Contracts

Create test file: `src/lib/scrapers/__tests__/makro.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { makroScraper } from "../makro";

describe("makroScraper", () => {
  it("returns array of scraped prices", async () => {
    const results = await makroScraper.scrape();
    expect(results.length).toBeGreaterThan(0);
  });

  it("includes seafood products", async () => {
    const results = await makroScraper.scrape();
    const seafood = results.filter(r => 
      ["ปลาทู", "กุ้งกุลาดำ", "ปลาหมึก"].includes(r.sourceProductName)
    );
    expect(seafood.length).toBeGreaterThanOrEqual(3);
  });

  it("all prices are positive numbers", async () => {
    const results = await makroScraper.scrape();
    for (const r of results) {
      expect(r.price).toBeGreaterThan(0);
    }
  });

  it("all items have non-empty unit strings", async () => {
    const results = await makroScraper.scrape();
    for (const r of results) {
      expect(r.unit).toBeTruthy();
      expect(r.unit.length).toBeGreaterThan(0);
    }
  });

  it("sourceSlug is 'makro'", () => {
    expect(makroScraper.sourceSlug).toBe("makro");
  });

  it("provinceCode is null (national wholesale)", async () => {
    const results = await makroScraper.scrape();
    for (const r of results) {
      expect(r.provinceCode).toBeNull();
    }
  });
});
```

### 9. Verification Exit Criteria

- [ ] `npx drizzle-kit push` succeeds — `price_type` column exists on `sources` table — verify with `\d sources` in psql
- [ ] `pnpm seed` succeeds — 6 sources seeded (including makro), 12 categories, 77 provinces, ~51 products — verify console output shows correct counts
- [ ] `pnpm build` passes with zero TypeScript errors — `next build` exits 0
- [ ] `pnpm lint` passes — `eslint src/` exits 0
- [ ] `npx vitest run` passes — all tests green including new makro test file
- [ ] Manual: Start dev server (`pnpm dev`), open `http://localhost:3000/th`, confirm 12 category cards visible (8 existing + 4 new: seafood 🐟, beverages 🥤, noodles 🍜, bakery 🍞)
- [ ] Manual: Click อาหารทะเล category, confirm 8 seafood products listed (ปลาทู, กุ้งกุลาดำ, กุ้งขาว, ปลาหมึก, ปูม้า, หอยแมลงภั่ง, ปลาสำเตร็ง, ปลานิล)
- [ ] Manual: On product page for ปลาทู in wholesale mode, confirm prices from Makro + Talad Thai + Si Mum Muang visible
- [ ] Manual: Toggle to ปลีก (retail) mode, revisit ปลาทู page, confirm empty state shown (no retail source for seafood)
- [ ] Manual: Toggle to ส่ง (wholesale) mode, open หมูสามชั้น page, confirm prices from Makro + OAE + Talad Thai + Si Mum Muang visible (NO DIT — DIT is retail)
- [ ] Manual: Toggle to ปลีก (retail) mode, open หมูสามชั้น page, confirm only DIT price visible
- [ ] Manual: Switch language to EN, confirm all new category names show in English (Seafood, Beverages, Noodles, Bakery)
- [ ] Manual: Toggle labels show "ปลีก/ส่ง" in TH and "Retail/Wholesale" in EN

### 10. Vertical-Slice Order

| Slice | What | Testable Outcome |
|-------|------|-----------------|
| 1 | Schema + push | `price_type` column in DB |
| 2 | Seed updates (sources, categories, products, mappings) | `pnpm seed` shows correct counts |
| 3 | Makro scraper + mock updates | `npx vitest run` passes makro tests |
| 4 | Query layer (priceType filter) | Queries return filtered results |
| 5 | PriceTypeToggle component | Component renders, cookie persists |
| 6 | Page updates (home, category, product) | Pages read cookie, filter prices |
| 7 | i18n updates | All strings in TH + EN |
| 8 | Build + lint + full verification | All exit criteria pass |
