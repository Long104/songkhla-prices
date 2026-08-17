# Fix: Lotus's cut-grade variant contamination in pickPerFamily

## Section 1 — Product

**Goal:** Stop `pickPerFamily` (src/lib/scrapers/lotuss.ts) from picking cheaper
cut-grade variants (skin-on "หนัง", fatty "ติดมัน") when a plain grade of the same
tracked product exists. Today this surfaced as หมูสะโพก showing ฿86/kg (skin+fatty
"ซีพี หนังสะโพกหมูติดมัน") while Lotus's own headline price is ฿135/kg plain —
user saw "price not match" and lost trust in the site.

**Why:** Cheapest-of-family is correct for finding the best plain-grade deal, but
skin-on/fatty grades are a different product tier sold 20-40% cheaper. Mixing
tiers under one tracked product makes the site look wrong next to the store
shelf.

**Scope:**
- Weight-candidate selection in `pickPerFamily` only.
- Pack candidates: UNTOUCHED (explicitly out of scope).

**Out of scope (NOT building):**
- No changes to `filterLotusCandidates` matching/alias logic.
- No changes to other scrapers (makro, simummuang, dit, eppo).
- No DB schema changes, no UI changes.
- No per-variant product pages / tier display.

**Acceptance criteria:**
1. When plain (135) and skin-on/fatty (86) weight candidates both match a
   tracked product, the plain one is picked (135).
2. When ONLY skin-on/fatty weight candidates exist (edge case: product sold
   only skin-on that day), fall back to cheapest overall — never return nothing.
3. All existing lotuss tests still pass (pork belly, pagination, sanity bounds).
4. Live re-scrape blast-radius: only products where a หนัง/ติดมัน variant was
   cheapest TODAY change price; full before/after diff table reported.
5. `/th/product/pork-shoulder` lotuss row's stored productTitle contains NO
   "หนัง" and NO "ติดมัน" substring.

## Section 2 — Engineering Handoff

### Root cause (confirmed by live probe — do not re-investigate)

`pickPerFamily` at src/lib/scrapers/lotuss.ts:265-319 builds `weightCands`
(line 278-280: filter on sellingType === "weight", perUow 60..MAX_PRICE) and
emits `weightCands.reduce(cheapest by perUow)` at line 289-303. Cut-grade
modifiers in the Thai title are never considered, so "ซีพี หนังสะโพกหมูติดมัน
กก.ละ" (86) beats "สะโพกหมู กก.ละ" (135).

### Target files

| File | Change |
|---|---|
| `src/lib/scrapers/__tests__/lotuss.test.ts` | Add cut-grade selection describe-block (TDD: write FIRST, confirm red) |
| `src/lib/scrapers/lotuss.ts` | Modify `pickPerFamily` weight-candidate selection only (~5 lines + comment) |
| `/tmp/lotuss-blastradius.ts` (temp, DELETE after) | One-shot re-scrape + diff script |

No new files in src/. lotuss.ts is 331 lines — stays under 300-line budget is
impossible without refactor; do NOT refactor (minimal diff mandate), touching
only pickPerFamily keeps the diff surgical.

### Exact edit — `pickPerFamily` in lotuss.ts

After line 278-280 (`weightCands` filter), insert cut-grade partitioning:

```ts
// Cut-grade variants (หนัง = skin-on, ติดมัน = fatty) are a cheaper product
// tier, not the same product. Prefer plain-grade weight candidates when any
// exist; if ALL weight candidates are cut-grade (product only sold skin-on
// that day), fall back to cheapest overall rather than emitting nothing.
const isCutGrade = (name: string) => name.includes("หนัง") || name.includes("ติดมัน");
const plainWeightCands = weightCands.filter((c) => !isCutGrade(c.product.name));
const pool = plainWeightCands.length > 0 ? plainWeightCands : weightCands;
```

Then change line 289-290 from `weightCands.length > 0` / `weightCands.reduce`
to `pool.length > 0` / `pool.reduce`. Pack candidates block (line 305-316)
UNTOUCHED. `isCutGrade` helper may be module-scope or inline — engineer's
choice, keep strict TS (no `any`).

Note: `pool` shadows nothing; `detectUnitFromTitle(cheapest.product.name)` call
inside the emit block already references `cheapest` from the reduce — keep as-is.

### TDD order (Red-Green-Refactor — mandated by AGENTS.md)

**Step 1 (RED):** Add to `src/lib/scrapers/__tests__/lotuss.test.ts` a new
describe block `pickPerFamily cut-grade selection (skin/fat variant exclusion)`
with these cases, using existing `makeWeightProduct` / `mockApiResponse` /
`runScrape` helpers:

- **Case A — plain preferred over cut-grade:**
  keyword "หมูสะโพก" returns
  `makeWeightProduct("ซีพี หนังสะโพกหมูติดมัน กก.ละ", 27, 86)` and
  `makeWeightProduct("สะโพกหมู กก.ละ", 42.5, 135)`.
  Assert: exactly 1 weight row, price 135, productTitle "สะโพกหมู กก.ละ".

- **Case B — fallback when only cut-grade exists:**
  keyword "หมูสะโพก" returns ONLY
  `makeWeightProduct("ซีพี หนังสะโพกหมูติดมัน กก.ละ", 27, 86)`.
  Assert: 1 weight row, price 86, productTitle contains "หนัง" (fallback
  documented — emitting nothing would silently drop the product).

- **Case B2 — ติดมัน modifier alone also excluded:**
  keyword "หมูสะโพก" returns
  `makeWeightProduct("สะโพกหมูติดมัน กก.ละ", 30, 99)` and
  `makeWeightProduct("สะโพกหมู แต่งสะอาด กก.ละ", 45, 148)`.
  Assert: picks 148.

- **Case C — pack candidates untouched by cut-grade filter:**
  keyword "หมูสะโพก" returns
  `makePackProduct("ซีพี หนังสะโพกหมูติดมัน แพ็ค", 89)` and
  `makePackProduct("สะโพกหมู แพ็ค", 120)`.
  Assert: 1 pack row, price 89 (packs keep cheapest-overall behavior).

- **Case C2 — existing regression suite green:** all pre-existing tests pass
  unmodified (pork belly sanity bounds, pagination, dual-family emit).

**Step 2 (GREEN):** Apply the pickPerFamily edit. All tests pass.
**Step 3:** `npx vitest run src/lib/scrapers/__tests__/lotuss.test.ts` green,
`npx tsc --noEmit` clean, lint clean.

### Existing scripts (verified on disk)

- `scripts/dev/run-lotuss.ts` — runs lotuss + writes DB. Do NOT use for the
  diff (DB writes pollute); write a temp variant that ONLY calls
  `lotussScraper.scrape()` and dumps JSON.
- `scripts/dev/cross-check.ts` — run green after fix.
- `scripts/dev/coverage-audit.ts` — run green after fix.
- Invocation pattern: `npx tsx scripts/dev/<script>.ts` (tsx is used by seed
  script; `@/` alias resolves in tsx via tsconfig paths).

### Blast-radius procedure (MANDATORY, order matters)

**TRAP: Lotus search results rotate daily. The before/after scrapes MUST run
back-to-back in the same session or the diff table is meaningless noise.**

1. **BEFORE scrape (on pre-fix code, main state):** temp script
   `/tmp/lotuss-blastradius.ts` run via `npx tsx` (or vitest scratch — engineer
   picks; delete after). It must:
   - call `lotussScraper.scrape()` directly,
   - print `{ sourceProductName, price, unit, productTitle }` for every row
     sorted by sourceProductName → save as `/tmp/lotuss-before.json`.
2. Apply the fix (Step 2 above).
3. **AFTER scrape (same script, same session):** save `/tmp/lotuss-after.json`.
4. Diff the two JSON files. Report full table: rows where price OR productTitle
   changed, plus a count of unchanged rows. Expected: only products where a
   หนัง/ติดมัน variant was cheapest at this moment change (pork-shoulder at
   minimum). If a product changed for another reason (search rotation served
   different plain candidates), note it — rotation is real, price moves within
   plain-grade set are NOT a bug, but cut-grade title appearing after fix IS a
   bug.
5. **DB write verification (optional if cron path is healthy):** if dev server
   on :3000 is up, `curl -X POST http://localhost:3000/api/cron/scrape -H
   "Authorization: Bearer $CRON_SECRET"` (read from .env.local) then psql:
   latest lotuss row for pork-shoulder has productTitle without หนัง/ติดมัน.
   Tests are isolated to `songkhla_prices_test` DB — do NOT touch prod tables
   via direct writes; the cron path writes through the normal pipeline only.
   If cron is flaky, the /tmp JSON diff (steps 1-4) is sufficient evidence.

### Domain model notes

- **CORRECTION (verified during delivery):** `ScrapedPrice.productTitle` is NOT
  persisted — `prices` table has no product_title column; productTitle is
  consumed transiently by `normalizeAtIngest` (pack-title → weightGrams →
  per-kg conversion). DB-level verification therefore asserts on price+unit
  (135 บาท/กก. plain-range, not 86), and title-substring assertions live in
  the unit tests only.
- `normalizeAtIngest(sp.price, sp.unit, sp.productTitle ?? ...)` in
  db-writer.ts:60 consumes productTitle downstream — no contract change.
- Product page data is `unstable_cache` revalidate:300 — post-scrape page
  verification must wait out the 5-min window (pre-existing behavior).

### Edge matrix

| Edge | Expected |
|---|---|
| All weight cands are cut-grade | Fallback to cheapest overall (Case B) |
| No weight cands at all (pack-only) | Existing behavior, pack row only |
| perUow null / out of 60..MAX bounds | Existing filter drops them first, unchanged |
| หนัง/ติดมัน in PACK candidate names | NOT filtered (Case C) |
| Mixed plain set where cheapest plain rotates day-to-day | Fine — price moves within plain set are legit |

### Verification Exit Criteria (engineer MUST check all before DONE)

- [ ] New describe-block has cases A, B, B2, C, C2; all pass via `npx vitest run src/lib/scrapers/__tests__/lotuss.test.ts` (exit 0)
- [ ] RED was observed first (git stash trick or pre-fix run log showing A/B/B2 failing)
- [ ] `npx tsc --noEmit` exit 0, no new errors
- [ ] Lint clean on changed files (project's configured linter)
- [ ] `/tmp/lotuss-before.json` + `/tmp/lotuss-after.json` captured back-to-back; full diff table reported in DONE message; pork-shoulder (หมูสะโพก) row shows cut-grade title → plain title (or price within plain range 135-169)
- [ ] Changed-product count = only cut-grade-cheapest products (report exact count + names)
- [ ] If cron path used: psql query on latest pork-shoulder lotuss row shows product_title NOT LIKE '%หนัง%' AND NOT LIKE '%ติดมัน%'
- [ ] `npx tsx scripts/dev/cross-check.ts` green
- [ ] `npx tsx scripts/dev/coverage-audit.ts` green (per recent commits, standing check)
- [ ] Temp scripts deleted (`/tmp/lotuss-blastradius.*` and any scratch files); `git status` shows only the 2 intended src files
- [ ] Full `npx vitest run` green (whole suite, not just lotuss)

### Security check

No new inputs, no new endpoints, no dependency changes. Thai title substring
check (`includes`) is injection-safe (no eval/regex from untrusted input).
CRON_SECRET stays in .env.local, never logged. No secrets in temp scripts or
commit.
