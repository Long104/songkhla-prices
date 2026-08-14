# Unit Normalization Pipeline

## Section 1 — Product

### Goal & Scope

Standardize price-unit vocabulary across all data sources (DIT, EPPO, Makro, SimumMuang, Lotus's) so the UI shows consistent, comparable units. Currently Lotus's stores `บาท/ชิ้น` while DIT/Makro store `บาท/กก.` — the user sees mismatched units with no reliable comparison.

**What we're building:**
1. A **unit dictionary** (static config) that maps Thai unit synonyms to canonical display words (e.g., `ชิ้น` → `แพ็ค`, `กิโลกรัม` → `กก.`)
2. **Ingest-time normalization** — when scrapers produce data, standardize the unit word and convert to per-kg when weight is known, BEFORE storing in DB
3. **DB persistence** — new columns `normalized_price`, `normalized_unit`, `weight_grams` on the `prices` table
4. **Backfill script** — normalize all existing rows so historical data is consistent
5. **Display updates** — read pre-normalized values from DB instead of computing on every page load

### Out of Scope
- Lotus's scraper card-level parsing refactor (too large, separate effort)
- Fuzzy product-name matching across sources
- Changing Makro's inline normalization (already produces canonical units)
- UI redesign of price table layout

### User Stories / Acceptance Criteria

1. **AC-1**: When I view a product comparison page, all sources show the same unit word for the same type of measurement (no more `ชิ้น` next to `กก.` unless weight is genuinely unknown).

2. **AC-2**: The word `ชิ้น` is replaced by `แพ็ค` everywhere in the UI. If a price was per-piece and no weight is available, it shows `฿49.00/แพ็ค` (display word standardized).

3. **AC-3**: When weight IS extractable from a product title (e.g., "หมูสามชั้น 150 กรัม"), the normalized per-kg price is computed at ingest time and stored in `normalized_price`. The UI shows the per-kg price directly.

4. **AC-4**: The `getRecentPriceChanges()` query (home page "today's prices") uses normalized values, not raw values.

5. **AC-5**: A backfill script normalizes ALL existing rows in the `prices` table so historical data is consistent with new data.

6. **AC-6**: Existing unit tests pass. New tests cover the unit dictionary and ingest normalizer.

---

## Section 2 — Engineering Handoff

### ADR: Schema Evolution Strategy

**Context**: Project uses `drizzle-kit push` (no migration files). Adding nullable columns to `prices` with existing data.

**Decision**: Add three nullable columns (`normalized_price`, `normalized_unit`, `weight_grams`). Run `npx drizzle-kit push --force` to apply. Then run backfill script to populate. Nullable columns ensure the app doesn't crash if `normalized_price` is NULL (falls back to raw `price`).

**Discarded**: NOT NULL with defaults — `normalized_price` can't have a meaningful default for rows where conversion is impossible (no weight data).

---

### 0. Domain Model

**Unit taxonomy (canonical forms):**

| Category | Canonical Unit | Example Sources | Comparable? |
|----------|---------------|-----------------|-------------|
| Weight | `บาท/กก.` | DIT, Makro, SimumMuang | Yes (all weight) |
| Volume | `บาท/ลิตร` | EPPO (fuel), Makro (oil) | Yes (≈weight for liquids) |
| Count | `บาท/แพ็ค` | Lotus's (no weight) | Only within same unit |
| Count | `บาท/ฟอง` | DIT, Makro (eggs) | Only within same unit |
| Count | `บาท/ขวด` | Makro (water, sauce) | Only within same unit |
| Count | `บาท/ซอง` | Makro (instant noodles) | Only within same unit |
| Count | `บาท/ถุง` | (future) | Only within same unit |
| Weight | `บาท/ถัง 15 กก.` | EPPO (LPG) | Fixed-weight item |

**Unit synonym map (raw → canonical):**
- `ชิ้น` → `แพ็ค` (user's explicit request)
- `ถาด` → `แพ็ค` (tray = pack)
- `แพ็ค` → `แพ็ค` (already canonical)
- `กก.` / `กิโลกรัม` / `kg` → `กก.`
- `ลิตร` / `ล.` / `liter` → `ลิตร`
- `ฟอง` → `ฟอง`
- `ขวด` → `ขวด`
- `ซอง` → `ซอง`
- `ถุง` → `ถุง`
- `ตัว` → `ตัว`
- `ถัง 15 กก.` → `ถัง 15 กก.`

**Invariants that must never break:**
1. If `weight_grams` is known AND unit category is "count" (pack/piece), `normalized_price` MUST be `price / (weight_grams / 1000)` and `normalized_unit` MUST be `บาท/กก.`
2. If `weight_grams` is NULL, `normalized_price` MUST equal `price` and `normalized_unit` MUST be the canonical synonym of `unit`
3. `normalized_price` is never NULL after backfill — it always has a value (equal to `price` at minimum)
4. `normalized_unit` is never NULL after backfill — it always has a canonical unit word

---

### 1. Target Files & Folder Structure

**CREATE:**
- `src/lib/unit-dictionary.ts` — Canonical unit mapping config (~80 lines)
- `src/lib/normalize-ingest.ts` — Ingest normalization function (~60 lines)
- `src/db/backfill-normalized.ts` — One-time backfill script (~80 lines)
- `src/lib/__tests__/unit-dictionary.test.ts` — Dictionary tests (~50 lines)
- `src/lib/__tests__/normalize-ingest.test.ts` — Ingest normalizer tests (~80 lines)

**MODIFY:**
- `src/db/schema.ts` — Add 3 columns to `prices` table (~10 lines added)
- `src/lib/scrapers/types.ts` — Add `productTitle?: string` to `ScrapedPrice` (~3 lines)
- `src/lib/scrapers/lotuss.ts` — Capture weight from body text context (~15 lines changed)
- `src/app/api/cron/scrape/route.ts` — Call normalizer before INSERT (~10 lines changed)
- `src/app/[locale]/product/[slug]/page.tsx` — Add normalized columns to raw SQL + PriceRow mapping (~15 lines changed)
- `src/db/queries.ts` — Use `normalized_price`/`normalized_unit` columns; remove read-time normalization (~40 lines changed)
- `src/components/price-table.tsx` — Use pre-normalized DB values; remove client-side `normalizePriceAndUnit` calls (~20 lines changed)
- `src/lib/__tests__/unit-normalizer.test.ts` — Update tests for new behavior (~20 lines changed)
- `src/lib/scrapers/__tests__/lotuss.test.ts` — Update test expectations for weight capture (~10 lines changed)

### 2. Import Definitions & Dependencies

**No new packages.** All existing:
- `drizzle-orm` — schema definitions, queries
- `vitest` — testing
- `tsx` — running backfill script (`npx tsx src/db/backfill-normalized.ts`)

**Key existing imports to reuse:**
- `extractWeightFromTitle` from `src/lib/unit-normalizer.ts` — weight extraction regex logic (move to `normalize-ingest.ts` or keep and re-export)
- `normalizePriceAndUnit` from `src/lib/unit-normalizer.ts` — existing logic, refactor into ingest normalizer

### 3. Database Schema Changes

**Add to `prices` table in `src/db/schema.ts`:**

```typescript
// Inside the prices pgTable definition, after the existing `unit` column:

/** Per-kg equivalent price when weight is known; otherwise equals `price`. */
normalizedPrice: numeric("normalized_price", { precision: 10, scale: 2 }),
/** Canonical unit word from unit-dictionary (e.g., "บาท/กก.", "บาท/แพ็ค"). */
normalizedUnit: varchar("normalized_unit", { length: 50 }),
/** Extracted weight in grams from product title; NULL when unknown. */
weightGrams: integer("weight_grams"),
```

All three columns are **nullable** (existing rows have NULL until backfilled).

**Apply with:** `npx drizzle-kit push --force` (project convention — no SQL migration files)

### 4. Step-by-Step Edits

#### Step 1: Create `src/lib/unit-dictionary.ts`

```typescript
/**
 * Canonical unit dictionary for price normalization.
 * Maps raw Thai unit words to canonical display forms.
 */

/** Raw unit word → canonical display word */
export const UNIT_SYNONYMS: Record<string, string> = {
  // Pack/piece synonyms → แพ็ค
  "ชิ้น": "แพ็ค",
  "ถาด": "แพ็ค",
  "แพ็ค": "แพ็ค",
  // Weight synonyms → กก.
  "กก.": "กก.",
  "กิโลกรัม": "กก.",
  "kg": "กก.",
  "kg.": "กก.",
  // Volume synonyms → ลิตร
  "ลิตร": "ลิตร",
  "ล.": "ลิตร",
  // Count units (already canonical)
  "ฟอง": "ฟอง",
  "ขวด": "ขวด",
  "ซอง": "ซอง",
  "ถุง": "ถุง",
  "ตัว": "ตัว",
  // Special fixed-weight
  "ถัง 15 กก.": "ถัง 15 กก.",
};

export type UnitCategory = "weight" | "volume" | "count";

/** Canonical unit → measurement category */
export const UNIT_CATEGORY: Record<string, UnitCategory> = {
  "กก.": "weight",
  "ลิตร": "volume",
  "แพ็ค": "count",
  "ถุง": "count",
  "ฟอง": "count",
  "ขวด": "count",
  "ซอง": "count",
  "ตัว": "count",
  "ถัง 15 กก.": "weight",
};

/**
 * Parse the unit word from a full unit string like "บาท/ชิ้น" → "ชิ้น".
 * Returns the raw unit word (before dictionary mapping).
 */
export function parseUnitWord(fullUnit: string): string {
  // Split on "/" and take the part after "บาท"
  const parts = fullUnit.split("/");
  return parts[1]?.trim() || fullUnit;
}

/**
 * Map a raw unit word to its canonical display form.
 * Falls back to the raw word if no synonym found.
 */
export function canonicalizeUnit(rawUnitWord: string): string {
  return UNIT_SYNONYMS[rawUnitWord] ?? rawUnitWord;
}

/**
 * Build the full display unit string: "บาท/<canonical>"
 */
export function buildDisplayUnit(rawFullUnit: string): string {
  const word = parseUnitWord(rawFullUnit);
  const canonical = canonicalizeUnit(word);
  return `บาท/${canonical}`;
}
```

#### Step 2: Create `src/lib/normalize-ingest.ts`

```typescript
import { buildDisplayUnit, UNIT_CATEGORY, parseUnitWord } from "./unit-dictionary";

/**
 * Weight extraction regex patterns.
 * Moved from unit-normalizer.ts to consolidate ingest logic.
 * Matches: "150 กรัม", "1.5 กก.", "500 g", "1000 มล.", "1 ลิตร"
 */
const WEIGHT_PATTERNS = [
  { regex: /(\d+(?:\.\d+)?)\s*(?:กก\.?|กิโลกรัม|kg\.?)/i, multiplier: 1000 },
  { regex: /(\d+(?:\.\d+)?)\s*(?:กรัม|g\.|ก\.(?![ก/]))/i, multiplier: 1 },
  { regex: /(\d+(?:\.\d+)?)\s*(?:มล\.|ml\.?)/i, multiplier: 1 },
  { regex: /(\d+(?:\.\d+)?)\s*(?:ลิตร|[ลl]\.?(?!\d))/i, multiplier: 1000 },
];

export interface NormalizedPriceResult {
  normalizedPrice: number;
  normalizedUnit: string;
  weightGrams: number | null;
}

/**
 * Extract weight in grams from a product title or context string.
 * Returns null when no weight pattern is found.
 */
export function extractWeightGrams(text: string): number | null {
  for (const { regex, multiplier } of WEIGHT_PATTERNS) {
    const match = text.match(regex);
    if (match) {
      return Math.round(parseFloat(match[1]) * multiplier);
    }
  }
  return null;
}

/**
 * Normalize a scraped price at ingest time.
 * 
 * Logic:
 * 1. Build canonical display unit from raw unit (e.g., "บาท/ชิ้น" → "บาท/แพ็ค")
 * 2. If weight is extractable from product name/context AND unit is count-type,
 *    convert to per-kg: normalizedPrice = rawPrice / (weightGrams / 1000)
 * 3. If weight is not available, keep raw price with canonical unit word
 * 
 * @param rawPrice - The scraped price (e.g., 49.00)
 * @param rawUnit - The scraped unit (e.g., "บาท/ชิ้น")
 * @param productNameOrContext - Product name or body text containing weight info
 * @returns NormalizedPriceResult with normalizedPrice, normalizedUnit, weightGrams
 */
export function normalizeAtIngest(
  rawPrice: number,
  rawUnit: string,
  productNameOrContext: string,
): NormalizedPriceResult {
  const canonicalUnit = buildDisplayUnit(rawUnit);
  const unitWord = parseUnitWord(rawUnit);
  const category = UNIT_CATEGORY[parseUnitWord(canonicalUnit)];
  const weightGrams = extractWeightGrams(productNameOrContext);

  // If we have weight AND the unit is count-type (pack/piece), convert to per-kg
  if (weightGrams && weightGrams > 0 && category === "count") {
    const normalizedPrice = Math.round((rawPrice / (weightGrams / 1000)) * 100) / 100;
    return {
      normalizedPrice,
      normalizedUnit: "บาท/กก.",
      weightGrams,
    };
  }

  // Otherwise: keep raw price, just standardize the unit word
  return {
    normalizedPrice: rawPrice,
    normalizedUnit: canonicalUnit,
    weightGrams,
  };
}
```

#### Step 3: Add columns to `src/db/schema.ts`

Add three nullable columns to the `prices` table definition (after `unit` column, before `scrapedAt`):

```typescript
normalizedPrice: numeric("normalized_price", { precision: 10, scale: 2 }),
normalizedUnit: varchar("normalized_unit", { length: 50 }),
weightGrams: integer("weight_grams"),
```

#### Step 4: Extend `ScrapedPrice` in `src/lib/scrapers/types.ts`

Add optional `productTitle` field for weight extraction context:

```typescript
export interface ScrapedPrice {
  sourceProductName: string;
  price: number;
  unit: string;
  provinceCode: string | null;
  sourceDate: Date;
  /** Raw product title or context text — used for weight extraction at ingest */
  productTitle?: string;
}
```

#### Step 5: Update Lotus's scraper to capture weight context

In `src/lib/scrapers/lotuss.ts`, modify the price-capture loop to include the preceding text (which may contain weight info like "150 กรัม"):

In the `scrape()` method, where `allPrices.push()` is called (~line 148), add the `precedingText` as `productTitle`:

```typescript
// Capture the context text around the cheapest price for weight extraction
const cheapestIdx = candidates.indexOf(cheapest);
// Re-scan to find the preceding text for the cheapest candidate
// (The last match's precedingText is good enough for weight extraction)
allPrices.push({
  sourceProductName: trackedName,
  price: cheapest,
  unit: "บาท/ชิ้น",
  provinceCode: null,
  sourceDate: today,
  productTitle: precedingText, // The 200-char context before the price
});
```

**Important**: The `precedingText` variable is already computed in the loop (line 136). The Lotus's scraper needs to track the preceding text for the cheapest price. Since candidates are built in the while loop, and the cheapest is selected after, we need to store the preceding text alongside each candidate. Change the candidates array to store objects `{ price, precedingText }` instead of just numbers.

#### Step 6: Update cron route for ingest normalization

In `src/app/api/cron/scrape/route.ts`, add normalization before INSERT (~line 68):

```typescript
import { normalizeAtIngest } from "@/lib/normalize-ingest";

// Inside the loop, before db.insert(prices):
const normalized = normalizeAtIngest(
  sp.price,
  sp.unit,
  sp.productTitle ?? sp.sourceProductName,
);

await db
  .insert(prices)
  .values({
    productId: mapping.productId,
    sourceId: source.id,
    provinceId,
    price: sp.price.toString(),
    unit: sp.unit,
    normalizedPrice: normalized.normalizedPrice.toString(),
    normalizedUnit: normalized.normalizedUnit,
    weightGrams: normalized.weightGrams,
    scrapedAt: new Date(),
    sourceDate: toDateOnly(sp.sourceDate),
  })
  .onConflictDoNothing();
```

#### Step 7: Create backfill script `src/db/backfill-normalized.ts`

```typescript
/**
 * One-time backfill: normalize all existing price rows.
 * Reads each row, computes normalized values, updates in place.
 * 
 * Usage: npx tsx src/db/backfill-normalized.ts
 */
import { getDb } from "@/db";
import { prices, products, productSourceMappings, sources } from "@/db/schema";
import { eq, isNull } from "drizzle-orm";
import { normalizeAtIngest } from "@/lib/normalize-ingest";

async function main() {
  const db = getDb();
  if (!db) {
    console.error("Database not available.");
    process.exit(1);
  }

  // Fetch all rows where normalized_unit is NULL
  const rows = await db
    .select({
      id: prices.id,
      price: prices.price,
      unit: prices.unit,
      productId: prices.productId,
    })
    .from(prices)
    .where(isNull(prices.normalizedUnit));

  console.log(`Found ${rows.length} rows to backfill`);

  // Build a product-name lookup for weight extraction
  const productRows = await db
    .select({ id: products.id, nameTh: products.nameTh })
    .from(products);
  const productNameMap = new Map(productRows.map((p) => [p.id, p.nameTh]));

  let updated = 0;
  for (const row of rows) {
    const productName = productNameMap.get(row.productId) ?? "";
    const normalized = normalizeAtIngest(Number(row.price), row.unit, productName);
    
    await db
      .update(prices)
      .set({
        normalizedPrice: normalized.normalizedPrice.toString(),
        normalizedUnit: normalized.normalizedUnit,
        weightGrams: normalized.weightGrams,
      })
      .where(eq(prices.id, row.id));
    
    updated++;
    if (updated % 50 === 0) {
      console.log(`  Backfilled ${updated}/${rows.length}`);
    }
  }

  console.log(`Done. Backfilled ${updated} rows.`);
}

main().catch(console.error);
```

#### Step 8: Update `src/db/queries.ts`

**`getProductsWithCheapestPrice()`**: Replace read-time normalization with DB columns.

Change the raw SQL to select `normalized_price` and `normalized_unit`:
```sql
SELECT DISTINCT ON (prices.source_id)
  prices.price,
  prices.unit,
  prices.normalized_price,
  prices.normalized_unit,
  prices.weight_grams,
  prices.source_id as "sourceId",
  sources.name_th as "sourceNameTh",
  sources.name_en as "sourceNameEn"
FROM prices
...
```

Replace the `normalizePriceAndUnit()` call loop with:
```typescript
for (const r of priceRows) {
  const normPrice = r.normalizedPrice ? Number(r.normalizedPrice) : Number(r.price);
  const normUnit = r.normalizedUnit ?? r.unit;
  
  if (cheapestPrice === null || normPrice < cheapestPrice) {
    cheapestPrice = normPrice;
    cheapestUnit = normUnit;
    // ...source fields...
  }
  if (maxPrice === null || normPrice > maxPrice) {
    maxPrice = normPrice;
    maxUnit = normUnit;
  }
}
```

Remove the import of `normalizePriceAndUnit` from this file.

**`getRecentPriceChanges()`**: Add normalization. Currently this query uses raw `prices.price` and `prices.unit` without normalization. Change to use `normalized_price` / `normalized_unit`:

```typescript
// In the select, add:
normalizedPrice: prices.normalizedPrice,
normalizedUnit: prices.normalizedUnit,

// In the byProduct map, use normalized values:
const num = r.normalizedPrice ? Number(r.normalizedPrice) : Number(r.price);
const unit = r.normalizedUnit ?? r.unit;
```

#### Step 9: Update `src/components/price-table.tsx`

Remove client-side normalization. The `PriceRow` interface already has `price` and `unit`. Add `normalizedPrice` and `normalizedUnit` fields:

```typescript
export interface PriceRow {
  productName: string;
  sourceSlug: string;
  sourceNameTh: string;
  sourceNameEn: string;
  sourceType: string;
  price: string;
  unit: string;
  normalizedPrice: string | null;  // NEW
  normalizedUnit: string | null;   // NEW
  weightGrams: number | null;      // NEW
  sourceDate: string;
  isNational: boolean;
}
```

In the component body, replace the `normalizePriceAndUnit` call with:
```typescript
const normalizedRows = rows.map((r) => ({
  ...r,
  displayPrice: r.normalizedPrice ? parseFloat(r.normalizedPrice) : parseFloat(r.price),
  displayUnit: r.normalizedUnit ?? r.unit,
  originalPrice: parseFloat(r.price),
  originalUnit: r.unit,
  weightText: r.weightGrams ? `${r.weightGrams} กรัม` : null,
}));
```

Remove the `import { normalizePriceAndUnit }` from this file.

**Note**: The caller of `PriceTable` (likely a page component) must also pass the new fields. Check `src/app/[locale]/...` for where `PriceRow[]` is constructed and add the new fields from the query result.

#### Step 9b: Update `src/app/[locale]/product/[slug]/page.tsx`

This page constructs `PriceRow[]` from a raw SQL query (lines 52-90). It currently does NOT select `normalized_price`, `normalized_unit`, or `weight_grams`.

**Edit 1** — Add columns to the SQL SELECT (~line 52):
```sql
SELECT DISTINCT ON (prices.source_id)
  sources.slug as "sourceSlug",
  sources.name_th as "sourceNameTh",
  sources.name_en as "sourceNameEn",
  sources.type as "sourceType",
  prices.price,
  prices.unit,
  prices.normalized_price as "normalizedPrice",
  prices.normalized_unit as "normalizedUnit",
  prices.weight_grams as "weightGrams",
  prices.source_date as "sourceDate",
  prices.province_id as "provinceId"
FROM prices
...
```

**Edit 2** — Add fields to the type cast (~line 69):
```typescript
const rawPrices = (...) as Array<{
  sourceSlug: string;
  sourceNameTh: string;
  sourceNameEn: string | null;
  sourceType: string;
  price: string;
  unit: string;
  normalizedPrice: string | null;
  normalizedUnit: string | null;
  weightGrams: number | null;
  sourceDate: string;
  provinceId: number | null;
}>;
```

**Edit 3** — Map into PriceRow (~line 80):
```typescript
priceRows = rawPrices.map((r) => ({
  productName: productRow.nameTh,
  sourceSlug: r.sourceSlug,
  sourceNameTh: r.sourceNameTh,
  sourceNameEn: r.sourceNameEn ?? "",
  sourceType: r.sourceType,
  price: r.price,
  unit: r.unit,
  normalizedPrice: r.normalizedPrice,
  normalizedUnit: r.normalizedUnit,
  weightGrams: r.weightGrams,
  sourceDate: r.sourceDate,
  isNational: r.provinceId === null,
}));
```

#### Step 10: Update `src/lib/scrapers/__tests__/lotuss.test.ts`

Update the test expectation for Lotus's unit to `"บาท/ชิ้น"` (this stays as raw unit — normalization happens at ingest, not in the scraper). But verify `productTitle` is now set on the output. Add a test case for weight extraction from context.

### 5. Component States

- **Loading**: No change (existing loading states)
- **Error**: No change
- **Empty DB**: `normalized_price` / `normalized_unit` columns are NULL → UI falls back to raw `price` / `unit`. No crash.
- **Success-edge**: All sources have same unit → no unit-warning badge shown. Sources with different unit categories → badge shown (correct behavior).

### 6. Edge Cases

| Edge Case | Expected Behavior |
|-----------|-------------------|
| `normalized_price` is NULL (un-backfilled row) | UI falls back to raw `price` |
| `normalized_unit` is NULL | UI falls back to raw `unit` |
| Weight extracted but 0 or negative | Treated as no weight — keep raw price |
| Unit not in dictionary | Falls through as-is (canonicalizeUnit returns raw word) |
| Product name has multiple weights (e.g., "55-85 ก./ชิ้น") | First match wins (existing behavior) |
| Price is 0 | normalizedPrice = 0, no division error (0/weight = 0) |
| 10k+ price rows | Backfill processes in batches, no timeout. Each UPDATE is individual (~2s for 10k rows on Neon) |

### 7. API Contracts

No new API endpoints. The cron scrape endpoint (`POST /api/cron/scrape`) now stores additional columns but the response shape is unchanged.

### 8. Vertical Slice Order

**Slice 1** (foundation): Unit dictionary + ingest normalizer + tests
**Slice 2** (schema): Add columns to `prices` table + push to DB
**Slice 3** (ingest): Update cron route + Lotus's scraper
**Slice 4** (backfill): Create and run backfill script
**Slice 5** (display): Update queries.ts + price-table.tsx + page components
**Slice 6** (cleanup): Remove deprecated read-time normalization from unit-normalizer.ts (keep weight extraction functions for backward compat)

Each slice produces a testable checkpoint:
- Slice 1: `npx vitest run src/lib/__tests__/unit-dictionary.test.ts src/lib/__tests__/normalize-ingest.test.ts`
- Slice 2: `npx drizzle-kit push --force` succeeds
- Slice 3: Scraper tests pass
- Slice 4: `npx tsx src/db/backfill-normalized.ts` reports success
- Slice 5: `npm run build` passes, UI shows consistent units
- Slice 6: All tests pass, no dead code

### 9. Test Matrix

| Test | Layer | File | Cases |
|------|-------|------|-------|
| Unit dictionary mapping | Unit | `src/lib/__tests__/unit-dictionary.test.ts` | Synonym lookup, unknown unit passthrough, parseUnitWord, buildDisplayUnit |
| Ingest normalizer | Unit | `src/lib/__tests__/normalize-ingest.test.ts` | Pack→per-kg conversion, no-weight passthrough, already-per-kg, egg/bottle units, weight extraction patterns |
| Existing normalizer | Unit | `src/lib/__tests__/unit-normalizer.test.ts` | Update: verify backward compat of extractWeightFromTitle |
| Lotus's scraper | Unit | `src/lib/scrapers/__tests__/lotuss.test.ts` | Verify productTitle is captured; weight in context |
| Schema | Integration | Manual | `drizzle-kit push` succeeds, columns exist |
| Backfill | Integration | Manual | Script runs, rows updated, no NULLs remain |
| Build | E2E | CI | `npm run build` passes |

### 10. Executable Test Contracts

**`src/lib/__tests__/unit-dictionary.test.ts`** — Engineer creates:
```typescript
describe("unit-dictionary", () => {
  it("maps ชิ้น to แพ็ค");
  it("maps ถาด to แพ็ค");
  it("maps กิโลกรัม to กก.");
  it("passes through unknown units unchanged");
  it("parses unit word from full unit string");
  it("builds display unit with บาท/ prefix");
});
```

**`src/lib/__tests__/normalize-ingest.test.ts`** — Engineer creates:
```typescript
describe("normalizeAtIngest", () => {
  it("converts pack price to per-kg when weight is known");
  it("keeps pack price when weight is unknown");
  it("standardizes ชิ้น to แพ็ค in normalized unit");
  it("keeps per-kg price unchanged");
  it("keeps egg price (บาท/ฟอง) unchanged");
  it("extracts weight in grams from Thai title");
  it("extracts weight in grams from English title");
  it("returns null weight when no pattern matches");
});
```

### 11. Verification Exit Criteria

- [ ] `npx vitest run` — ALL tests pass (existing + new)
- [ ] `npm run build` — Next.js build succeeds with no type errors
- [ ] `npm run lint` — ESLint passes with no errors
- [ ] `npx drizzle-kit push --force` — Schema applied successfully (3 new columns on `prices` table)
- [ ] `npx tsx src/db/backfill-normalized.ts` — Backfill script runs and reports "Backfilled N rows"
- [ ] Unit dictionary maps `ชิ้น` → `แพ็ค` — verify via test
- [ ] Ingest normalizer converts pack+weight to per-kg — verify via test
- [ ] `price-table.tsx` no longer imports `normalizePriceAndUnit` — verify via grep
- [ ] `queries.ts` no longer imports `normalizePriceAndUnit` — verify via grep
- [ ] No `normalized_price` or `normalized_unit` is NULL after backfill — verify via SQL count query (optional, requires DB access)

### 12. Security Verification

- No new user inputs or endpoints — security surface unchanged
- Backfill script uses existing DB connection (no new credentials)
- Cron route authorization unchanged (Bearer token)
- No SQL injection risk — all queries use Drizzle ORM parameterized queries

### 13. Open Questions / Edge Cases

1. **Lotus's weight capture limitation**: The current Lotus's scraper uses body-text scanning, not individual product-card parsing. Weight extraction from the 200-char context window is a best-effort heuristic — it may capture weight from a nearby but different product variant. This is acceptable for now; false positives will be caught by implausible per-kg prices (e.g., >1000 ฿/kg for vegetables).

2. **Page component updates**: The `PriceTable` component is used in product detail pages. The engineer must trace ALL callers of `PriceTable` and update the `PriceRow[]` construction to include `normalizedPrice`, `normalizedUnit`, and `weightGrams` from the query results. Use `grep` to find all `<PriceTable` usages.

3. **`unit-normalizer.ts` deprecation**: The `normalizePriceAndUnit` function becomes dead code after this change. The engineer should check all imports and remove dead code, but keep `extractWeightFromTitle` if still referenced elsewhere (or mark as deprecated).
