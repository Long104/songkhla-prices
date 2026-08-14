# Lotus's JSON API Rewrite + Per-Scraper Cron Writes

Branch: `feat/lotus-json-api-rewrite` (worktree)
Spec owner: PM · Status: ready for engineering

---

## Section 1 — Product

### Goal & scope

Lotus's has **zero rows** in the `prices` table while makro/dit/eppo/simummuang write fine. Two deliverables:

1. **Rewrite `src/lib/scrapers/lotuss.ts`** — replace sequential Browserless HTML rendering (~60 terms × 35s = 10–35 min, free-tier quota exhaustion → null → empty) with a fast client-side JSON search API called via plain `fetchJson`, mirroring the Makro scraper pattern.
2. **Harden `src/app/api/cron/scrape/route.ts`** — write each scraper's results to DB **as soon as that scraper settles**, so one slow/dead scraper can never starve the others' writes or hold the whole serverless function hostage.

### Root cause (verified against live DB + code)

- `lotuss.ts` renders every search page through Browserless sequentially; cron's `Promise.allSettled` (route line 26) waits for ALL scrapers before any DB write → serverless timeout kills the run mid-wait → nothing writes; Browserless quota exhaustion returns null per product → empty array even on completion.
- lotuss.com is Next.js; `_next/data/<buildId>/th/search/<term>.json` returns only SSP shell — products come from a **separate client-side XHR** that must be discovered (Phase 0 below). `api.lotuss.com` direct guesses return 403.

### Out of scope

- NOT touching makro/dit/eppo/simummuang scraper internals.
- NOT changing UI, DB schema, `normalizeAtIngest`, or `product_source_mappings`.
- NOT backfilling historical Lotus prices.
- NOT deploying/configuring Vercel cron schedule (though we must not break it).

### Acceptance criteria

1. Local live run of the rewritten Lotus scraper writes > 0 rows to the local Postgres `prices` table for source `lotuss` — **actual count reported**.
2. Lotus scrape wall time < 5 min locally (vs current 10–35 min).
3. Cron route: if scraper B rejects or hangs, scraper A's rows are still written (proven by unit test).
4. `sourceProductName` values remain EXACTLY the current `LOTUS_TRACKED_PRODUCTS` keys (they join against `product_source_mappings.source_product_name`).
5. `productTitle` carries the full API product title including weight text (e.g. "โลตัส ซี่โครงหมู 250 กรัม") — `normalizeAtIngest` extracts weight from it.
6. All tests pass, `pnpm build` passes, strict TS with zero `any` in changed files.

### ⚠ Known production risk (open question — NOT locally verifiable)

The JSON API will be discovered/verified from a local machine (Thai IP, real browser session). The Vercel cron function egresses from a different region with no cookies. If the API geo-blocks or requires session-bound tokens, **local verification passes while production still writes zero Lotus rows** — the original bug recurring silently. Mitigations (mandatory): replicate the browser's exact request headers (User-Agent, any `x-api-key`-style headers found in app chunks); prefer the stateless variant of the endpoint (no cookie dependency) if more than one exists. After deploy, first cron run must be checked: `results.lotuss` in the cron response JSON. Flagged for the Entrepreneur — cannot be closed from this worktree.

---

## Section 2 — Engineering Handoff

### 0. Context: existing code contracts (verbatim from codebase)

```ts
// src/lib/scrapers/types.ts
export interface ScrapedPrice {
  sourceProductName: string;   // EXACT canonical key — joins product_source_mappings
  price: number;
  unit: string;                // Lotus uses "บาท/ชิ้น"
  provinceCode: string | null; // Lotus uses null
  sourceDate: Date;
  productTitle?: string;       // full title WITH weight text — normalizeAtIngest parses it
}
export interface Scraper { sourceSlug: string; scrape(): Promise<ScrapedPrice[]>; }
// shared helpers in types.ts (already exist — reuse, do NOT duplicate):
//   fetchJson<T>(url, init), fetchHtml(url, init), parsePrice(raw)
```

- Makro template (`src/lib/scrapers/makro.ts`): `detectBuildId()` regex `/"buildId":"([^"]+)"/` on homepage HTML; category JSON via `_next/data`; `fetchWithBuildIdRetry()` retries once when buildId goes stale; rate-limit-friendly delays; per-product try/catch isolation.
- Cron write path (current, route lines 26–101): `Promise.allSettled(scrapers.map(s => s.scrape()))` → per-scraper loop → per-row: resolve `sources` by slug → `product_source_mappings` by (sourceId, sourceProductName) → optional `provinces` by code → `normalizeAtIngest(price, unit, productTitle ?? sourceProductName)` → `db.insert(prices).onConflictDoNothing()`. Unique index `prices_product_source_province_date_idx (productId, sourceId, provinceId, sourceDate)` makes re-runs idempotent.
- Deps: pnpm, `tsx` (used by `seed` script), Vitest 4, `cheerio` (still used? see step 4), drizzle-orm 0.45.x. **No `p-limit`** — do not add it; hand-roll chunked concurrency if needed.

### 1. Target files

| File | Action |
|---|---|
| `src/lib/scrapers/lotuss.ts` | **Rewrite** (JSON API). Keep `LOTUS_TRACKED_PRODUCTS` dict byte-identical. |
| `src/lib/scrapers/__tests__/lotuss.test.ts` | **Rewrite** — mock `fetchJson` from `../types` (copy makro.test.ts mocking pattern). |
| `src/app/api/cron/scrape/route.ts` | **Refactor** — extract per-scraper write helper + settle-as-you-go. |
| `src/app/api/cron/scrape/__tests__/route.test.ts` | **New** — resilience tests (mock `@/lib/scrapers` + `@/db`). |
| `scripts/run-lotuss.ts` | **New** (one-off live verification; small, may be deleted before commit if you prefer — but it's useful, keep it). |
| `src/lib/scrapers/browserless.ts` | **Delete IF** no importer remains after rewrite (`rg -l "fetchRenderedHtml|browserless"` → only lotuss.ts imports it today). Zero-legacy mandate applies. If deleted, remove `BROWSERLESS_API_KEY` references from code (leave `.env.local` alone). |

### 2. Phase 0 — Discover the Lotus's search JSON API (MANDATORY first step)

Use the `agent-browser` skill (or `ego-browser`) to capture the real XHR:

1. Open `https://www.lotuss.com/th/search/ซี่โครงหมู` with network monitoring; wait for products to render.
2. Inspect XHR/fetch responses; find the JSON payload containing the product list (fields with Thai product name + price). Check lazy-loaded app chunks (`_next/static/chunks/app/...`) for hardcoded API host/key — framework chunks are already ruled out.
3. Record and hardcode as constants in the new `lotuss.ts`:
   - full URL template (host, path, query params: search term, page, pageSize, sort)
   - HTTP method + **every required header** (User-Agent, accept, `x-api-key`/similar). Replicate them in every `fetchJson` call via `init.headers`.
   - response JSON shape: exact path to the product array + to each product's title and price; pagination mechanism (offset/page param, `hasMore`/totalPages field).
   - whether cookies/session are required (if yes: prefer a stateless variant or note it — see production risk above).
4. **Prove statelessness**: reproduce the call with plain `curl` (headers only, no cookies) and get product JSON back. If curl 403s, add browser headers; if still blocked, capture the exact failing status and move to the Fallback (§6).

### 3. Phase 1 — Rewrite `lotuss.ts` (TDD: write failing tests first)

Structure (mirror makro.ts conventions):

```ts
// constants
const LOTUS_SEARCH_API = "<discovered URL template>"; // from Phase 0
const LOTUS_HEADERS: Record<string, string> = { /* captured from Phase 0 */ };
const MIN_PRICE = 5; const MAX_PRICE = 2000; // keep
const SEARCH_CONCURRENCY = 5;      // hand-rolled chunking — no new deps
const PER_TERM_TIMEOUT_MS = 15_000;
const MAX_PAGES_PER_TERM = 2;      // cheapest-match across fetched pages

// typed response model — NO any. Define interfaces for the API response
// (e.g. LotusSearchResponse { products: LotusApiProduct[]; totalPages: number }
//  with title: string and price fields as observed in Phase 0).

async function searchTerm(term: string): Promise<LotusApiProduct[]> {
  // fetch page 1 (..up to MAX_PAGES_PER_TERM if a next page exists)
  // per-request AbortSignal.timeout(PER_TERM_TIMEOUT_MS) + retry-once on 429 after 2s
}

export const lotussScraper: Scraper = {
  sourceSlug: "lotuss",
  async scrape() {
    // chunk Object.entries(LOTUS_TRACKED_PRODUCTS) into groups of SEARCH_CONCURRENCY,
    // await each chunk (Promise.all), collect; per-term try/catch → log + continue
    // per term: candidates = products where title.includes(trackedName)
    //           && MIN_PRICE <= price <= MAX_PRICE
    // cheapest = min by price; skip term if none
    // push { sourceProductName: trackedName, price: cheapest.price, unit: "บาท/ชิ้น",
    //        provinceCode: null, sourceDate: new Date(),
    //        productTitle: <full API title string, unmodified> }
  },
};
```

Preserved invariants (same semantics as current file, lines 170–187):
- match filter is `title.includes(trackedName)` (was `containerText.includes`)
- cheapest-match-per-product (was `reduce((a,b) => a.price < b.price ? a : b)`)
- price sanity bounds 5–2000 บาท
- `sourceProductName` = dictionary key, never the API title

**Test contracts** — `src/lib/scrapers/__tests__/lotuss.test.ts` (rewrite; mock `fetchJson` from `../types`):

1. `returns cheapest matching product per tracked term` — mock 3 products for "ซี่โครงหมู", two matching (89, 129), one non-matching name → expect price 89.
2. `productTitle is the full API title with weight text` — mock title `"โลตัส ซี่โครงหมู 250 กรัม"` → `productTitle` equals it exactly.
3. `sourceProductName equals dictionary key, not the API title`.
4. `skips products outside 5–2000 price bounds`.
5. `skips term when API returns empty product list` (no throw, no row).
6. `continues other terms when one term's fetch rejects` (error isolation).
7. `fetches page 2 when page 1 signals more pages` (assert fetchJson called with page param).
8. `sends captured browser headers in every request` (assert init.headers).

### 4. Phase 2 — Cron route per-scraper writes

Refactor `src/app/api/cron/scrape/route.ts`:

1. Extract the per-scraper body (current lines 32–101) into a module-level helper:
   ```ts
   async function writeScraperResults(
     scraper: Scraper, scrapedPrices: ScrapedPrice[],
     ctx: { results: Record<string, {status: string; count?: number; error?: string}>;
            unmapped: string[] },
   ): Promise<number>  // returns rows inserted-attempted count
   ```
   Keep ALL existing write semantics identical (source/mapping/province lookups, `normalizeAtIngest`, `onConflictDoNothing`, `console.error` tags).
2. Replace lines 26–101 with settle-as-you-go:
   ```ts
   const PER_SCRAPER_TIMEOUT_MS = 240_000; // one hung scraper can't hold the response
   await Promise.allSettled(scrapers.map(async (scraper) => {
     try {
       const scraped = await withTimeout(scraper.scrape(), PER_SCRAPER_TIMEOUT_MS,
                                         `${scraper.sourceSlug} timed out`);
       const inserted = await writeScraperResults(scraper, scraped, ctx);
       totalInserted += inserted;   // safe: single-threaded event loop
     } catch (err) {
       ctx.results[scraper.sourceSlug] = { status: "error",
         error: err instanceof Error ? err.message : "Unknown error" };
     }
   }));
   ```
   with a small local `withTimeout(promise, ms, msg)` using `AbortSignal.timeout` semantics or a manual timer+reject (hand-rolled, no deps). DB writes now happen the moment each scraper settles — a later timeout/kill cannot un-write them.
3. Response shape stays exactly `{ success, results, totalInserted, unmapped, duration }`.

**Test contracts** — `src/app/api/cron/scrape/__tests__/route.test.ts` (new):

1. `returns 401 without Bearer CRON_SECRET`.
2. `writes scraper A rows when scraper B rejects` — mock `@/lib/scrapers` with A fulfilled / B rejected; mock `@/db` `getDb` with in-memory stubs (`select` returns source/mapping/province fixtures, `insert` records calls) → assert insert called for A's rows and `results.b.status === "error"`, `results.a.status === "ok"`.
3. `times out a hung scraper but still writes the fast one` — A resolves immediately, B never settles; fake timers advance past `PER_SCRAPER_TIMEOUT_MS` → A's insert recorded, `results.b.error` contains "timed out", POST resolves.
4. `collects unmapped product names` — mapping lookup returns empty → name lands in `unmapped`, no insert.

### 5. Phase 3 — Live local verification (MANDATORY, evidence required)

1. `scripts/run-lotuss.ts`: loads env (`dotenv`-free — run via `export $(grep -v '^#' .env.local | xargs) && npx tsx scripts/run-lotuss.ts`), calls `lotussScraper.scrape()`, then calls `writeScraperResults(lotussScraper, prices, ctx)` — reuse the extracted helper, do NOT duplicate insert logic — prints `{ scraped: n, inserted: m, durationMs }`.
2. Verify in local Postgres:
   ```sql
   SELECT count(*) FROM prices p JOIN sources s ON s.id = p.source_id
   WHERE s.slug = 'lotuss' AND p.source_date = current_date;
   ```
3. Record the count + wall time in the PR/commit message or worklog. Target: > 0 rows, < 5 min.

### 6. Fallback plan (ONLY if Phase 0 API discovery genuinely fails)

Keep Browserless path but: chunked concurrency 4 (hand-rolled), `timeout: 15_000`, drop `networkidle2` → `domcontentloaded` + `waitForTimeout: 1500`. Cron changes (Phase 2) still ship unchanged — they alone fix the "one scraper starves all" production failure. If fallback is taken, mark this clearly in the final report — the < 5 min criterion becomes best-effort.

### 7. Edge matrix

| Edge | Expected behavior |
|---|---|
| API returns 200 with empty product array | term skipped, no row, no throw |
| One term's fetch rejects/403s | logged, other terms continue (per-term isolation) |
| API 429 | single retry after 2s; second failure → term skipped |
| No products match `trackedName` | term skipped silently |
| Product price outside 5–2000 | filtered out before cheapest-match |
| Page 1 full, page 2 request fails | keep page-1 results (partial > none) |
| Scraper hangs > 240s in cron | marked error; other scrapers already written; response still returns |
| Cron re-run same day | `onConflictDoNothing` — zero duplicates (existing unique index) |
| DB unavailable (`getDb()` null) | that scraper marked error; others unaffected |
| 88 tracked terms | chunked ×5 concurrency; all terms attempted; runtime < 5 min |

### 8. Verification Exit Criteria (Engineer: loop until ALL checked)

- [ ] `pnpm vitest run` — all green, including new `lotuss.test.ts` (≥8 cases) and `route.test.ts` (≥4 cases) — command output pasted in report
- [ ] `pnpm build` exits 0
- [ ] `npx tsc --noEmit` — zero errors; `rg -n '\bany\b' src/lib/scrapers/lotuss.ts src/app/api/cron/scrape/route.ts` shows no type `any`
- [ ] `pnpm lint` (or `npm run lint`) passes on changed files
- [ ] `rg -n "fetchRenderedHtml|browserless" src/` → zero matches in `lotuss.ts` (file deleted if truly unimported)
- [ ] Live run executed per §5: SQL count for `lotuss` + today > 0 — **exact count and wall time reported**
- [ ] Cron unit test output shows scraper-A-writes-despite-scraper-B-failure case passing
- [ ] `git diff` contains NO changes to makro/dit/eppo/simummuang scraper logic

Same criterion failing twice → STOP and report BLOCKED with the exact error.
