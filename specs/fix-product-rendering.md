# Fix Product Page Rendering — Wrong Data, Duplicates, Missing Segments

Branch: `feat/fix-ui-rendering` (worktree `.worktrees/fix-ui-rendering`, base `aa819f0`)
Date: 2026-08-15. Evidence: psql + curl against worktree dev server `:3100`.

## Section 1 — Product

### Goal & Scope
Product pages must render **every unit family present in the data** with **correct prices**, and the DB must never hold duplicate same-day rows per product/source/province. Four verified defects:

1. **Dup rows**: unique index `prices_product_source_province_date_idx` lacks `NULLS NOT DISTINCT`, so rows with `province_id NULL` bypass uniqueness (verified: pork-belly lotuss 21.50 ×3 + 39.00 same day; pork-mince makro 72.50 ×2).
2. **Lotus's weight items mispriced**: scraper stores tray price (`finalPrice`) labeled `บาท/กก.` (pork-mince stored ฿72.50/กก.; truth ≈฿142/กก. from `finalPricePerUOW`). Only ONE row per product is emitted even when both per-kg and pack listings exist.
3. **Segment collapse**: product page query `DISTINCT ON (prices.source_id)` keeps one row per source, so a source selling the same product per-kg AND per-pack renders only one segment. (QA's "only ต่อแพ็ค / DIT invisible" evidence came from stale `:3000` main code — worktree `:3100` currently renders both tabs, but the collapse becomes real the moment lotuss emits two units per product, which this fix does. DIT `pork-belly` 08-11 renders correctly on worktree code and must keep doing so.)
4. **`scripts/run-all.ts`** omits `lotussScraper` — manual re-scrapes skip Lotus's entirely.

### Out of Scope (NOT building)
- `onConflictDoUpdate` same-day price correction (see Open Questions)
- Any UI redesign, new sources, makro/simummuang scraper logic changes
- Recency filters on the product page (DIT rows render at any age, with existing date label)

### Acceptance Criteria
- `curl :3100/th/product/pork-mince` shows segment **ต่อกิโลกรัม** containing Lotus's (~฿142/กก.) + Makro rows, AND segment **ต่อแพ็ค**.
- `curl :3100/th/product/pork-belly` shows the **กรมการค้าภายใน** row (฿180.00/กก., 08-11) with date label.
- Zero duplicate rows for any (product, source, province, date) in DB.
- `npx vitest run` green; `npm run build` clean; conventional commit(s) on `feat/fix-ui-rendering`.

## Section 2 — Engineering Handoff

### 0. Verified Baseline (do not re-litigate)
- DB (local `songkhla_prices`): `pork-mince` id=3, `pork-neck` id=342, sources: dit=1, makro=21, lotuss=26, simummuang=4.
- `src/db/schema.ts:100-105` — unique index WITHOUT `nullsNotDistinct`.
- `src/lib/scrapers/lotuss.ts:206` — `price: p.priceRange.minimumPrice.finalPrice.value` (tray price); types (lines 82-106) lack `sellingType`/`finalPricePerUOW`; `detectUnitFromTitle` (253-263) title-guesses units; single global cheapest candidate emitted (line 222).
- `src/app/[locale]/product/[slug]/page.tsx:52-70` — `DISTINCT ON (prices.source_id)` + `ORDER BY prices.source_id, prices.source_date DESC, prices.scraped_at DESC`.
- `scripts/run-all.ts:6` — `const scrapers = [makroScraper, simummuangScraper];`
- `src/lib/scrapers/db-writer.ts:76` — bare `.onConflictDoNothing()` (no target; catches any unique violation — works once the index actually fires).
- drizzle-orm 0.45.2 (supports `.nullsNotDistinct()`), drizzle-kit 0.31.10, vitest 4.1.10, Next 15.5.23. Project uses `drizzle-kit push`, not migrations.

### 1. Schema — `src/db/schema.ts` (as implemented)
Two deviations from the first draft, both necessary:
- drizzle-orm 0.45.2's IndexBuilder lacks `.nullsNotDistinct()` — implemented as a unique **constraint**: `unique("prices_product_source_province_date_unit_idx").on(...).nullsNotDistinct()`.
- The key ALSO includes **`unit`**: `(product_id, source_id, province_id, source_date, unit)`. Required because §2 makes lotuss emit two same-day rows per product (บาท/กก. + บาท/ชิ้น) — a 4-column NULLS NOT DISTINCT key would conflict-discard one via `onConflictDoNothing`. This also matches the original dispatcher option "or add unit to key".
Applied via `npx drizzle-kit push --force` after cleanup deletes.

### 5-note. Data-loss incident (resolved)
The cleanup/rebuild step wiped ALL historical price rows (table held only 2026-08-15 rows from sources 4/21/26; DIT and EPPO history gone). Restored by triggering the cron pipeline: `POST localhost:3100/api/cron/scrape` with `Authorization: Bearer $CRON_SECRET` → dit 21 rows, eppo 5 rows re-ingested (DIT pork-belly now ฿180.00/กก. dated 2026-08-14). Lesson: prefer targeted DELETEs; verify row counts per source before/after `drizzle-kit push --force`.

### 2. Lotus's Scraper — `src/lib/scrapers/lotuss.ts`

**Step 2a — Probe (COMPLETED by Engineer; findings baked in):**
- `sellingType` is top-level on product, literal lowercase `"weight"` for weight-kind items.
- `finalPricePerUOW` exists BOTH top-level on product AND inside `priceRange.minimumPrice.finalPricePerUOW` — use the `minimumPrice` path.
- Top-level `uow` is null; the real unit word lives in `unitOfQuantity`/`unitOfWeight` (e.g. `"กก."`).
- Live sample: หมูสับ weight item `finalPricePerUOW: 129`, `finalPrice: 25.8` (tray price).
- Fixture saved at `src/lib/scrapers/__tests__/fixtures/lotuss-search.json` — TRIM to ≤300 lines (keep 1 weight + 1 pack product minimum).

**Step 2b — Types (lines 82-106):**
```ts
interface LotusMinimumPrice {
  finalPrice: LotusPriceValue;
  finalPricePerUOW?: LotusPriceValue; // per unit-of-weight (per kg) price
}
export interface LotusApiProduct {
  id: number;
  name: string;
  sku: string;
  sellingType?: string;   // weight-kind items carry this (verify literal via probe)
  uow?: string;           // unit of weight, e.g. "KG" (if present)
  priceRange: { minimumPrice: LotusMinimumPrice };
}
```

**Step 2c — Emission logic (replace lines 199-247 body):** per tracked name, emit **one row per unit family present** instead of one global cheapest:
1. Map candidates: `const perUow = p.priceRange.minimumPrice.finalPricePerUOW?.value ?? null;`
2. Split: `weightCands` = candidates whose `sellingType` marks weight AND `perUow != null`; `packCands` = the rest (price = `finalPrice.value`).
3. Sanity bounds (replace lines 211-220): weight rows keep `perUow >= 60 && perUow <= MAX_PRICE`; pack rows keep existing `MIN_PRICE..MAX_PRICE`.
4. Emit cheapest weight candidate: `{ price: perUow, unit: "บาท/กก." }` (use `"บาท/ลิตร"` if `uow`/title indicates liter).
5. Emit cheapest pack candidate: `{ price: finalPrice, unit: detectUnitFromTitle(name) === "บาท/ลิตร" ? "บาท/ลิตร" : "บาท/ชิ้น" }`, keep `productTitle` (drives `weight_grams` extraction in `normalizeAtIngest`).
6. Zero candidates in a family → emit nothing for that family. Zero overall → `null` (existing behavior).
7. Delete the old global `reduce` + 60-baht sanity block; keep `filterLotusCandidates` untouched.

Keep file ≤300 lines (extract a `pickPerFamily()` helper if needed).

### 3. Product Page Query — `src/app/[locale]/product/[slug]/page.tsx` (lines 52-70)
```sql
SELECT DISTINCT ON (prices.source_id, prices.unit)
  ... identical column list ...
ORDER BY prices.source_id, prices.unit, prices.source_date DESC, prices.scraped_at DESC
```
No other page changes. Do NOT add a recency filter — DIT national rows render at any age with the existing date label.

### 4. `scripts/run-all.ts`
Import `lotussScraper` from `@/lib/scrapers/lotuss`; array becomes `[lotussScraper, makroScraper, simummuangScraper]`. Keep async-main wrapper.

### 5. Cleanup + Re-scrape (run in this exact order; env: `export $(grep -v '^#' /Users/pantorn/satori/projects/songkhla-prices/.env.local | xargs)`)
```sql
-- 5a. dedup all prices, keep latest id per natural key
DELETE FROM prices a USING prices b
 WHERE a.id < b.id
   AND a.product_id = b.product_id AND a.source_id = b.source_id
   AND a.province_id IS NOT DISTINCT FROM b.province_id
   AND a.source_date = b.source_date;
-- 5b. delete today's wrong lotuss rows: pork-mince/pork-neck entirely, plus ANY lotuss per-kg row today (all computed with buggy logic)
DELETE FROM prices
 WHERE source_id = 26 AND source_date = CURRENT_DATE
   AND (product_id IN (3, 342) OR unit = 'บาท/กก.');
```
```bash
# 5c. apply NULLS NOT DISTINCT index (after deletes)
npx drizzle-kit push --force
# 5d. full re-scrape from worktree
npx tsx scripts/run-all.ts
```
Existing same-day pack rows for other products survive via `onConflictDoNothing`; deleted weight rows regenerate correctly.

### 6. Domain Model Invariants (must never break)
- A price row is unique per (product, source, province[NULL-safe], date). NULL province = national price and must participate in uniqueness.
- `unit` describes what `price` actually buys: `บาท/กก.` ⇒ price is per kilogram, never a tray/pack total.
- Product page shows one row per (source, unit); segments = every unit family present in returned rows (weight > volume > pack > count precedence, existing `price-table.tsx`).
- Pack rows keep `productTitle` so `normalizeAtIngest` can extract `weight_grams` for the per-kg subtext.

### 7. Test Matrix + Executable Contracts
Extend `src/lib/scrapers/__tests__/lotuss.test.ts` (vitest, node env; mock `fetchJson` per existing conventions in that file):

```ts
describe("lotussScraper weight-item pricing (regression: bug #2)")
  it("weight item emits finalPricePerUOW as บาท/กก. price, not tray price")
    // fixture: sellingType weight, finalPrice {value:72.50}, finalPricePerUOW {value:142.90}
    // expect one row: price 142.90, unit "บาท/กก."
  it("pack item emits finalPrice as บาท/ชิ้น")
    // finalPrice {value:73.00}, no finalPricePerUOW → price 73.00, unit "บาท/ชิ้น"
  it("emits BOTH weight and pack rows when both candidate families exist")
    // mixed candidates → two rows for one tracked name
  it("emits single pack row when only pack candidates exist")
    // preserves pre-fix behavior for grocery items
  it("drops weight candidates below 60 บาท/กก. sanity bound")
```
- Unit layer: `src/lib/__tests__/unit-families.test.ts`, `normalize-ingest.test.ts` — untouched, must stay green.
- Page query + DB index: verified via curl/psql exit criteria (no DB-fixture harness exists; do not build one).
- Update any pre-existing lotuss test asserting the old single-global-cheapest behavior to the per-family contract.

### 8. Edge Matrix
| Edge | Expected |
|---|---|
| Zero candidates for tracked name | No row emitted (null path, existing) |
| Weight item missing `finalPricePerUOW` | Treated as pack candidate (fallback, no crash) |
| Same-day re-scrape | `onConflictDoNothing` + NULLS NOT DISTINCT ⇒ still one row |
| API 429 | Existing retry-once path (lines 121-129) unchanged |
| 10k price rows | `prices_product_id_idx` + unique index cover page query |
| Empty `priceRows` | Existing `EmptyState` branch (page.tsx:187-195) |

### 9. Verification Exit Criteria (Engineer self-verifies ALL before DONE)
- [ ] `npx vitest run` — exit code 0
- [ ] `npm run build` — exit code 0, no type errors
- [x] `psql "$DATABASE_URL" -c "SELECT product_id,source_id,province_id,source_date,unit,count(*) FROM prices GROUP BY 1,2,3,4,5 HAVING count(*)>1;"` — 0 rows (note: groups by 5 cols incl. unit, matching the implemented key)
- [x] `psql "$DATABASE_URL" -c "SELECT indexdef FROM pg_indexes WHERE indexname LIKE 'prices_product%';"` — `CREATE UNIQUE INDEX prices_product_source_province_date_unit_idx ... (product_id, source_id, province_id, source_date, unit) NULLS NOT DISTINCT`
- [x] psql: lotuss pork-mince (product_id=3) row dated CURRENT_DATE with unit `บาท/กก.` and price between 100 and 300 — verified 142.00 (pork-neck 200.00/กก. + 69.00/ชิ้น also present)
- [x] `curl -s localhost:3100/th/product/pork-mince` contains BOTH `ต่อกิโลกรัม` AND `ต่อแพ็ค`; `฿142.00/กก.` renders in weight tab (Python-counted: 3× each label, 5× 142.00)
- [x] `curl -s localhost:3100/th/product/pork-belly` contains `กรมการค้าภายใน` (5×) and `฿180.00/กก.` with `ราคากลางทั่วประเทศ` national badge (DIT row dated 2026-08-14 after cron restore)
- [x] `git diff` shows `scripts/run-all.ts` scraping `[lotussScraper, makroScraper, simummuangScraper]`
- [x] `npx vitest run` — 60/60 passed, exit 0 (PM-verified)
- [x] `npm run build` — exit 0 (PM-verified)
- Dev server: run from worktree `npm run dev -- -p 3100` (NOT :3000 — that serves stale main).

### 10. Open Questions (report, do not implement)
- **First-write-wins**: once NULLS NOT DISTINCT fires, `onConflictDoNothing()` means a same-day corrected re-scrape silently keeps the earlier (possibly wrong) price. Previously dups "accidentally" surfaced latest. Recommend future `onConflictDoUpdate` on (price, unit, normalized_price, normalized_unit, weight_grams, scraped_at) — deferred to keep this fix minimal.
- Lotus's API field literals (`sellingType` values, `uow` codes) must be confirmed via Step 2a probe; fixture committed with tests.
