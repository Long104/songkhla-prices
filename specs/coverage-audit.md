# Coverage audit and silent-gap remediation

## Product

### Goal & scope
Create a permanent `scripts/dev/coverage-audit.ts` pre-deploy check that detects mapped products whose latest persisted price is absent or too old, not merely mismatched existing rows. Run it against every seeded source mapping, investigate gaps with bounded live probes, and fix confirmed matcher/API/mapping defects with regression tests. Keep changes limited to coverage auditing, scraper matcher/search fallback behavior, mapping corrections, tests, and worklog usage documentation.

### Out of scope
- No UI redesign or unrelated scraper refactors.
- No new data sources or database migrations unless implementation proves one unavoidable.
- No attempt to guarantee inventory availability beyond the bounded audit/probe window.

### Acceptance criteria
- The audit examines every product-source mapping and reports a machine-readable, human-readable matrix with `PRESENT`, `STALE`, or `MISSING`, plus source products returned by scrapers/live data that have no mapping.
- It uses latest rows grouped by product/source/unit; default recency is 48 hours and source-specific cadence is configurable so DIT/EPPO are not falsely reported for their normal daily/weekly schedules.
- It exits nonzero when any unexplained MISSING or STALE item remains, and zero when all gaps are explained/resolved.
- Every confirmed matcher/API/mapping fix has a failing regression test first, and no strict-TypeScript `any` is introduced under `src/`.
- The audit is run after fixes, the authenticated cron scrape is triggered, and 2–3 product pages are spot-checked for newly written rows and <=300-second cache behavior.
- Vitest, TypeScript, lint/build, and reviewer checks pass; usage is appended to `.worklog.md`.

### Domain invariant / production gap
Mappings do not contain a unit, while the requested matrix is product×source×unit. If expected units are inferred inconsistently from historical rows, a newly introduced unit can be silently omitted or falsely marked missing because the database schema cannot distinguish “no expected unit yet” from “scraper failed”; the implementation must document and deterministically handle this case (open decision: infer units from seeded source conventions or observed source output).

## Engineering Handoff

### Architecture and scaling tradeoffs
- Chosen: one bounded Node/tsx script using Drizzle joins and grouped latest-price SQL, with source cadence configuration and optional live-probe reporting. This is YAGNI for 202 mappings and avoids loading all price history.
- Rejected: changing mapping schema to add units, because it expands scope and requires migration for an audit whose primary contract can operate on existing rows.
- Rejected: invoking every external scraper as the audit's core operation, because a pre-deploy check must be deterministic and not fail due to third-party outages; probes are bounded diagnostics.

### Target files
- `scripts/dev/coverage-audit.ts` — new executable audit; keep under 300 lines if possible.
- `scripts/dev/__tests__/coverage-audit.test.ts` or existing scripts test location — pure classification/format/recency tests.
- `src/lib/scrapers/lotuss.ts`, `src/lib/scrapers/makro.ts`, or other scraper files only when live diagnosis confirms a gap; minimal matcher/search edits.
- Corresponding `src/lib/scrapers/__tests__/*.test.ts` — regression tests before implementation.
- `src/db/seed.ts` only for confirmed wrong mappings.
- `.worklog.md` — command and outcome.

### Imports and dependencies
Use existing `getDb` from `@/db`, Drizzle schema exports `prices`, `products`, `sources`, `productSourceMappings`, and `and/eq/desc` or SQL aggregation helpers from `drizzle-orm`. Load `.env.local` through the existing invocation convention: `pnpm exec tsx --env-file=.env.local scripts/dev/coverage-audit.ts`. Do not add dependencies.

### Data model and invariants
`productSourceMappings(productId, sourceId, sourceProductName, sourceProductCode)` maps canonical products to source names; it has no unit. `prices(productId, sourceId, provinceId, unit, sourceDate, scrapedAt, price)` stores observations. Latest means highest `scrapedAt` (with `sourceDate` as deterministic secondary ordering) for each product/source/unit, considering Songkhla/null province consistently with existing price ingestion. A mapping is never marked PRESENT merely because another product/source has a row.

### Audit contract
CLI options/env: `RECENCY_WINDOW_HOURS` default `48`; `--json` optional; source overrides are constants (DIT/EPPO cadence based on documented observed cadence, never silently broad enough to hide supermarket gaps). Output header must include `mapped=<n> present=<n> stale=<n> missing=<n> unmapped=<n>`, one matrix row per mapping and deterministic unit set, and a final summary line. Exit `1` for unresolved stale/missing, `0` otherwise; DB unavailable is exit `1`. A mapping with no historical unit must be reported explicitly rather than silently skipped. Unmapped scraped products must include source, raw name, unit, and date.

### Vertical slices
1. Add pure status classifier, cadence config, deterministic formatter, and executable test contracts; make tests fail first.
2. Implement DB query and CLI output/exit behavior; test with isolated fixtures or mocked query boundary.
3. Run audit; for each gap perform <=15 minutes live probing. Classify matcher bug, rotation/API miss, not sold/mapping error, or normal government cadence. For confirmed fixes, add failing scraper test then minimal implementation and rerun tests.
4. Trigger `POST http://localhost:3000/api/cron/scrape` with `Authorization: Bearer $CRON_SECRET`, rerun audit, and spot-check product pages.

### Edge matrix
| Case | Expected behavior | Owner |
|---|---|---|
| Empty DB / no unit history | explicit unknown-unit/missing diagnostic and nonzero exit | audit |
| Null province | use same province scope as ingestion; never mix incompatible scopes | audit |
| Stale source row | STALE using source-specific cutoff | audit |
| Duplicate same-day/unit rows | latest scrapedAt wins | audit |
| 10k+ historical rows | grouped SQL/latest query, bounded memory | audit |
| External probe timeout/rate limit | classify as probe-inconclusive, do not erase audit gap | probe |
| Unmapped source product | report separately, never fail mapping lookup silently | audit |
| Cron 401/500 | record exact response and fail verification | integration |

### Test matrix / executable contracts
- Unit: `classifyCoverage` returns PRESENT at/inside cutoff, STALE outside cutoff, MISSING with no row; source override precedence; unknown unit is explicit.
- Unit: formatter counts and ordering are deterministic; nonzero exit for unresolved gaps.
- Integration: seeded test DB returns one latest row per product/source/unit and detects absent rows; unmapped output is present.
- Regression: each confirmed alias/search fix reproduces the source title and asserts a candidate/price is accepted.
- Security: no secrets printed; malformed env/DB errors produce nonzero exit; SQL uses Drizzle parameters, not string interpolation.
- Performance: audit completes within 10 seconds on 202 mappings plus 10k price rows in test DB.
- E2E: cron returns 2xx with bearer secret, audit reaches zero unexplained gaps, and 2–3 product pages show current rows with cache age <=300s.

### Verification Exit Criteria
- [ ] `pnpm exec vitest run` passes, including audit and scraper regression tests.
- [ ] `pnpm exec tsc --noEmit` passes with no new `any` in `src/`.
- [ ] `pnpm exec eslint src/` passes.
- [ ] `pnpm exec tsx --env-file=.env.local scripts/dev/coverage-audit.ts` prints mapped/present/stale/missing/unmapped counts and exits according to unresolved gaps.
- [ ] Final audit output has `missing=0` and no unexplained `stale` entries, or the report lists each best-effort probe classification explicitly.
- [ ] Authenticated cron scrape returns HTTP 2xx and writes/refreshes rows.
- [ ] Two or three product pages render the refreshed rows; browser console has no errors and cache age is <=300 seconds.
- [ ] `git diff` contains only scoped audit/matcher/mapping/tests/worklog changes and reviewer returns APPROVED.

### Verification commands and logs
`pnpm exec vitest run`; `pnpm exec tsc --noEmit`; `pnpm exec eslint src/`; audit command above; cron response saved/observed from `/tmp/songkhla-dev.log` if server restart is required. Commit only on `fix/coverage-audit`; do not push or merge.
