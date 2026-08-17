# Fix: pork-shoulder (หมูสะโพก) missing Lotus's + Makro rows — Thai word-order reversal alias

Branch: `feat/pork-shoulder-alias` (worktree, based on main @ 5dabba9)
Root cause: CONFIRMED with live evidence (do not re-investigate).

## Section 1 — Product

### Goal & Scope
The product page for หมูสะโพก (pork-shoulder) shows only the DIT row (155 บาท/กก.). Both Lotus's and Makro sell the item but our scrapers drop every candidate because **both retailers title the product in reversed Thai word order** — "สะโพกหมู…" instead of our tracked name "หมูสะโพก". Strict substring matching yields 0 candidates → 0 rows.

This is the same bug class already fixed for หมูคอสไลซ์ (คอหมู/สันคอ) and หมูสับ (หมูบดอนามัย/เนื้อหมูบด). We mirror those alias patterns.

Live evidence (verified today):
- Lotus's search "หมูสะโพก" → 15 products, ALL titled "สะโพกหมู…" (e.g. "สะโพกหมู กก.ละ", "ซีพี สะโพกหมูแต่งตัดชิ้น กก.ละ"). `filterLotusCandidates` (lotuss.ts:172) strict `name.includes("หมูสะโพก")` → 0 matches → no alias branch → `[]`.
- Makro `_next/data` meat/pork page 1 contains "เซพแพ็ค สะโพกหมู 6 กก./แพ็ค" (https://www.makro.pro/p/831499-800259117952024). `matchesName` (makro.ts:201) strict match fails → no alias branch → dropped.
- DB today: pork-shoulder has ONLY the DIT row.

### Out of Scope
- NO other products, no refactors, no pagination changes, no schema changes.
- No changes to DIT scraper, cross-check logic, or UI.

### Acceptance Criteria
1. After a live scrape, `pork-shoulder` has ≥1 lotuss row AND ≥1 makro row alongside the DIT row.
2. Unit tests prove: reversed-order titles ("สะโพกหมู") match, forward-order ("หมูสะโพก") still match, and "สะโพกไก่" (chicken thigh) never matches หมูสะโพก.
3. `npx vitest run` and `npx tsc --noEmit` green. Strict TS, no `any` in src.
4. No scratch debug scripts committed (worktree is already clean of them).

## Section 2 — Engineering Handoff

### Domain Model (invariant)
- Tracked name "หมูสะโพก" = pork shoulder. Thai retailers reverse the noun compound: "สะโพกหมู". The bigram "สะโพกหมู" embeds หมู, so matching it CANNOT false-positive on chicken ("สะโพกไก่" does not contain "สะโพกหมู"). No extra guard keyword needed.
- Lotus's two-phase design (strict phase wins; alias fallback only when strict yields 0) must be preserved. Known accepted trade-off (unchanged from หมูคอสไลซ์ behavior): on a day Lotus returns even one forward-order title, reversed-order candidates are excluded that day. Document in code comment; do NOT "fix" by blending.
- Makro NFC folding (`nfc()`) applies to titles/tracked names before `matchesName`; the new branch is plain `includes` on already-folded strings — "สะโพกหมู" contains no sara-am so folding is irrelevant but harmless.

### Target Files (ONLY these)
1. `src/lib/scrapers/lotuss.ts` — add fallback branch in `filterLotusCandidates` (~5 lines) + extend its doc comment.
2. `src/lib/scrapers/makro.ts` — add alias branch in `matchesName` (~5 lines) + extend its doc comment.
3. `src/lib/scrapers/__tests__/lotuss.test.ts` — extend `filterLotusCandidates` describe block.
4. `src/lib/scrapers/__tests__/makro.test.ts` — extend `makroScraper` describe block (tests go through `scrape()`; `matchesName` is private).

NO other files. Both scrapers stay well under 300 lines.

### TDD Order (Red-Green per AGENTS.md)
Write ALL failing tests FIRST, run once to confirm red, then implement, then green.

#### Test contracts — lotuss.test.ts (inside existing `describe("filterLotusCandidates")`)
Using existing `makePackProduct` helper:

1. `it("falls back to reversed-order 'สะโพกหมู' for 'หมูสะโพก' when no strict match")`
   - products: `makePackProduct("สะโพกหมู กก.ละ", 155)`, `makePackProduct("ซีพี สะโพกหมูแต่งตัดชิ้น กก.ละ", 165)`, `makePackProduct("หมูสามชั้น กก.ละ", 180)`
   - `filterLotusCandidates(products, "หมูสะโพก")` → length 2 (both สะโพกหมู titles, distractor excluded).
2. `it("strict forward-order 'หมูสะโพก' titles win over reversed fallback")`
   - products: `makePackProduct("หมูสะโพก แพ็ค", 100)`, `makePackProduct("สะโพกหมู กก.ละ", 90)`
   - → length 1, `[0].name` is `"หมูสะโพก แพ็ค"` (strict phase precedence).
3. `it("does NOT match 'สะโพกไก่' for 'หมูสะโพก'")`
   - products: `makePackProduct("สะโพกไก่ กก.ละ", 60)` → length 0.
4. Scraper-level (inside `describe("lotussScraper")`): `it("emits บาท/กก. row for หมูสะโพก when API returns only reversed titles")`
   - mock keyword `"หมูสะโพก"` → `makeWeightProduct("สะโพกหมู กก.ละ", 42.5, 170)`; all other keywords → empty.
   - result row: `sourceProductName === "หมูสะโพก"`, `price === 170`, `unit === "บาท/กก."`.

#### Test contracts — makro.test.ts (inside existing `describe("makroScraper")`)
Using existing `makeDoc` / `mockCategoryResponse` helpers:

5. `it("matches reversed 'สะโพกหมู' alias for หมูสะโพก")`
   - meat/pork hits: `makeDoc("เซพแพ็ค สะโพกหมู 6 กก./แพ็ค", 690, 6)` and `makeDoc("สะโพกหมู 1 กก.", 149)`
   - expect row `sourceProductName === "หมูสะโพก"`, price `min(690/6, 149/1) = 115`, unit `บาท/กก.`.
6. `it("still matches strict forward-order 'หมูสะโพก' title")`
   - meat/pork hits: `makeDoc("หมูสะโพก 1 กก.", 139)` → row price 139.
7. `it("does NOT match 'สะโพกไก่' for หมูสะโพก")`
   - meat/pork: empty; meat/poultry: `makeDoc("สะโพกไก่ 1 กก.", 55)`
   - `results.find(r => r.sourceProductName === "หมูสะโพก")` → undefined.

#### Implementation — lotuss.ts `filterLotusCandidates`
After the `หมูคอสไลซ์` branch, add (mirroring existing style):

```ts
if (trackedName === "หมูสะโพก") {
  // Lotus's titles reverse the word order: "สะโพกหมู ..." (never
  // "หมูสะโพก"). The bigram embeds หมู, so "สะโพกไก่" cannot match.
  return products.filter((p) => p.name.includes("สะโพกหมู"));
}
```
Also add a bullet to the function's doc comment: `- "หมูสะโพก" → "สะโพกหมู" (reversed Thai word order; all Lotus titles use this form)`.

#### Implementation — makro.ts `matchesName`
Add a branch before the final strict fallback (after the `หมูสับ` branch):

```ts
if (trackedName === "หมูสะโพก") {
  // Reversed Thai word order: Makro titles use "สะโพกหมู" (e.g.
  // "เซพแพ็ค สะโพกหมู 6 กก./แพ็ค"). The bigram embeds หมู, so
  // "สะโพกไก่" cannot match. Forward-order strict match still accepted
  // via the fallthrough below.
  if (title.includes("สะโพกหมู")) return true;
}
```
Update the function's doc comment with the same note. (Fallthrough keeps strict `title.includes("หมูสะโพก")` working — no rejection of strictMatch here, unlike หมูสับ.)

### Edge Matrix
| Edge | Expected |
|---|---|
| API returns only reversed titles | Fallback matches; rows emitted |
| API returns forward-order title | Strict phase wins (Lotus) / strict accepted (Makro) |
| "สะโพกไก่" title present | Never matched to หมูสะโพก |
| Empty candidate list after alias | `candidates.length === 0` → term skipped (existing behavior) |
| Makro pack price ÷ title weight | "6 กก." → 690/6 = 115 บาท/กก. (existing `normalizePrice`) |

### Verification Exit Criteria (engineer MUST self-verify all)
- [ ] New tests written FIRST and confirmed RED before implementation (note red-run output) — `npx vitest run src/lib/scrapers/__tests__/lotuss.test.ts src/lib/scrapers/__tests__/makro.test.ts`
- [ ] After implementation: `npx vitest run` — full suite green (0 failures)
- [ ] `npx tsc --noEmit` — clean, no `any` introduced
- [ ] Dev server on :3000 (`.env.local`), then `curl -s -X POST http://localhost:3000/api/cron/scrape -H "Authorization: Bearer $CRON_SECRET"` → success response
- [ ] psql row-count query (below) shows `lotuss ≥ 1` and `makro ≥ 1` for pork-shoulder (baseline today: only `dit`)
- [ ] `npx tsx --env-file=.env.local scripts/dev/cross-check.ts` passes; no new unmapped entries
- [ ] `curl -s http://localhost:3000/th/product/pork-shoulder` (after ≤300s cache expiry or revalidate) contains lotuss + makro price rows
- [ ] `git status` shows only the 4 target files modified; no scratch scripts present

### Verification commands
```bash
# psql check (DATABASE_URL from .env.local)
psql "$DATABASE_URL" -c "
SELECT s.slug AS source, COUNT(p.id) AS rows, MIN(p.price) AS min_price
FROM prices p
JOIN products pr ON p.product_id = pr.id
JOIN sources s ON p.source_id = s.id
WHERE pr.slug = 'pork-shoulder'
GROUP BY s.slug ORDER BY s.slug;"
# Expected sources: dit, lotuss, makro (lotuss/makro ≥1 row each — baseline: dit only)
```

### Commit
Conventional commit, e.g. `fix(scrapers): match reversed-order "สะโพกหมู" titles for หมูสะโพก (lotuss + makro)`. Do NOT push.

### Notes
- Scratch scripts `scripts/dev/debug-pork-shoulder.ts` / `scripts/dev/debug-makro.ts` exist only as untracked files in the MAIN tree, not this worktree — nothing to do; just don't create equivalents.
- Seed mappings for both sources already exist (src/db/seed.ts:380,429), so scraped rows map to pork-shoulder automatically.
