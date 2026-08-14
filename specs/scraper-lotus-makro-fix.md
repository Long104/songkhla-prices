# Lotus/Makro pork-neck scraper fix

## Product

### Goal & scope
Restore comparable prices for the canonical product **หมูคอสไลซ์** (pork neck slices) from Lotus's and Makro Pro. Lotus must retain product-card context long enough to capture titles containing Thai/English weights such as `500 กรัม` and `500g`; Makro must search beyond the first result page and recognize common title variants such as `หมูสันคอสไลซ์`, `เอโร่ หมูคอสไลซ์`, and frozen/weight-suffixed forms. Results must continue to emit the canonical mapping key `หมูคอสไลซ์`.

### Out of scope
- No redesign of the scraper architecture or introduction of a new scraping library.
- No UI, schema, migration, or unrelated product-catalog changes.
- No broad fuzzy matching that can map unrelated pork products.

### User stories / acceptance criteria
- As a price-comparison user, I can receive a Lotus pork-neck price when the weight appears in the same product card but more than 200 characters before the price.
- As a price-comparison user, I can receive a Makro pork-neck price when the matching item is on pages 2 or 3 of the pork category.
- Variant titles listed above map to exactly `sourceProductName: "หมูคอสไลซ์"` and do not match unrelated products such as `หมูสามชั้น` or generic `หมูสไลซ์` without neck/sันคอ evidence.
- The cheapest valid normalized candidate is emitted once per source; empty pages, malformed products, unavailable prices, and fetch failures do not crash the whole scraper.

## Engineering Handoff

### Architecture and scaling tradeoffs
Keep the existing per-category Makro fetch and Lotus rendered HTML approach. Fetch at most three Makro pages per category, sequentially with the existing 1.5s rate limit, which bounds request volume and avoids an unbounded crawl. Reuse existing Cheerio, `fetchRenderedHtml`, `fetchJson`, and normalization helpers. Do not add dependencies.

Discarded alternatives: a site-wide Makro search crawl (unbounded/rate-limit risk) and global body-text fuzzy matching for Lotus (cross-card price contamination).

### Target files
- `src/lib/scrapers/lotuss.ts` — extract each price from its nearest product container/full card text; preserve weight-bearing title text in `productTitle`.
- `src/lib/scrapers/makro.ts` — page-aware category fetching (pages 1–3), variant matching, and deduplication.
- `src/lib/scrapers/__tests__/lotuss.test.ts` — deterministic card/container and weight regression tests.
- `src/lib/scrapers/__tests__/makro.test.ts` — mocked pagination and alias matching tests; preserve existing tests unless incompatible.

No seed change is expected because `หมูคอสไลซ์` already exists in the tracked maps. Engineer must verify `src/db/seed.ts` contains matching Lotus and Makro mapping rows; only edit seed if the mapping is genuinely absent.

### Imports and dependencies
Use existing imports only: `cheerio`, `fetchRenderedHtml`, `fetchHtml`, `fetchJson`, scraper types, and `parsePrice`. Use Vitest mocks for network/rendered HTML. No `any`; keep strict TypeScript.

### Domain model and invariants
- Tracked product: canonical `sourceProductName`, here `หมูคอสไลซ์`.
- Source product: raw Lotus/Makro title, including brand, frozen status, and package size.
- Candidate price: source package price with positive value and existing Lotus bounds; Makro normalization remains per kg/unit.
- Invariants: canonical output key must match product-source mappings exactly; one cheapest result per tracked product/source; no cross-card Lotus association; Makro aliases must contain neck/sันคอ semantics; failed category/page fetches are isolated.

### API/data contracts — REVISED after live verification (PM, Aug 14 2026)
**Live evidence**: `GET /_next/data/{buildId}/th/c/meat/pork.json?page=2` and `?page=3` both return `initialSearchResult.page: 1` with the SAME 20 hits (`found: 724`). The category data endpoint **ignores pagination query params**. A private Typesense search API exists (`api.makro.pro` + `/indexes/products/search`, POST, Bearer token) but token acquisition is undocumented — rejected as fragile.

**Revised Makro approach** (supersedes the "pages 1–3" plan):
1. Remove the unconditional `?page=` loop. If a page loop is kept at all, it must verify `initialSearchResult.page === requestedPage` after each fetch and break immediately when the API echoes a different page (self-disabling guard against the proven ignore behavior).
2. Pork-neck matching must use the alias set {`หมูคอ`, `สันคอ`, `คอหมู`} — Thai word order varies ("คอหมูสําเร็จย่าง 1 กก." is a real page-1 product). Generic `หมูสไลซ์` without a neck keyword must not match. "คอหมู" must appear contiguously (so "คอไก่" cannot match).
3. Acceptable limitation (documented): if a product is outside the top-20 of its category, no result is recorded for it (existing graceful-skip behavior).

**Additional live findings (PM, final)**: `?q=`, `?sort=`, and cookie-based query injection are ALL ignored by the `_next/data` endpoint (searchQuery stays `"*"`, found stays 724). The category top-20 listing itself **rotates between fetches** (observed "คอหมูสําเร็จย่าง 1 กก." present in one fetch, absent ~1h later with identical first-3 items). Consequence: Makro pork-neck capture is **intermittent by upstream design** — when the item surfaces in the top-20, the alias match records the per-kg price, and the DB's `onConflictDoNothing` upsert keeps the last-seen price sticky across days it doesn't surface. A live full-run smoke test matched 20 products but not pork neck (item not in top-20 at fetch time); the alias+guard behavior is proven by unit tests with realistic fixtures.

`MakroProductDocument` typing is preserved; missing/invalid hit documents tolerated. `ScrapedPrice` output remains `{ sourceProductName, price, unit, provinceCode, sourceDate, productTitle? }`. Lotus productTitle should contain the selected card's meaningful title/weight text, not an arbitrary global 200-character prefix.

### Step-by-step vertical slices
1. Add failing Lotus tests with multiple product cards where the weight/title is outside the old 200-character window but inside the nearest card; assert pork-neck result, canonical name, price, and weight-bearing `productTitle`. Add a negative unrelated-card case.
2. Implement a small Lotus card-text extraction helper using existing Cheerio structure. Identify the nearest sensible product container around each `฿` node, extract normalized text, match the tracked name within that container, and select the cheapest valid candidate. Keep a conservative fallback only if no product container exists.
3. Add failing Makro tests mocking build detection and category JSON for pages 1–3. Assert page 2/3 products are considered, aliases match, unrelated pork titles do not, duplicate products are harmless, and one cheapest normalized result is emitted.
4. Implement bounded sequential page fetching (maximum 3 pages/category), stopping when a page is empty or has no additional hits where the response provides that signal. Keep build-ID retry behavior and rate limiting. Expand matching only for explicit pork-neck aliases, with Thai sara-am normalization retained.
5. Verify seed mappings and run all scraper tests, lint, and build. Do not modify database schema.

### Component/runtime states
- Loading/network: each source/category/page failure logs structured context and continues; top-level scraper returns collected results or `[]`.
- Empty: no candidate yields no `ScrapedPrice` for that tracked product.
- Success: exactly one cheapest valid candidate per tracked product.
- Malformed edge: missing title, hits, price, or card text is skipped without throwing.

### Edge matrix
| Case | Expected behavior | Test owner |
|---|---|---|
| Lotus title/weight >200 chars before price | nearest card text still captures it | Lotus unit |
| Multiple Lotus cards/prices | only same-card candidates; cheapest valid selected | Lotus unit |
| Lotus no product container | conservative fallback or skip; never cross-card match | Lotus unit |
| Makro pagination param ignored by API | guarded loop breaks on page echo mismatch; no duplicate requests | Makro unit |
| Makro empty page | stop pagination for that category | Makro unit |
| Makro duplicate across pages | output once, cheapest normalized | Makro unit |
| Generic `หมูสไลซ์` / unrelated pork | not mapped to pork neck | Makro unit |
| null/invalid network payload | source/category continues without crash | unit/integration |
| 10k hits or unusually large HTML | bounded pages and linear parsing; no unbounded memory growth | review/test |
| secrets/auth | no API keys logged or committed; Browserless/Makro URLs only | security review |

### Test matrix and executable contracts
- Unit: Lotus card extraction, Thai/English weight retention, canonical name, price bounds, null HTML, negative cross-card match.
- Unit: Makro pagination, explicit aliases, exclusion, normalization, dedupe, empty/malformed pages.
- Integration: scraper orchestration still returns valid `ScrapedPrice[]` under one failed page/category.
- Regression: existing scraper tests pass; `pnpm lint` and `pnpm build` pass.
- Security: tests/review ensure environment secrets are not included in logs or fixtures.
- Performance: pagination is capped at 3 pages/category and retains 1.5s inter-request delay.

Named test cases Engineer must implement/fill:
- `extracts Lotus weight and title from the nearest product card`
- `does not associate a price with a neighboring Lotus card`
- `matches Makro pork-neck alias on page two`
- `matches branded/frozen pork-neck alias and rejects generic sliced pork`
- `stops after an empty Makro page and selects the cheapest candidate`
- `continues when one Makro page payload is malformed`

### Verification Exit Criteria
- [ ] `pnpm vitest run src/lib/scrapers/__tests__/lotuss.test.ts src/lib/scrapers/__tests__/makro.test.ts` passes with all named regression tests.
- [ ] Lotus fixture with title/weight beyond 200 preceding characters produces `sourceProductName === "หมูคอสไลซ์"`, the expected price, and `productTitle` containing its weight.
- [ ] Makro fixture with the only matching alias on page 2 or 3 produces one canonical result; generic sliced-pork fixture produces none.
- [ ] `pnpm lint` exits 0 with no new warnings/errors.
- [ ] `pnpm build` exits 0.
- [ ] `pnpm seed` or a static inspection confirms both source mappings for `หมูคอสไลซ์`; no schema migration is generated.
- [ ] Review confirms no secret values are logged and pagination is hard-capped at three pages/category.

### Domain invariant / production gap
The request does not specify how to distinguish a true pork-neck product from Makro titles that contain only generic `หมูสไลซ์`; broad matching would incorrectly display another cut's price because the canonical mapping would be wrong. This remains an explicit negative-match acceptance criterion and should be escalated if live titles cannot be classified conservatively.
