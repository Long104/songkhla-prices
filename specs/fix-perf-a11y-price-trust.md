# Fix: Performance, Accessibility, Price-Trust UI

**Branch:** `fix/perf-a11y-price-trust` (from `main`)
**Source:** User complaint — slow page loads, a11y friction, prices "don't match" Makro/Lotus/checkraka.app
**Investigation:** Verified with file:line evidence (see .worklog.md). Do NOT re-investigate.

---

## Section 1 — Product

### Goal & Scope
1. **PERF** — Kill the N+1 query cascade making category/search/product pages slow; add data-layer caching; make search use a trgm index instead of a full-table scan.
2. **A11Y** — Correct `lang` attribute, fix low-contrast text, solid focus ring, aria-labels on card links.
3. **PRICE TRUST** — checkraka.app-style transparency: show *when* each price was updated and % change vs previous price, so users understand WHY our numbers differ from Makro/Lotus (different sources, different dates — the numbers themselves are correct).

### Out of scope (explicitly NOT building)
- NOT changing scrapers, price sources, or price values (gaps vs checkraka are legitimate source differences — retail vs wholesale; labeling solves trust).
- NOT adding revalidateTag/cache-invalidation hooks into the scrape pipeline (open question, below).
- NOT redesigning UI beyond listed contrast/label/badge tweaks.
- NOT new dependencies (no new npm packages).

### User stories / acceptance criteria
- As a shopper, category/search pages load noticeably faster (no per-product DB round-trips).
- As a screen-reader user on `/th`, the page announces Thai (`lang="th"`); text meets WCAG AA contrast; keyboard focus ring is clearly visible.
- As a shopper comparing with Makro/Lotus, every price I see has a visible **updated date** and (on product pages) a **% change vs previous report**, so I know how fresh each number is.

### Baseline metrics (dev server :3000, captured 2026-08-16, before fix)
- `/th` → 0.582s · `/th/category/pork` → 0.439s · `/th/product/pork-belly` → 0.900s

---

## Section 2 — Engineering Handoff

### 0. ADR / Tradeoffs
- **Batched latest-price query over per-product queries**: one `DISTINCT ON (product_id, source_id, unit)` query with `WHERE product_id IN (...)`, grouped in JS. Semantics identical to existing single-product query (parity test proves it).
- **Data-layer caching (`unstable_cache`) in a NEW module** `src/db/cached-queries.ts`, NOT inside `src/db/queries.ts`. Why: `queries.ts` is imported by Vitest (node env, no Next runtime) — importing `next/cache` there risks breaking all 63 tests. Pages switch imports to `cached-queries.ts`; tests keep testing pure `queries.ts`.
- **Root-layout restructure for `lang`**: delete `src/app/layout.tsx`, move `<html lang={locale}>`/`<body>` + Inter font + globals.css into `src/app/[locale]/layout.tsx`. This is the officially documented next-intl App Router pattern. `next build` passing is the proof.
- **Cache staleness edge (accepted)**: after a scrape run, pages may serve prices up to 300s old. Mitigated by the trust labels themselves showing each price's own `source_date`. Revalidate-on-scrape is an open question, out of scope.
- **Discarded**: `export const revalidate = 300` on pages — pages read `cookies()` (province) so they're dynamic; segment revalidate is a no-op there.

### 1. Target Files
| File | Action |
|---|---|
| `src/db/queries.ts` | Add `getLatestPricesForProducts` (batched), `getAllPricesForProduct`; extend `ProductWithCheapestPrice` + `RawPriceRow` |
| `src/db/cached-queries.ts` | **NEW** — `unstable_cache` wrappers used by pages |
| `src/lib/unit-families.ts` | `PriceInputRow.sourceDate?`, `UnitFamilySummary.cheapestSourceDate?` |
| `src/lib/price-changes.ts` | **NEW** — pure `computePriceChanges()` helper |
| `src/app/layout.tsx` | **DELETE** (html/body move to locale layout) |
| `src/app/[locale]/layout.tsx` | Render `<html lang={locale}>`/`<body>`, font, globals.css, metadata |
| `src/app/[locale]/category/[slug]/page.tsx` | Promise.all; import cached-queries |
| `src/app/[locale]/search/page.tsx` | LIMIT 50, wildcard escaping; import cached-queries |
| `src/app/[locale]/product/[slug]/page.tsx` | % change wiring; import cached-queries |
| `src/app/[locale]/page.tsx` (home) | Import cached-queries |
| `src/components/product-card.tsx` | zinc-600 contrast; updated-date label; aria-label |
| `src/components/category-card.tsx` | zinc-600 contrast; aria-label |
| `src/components/price-changes-list.tsx` | zinc-600 contrast; updated-date; aria-label |
| `src/components/price-table.tsx` | ▲/▼ % change badge |
| `src/app/globals.css` | Solid focus ring |
| `src/messages/th.json`, `src/messages/en.json` | New keys (below) |
| `src/db/schema.ts` | trgm GIN indexes on `products` |
| `src/db/__tests__/queries.test.ts` | **NEW** — DB parity/integration tests |
| `src/lib/__tests__/price-changes.test.ts` | **NEW** — % change unit tests |

### 2. Imports & Dependencies
- `unstable_cache` from `next/cache` (only in `cached-queries.ts`).
- Drizzle: `sql`, `eq`, `or`, `ilike`, `inArray` from `drizzle-orm`; `index` from `drizzle-orm/pg-core` in schema.
- Existing: `summarizePriceFamilies`, `formatDate` (`src/lib/utils.ts`), `getDb()` (`src/db/index.ts` — returns `Db | null`, test env guards test DB).
- No new packages.

### 3. Schema Changes
1. `CREATE EXTENSION IF NOT EXISTS pg_trgm;` — run against dev DB (tsx script with `--env-file=.env.local`, or psql).
2. In `src/db/schema.ts` products table add:
   ```ts
   index("products_name_trgm_idx").using("gin", sql`${table.nameTh} gin_trgm_ops, ${table.nameEn} gin_trgm_ops`)
   ```
3. **DO NOT use `drizzle-kit push`** — dev DB has drift (schema.ts's `prices_product_source_province_date_unit_idx` unique constraint was never pushed; push demands truncating 238 rows). Apply via raw SQL against the dev DB instead (tsx script `--env-file=.env.local` or psql):
   ```sql
   CREATE EXTENSION IF NOT EXISTS pg_trgm;
   CREATE INDEX IF NOT EXISTS products_name_trgm_idx ON products USING gin (name_th gin_trgm_ops, name_en gin_trgm_ops);
   CREATE UNIQUE INDEX IF NOT EXISTS prices_product_source_province_date_unit_idx ON prices (product_id, source_id, province_id, source_date, unit);
   ```
   If the UNIQUE index fails on duplicates, dedupe first (keep latest scraped_at per key) — never truncate. **Deploy note**: same SQL must run on prod Neon (documented in worklog).

### 4. Step-by-step Edits

**STEP 1 — A11Y quick wins (no structure changes)**
1.1 `globals.css` `@layer base`: replace `outline-color: color-mix(in oklab, var(--color-ring) 50%, transparent)` with solid `outline-color: var(--color-ring)`; add
```css
:focus-visible { outline: 2px solid var(--color-ring); outline-offset: 2px; }
```
1.2 Contrast — in `product-card.tsx` (lines ~48, 63, 69, 80, 97), `price-changes-list.tsx` (~35, 42), `category-card.tsx` (~27), product page subtitle/meta (~128, 144, 147): every `text-zinc-400` on white background → `text-zinc-600`.
1.3 `category-card.tsx` Link: `aria-label={t(slug)}`. `product-card.tsx` Link: `aria-label={display}`. `price-changes-list.tsx` Link: `aria-label={`${display} — ฿${Number(item.minPrice).toFixed(2)}`}`.

**STEP 2 — lang attribute (root layout restructure)**
2.1 Move from `src/app/layout.tsx` into `src/app/[locale]/layout.tsx`: Inter font, `./globals.css` import (fix path), `metadata` (convert to `generateMetadata` if per-locale titles desired — plain `metadata` export is acceptable).
2.2 `[locale]/layout.tsx` returns:
```tsx
<html lang={locale} suppressHydrationWarning>
  <body className={`${inter.variable} antialiased`}>
    <NextIntlClientProvider messages={messages}>…existing shell…</NextIntlClientProvider>
  </body>
</html>
```
2.3 Delete `src/app/layout.tsx`. `next build` must pass (proof the restructure is valid).

**STEP 3 — N+1 → batched query (TDD: test first)**
3.1 Add to `queries.ts`:
```ts
export interface RawPriceRowWithProduct extends RawPriceRow { productId: number; }
export async function getLatestPricesForProducts(
  db: Db, productIds: number[], provinceId: number | null
): Promise<RawPriceRowWithProduct[]>
```
Single SQL — same SELECT/join as `getLatestPricesForProduct` plus `prices.product_id as "productId"`, `DISTINCT ON (prices.product_id, prices.source_id, prices.unit)`, `WHERE prices.product_id IN (…ids…) AND (provinceCondition)`, `ORDER BY prices.product_id, prices.source_id, prices.unit, prices.source_date DESC, prices.scraped_at DESC`. Build the IN list via drizzle `sql.join(ids.map(id => sql`${id}`), sql`, `)` (parameterized — never string-concat user data). Empty `productIds` → return `[]` without querying.
3.2 Rewrite `getProductsWithCheapestPrice`: one `getLatestPricesForProducts` call → `Map<number, RawPriceRowWithProduct[]>` grouped by productId → per product run the EXISTING `summarizePriceFamilies` mapping (identical to current lines 123–153, incl. per-product try/catch → nulls + sourceCount 0).
3.3 Parity is the contract: for identical seed data, new batched output ≡ old per-product output.

**STEP 4 — % change data (TDD: test first)**
4.1 `queries.ts`: `getAllPricesForProduct(db, productId, provinceId)` — all price rows for one product (same joins/select as `getLatestPricesForProduct`, NO DISTINCT ON), ordered by `source_id, unit, source_date DESC, scraped_at DESC`.
4.2 `src/lib/price-changes.ts`:
```ts
export interface PriceChange { changePct: number | null; }
export function computePriceChanges(rows: {sourceSlug: string; unit: string; price: string;}[]): Map<string, PriceChange>
```
Key `${sourceSlug}::${unit}`. Within each key group (already date-desc): latest = first, previous = second; `changePct = round(((latest - previous) / previous) * 1000) / 10` (1 decimal). No previous → `null`. previous price 0 → `null`. Pure function, no DB.
4.3 Product page: `getAllPricesForProduct` → `computePriceChanges` → `changePct` onto matching `PriceRow`s (match key sourceSlug+unit on the LATEST row set).

**STEP 5 — Trust UI**
5.1 `unit-families.ts`: `PriceInputRow` + optional `sourceDate?: string | null`; `UnitFamilySummary` + optional `cheapestSourceDate?: string | null`; set from `minRow.sourceDate ?? null` (existing tests must still pass — optional fields only).
5.2 `queries.ts`: `ProductWithCheapestPrice` + `cheapestSourceDate: string | null`; populate from `primarySummary`.
5.3 Messages — add keys:
   - `common.updatedShort`: th `"อัปเดต {date}"`, en `"Updated {date}"`
   - `product.priceUp`: th `"ราคาขึ้น {pct}%"`, en `"Price up {pct}%"`
   - `product.priceDown`: th `"ราคาลง {pct}%"`, en `"Price down {pct}%"`
5.4 `product-card.tsx`: under the "cheapestAt" line add `{p.cheapestSourceDate && <p className="text-[11px] text-zinc-600">{t("updatedShort", { date: formatDate(cheapestSourceDate, locale) })}</p>}` (prop flows from page — pass `cheapestSourceDate` at both call sites: category + search pages).
5.5 `price-table.tsx`: next to `displayPriceText`, if `row.changePct !== null` render `<span className={changePct > 0 ? "text-red-600" : "text-green-600"} aria-label={…priceUp/priceDown…}>▲ +5.2%</span>` (`▲` up, `▼` down, sign always explicit, 1 decimal).
5.6 `price-changes-list.tsx`: append ` · {tc("updatedShort", { date: formatDate(item.sourceDate, locale) })}` to the source line (zinc-600).

**STEP 6 — Caching layer**
6.1 `src/db/cached-queries.ts` — thin wrappers, all `unstable_cache(fn, keyParts, { revalidate })`, each wrapper calls `getDb()` itself and returns `[]`/`null` if db missing:
   - `getProvinceIdByCodeCached(code)` — 86400s
   - `getCategoryProductCountsCached()` — 3600s
   - `getRecentPriceChangesCached(provinceId)` — 300s
   - `getLatestPricesForProductsCached(productIds, provinceId)` — 300s, key includes sorted ids + province
   - `getLatestPricesForProductCached(productId, provinceId)` — 300s
   - `getAllPricesForProductCached(productId, provinceId)` — 300s
   - `getProductsWithCheapestPriceCached(productRows, provinceId)` — composes cached batch fetch + in-memory merge (names/ids from `productRows`, prices from cache) — 300s effective
   IMPORTANT: cache keys must be JSON-serializable primitives; `unstable_cache` args are part of the key.
6.2 Pages (`[locale]/page.tsx`, category, search, product) import from `@/db/cached-queries` instead of `@/db/queries` for the wrapped fns. Type re-exports: `export type { ProductWithCheapestPrice, RawPriceRow, PriceChangeItem } from "@/db/queries"`.

**STEP 7 — Search hardening + trgm**
7.1 `search/page.tsx`: escape LIKE wildcards before querying: `const safeQ = q.trim().replace(/[%_\\]/g, (m) => `\\${m}`)`; add `.limit(50)`.
7.2 Schema index + `CREATE EXTENSION IF NOT EXISTS pg_trgm` + `pnpm drizzle-kit push` (Section 3).

**STEP 8 — Category page parallelization**
`category/[slug]/page.tsx`: run `getProvinceIdByCode` + icon query + products query via `Promise.all`, then cached `getProductsWithCheapestPrice`.

### 5. Test Matrix (TDD — write failing tests FIRST for steps 3 & 4)
| Test | Layer | File |
|---|---|---|
| Batched ≡ per-product parity (multi-product, multi-source, multi-date, province+national rows, product-without-prices) | Integration (test DB `songkhla_prices_test`) | `src/db/__tests__/queries.test.ts` |
| `getLatestPricesForProducts([])` returns `[]`, no query | Integration | same |
| `computePriceChanges`: up / down / single-date → null / zero-previous → null / 1-decimal rounding | Unit | `src/lib/__tests__/price-changes.test.ts` |
| `summarizePriceFamilies` propagates `cheapestSourceDate` from min row; existing tests unbroken | Unit | extend `src/lib/__tests__/unit-families.test.ts` |
DB test setup: vitest env already points `DATABASE_URL` at `songkhla_prices_test`; create tables `IF NOT EXISTS` matching `schema.ts` (or push), `TRUNCATE ... RESTART IDENTITY` in `beforeEach`, seed fixtures. Never touch the dev DB (getDb throws if test URL lacks "test").

### 6. Edge Matrix
| Edge | Expected |
|---|---|
| Empty category / DB down | Existing null-DB path renders EmptyState (unchanged) |
| `productIds = []` | `[]` immediately, no SQL |
| Product with zero prices | cheapest* all null, sourceCount 0 |
| Search `q="100%"` or `_` | Treated literally (escaped), HTTP 200, no full-scan blowup |
| Search matching >50 products | 50 results max |
| Price with no previous report | No % badge rendered |
| previous price = 0 | changePct null (no div-by-zero) |
| Post-scrape within 300s | Pages may show prior prices ≤300s; labels show each price's own source_date (accepted tradeoff) |
| 10k prices / 500 products/category | 1 batched query + JS grouping; no per-product round-trips |

### Verification Exit Criteria (Engineer MUST self-verify all before DONE)
- [ ] `pnpm build` exits 0 — run in repo root
- [ ] `npx vitest run` — ALL pass (63 existing + new files), 0 failures
- [ ] `npx eslint src/` — no new errors
- [ ] Dev server warm-cache timings: 3× `curl -s -o /dev/null -w "%{time_total}"` on `/th/category/pork` and `/th/product/pork-belly` — median strictly < baseline 0.439s / 0.900s
- [ ] `curl -s localhost:3000/th | grep -o 'lang="th"'` → exactly 1 match; same for `lang="en"` on `/en`
- [ ] `curl -s localhost:3000/th/product/pork-belly | grep -c "อัปเดต"` → ≥1
- [ ] `rg -c "text-zinc-400" src/components/product-card.tsx src/components/category-card.tsx src/components/price-changes-list.tsx` → 0 matches
- [ ] psql (dev DB): `SELECT indexname FROM pg_indexes WHERE indexname='products_name_trgm_idx'` → 1 row; `SELECT * FROM pg_extension WHERE extname='pg_trgm'` → 1 row
- [ ] `EXPLAIN ANALYZE` of the search ilike on products shows Bitmap/Index scan (not Seq Scan) — paste into worklog
- [ ] Category page issues exactly ONE prices query for N products (verify via Neon dashboard or query logging — or structurally: `getLatestPricesForProducts` called once, `getLatestPricesForProduct` not called in list paths)
