# Variant metadata and source links

## Product

### Goal & scope
Preserve the exact supermarket candidate selected by each scraper, show whether that reported price is fresh, chilled, or frozen, and let users open the source product page where one exists. This prevents the Makro ฿118/kg frozen เซพแพ็ค price being confused with the ฿139 fresh tray price and makes Lotus's and Makro rows actionable.

### Out of scope
- No changes to the existing product/source mapping or uniqueness key.
- No new source-specific product catalogue, checkout integration, or authentication.
- No fabricated per-product URLs for DIT, EPPO, or Simummuang; those rows may use a verified source landing page only if the product has no individual page.
- No change to the canonical product taxonomy or price comparison math.

### User stories and acceptance criteria
1. As a shopper, I can see the selected source product title beneath the source name, truncated without breaking the row.
2. As a shopper, I can distinguish `สด` (fresh), `แช่แข็ง` (frozen), and `แช่เย็น` (chilled) from the selected title; no badge appears when the title gives no such evidence.
3. As a shopper, I can click `ดูราคาที่ร้าน` / `View at store` for a row with a product URL; it opens a new tab with `rel="noopener noreferrer"` and an accessible label. Rows without a product URL show no product-link affordance.
4. Makro rows persist the picked document title and URL `https://www.makro.pro/th/p/831499-{productId}`; the spot-checked pork-shoulder frozen candidate resolves to its correct page.
5. Lotus's rows persist the picked candidate name and a URL derived from its API `urlKey`; a spot-checked CP/plain candidate resolves successfully. If the current API shape has no `urlKey`, the implementation must use the verified available identifier/URL shape rather than invent a broken link and must record the limitation in tests.
6. DIT, EPPO, and Simummuang persist nullable product metadata and do not display a misleading product link. Their source landing URLs remain source-level metadata, not product URLs.
7. Existing price calculations, unique conflict target, source filtering, accessibility, Thai/English i18n, `cross-check.ts`, and `coverage-audit.ts` remain green.

**Production gap / edge constraint:** A source can return a title containing both pack and temperature terms, or a title can change between scrapes. If the UI treats missing/ambiguous title text as a definitive fresh classification, users can buy the wrong variant; therefore badges must be conservative (only exact known markers) and the raw selected title must remain visible.

## Engineering Handoff

### Architecture and scaling trade-offs
Store immutable scrape metadata on each daily price row rather than joining to a mutable product catalogue. This preserves what the user actually saw and requires no new runtime service. Rejected: a separate source-products table (unnecessary catalogue complexity and migration scope); deriving all links in the UI (loses the exact picked candidate and makes scraper identity ambiguous).

### Target files
- `src/db/schema.ts`: add nullable `productTitle` (`product_title`, varchar 500) and `productUrl` (`product_url`, varchar 500) to `prices`.
- No migration file needed: this repo is greenfield and uses schema-first `drizzle-kit push` (no `drizzle/migrations/` exists, config `out` is unused so far). Apply with `set -a; source .env.local; set +a; pnpm exec drizzle-kit push`. Do not alter the existing unique index.
- `src/lib/scrapers/types.ts`: extend `ScrapedPrice` with optional `productUrl?: string` while retaining `productTitle?: string`.
- `src/lib/scrapers/lotuss.ts`: extend API candidate typing if needed; persist picked candidate name and urlKey-derived URL for both weight and pack emissions.
- `src/lib/scrapers/makro.ts`: persist picked document title and Makro URL from the selected document productId/id.
- `src/lib/scrapers/dit.ts`, `eppo.ts`, `simummuang.ts`: explicitly emit null/undefined product URL; preserve only trustworthy title if available; use no fabricated product URL.
- `src/lib/scrapers/db-writer.ts`: write and conflict-update both metadata fields.
- `src/db/queries.ts`: include `prices.productTitle` and `prices.productUrl` in every product-price select used by the detail page.
- `src/components/price-table.tsx`: render title, conservative variant badge, and external link.
- `src/messages/th.json`, `src/messages/en.json`: add all new labels/accessibility strings.
- `src/lib/scrapers/__tests__/lotuss.test.ts`, `makro.test.ts` (or existing Makro test path): picked-candidate metadata propagation tests; add pure variant-classification tests beside the component/domain utility.
- `src/components/__tests__/price-table.test.tsx` or project-equivalent: link/badge/a11y rendering tests.
- Existing audit scripts only if explicit-column queries require adjustment: `scripts/dev/cross-check.ts`, `scripts/dev/coverage-audit.ts`.
- Existing local backfill/re-scrape script or a minimal one-off under `src/db/`: apply migration, then scrape all sources with `tsx --env-file=.env.local`; do not add a permanent endpoint solely for backfill.

### Imports and dependencies
Use existing Drizzle `varchar`, existing `Badge`, existing `ExternalLink`/Lucide icon convention if present, Next-intl’s existing `useTranslations`, and existing testing stack (Vitest plus current React testing conventions). Do not add dependencies. Use `target="_blank"` and `rel="noopener noreferrer"`; never interpolate untrusted URL into HTML outside normal React attribute escaping.

### Domain model and invariants
- `ScrapedPrice`: source product name, numeric price/unit, province/date, optional raw selected title, optional exact selected product URL.
- `prices.product_title`: nullable raw title of the candidate that produced this row; retained for audit and variant display.
- `prices.product_url`: nullable absolute HTTPS URL to the exact source candidate; null means no per-product page.
- Invariant: metadata must come from the same candidate as price/unit, never from the first search result or a different variant.
- Invariant: existing uniqueness `(product_id, source_id, province_id, source_date, unit)` is unchanged; upsert refreshes metadata on conflict.
- Invariant: links are only shown for non-empty valid absolute HTTPS URLs; source landing pages are not silently presented as product purchase links.
- Variant classification: classify title using explicit Thai markers `แช่แข็ง` => frozen, `แช่เย็น` => chilled, `สด` => fresh, with deterministic precedence frozen > chilled > fresh when multiple markers occur. No marker => no badge. Keep classifier pure and tested.

### Schema and migration
Run `drizzle-kit push` against local Postgres (`set -a; source .env.local; set +a; pnpm exec drizzle-kit push`) after editing `src/db/schema.ts`. Verify with `\d prices` (or information_schema query) that both columns exist, are nullable varchars. Do not drop/recreate the table or change the unique constraint. Existing rows remain null until re-scrape.

### API/data contract
No public API shape change beyond adding nullable fields to the existing price-row query:
```ts
type PriceRow = {
  // existing fields...
  productTitle: string | null;
  productUrl: string | null;
};
```
Scrapers may omit fields (`undefined`) and the writer stores null. URL contract: Makro `https://www.makro.pro/th/p/831499-{productId}`; Lotus's must use the actual verified URL pattern from its `urlKey` and test a 200/redirect response. No auth changes.

### Vertical slices
1. **Persistence slice:** schema + migration + writer + unit test proving insert and conflict-update retain title/url.
2. **Makro slice:** selected document metadata and URL + picked-candidate test with the frozen pork candidate.
3. **Lotus slice:** selected candidate name/urlKey URL for weight and pack + tests proving metadata follows the cheapest selected candidate, not an unselected candidate.
4. **Other source slice:** explicit null product URLs and source-level behavior; existing scraper tests remain green.
5. **UI slice:** query fields, classifier, title/badges/link, i18n, component tests including no-link and ambiguous-title states.
6. **Data slice:** apply migration and full local re-scrape/backfill; verify persisted rows and live links.

### Component states and edge matrix
- Loading/error/empty states: preserve existing behavior; metadata must not cause crashes when null.
- Null/empty title: render source and price only; no badge/link based on title.
- Ambiguous/multiple markers: precedence above; raw title remains visible.
- Missing/malformed/non-HTTPS URL: no link; log/cover with unit test, never throw during rendering.
- Long title: one/two-line truncation using existing responsive styles, with accessible full title via `title` or equivalent.
- 10k rows: classification is O(title length), no network calls during render.
- Offline/dead source link: browser owns navigation; UI remains usable and link has external affordance.
- Concurrent same-day scrape: existing conflict upsert remains idempotent and updates metadata atomically.
- Rate limit/partial source failure: existing scraper error isolation remains; one source cannot erase existing metadata from another source.
- Security: only allow absolute HTTPS source URLs, escape title through React, no `dangerouslySetInnerHTML`, no secrets in title/URL, preserve auth on cron.
- Accessibility: AA contrast, keyboard focus, visible focus, link `aria-label` includes source/product context, icon is decorative, target is at least 44px.

### Test matrix and executable contracts
- Unit: `classifyVariant(null/empty/fresh/frozen/chilled/multiple)` returns exact enum/null.
- Unit: Lotus weight and pack output title/url belong to the selected cheapest candidate.
- Unit: Makro output title/url belong to `pickRepresentative` result and URL contains the selected product id.
- Unit: db writer insert and conflict update pass both fields; unique target unchanged.
- Component: title truncation/null state, each badge in Thai/English, valid link attributes, malformed/non-HTTPS/no URL hidden, accessible label.
- Integration: query returns nullable metadata; migration applies; existing audits pass.
- Regression: all existing scraper, normalization, and price-table tests.
- Security: URL allowlist rejects `javascript:`, relative, and HTTP URLs; title renders as text.
- Performance: classification/render with 10,000 synthetic rows completes without fetch/network calls.

Test stubs Engineer must fill with named cases:
```ts
describe("classifyVariant", () => {
  it("returns frozen for แช่แข็ง");
  it("returns chilled for แช่เย็น");
  it("returns fresh for สด");
  it("returns null for missing or ambiguous marker");
});
describe("scraped candidate metadata", () => {
  it("Lotus emits metadata from selected weight candidate");
  it("Lotus emits metadata from selected pack candidate");
  it("Makro emits metadata from selected representative");
});
describe("price row source link", () => {
  it("opens valid HTTPS product URL in a noopener new tab");
  it("hides link for null or unsafe URL");
});
```

### Backfill and live verification
After migration, run the existing all-source scrape path (cron handler locally or direct script with `tsx --env-file=.env.local`) against `songkhla_prices_test` only when tests are intended; production/local app DB uses `.env.local`. Verify SQL rows for Makro and Lotus contain non-null title/url, then run the app and spot-check:
- Makro pork shoulder frozen row link resolves HTTP 200/redirect and page title includes เซพแพ็ค/frozen candidate.
- Lotus CP/plain row link resolves HTTP 200/redirect and page title matches the selected candidate.
- DIT/EPPO/Simummuang have no per-product link.

### Verification Exit Criteria
- [ ] `pnpm vitest run` passes with all existing and new tests, including named metadata/classifier/link contracts.
- [ ] `pnpm exec tsc --noEmit` exits 0 with strict typing and no `any`.
- [ ] `set -a; source .env.local; set +a; pnpm exec drizzle-kit push` applies cleanly and an information_schema query confirms nullable `product_title`/`product_url` on `prices`.
- [ ] `pnpm exec tsx --env-file=.env.local scripts/dev/cross-check.ts` exits 0.
- [ ] `pnpm exec tsx --env-file=.env.local scripts/dev/coverage-audit.ts` exits 0.
- [ ] Local re-scrape completes without unhandled source failure and SQL confirms selected Makro/Lotus rows have matching title and URL metadata.
- [ ] Browser price page shows title under source, correct fresh/frozen/chilled badge, and no console errors; null-title rows remain readable.
- [ ] Makro pork-shoulder URL and Lotus CP/plain URL each return HTTP 200 or a redirect to the correct product page; link opens a new tab with `rel="noopener noreferrer"`.
- [ ] Rendered link is keyboard-focusable, has a contextual `aria-label`, has at least a 44px hit target, and visible text/icon contrast meets AA.
- [ ] `git diff` contains no changes to the existing uniqueness columns/index and no secrets.

### Verification commands and logs
- Build: `pnpm build`
- Tests: `pnpm vitest run`
- Types: `pnpm exec tsc --noEmit`
- Scrape/backfill: existing cron/direct script with `tsx --env-file=.env.local`; server log `/tmp/songkhla-dev.log` when using `nohup npm run dev`.
- Reviewer must inspect migration, all scraper selection paths, query/UI contract, security, tests, and `git diff` before approval.
