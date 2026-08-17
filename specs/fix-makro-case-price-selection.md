# Fix: Makro representative-price policy — exclude wholesale cases + cut-grade variants

Follow-up to c9f52b3 (lotuss cut-grade fix) on the SAME branch
`fix/lotuss-cut-grade-selection`. Same class of bug, second scraper.

## Section 1 — Product

**Goal:** Makro's per-kg prices must represent a single retail pack, not a
wholesale ลัง/case. Today หมูสะโพก shows ฿116/kg because
"เซพแพ็ค สะโพกหมูหั่นแกงแช่แข็ง 1 ลัง (1 กก. x 10)" (฿1160 ÷ 10kg = 116)
beats every 1kg retail pack (135/127/118). User sees ฿135 on the shelf for the
product they clicked and calls our ฿116 "no match". Additionally, skin-on
cut-grade variants exist at Makro ("สะโพกหมูติดหนังตัดชิ้นแช่แข็ง 4.2-5.5
กก./แพ็ค") — the lotuss cut-grade policy must be mirrored here for consistent
representative pricing across scrapers.

**Scope:** Candidate selection policy in `makroScraper.scrape()` (Pass 1
category loop + Pass 2 search fallback). Nothing else.

**Out of scope (NOT building):**
- No changes to `matchesName`, `normalizePrice`, `extractTitleWeight`,
  `extractEggCount`, category map, or buildId logic.
- No changes to other scrapers. No DB schema changes. No UI changes.
- NOT fixing the per-unit pack-price quirk (บะหมี่/น้ำดื่ม use raw
  displayPrice) — bulk exclusion is a no-op there today because cheapest-pick
  already prefers single packs (a case is pricier in absolute terms).

**Acceptance criteria:**
1. When single-pack and bulk-case candidates both match, the cheapest
   SINGLE-PACK candidate wins (pork-shoulder: 135 or 118 — cheapest retail —
   NOT the case-derived 116).
2. When ONLY bulk cases exist, case price is used (never drop the product).
3. When plain and cut-grade (หนัง/ติดมัน) single-packs both match, plain wins;
   when only cut-grade exists, it is kept.
4. Existing makro tests pass unmodified — especially the "เซพแพ็ค สะโพกหมู
   6 กก./แพ็ค" → 115 test (a 6kg retail pack is NOT a case: no ลัง, no x N,
   unitSize empty, unitFactor 1 → must NOT be excluded).
5. Blast radius: full before/after table for every makro product; every
   product where fallback engaged is flagged.
6. DB + page: /th/product/pork-shoulder makro row shows a non-case,
   non-cut-grade price after re-scrape + cache window.

## Section 2 — Engineering Handoff

### Root cause (confirmed by live probe — do NOT re-investigate)

`scrape()` Pass 1 (src/lib/scrapers/makro.ts:427-433) and Pass 2 (:465-470)
both do `normalized.reduce((a,b) => b.price < a.price ? b : a)` over ALL
matched candidates. `extractTitleWeight` correctly computes case weight
("1 กก. x 10" → 10kg → 116/kg), but a wholesale case per-kg price is not the
retail reference price users compare against.

Live evidence (Makro search `q=สะโพกหมู`, today):
- "สะโพกหมูตัดชิ้น 1 กก." ฿135, packagingWeight 0.49 (retail single)
- "เซพแพ็ค สะโพกหมูหั่นแกงแช่แข็ง 1 กก." ฿118 (retail single)
- "สะโพกหมูสไลซ์ แพ็คถาด 1 กก." ฿127 (retail single)
- "เซพแพ็ค สะโพกหมูหั่นแกงแช่แข็ง 1 ลัง (1 กก. x 10)" ฿1160, unitSize
  "10 unit(s)" ← case; ÷10 → 116 ← the reported bug
- "สะโพกหมูติดหนังตัดชิ้นแช่แข็ง 4.2-5.5 กก./แพ็ค" ฿825 (cut-grade)

### Target files

| File | Change |
|---|---|
| `src/lib/scrapers/__tests__/makro.test.ts` | New describe-block (TDD RED first); extend `makeDoc` with optional overrides param (backwards-compatible) |
| `src/lib/scrapers/makro.ts` | Add `isBulkCase` + `pickRepresentative` helpers (~35 lines); replace BOTH reduce sites (Pass 1 :433, Pass 2 :470) |
| `scripts/dev/tmp-run-makro.ts` (temp, DELETE after) | Mirrors run-lotuss.ts for DB write |

makro.ts is 497 lines — over the 300-line budget already; do NOT refactor or
split (minimal-diff mandate, consistent with the lotuss pass).

### Exact edits

**1. Helpers (place after `normalizePrice`, Step 5.5):**

```ts
/**
 * Detect wholesale case/multipack listings (ลัง = case, "x N" title
 * multiplier, or unitSize/unitFactor indicating >1 sellable units per pack).
 * These per-kg prices undercut every retail pack and misrepresent the
 * shelf price users compare against.
 */
function isBulkCase(p: MakroProductDocument): boolean {
  const title = nfc(p.title);
  if (title.includes("ลัง")) return true;
  const mult = title.match(/[x×]\s*(\d+)/i);
  if (mult && parseInt(mult[1], 10) > 1) return true;
  const unitCount = p.unitSize.match(/^(\d+)\s*unit/i);
  if (unitCount && parseInt(unitCount[1], 10) > 1) return true;
  return p.unitFactor > 1;
}

/** Cut-grade modifiers mark a cheaper product tier (see lotuss.ts). */
const isCutGrade = (title: string): boolean => title.includes("หนัง") || title.includes("ติดมัน");

/**
 * Representative-price policy: cheapest single-pack, plain-grade candidate.
 * Wholesale cases and cut-grade variants are excluded ONLY when better
 * candidates exist — if a dimension excludes everything (product sold only
 * as cases / only skin-on that day), fall back to that dimension's full
 * pool rather than dropping the product.
 */
function pickRepresentative<T extends { price: number; product: MakroProductDocument }>(
  normalized: T[],
): T {
  let pool = normalized.filter((n) => !isBulkCase(n.product));
  if (pool.length === 0) pool = normalized; // only cases exist — keep wholesale price
  let preferred = pool.filter((n) => !isCutGrade(nfc(n.product.title)));
  if (preferred.length === 0) preferred = pool; // only cut-grade — keep it
  return preferred.reduce((a, b) => (b.price < a.price ? b : a));
}
```

Cascade semantics (spec'd deliberately): retail-plain > retail-cut-grade >
case-plain > case-cut-grade. Retailness dominates grade.

**2. Pass 1 line 433:** replace
`const cheapest = normalized.reduce((a, b) => (b.price < a.price ? b : a));`
with `const cheapest = pickRepresentative(normalized);`

**3. Pass 2 line 470:** same replacement.

Generic `<T extends ...>` keeps strict TS (no `any`); `normalized` array
elements are `{ price, unit, product }` — satisfies the constraint.

### TDD order (Red-Green-Refactor — mandated)

**Step 1 (RED):** In makro.test.ts extend makeDoc signature:
`makeDoc(title, displayPrice, packagingWeight = 1.0, overrides: Partial<MakroProductDocument> = {})`
spread last. New describe block `representative-price policy (case + cut-grade exclusion)`:

- **A — case excluded when retail exists:** pork hits:
  `makeDoc("สะโพกหมูตัดชิ้น 1 กก.", 135, 0.49)` +
  `makeDoc("เซพแพ็ค สะโพกหมูหั่นแกงแช่แข็ง 1 ลัง (1 กก. x 10)", 1160, 1, { unitSize: "10 unit(s)", unitFactor: 10 })`.
  Assert price 135 (today yields 116 → RED).
- **A2 — unitSize-only signal:** `makeDoc("สะโพกหมูหั่นแกงแช่แข็ง 1 กก.", 118, 1, { unitSize: "10 unit(s)" })` + `makeDoc("สะโพกหมูสไลซ์ แพ็คถาด 1 กก.", 127)` → 127.
- **A3 — unitFactor-only signal:** same but `{ unitFactor: 10 }` on the 118 → 127.
- **B — only case exists → fallback:** single hit the 1160 case → price 116.
- **C — cut-grade excluded when plain exists:** `makeDoc("สะโพกหมูติดหนัง 1 กก.", 99)` + `makeDoc("สะโพกหมูสไลซ์ แพ็คถาด 1 กก.", 127)` → 127.
- **C2 — only cut-grade exists → fallback:** the 99 alone → 99.
- **P2 — policy applies to search fallback path too:** category empty, search returns case (1160/ลัง) + retail 135 → 135.
- **D — regression:** ALL existing tests unmodified and green, especially
  `matches reversed 'สะโพกหมู' alias` (6 กก./แพ็ค → 115 must survive: no ลัง,
  no x N, empty unitSize, unitFactor 1) and `falls back to /c/search`
  (118 single-pack).

Run `npx vitest run src/lib/scrapers/__tests__/makro.test.ts` — A/A2/A3/C/P2
must FAIL (RED) before the fix.

**Step 2 (GREEN):** apply edits; full makro suite green.

### Blast-radius procedure (MANDATORY, back-to-back, same session)

Same discipline as lotuss pass — Makro category listings rotate.

1. **Probe validation (BEFORE-scrape script must log it):** for every
   matched candidate of pork, poultry, dry-grocery, household, pet-care
   (one product each is enough), log `{title, unitSize, unitFactor}` so the
   detection signals are validated against real data — if unitSize/unitFactor
   turn out flat/unreliable, note it and rely on title signals (already
   sufficient for the pork case).
2. Temp script `/tmp/makro-blastradius.ts` (or `scripts/dev/tmp-blastradius-makro.ts`
   if `@/` alias needs repo cwd; DELETE after): ONLY `makroScraper.scrape()`,
   print rows `{sourceProductName, price, unit}` sorted → `/tmp/makro-before.json`.
   NOTE: makro has no productTitle on ScrapedPrice — title-level fallback
   detection is internal to the scraper; blast radius compares price+unit only.
3. Apply fix, re-run → `/tmp/makro-after.json`.
4. Diff table for EVERY product (changed + unchanged count). Expected:
   pork-shoulder 116 → 135-ish retail (118-135 band); possibly a few others
   legitimately shifting off case prices (household/pet-care are case-heavy —
   flag every product where ALL candidates were cases, i.e. fallback engaged).
5. **DB write:** temp `scripts/dev/tmp-run-makro.ts` mirroring run-lotuss.ts
   (`writeScraperResults(makroScraper, ...)`) → psql:
   latest pork-shoulder/makro row price in [110, 150] band AND ≠ 116.00 case
   value OR (if today's cheapest retail differs) any non-case value — report
   exact number. DELETE temp scripts after.

### Edge matrix

| Edge | Expected |
|---|---|
| Only case candidates exist (fallback) | Case per-kg price kept (Case B) |
| Only cut-grade candidates exist | Kept (Case C2), consistent with lotuss fallback |
| 6 กก./แพ็ค large retail pack (no case markers) | NOT excluded — existing test guards (Case D) |
| unitSize/unitFactor missing (""/1) on cases | Title signals ลัง + "x 10" still catch it |
| Range-weight cut-grade "4.2-5.5 กก." | Existing extractTitleWeight takes 5.5; excluded via หนัง/ติดมัน when plain exists |
| Eggs "30 ฟอง x 5" case | Excluded when a 30-tray exists; per-egg fallback fine |
| Empty candidates / zero price | Existing guards (`continue`) unchanged |

### Verification Exit Criteria (engineer MUST check all before DONE)

- [ ] RED observed first (A/A2/A3/C/P2 failing output captured)
- [ ] `npx vitest run src/lib/scrapers/__tests__/makro.test.ts` green incl. new block
- [ ] FULL `npx vitest run` green (baseline was 125 tests before this feature)
- [ ] `npx tsc --noEmit` exit 0; `npm run lint` clean on changed files
- [ ] unitSize/unitFactor probe log captured (real values from ≥5 products across ≥3 categories) and detection validated against it
- [ ] `/tmp/makro-before.json` + `/tmp/makro-after.json` back-to-back; full diff table in DONE message; changed-product count + names; fallback-engaged products flagged
- [ ] DB: latest pork-shoulder/makro row is a non-case price (report exact value; expect 118-135 band)
- [ ] `npx tsx --env-file=.env.local scripts/dev/cross-check.ts` exit 0
- [ ] `npx tsx --env-file=.env.local scripts/dev/coverage-audit.ts` → PASS (mapped=179 present≥177)
- [ ] Temp scripts deleted; `git status` shows only makro.ts + makro.test.ts (+ this spec) 
- [ ] No commit — leave for review

### Security check

No new endpoints/deps; substring/regex checks on titles are injection-safe;
no secrets touched. Temp scripts must not log CRON_SECRET/DATABASE_URL.
