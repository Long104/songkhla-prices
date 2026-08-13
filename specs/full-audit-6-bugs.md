# Full Audit Fix — 6 Bugs

## Section 1 — Product

### Goal
Fix all 6 bugs found in the full audit so the website correctly displays prices from ALL sources (including Makro and Si Mum Muang), shows ALL 24 product categories (those with products), renders category pages without 404, and shows correct source names in the footer.

### Out of Scope
- Changing DIT, EPPO, Makro, SiMumMuang scraper code
- Redesigning the UI or changing the design system
- Adding new products or categories beyond what's in the DB
- Deploying or merging to main

### Acceptance Criteria
1. Product detail page shows prices for products that HAVE prices in DB (no more "ยังไม่มีข้อมูลราคา" when prices exist)
2. Makro and Si Mum Muang prices appear on product and category pages
3. Lotus's scrape runs and inserts prices for as many of the 39 zero-price products as possible
4. Home page shows all 24 categories that have products (not just 16)
5. /th/category/household (and all other category slugs) renders without 404
6. Footer shows: กรมการค้าภายใน · แม็คโคร · โลตัส · ตลาดสี่มุมเมือง · สำนักงานนโยบายและแผนพลังงาน
7. `pnpm build` passes with zero errors

---

## Section 2 — Engineering Handoff

### Bug 1: Product detail page query fails silently (CRITICAL)

**Root cause**: `src/app/[locale]/product/[slug]/page.tsx` line 66 uses nested Drizzle SQL template interpolation:
```typescript
AND ${provincePriceFilter(provinceId) ?? sql`TRUE`}
```
`provincePriceFilter()` returns a Drizzle `SQL` object. Embedding a `SQL` object inside another `sql` tagged template via `${}` can fail silently in certain Drizzle versions / node-postgres driver combos. The catch block on line 93 swallows the error, returning `priceRows = []`.

**Fix**: Rewrite lines 53-78 of `src/app/[locale]/product/[slug]/page.tsx`. Replace the `provincePriceFilter()` call with inline parameterized SQL. Also remove the `price_type` filter (Bug 2).

New query body:
```typescript
const rawPrices = (await db.execute(sql`
  SELECT DISTINCT ON (prices.source_id)
    sources.slug as "sourceSlug",
    sources.name_th as "sourceNameTh",
    sources.name_en as "sourceNameEn",
    sources.type as "sourceType",
    prices.price,
    prices.unit,
    prices.source_date as "sourceDate",
    prices.province_id as "provinceId"
  FROM prices
  INNER JOIN sources ON prices.source_id = sources.id
  WHERE prices.product_id = ${productRow.id}
    AND (prices.province_id = ${provinceId} OR prices.province_id IS NULL)
  ORDER BY prices.source_id, prices.source_date DESC, prices.scraped_at DESC
`)) as unknown as Array<{ ... }>;
```

Key changes:
- Replace `${provincePriceFilter(provinceId) ?? sql\`TRUE\`}` with `(prices.province_id = ${provinceId} OR prices.province_id IS NULL)`
- When `provinceId` is `null`, the expression `(prices.province_id = NULL OR prices.province_id IS NULL)` simplifies to `prices.province_id IS NULL` (correct — national-only)
- **Remove** `AND sources.price_type = ${priceType}` entirely
- Remove the `priceType` variable usage (can keep the cookie read but don't use it in the query)
- Remove the unused `provincePriceFilter` import from this file (keep `getProvinceIdByCode`)

### Bug 2: price_type filter hides wholesale sources

**Root cause**: Multiple files filter by `sources.price_type` (default "retail"), hiding Makro (wholesale) and Si Mum Muang (wholesale).

**Fix — `src/db/queries.ts`**:

1. `getProductsWithCheapestPrice` (line 60-137):
   - Remove `priceType: string = "retail"` parameter (or keep but ignore)
   - Remove `AND ${priceTypeFilter(priceType)}` from the SQL on line 80
   - Update the function signature and all callers

2. `getRecentPriceChanges` (line 174-226):
   - Remove `priceType: string = "retail"` parameter (or keep but ignore)
   - Remove `.where(priceTypeFilter(priceType))` from the latest-date query (line 185)
   - Remove `priceTypeFilter(priceType)` from the `.where(and(...))` on line 202

3. `priceTypeFilter` function (line 36-38): Leave it defined but unused, or remove it. Removing is cleaner — delete lines 36-38.

**Fix — `src/app/[locale]/product/[slug]/page.tsx`**: Already handled in Bug 1 (removing `AND sources.price_type = ${priceType}`).

**Fix — `src/app/[locale]/category/[slug]/page.tsx`** line 58:
```typescript
// Before:
productList = await getProductsWithCheapestPrice(db, result, provinceId, priceType);
// After:
productList = await getProductsWithCheapestPrice(db, result, provinceId);
```
Also remove the `priceType` cookie read on line 37 (or keep but unused — cleaner to remove).

**Fix — `src/app/[locale]/page.tsx`** line 56:
```typescript
// Before:
getRecentPriceChanges(db, provinceId, 8, priceType),
// After:
getRecentPriceChanges(db, provinceId, 8),
```
Also remove the `priceType` cookie read on line 45 (or keep but unused).

**PriceTypeToggle**: Keep the component in the UI (it's cosmetic — sets a cookie that's no longer used for filtering). Do NOT remove it from the layout. It's a visual element that doesn't affect queries anymore.

### Bug 3: 39 products with 0 prices — extend Lotus's scraper

**Root cause**: The Lotus's scraper (`src/lib/scrapers/lotuss.ts`) only tracks 31 products in `LOTUS_TRACKED_PRODUCTS`. Many of the 39 zero-price products have no Lotus's tracking entry and no `product_source_mappings` row for Lotus's.

**Fix — `src/lib/scrapers/lotuss.ts`**: Add ALL missing products to `LOTUS_TRACKED_PRODUCTS`. The key is the Thai name (must match `product_source_mappings.sourceProductName`), the value is the lotuss.com search term.

Products to add (39 zero-price products, minus the 7 that already have Lotus's tracking):
```
// Already tracked but still 0 prices (keep, will re-scrape):
// "หมูคอสไลซ์", "ปีกไก่", "เนื้อวัวสไลซ์", "ผงซักฟอก", "น้ำยาล้างจาน", "แชมพู", "ยาสีฟัน"

// NEW entries to add:
// Baby
"ผ้าอ้อมเด็ก": "ผ้าอ้อม",
"นมผง": "นมผงเด็ก",
"สบู่เด็ก": "สบู่เด็ก",
// Bakery
"ขนมปัง": "ขนมปัง",
// Beverages
"น้ำผลไม้": "น้ำผลไม้",
"น้ำอัดลม": "น้ำอัดลม",
// Canned Goods
"ผลไม้กระป๋อง": "ผลไม้กระป๋อง",
"ปลากระป๋อง": "ปลากระป๋อง",
"ผักกาดดอง": "ผักกาดดอง",
// Coffee & Tea
"กาแฟ 3in1": "กาแฟ 3in1",
"กาแฟคั่วบด": "กาแฟคั่วบด",
"ชาเขียว": "ชาเขียว",
// Frozen
"อาหารพร้อมทานแช่แข็ง": "อาหารสำเร็จรูปแช่แข็ง",
"ไส้กรอก": "ไส้กรอก",
"นักเก็ตไก่": "นักเก็ตไก่",
// Household
"น้ำยาล้างห้องน้ำ": "น้ำยาทำความสะอาดห้องน้ำ",
"น้ำยาถูพื้น": "น้ำยาถูพื้น",
"ทิชชู่": "ทิชชู่",
// Noodles
"เส้นหมี่": "เส้นหมี่",
"วุ้นเส้น": "วุ้นเส้น",
// Personal Care
"ครีมอาบน้ำ": "ครีมอาบน้ำ",
"ผ้าอนามัย": "ผ้าอนามัย",
"สบู่ก้อน": "สบู่ก้อน",
// Pet
"ทรายแมว": "ทรายแมว",
"อาหารสุนัข": "อาหารสุนัข",
"อาหารแมว": "อาหารแมว",
// Seasoning (missing)
"กะทิ": "กะทิ",
"เกลือ": "เกลือ",
"นมข้นหวาน": "นมข้นหวาน",
// Snacks
"มันฝรั่งทอด": "มันฝรั่งทอด",
"บิสกิต": "บิสกิต",
"คุกกี้": "คุกกี้",
```

**Fix — `src/db/seed.ts`**: Add `lotussMappings` entries for ALL new products listed above. Format:
```typescript
{ sourceSlug: "lotuss", productSlug: "baby-diaper", sourceProductName: "ผ้าอ้อมเด็ก" },
{ sourceSlug: "lotuss", productSlug: "baby-formula", sourceProductName: "นมผง" },
// ... etc for all new products
```

**Run sequence** (Engineer must execute):
1. `pnpm seed` — re-seeds product_source_mappings with new Lotus's entries
2. Run the Lotus's scrape and insert results. Create a one-off script `src/db/scrape-lotuss-missing.ts` that:
   - Imports `lotussScraper` from `@/lib/scrapers/lotuss`
   - Calls `lotussScraper.scrape()`
   - For each result, looks up the `product_source_mappings` to get `productId`
   - Inserts into `prices` with `onConflictDoNothing()`
   - Prints a summary: "Inserted X prices, Y products still without prices"
   - Run with: `npx tsx src/db/scrape-lotuss-missing.ts`

**IMPORTANT — increase MAX_PRICE**: The current `MAX_PRICE = 500` in lotuss.ts will filter out legitimate products like ผงซักฟอก (detergent ~700+ for bulk), ผ้าอ้อม (diapers ~600+), etc. Change `MAX_PRICE` from 500 to 2000 to accommodate household/baby/pet products.

**Edge case**: Not all 39 products will be found on lotuss.com. The scraper may return 0 results for niche items (ทรายแมว, ผ้าอ้อมเด็ก). This is expected — report how many succeeded.

### Bug 4: Home page missing 8 categories

**Root cause**: `src/app/[locale]/page.tsx` lines 16-33 has a hardcoded `CATEGORIES` array with only 16 entries. Missing: household, personal-care, baby, pet, frozen, snacks, coffee-tea, canned-goods.

**Fix**: Add the 8 missing categories to the `CATEGORIES` array:
```typescript
{ slug: "household", icon: "🧹" },
{ slug: "personal-care", icon: "🧴" },
{ slug: "baby", icon: "🍼" },
{ slug: "pet", icon: "🐱" },
{ slug: "frozen", icon: "🧊" },
{ slug: "snacks", icon: "🍿" },
{ slug: "coffee-tea", icon: "☕" },
{ slug: "canned-goods", icon: "🥫" },
```

Place them after "bakery" in the array. The icons match the DB `categories.icon` values.

Note: Do NOT add "meat" or "seafood" — those categories have 0 products in the DB and are parent categories not meant for direct browsing.

### Bug 5: Category page 404s for new categories

**Root cause**: `src/app/[locale]/category/[slug]/page.tsx` lines 15-20 has a hardcoded `VALID_SLUGS` array with only 16 entries. Line 32 calls `notFound()` for any slug not in the list. Also `generateStaticParams()` only pre-renders those 16.

**Fix**: Add the 8 missing slugs to `VALID_SLUGS`:
```typescript
const VALID_SLUGS = [
  "pork", "chicken", "beef",
  "vegetables", "rice", "eggs", "oil", "seasoning", "fuel", "fruit",
  "fish", "shrimp", "shellfish-crab",
  "beverages", "noodles", "bakery",
  "household", "personal-care", "baby", "pet",
  "frozen", "snacks", "coffee-tea", "canned-goods",
];
```

### Bug 6: Footer shows wrong source names

**Root cause**: `src/components/footer.tsx` line 7 hardcodes:
```typescript
const sources = ["DIT", "OAE", "Talad Thai", "Si Mum Muang", "EPPO"];
```
These are outdated English abbreviations. Should show current Thai source names from DB.

**Fix**: Make the Footer a server component that fetches source names from DB. The Footer is currently a client component (it uses `useTranslations` from next-intl, which works in both server and client components within NextIntlClientProvider).

Change footer.tsx to:
```typescript
import { useTranslations } from "next-intl";
import { ShoppingBasket } from "lucide-react";
import { getDb } from "@/db";
import { sources } from "@/db/schema";

export async function Footer() {
  const t = useTranslations("footer");
  const tc = useTranslations("common");

  let sourceNames: string[] = [];
  try {
    const db = getDb();
    if (db) {
      const rows = await db.select({ nameTh: sources.nameTh }).from(sources).orderBy(sources.id);
      sourceNames = rows.map((r) => r.nameTh);
    }
  } catch {
    // DB not available
  }

  if (sourceNames.length === 0) {
    sourceNames = ["กรมการค้าภายใน", "แม็คโคร", "โลตัส", "ตลาดสี่มุมเมือง", "สำนักงานนโยบายและแผนพลังงาน"];
  }

  return (
    <footer className="mt-auto border-t border-zinc-100 bg-green-50/40 py-8">
      <div className="mx-auto max-w-5xl px-4">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-green-600 text-white">
            <ShoppingBasket className="h-3.5 w-3.5" />
          </span>
          <span className="text-sm font-bold text-zinc-800">{tc("appName")}</span>
        </div>
        <p className="mt-2 text-sm text-zinc-500">{t("tagline")}</p>
        <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
          {t("dataSources")}
        </p>
        <p className="mt-1 text-sm text-zinc-600">{sourceNames.join(" · ")}</p>
        <p className="mt-2 text-xs text-zinc-400">{t("disclaimer")}</p>
      </div>
    </footer>
  );
}
```

**IMPORTANT**: `useTranslations` works in async server components in next-intl v4. The layout already wraps everything in `NextIntlClientProvider`. The Footer is rendered inside the layout's server tree, so making it `async` is fine.

However, if `useTranslations` doesn't work in an async component (next-intl limitation), fall back to: keep the Footer as a client component but hardcode the correct Thai names:
```typescript
const sourceNames = ["กรมการค้าภายใน", "แม็คโคร", "โลตัส", "ตลาดสี่มุมเมือง", "สำนักงานนโยบายและแผนพลังงาน"];
```
This is the safe fallback. Prefer the dynamic DB fetch, but don't break the build.

---

### Target Files (all paths relative to project root)

| File | Bug(s) | Changes |
|------|--------|---------|
| `src/app/[locale]/product/[slug]/page.tsx` | 1, 2 | Rewrite SQL query, remove price_type filter |
| `src/db/queries.ts` | 2 | Remove priceTypeFilter from getProductsWithCheapestPrice and getRecentPriceChanges |
| `src/app/[locale]/category/[slug]/page.tsx` | 2, 5 | Remove priceType param, add 8 slugs to VALID_SLUGS |
| `src/app/[locale]/page.tsx` | 2, 4 | Remove priceType param, add 8 categories to CATEGORIES |
| `src/components/footer.tsx` | 6 | Dynamic source names from DB or correct hardcoded Thai names |
| `src/lib/scrapers/lotuss.ts` | 3 | Add missing products, increase MAX_PRICE to 2000 |
| `src/db/seed.ts` | 3 | Add lotussMappings for all missing products |
| `src/db/scrape-lotuss-missing.ts` | 3 | NEW — one-off script to run Lotus's scrape and insert |

### Domain Model Invariants
- `prices.product_id` + `prices.source_id` + `prices.province_id` + `prices.source_date` is UNIQUE
- `sources.price_type` ("retail"|"wholesale") is metadata only — must NOT filter query results
- All prices should be visible regardless of retail/wholesale classification
- Category slugs must match between DB `categories.slug`, home page `CATEGORIES`, and category page `VALID_SLUGS`

### Edge Cases
1. **Lotus's scrape may not find all 39 products** — lotuss.com search results are dynamic. Some niche products (ทรายแมว, ผ้าอ้อม) may not appear. Report success count.
2. **provinceId is null** — the inline SQL `(prices.province_id = NULL OR prices.province_id IS NULL)` correctly evaluates to `prices.province_id IS NULL` in Postgres (NULL = NULL is false, so only the IS NULL branch matches).
3. **Footer async component** — if next-intl's `useTranslations` doesn't work in async server components, fall back to hardcoded Thai names.

### Verification Exit Criteria

- [ ] `pnpm build` passes with zero TypeScript or ESLint errors
- [ ] `pnpm lint` passes with zero errors
- [ ] Product detail page for `pork-belly` (`/th/product/pork-belly`) shows prices from MULTIPLE sources including Makro (wholesale) — verify by loading the page in browser
- [ ] Category page `/th/category/household` returns 200 (not 404) and renders product cards
- [ ] Home page `/th` shows 24 category cards (not 16)
- [ ] Footer shows Thai source names: กรมการค้าภายใน · แม็คโคร · โลตัส · ตลาดสี่มุมเมือง · สำนักงานนโยบายและแผนพลังงาน
- [ ] After running `npx tsx src/db/scrape-lotuss-missing.ts`, the count of products with 0 prices decreases (run: `psql "$DATABASE_URL" -c "SELECT count(*) FROM products WHERE id NOT IN (SELECT DISTINCT product_id FROM prices)"`)
- [ ] Category page for `household` shows products even if some have no prices (renders "ยังไม่มีข้อมูลราคา" text, not 404)

### Build & Test Commands
- Build: `pnpm build`
- Lint: `pnpm lint`
- Seed: `pnpm seed`
- Run Lotus's scrape: `npx tsx src/db/scrape-lotuss-missing.ts`
- Dev server: `pnpm dev` (already running at localhost:3000)

### Vertical Slice Order
1. **Slice 1** (Bugs 1+2): Fix queries.ts + product page → verify product page shows prices
2. **Slice 2** (Bug 2 cont.): Fix category page + home page priceType → verify all sources show
3. **Slice 3** (Bugs 4+5): Add missing categories to home + category page → verify pages render
4. **Slice 4** (Bug 6): Fix footer → verify correct names
5. **Slice 5** (Bug 3): Extend Lotus's scraper + seed + run scrape → verify price count increases
6. **Final**: `pnpm build` + `pnpm lint` → verify clean build
