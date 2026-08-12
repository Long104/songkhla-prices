# Spec: Real Scrapers Pipeline & DB Cleanup

## Section 1: Product

### Goal & Scope
Wipe all legacy mock price data (`oae`, `taladthai`, `simummuang`) from the database, expand the Makro real scraper to track meat and vegetables alongside seafood/rice/oil/eggs, and update system seeds and scraper infrastructure so only real price data populates the application.

### Out of Scope
- Playwright / Puppeteer automation (banned).
- Mock or synthetic data generation (banned — DB contains ONLY real scraped prices).
- Auth-bypass hacking or token stealing for gated APIs.
- UI redesign or layout changes.

### User Stories / Acceptance Criteria
1. **DB Cleanup**: All price records for mock sources `oae`, `taladthai`, and `simummuang` are truncated. The `oae` and `taladthai` source entries are deleted.
2. **5 Active Sources**: Source list in `sources` table contains exactly 5 records: `dit`, `eppo`, `makro`, `lotuss`, `simummuang`.
3. **Makro Expansion**: `makro.ts` tracks meat (หมูสับ, หมูสามชั้น, ไก่สด, เนื้อวัว) and vegetables (ผักคะน้า, ผักบุ้ง, พริกขี้หนู, มะเขือเทศ, แตงกวา, ถั่วฝักยาว) by probing category endpoints `fresh-food/meat-poultry` and `fresh-food/vegetables`.
4. **Clean Scrapers for Lotus's & Si Mum Muang**: Scrapers `lotuss.ts` and `simummuang.ts` attempt real API fetches with clean header structures and return `[]` gracefully on HTTP 401/403/503 without throwing or crashing.
5. **Idempotent Seed**: `npm run seed` runs cleanly, inserts/updates the 5 sources and all required `product_source_mappings`.
6. **Live Data Verified**: Running scrapers populates `prices` table with real price rows for `dit`, `eppo`, and `makro`. Zero mock rows exist.

---

## Section 2: Engineering Handoff

### Target Files
1. `src/db/seed.ts` — Update sources list, remove oae/taladthai, update mappings for expanded Makro products and new sources.
2. `src/lib/scrapers/makro.ts` — Expand `PRODUCT_CATEGORY_MAP` with meat and vegetable products and their category slugs (`fresh-food/meat-poultry`, `fresh-food/vegetables`).
3. `src/lib/scrapers/simummuang.ts` — Replace mock array with real HTTP fetch attempt to `https://api.simummuangmarket.com/api/pricing` returning `[]` on auth fail.
4. `src/lib/scrapers/lotuss.ts` — Create new scraper hitting `https://api-o2o.lotuss.com/lotuss-mobile-bff/product/v2/products` returning `[]` on auth fail.
5. `src/lib/scrapers/index.ts` — Update scraper array to include `lotussScraper` and remove `oaeScraper`/`taladthaiScraper`.

### Imports & Dependencies
- `src/lib/scrapers/types.ts` (`Scraper`, `ScrapedPrice`, `fetchJson`, `fetchHtml`)
- Drizzle ORM (`eq`, `inArray`, `getDb`)
- `cheerio` (if HTML parsing needed)

### Schema & DB Updates
- Delete price rows where `source_id` in (`oae`, `taladthai`, `simummuang`).
- Delete sources `oae`, `taladthai`.
- Keep `simummuang` (type: `wholesale`, priceType: `wholesale`).
- Add `lotuss` (type: `supermarket`, priceType: `retail`).

### Exact Product Mappings to Add in `seed.ts` for Makro
```typescript
const makroExpandedMappings: MappingSeed[] = [
  // existing seafood & dry goods...
  // NEW Meat
  { sourceSlug: "makro", productSlug: "pork-mince", sourceProductName: "หมูสับ" },
  { sourceSlug: "makro", productSlug: "pork-belly", sourceProductName: "หมูสามชั้น" },
  { sourceSlug: "makro", productSlug: "chicken-whole", sourceProductName: "ไก่สด" },
  { sourceSlug: "makro", productSlug: "beef", sourceProductName: "เนื้อวัว" },
  // NEW Vegetables
  { sourceSlug: "makro", productSlug: "chinese-kale", sourceProductName: "ผักคะน้า" },
  { sourceSlug: "makro", productSlug: "morning-glory", sourceProductName: "ผักบุ้ง" },
  { sourceSlug: "makro", productSlug: "chili", sourceProductName: "พริกขี้หนู" },
  { sourceSlug: "makro", productSlug: "tomato", sourceProductName: "มะเขือเทศ" },
  { sourceSlug: "makro", productSlug: "cucumber", sourceProductName: "แตงกวา" },
  { sourceSlug: "makro", productSlug: "long-bean", sourceProductName: "ถั่วฝักยาว" },
];
```

### Component / System States
- **Scraper Success**: Returns array of `ScrapedPrice` objects with real normalized prices.
- **Scraper Auth Failure (Lotus's/Si Mum Muang)**: Logs info message, catches 401/403/503 error, returns `[]`. Cron continues without error.
- **Database Absence**: `getDb()` returns `null`, seed script exits gracefully.

### Edge Cases
- **Sara-am normalization**: Makro titles use precomposed/decomposed Thai sara-am (`น+้+ํ+า` vs `น+้+ำ`). Keep `nfc()` normalization helper in `makro.ts`.
- **Duplicate price entries**: `prices_product_source_province_date_idx` unique index uses `onConflictDoNothing()`.

### Verification Exit Criteria
- [ ] `npm run build` passes with zero type or lint errors — `npm run build`
- [ ] `npm run seed` populates DB cleanly with 5 sources — `npm run seed`
- [ ] DB contains ZERO mock rows from oae/taladthai — query DB `SELECT count(*) FROM prices p JOIN sources s ON p.source_id=s.id WHERE s.slug IN ('oae', 'taladthai')` equals 0
- [ ] Real Makro scraper fetches meat + vegetables — test via `npx vitest run src/lib/scrapers/__tests__/makro.test.ts`
- [ ] Scraper runner populates database with real prices — execute cron or run scrapers directly and verify price rows > 0 for dit, eppo, makro
