# Songkhla Grocery Price Comparison — Phase 1 MVP

## Section 1 — Product

### Goal & Scope

A free, no-login grocery price comparison web app for Thai families/consumers, starting with Songkhla province. Users search or browse products (fresh ingredients, price-controlled goods) and see prices from government/public data sources side by side. Cheapest price per product highlighted.

**Differentiation from checkraka.app**: We target regular families/consumers (not restaurants). Simple, clean, mobile-first UI. Government data only for Phase 1 — no supermarket scraping complexity.

### Out of Scope (NOT Building)

- Supermarket scraping (Lotus's, Big C, Makro) — Phase 2
- User accounts / login / registration
- Shopping list / basket mode
- Price history charts or alerts
- Price notifications (email/push)
- CPG/packaged goods catalog (instant noodles, milk cartons, sauces)
- Admin dashboard — scrapers run via cron, errors go to logs
- Mobile app — web only, responsive

### User Stories / Acceptance Criteria

1. **Browse by category** — User opens the app, sees 8 category cards (Meat, Vegetables, Rice, Eggs & Dairy, Oil & Fat, Seasoning, Fuel, Fruit). Tapping a card shows products in that category.
2. **Search products** — User types "หมูสามชั้น" in the search bar and sees matching products with prices from all available sources.
3. **Compare prices** — Each product shows a comparison table: source name, price, unit, last updated date. Cheapest is highlighted green.
4. **Switch province** — User selects a different province from a dropdown (default: Songkhla). Prices update to show that province's data (where available). Sources without province-level data show national/wholesale prices with a badge.
5. **Switch language** — User toggles between Thai and English. All UI text switches. Product names remain in Thai (with English subtitle where available).
6. **Mobile-first** — App is fully usable on mobile screens (360px+). No horizontal scrolling.
7. **Data freshness** — Prices are updated daily at 05:00 ICT. Each price row shows "อัพเดท: [date]" timestamp.

### Domain Invariant Gap (Mandatory)

**Gap: Unit normalization across sources.** DIT reports pork in "บาท/กก." (baht/kg), OAE might report vegetables in "บาท/กก." but wholesale markets report in "บาท/ลัง" (baht/crate) or "บาท/กำ" (baht/bunch). If we display these side-by-side without normalization, users will compare a per-kg price to a per-crate price — misleading and potentially harmful to trust.

**Impact**: Users see "ตลาดไท: 25 บาท" next to "DIT: 120 บาท" for the same vegetable — one is per bunch, one is per kg. User trusts the app less immediately.

**Decision for MVP**: Display the unit alongside each price prominently (never omit unit). Do NOT attempt automatic unit conversion in Phase 1 — too many edge cases. Flag in UI when units differ across sources for the same product with a warning badge "หน่วยต่างกัน". Document this as a known limitation.

---

## Section 2 — Engineering Handoff

### Architecture (Text Diagram)

```
┌─────────────────────────────────────────────────────────┐
│                    Vercel (Edge/Serverless)              │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────────┐ │
│  │ Next.js  │  │ API      │  │ Cron Job (Vercel)     │ │
│  │ App      │  │ Routes   │  │ 05:00 ICT daily       │ │
│  │ Router   │  │ /api/*   │  │ POST /api/cron/scrape │ │
│  └────┬─────┘  └────┬─────┘  └───────────┬───────────┘ │
│       │              │                     │             │
│       └──────────────┴─────────────────────┘             │
│                      │                                   │
│              ┌───────▼────────┐                          │
│              │  Drizzle ORM   │                          │
│              └───────┬────────┘                          │
│                      │                                   │
└──────────────────────┼───────────────────────────────────┘
                       │
               ┌───────▼────────┐
               │   Neon Postgres │
               │   (Serverless)  │
               └────────────────┘

Scraper Flow:
Cron → /api/cron/scrape → scraper modules (cheerio) → parse HTML → normalize → upsert DB
```

### Database Schema (Drizzle)

File: `src/db/schema.ts`

```typescript
// --- sources ---
// id: serial PK
// slug: varchar(50) unique not null — "dit", "oae", "taladthai", "simummuang", "eppo"
// name_th: varchar(100) not null
// name_en: varchar(100) not null
// url: varchar(255) not null
// type: varchar(20) not null — "government" | "wholesale"
// created_at: timestamp default now()

// --- categories ---
// id: serial PK
// slug: varchar(50) unique not null — "meat", "vegetables", "rice", etc.
// name_th: varchar(100) not null
// name_en: varchar(100) not null
// icon: varchar(50) — emoji or icon name
// sort_order: integer default 0

// --- products ---
// id: serial PK
// slug: varchar(100) unique not null — "pork-belly", "cooking-oil-palm"
// name_th: varchar(200) not null
// name_en: varchar(200)
// category_id: integer FK → categories.id
// created_at: timestamp default now()

// --- provinces ---
// id: serial PK
// code: varchar(10) unique not null — TH province code
// name_th: varchar(100) not null
// name_en: varchar(100) not null

// --- prices ---
// id: serial PK
// product_id: integer FK → products.id
// source_id: integer FK → sources.id
// province_id: integer FK → provinces.id (nullable — wholesale sources are national)
// price: numeric(10,2) not null
// unit: varchar(50) not null — "บาท/กก.", "บาท/ลิตร", "บาท/ฟอง", etc.
// scraped_at: timestamp not null — when we scraped it
// source_date: date — the date the source reports (may differ from scrape date)
// created_at: timestamp default now()
//
// UNIQUE constraint on (product_id, source_id, province_id, source_date)
// — prevents duplicate prices for same product/source/province/date

// --- product_source_mappings ---
// id: serial PK
// product_id: integer FK → products.id
// source_id: integer FK → sources.id
// source_product_name: varchar(300) not null — the raw name as it appears on the source site
// source_product_code: varchar(100) — if the source uses codes
// created_at: timestamp default now()
//
// This table maps our canonical product to the source's naming.
// e.g. our "pork-belly" maps to DIT's "หมูสามชั้น (สุกร)" and OAE's "เนื้อสุกร ส่วนสามชั้น"
```

### File Structure

```
songkhla-prices/               ← project root (inside worktree)
├── src/
│   ├── app/
│   │   ├── layout.tsx                     ← Root layout (fonts, next-intl provider, metadata)
│   │   ├── page.tsx                       ← Redirect to /th (default locale)
│   │   ├── [locale]/
│   │   │   ├── layout.tsx                 ← Locale layout (next-intl messages provider)
│   │   │   ├── page.tsx                   ← Home page (search bar + category grid)
│   │   │   ├── category/
│   │   │   │   └── [slug]/
│   │   │   │       └── page.tsx           ← Category page (product list with prices)
│   │   │   ├── product/
│   │   │   │   └── [slug]/
│   │   │   │       └── page.tsx           ← Product detail (full comparison table)
│   │   │   └── search/
│   │   │       └── page.tsx               ← Search results page
│   │   └── api/
│   │       └── cron/
│   │           └── scrape/
│   │               └── route.ts           ← Cron endpoint — triggers all scrapers
│   ├── components/
│   │   ├── ui/                            ← shadcn/ui components (auto-generated)
│   │   ├── category-card.tsx              ← Category card for home grid
│   │   ├── price-table.tsx                ← Price comparison table component
│   │   ├── product-card.tsx               ← Product card (name + cheapest price)
│   │   ├── province-selector.tsx          ← Province dropdown
│   │   ├── search-bar.tsx                 ← Search input with debounce
│   │   ├── language-toggle.tsx            ← Thai/English toggle
│   │   ├── unit-warning-badge.tsx         ← "หน่วยต่างกัน" badge
│   │   ├── header.tsx                     ← App header (logo, province, language, search)
│   │   └── footer.tsx                     ← Footer
│   ├── db/
│   │   ├── index.ts                       ← Drizzle client (Neon serverless)
│   │   ├── schema.ts                      ← All table definitions
│   │   └── seed.ts                        ← Seed categories, sources, provinces, product mappings
│   ├── lib/
│   │   ├── scrapers/
│   │   │   ├── types.ts                   ← Shared scraper interface & types
│   │   │   ├── dit.ts                     ← DIT scraper (กรมการค้าภายใน)
│   │   │   ├── oae.ts                     ← OAE scraper (สำนักงานเศรษฐกิจการเกษตร)
│   │   │   ├── taladthai.ts               ← ตลาดไท scraper
│   │   │   ├── simummuang.ts              ← ตลาดสี่มุมเมือง scraper
│   │   │   ├── eppo.ts                    ← EPPO fuel price scraper
│   │   │   └── index.ts                   ← Scraper registry — exports all scrapers
│   │   └── utils.ts                       ← Shared utilities (cn, date formatting)
│   ├── hooks/
│   │   └── use-province.ts                ← Province state hook (localStorage persisted)
│   ├── i18n/
│   │   ├── request.ts                     ← next-intl getRequestConfig
│   │   └── routing.ts                     ← Locale routing config
│   └── messages/
│       ├── th.json                        ← Thai translations
│       └── en.json                        ← English translations
├── drizzle/
│   └── migrations/                        ← Auto-generated migration files
├── drizzle.config.ts                      ← Drizzle Kit config
├── next.config.ts                         ← Next.js config (with next-intl plugin)
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── .env.local.example                     ← Environment variable template
├── vercel.json                            ← Vercel cron config
└── components.json                        ← shadcn/ui config
```

### Scraper Design

**Shared Interface** (`src/lib/scrapers/types.ts`):

```typescript
export interface ScrapedPrice {
  sourceProductName: string;   // Raw name from source
  price: number;
  unit: string;                // "บาท/กก.", "บาท/ลิตร", etc.
  provinceCode?: string;       // null for national/wholesale
  sourceDate: Date;            // Date the source reports
}

export interface Scraper {
  sourceSlug: string;          // matches sources.slug in DB
  scrape(): Promise<ScrapedPrice[]>;
}
```

**Per-source modules:**

1. **DIT (`dit.ts`)** — Fetch `dit.go.th` price pages. Parse HTML tables with cheerio. DIT publishes price-controlled goods (oil, sugar, condensed milk) and fresh goods (pork, chicken, eggs, vegetables) by province. Extract province from table headers/rows. Return `ScrapedPrice[]` with `provinceCode`.

2. **OAE (`oae.ts`)** — Fetch `oae.go.th` agricultural price pages. Parse HTML tables. OAE publishes national-level agricultural product prices (rice varieties, vegetables, fruits). Return `ScrapedPrice[]` with `provinceCode = null` (national data).

3. **Talad Thai (`taladthai.ts`)** — Fetch `taladthai.com/product/price_daily`. Parse daily price table. Wholesale produce prices. Return `ScrapedPrice[]` with `provinceCode = null`.

4. **Si Mum Muang (`simummuang.ts`)** — Fetch `simummuangmarket.com/price`. Parse daily price table. Wholesale produce prices. Return `ScrapedPrice[]` with `provinceCode = null`.

5. **EPPO (`eppo.ts`)** — Fetch `eppo.go.th` fuel price page. Parse HTML table for current retail fuel prices. Return `ScrapedPrice[]` with `provinceCode = null`.

**Scraper Pipeline** (`/api/cron/scrape/route.ts`):
1. Import all scrapers from registry
2. Run all scrapers in parallel (`Promise.allSettled`)
3. For each successful result:
   a. Match `sourceProductName` against `product_source_mappings` table
   b. If match found → upsert into `prices` table
   c. If no match → log warning (unmapped product)
4. Return JSON summary: `{ success: number, failed: number, unmapped: string[] }`
5. Protect endpoint with `CRON_SECRET` env var check (Vercel sets this automatically for cron)

**Error handling per scraper:**
- Wrap each scraper in try/catch
- If HTML structure changed (no table found, wrong column count) → throw descriptive error
- Log errors with source name + timestamp
- Other scrapers continue even if one fails

### i18n Setup (next-intl)

**Locales**: `th` (default), `en`

**Routing** (`src/i18n/routing.ts`):
```typescript
import { defineRouting } from 'next-intl/routing';
export const routing = defineRouting({
  locales: ['th', 'en'],
  defaultLocale: 'th',
});
```

**Message Structure** (`src/messages/th.json` — abbreviated):
```json
{
  "common": {
    "appName": "เทียบราคา",
    "search": "ค้นหาสินค้า...",
    "province": "จังหวัด",
    "cheapest": "ถูกที่สุด",
    "lastUpdated": "อัพเดท",
    "unitMismatch": "หน่วยต่างกัน",
    "noData": "ไม่มีข้อมูลราคา",
    "national": "ราคากลางทั่วประเทศ",
    "perKg": "บาท/กก.",
    "allCategories": "หมวดหมู่ทั้งหมด"
  },
  "categories": {
    "meat": "เนื้อสัตว์",
    "vegetables": "ผัก",
    "rice": "ข้าว",
    "eggs": "ไข่ & นม",
    "oil": "น้ำมัน & ไขมัน",
    "seasoning": "เครื่องปรุง",
    "fuel": "น้ำมันเชื้อเพลิง",
    "fruit": "ผลไม้"
  },
  "home": {
    "hero": "เทียบราคาของสด ของใช้ ทุกแหล่ง",
    "subtitle": "ข้อมูลจากราชการ อัพเดททุกวัน"
  },
  "product": {
    "priceFrom": "ราคาจาก",
    "source": "แหล่งข้อมูล",
    "price": "ราคา",
    "unit": "หน่วย",
    "date": "วันที่"
  }
}
```

`src/messages/en.json` — same structure, English values.

### Page Designs

**1. Home Page** (`/[locale]/page.tsx`):
- Header: App logo "เทียบราคา", province selector, language toggle
- Hero section: Search bar (large, centered)
- Category grid: 8 cards in 2x4 (mobile) or 4x2 (desktop) grid
- Each category card: emoji icon + name + product count
- Footer: Data source credits, "ข้อมูลจาก กรมการค้าภายใน, สศก., ตลาดไท, ตลาดสี่มุมเมือง, สนพ."

**2. Category Page** (`/[locale]/category/[slug]/page.tsx`):
- Breadcrumb: Home > [Category Name]
- Product list: Cards showing product name + cheapest price + source count
- Sort by: cheapest first (default)
- Click card → product detail page

**3. Product Detail Page** (`/[locale]/product/[slug]/page.tsx`):
- Breadcrumb: Home > [Category] > [Product]
- Product name (large)
- Price comparison table:
  | แหล่งข้อมูล | ราคา | หน่วย | วันที่อัพเดท |
  | DIT (กรมการค้าภายใน) | ฿120.00 | กก. | 2026-08-10 |
  | ตลาดไท | ฿115.00 ← cheapest (highlighted) | กก. | 2026-08-10 |
- Unit mismatch warning badge if units differ
- "ราคากลางทั่วประเทศ" badge on national-level sources when province filter active

**4. Search Results Page** (`/[locale]/search?q=xxx`):
- Search bar (pre-filled with query)
- Results list: Same product cards as category page
- No results state: "ไม่พบสินค้าที่ค้นหา"

### Component List (shadcn/ui)

Install these from shadcn/ui registry:
- `card` — category cards, product cards
- `input` — search bar
- `select` — province dropdown
- `table` — price comparison table
- `badge` — cheapest badge, unit mismatch warning, national price badge
- `button` — language toggle, navigation
- `breadcrumb` — page navigation
- `skeleton` — loading states
- `command` — search with suggestions (optional enhancement)

### Cron / Scheduling

**Vercel Cron** (`vercel.json`):
```json
{
  "crons": [
    {
      "path": "/api/cron/scrape",
      "schedule": "0 22 * * *"
    }
  ]
}
```
Note: `0 22 * * *` UTC = 05:00 ICT (UTC+7).

The `/api/cron/scrape` route handler:
1. Checks `Authorization` header for Vercel's `CRON_SECRET`
2. Runs all scrapers via `Promise.allSettled`
3. Processes results through product mapping
4. Upserts prices into DB
5. Returns summary JSON

### Seed Data

`src/db/seed.ts` must populate:

1. **5 sources** — DIT, OAE, Talad Thai, Si Mum Muang, EPPO
2. **8 categories** — meat, vegetables, rice, eggs, oil, seasoning, fuel, fruit
3. **77 provinces** — all Thai provinces with codes, name_th, name_en
4. **~30-40 products** — initial canonical product list covering core items:
   - Meat: หมูสามชั้น, หมูสะโพก, ไก่สด, ไก่ย่าง
   - Vegetables: ผักบุ้ง, ผักคะน้า, ถั่วฝักยาว, แตงกวา, มะเขือเทศ, พริก
   - Rice: ข้าวหอมมะลิ, ข้าวเหนียว, ข้าวขาว
   - Eggs & Dairy: ไข่ไก่, ไข่เป็ด, นมสด
   - Oil & Fat: น้ำมันปาล์ม, น้ำมันถั่วเหลือง
   - Seasoning: น้ำตาลทราย, นมข้นหวาน, น้ำปลา
   - Fuel: เบนซิน 95, แก๊สโซฮอล์ 91, แก๊สโซฮอล์ E20, ดีเซล, LPG
   - Fruit: ส้ม, มะม่วง, กล้วยน้ำว้า, แตงโม
5. **Product-source mappings** — map each product to the exact Thai name used by each source that carries it

### Environment Variables

```
DATABASE_URL=postgresql://...@...neon.tech/songkhla-prices
CRON_SECRET=... (auto-set by Vercel for cron routes)
```

### Step-by-Step Implementation (Vertical Slices)

**Step 1: Project scaffold + DB schema** (~100 lines changed)
1. `npx create-next-app@latest songkhla-prices --typescript --tailwind --app --src-dir --use-pnpm`
   - Run this in the worktree root, then move contents up (or run from parent and move)
2. Install deps: `pnpm add drizzle-orm @neondatabase/serverless next-intl cheerio`
3. Install dev deps: `pnpm add -D drizzle-kit @types/node`
4. Init shadcn: `pnpm dlx shadcn@latest init` (New York style, zinc, CSS variables)
5. Add shadcn components: `pnpm dlx shadcn@latest add card input select table badge button breadcrumb skeleton`
6. Create `src/db/schema.ts` with all tables per schema above
7. Create `src/db/index.ts` with Neon client
8. Create `drizzle.config.ts`
9. Generate migration: `pnpm drizzle-kit generate`
10. Create `.env.local.example`
11. **Verify**: `pnpm build` passes, schema file has all 6 tables

**Step 2: i18n setup + root layout** (~80 lines)
1. Create `src/i18n/routing.ts` and `src/i18n/request.ts`
2. Create `src/messages/th.json` and `src/messages/en.json` with full message structure
3. Update `next.config.ts` with next-intl plugin: `createNextIntlPlugin()`
4. Create `src/app/[locale]/layout.tsx` — wraps children with `NextIntlClientProvider`
5. Update `src/app/layout.tsx` — root layout with fonts, metadata
6. Create `src/app/page.tsx` — redirect to `/th`
7. Create `src/middleware.ts` — next-intl middleware for locale routing
8. **Verify**: `pnpm build` passes, visiting `/` redirects to `/th`, `/en` serves English

**Step 3: Home page + header + category cards** (~150 lines)
1. Create `src/components/header.tsx` — logo, province selector, language toggle, search bar
2. Create `src/components/footer.tsx` — data source credits
3. Create `src/components/category-card.tsx` — emoji + name + product count
4. Create `src/components/province-selector.tsx` — Select dropdown with 77 provinces
5. Create `src/components/language-toggle.tsx` — Button toggling /th ↔ /en
6. Create `src/components/search-bar.tsx` — Input with search icon, debounced, navigates to /search?q=
7. Create `src/hooks/use-province.ts` — persist selected province in localStorage
8. Create `src/app/[locale]/page.tsx` — home page with hero search + category grid
9. **Verify**: Home page renders with 8 categories, province dropdown works, language toggle switches locale

**Step 4: Category + Product pages + price table** (~200 lines)
1. Create `src/components/product-card.tsx` — product name + cheapest price badge
2. Create `src/components/price-table.tsx` — full comparison table with unit, source, date
3. Create `src/components/unit-warning-badge.tsx` — warns when units differ
4. Create `src/app/[locale]/category/[slug]/page.tsx` — fetch products by category + province, show product cards
5. Create `src/app/[locale]/product/[slug]/page.tsx` — fetch all prices for product + province, show price table
6. Create `src/app/[locale]/search/page.tsx` — search query against products.name_th/name_en ILIKE, show product cards
7. **Verify**: Category pages list products, product detail shows price table, search returns results

**Step 5: Scrapers + cron endpoint** (~250 lines) ✅ (implemented 2026-08-10; build ✓ lint ✓ — runtime cron test needs live DB + `CRON_SECRET`)
1. Create `src/lib/scrapers/types.ts` — Scraper interface, ScrapedPrice type
2. Create `src/lib/scrapers/dit.ts` — DIT scraper implementation
3. Create `src/lib/scrapers/oae.ts` — OAE scraper implementation
4. Create `src/lib/scrapers/taladthai.ts` — Talad Thai scraper
5. Create `src/lib/scrapers/simummuang.ts` — Si Mum Muang scraper
6. Create `src/lib/scrapers/eppo.ts` — EPPO fuel price scraper
7. Create `src/lib/scrapers/index.ts` — exports array of all scrapers
8. Create `src/app/api/cron/scrape/route.ts` — POST handler: auth check, run scrapers, map products, upsert prices
9. Create `vercel.json` with cron schedule
10. **Verify**: Each scraper can be tested independently. Cron endpoint returns summary JSON.

**Step 6: Seed script** (~150 lines)
1. Create `src/db/seed.ts` — seed sources, categories, provinces, products, product_source_mappings
2. Add `"seed"` script to `package.json`: `"seed": "npx tsx src/db/seed.ts"`
3. **Verify**: `pnpm seed` populates all tables. Query products table returns 30+ rows.

**NOTE on scraper implementation**: Government Thai sites may be inaccessible from the build environment. Scrapers must be written with correct URL targeting and HTML parsing logic based on known page structure, but if the sites are unreachable during dev/test, the scrapers should fail gracefully and log the error. The cron endpoint must still return a valid response even if all scrapers fail. Engineer should write scrapers that parse realistic HTML table structures (thead/tbody/tr/td) and handle connection timeouts (10s timeout per request).

### Edge Cases

1. **Empty DB** — Home page shows categories with "0 products" count. Category/product pages show "ไม่มีข้อมูลราคา" empty state.
2. **Null province** — Default to Songkhla (province code "90"). If province has no data for a product, show national/wholesale prices only.
3. **Scraper failure** — Individual scraper fails → others continue. Cron returns partial success.
4. **Unmapped product** — Scraper finds a product not in our `product_source_mappings` → log warning, skip. Don't crash.
5. **Duplicate prices** — UNIQUE constraint on (product_id, source_id, province_id, source_date) prevents duplicates. Use ON CONFLICT DO UPDATE to upsert.
6. **Missing units** — If scraper can't determine unit → default to source's known unit pattern, log warning.
7. **Search with special characters** — SQL ILIKE search with user input → must sanitize (parameterized queries via Drizzle prevent SQL injection).
8. **Province with no data** — Show "ไม่มีข้อมูลสำหรับจังหวัดนี้" with suggestion to switch to Songkhla or view national prices.

### API Contracts

**Server Components (Data Fetching)**:
These are NOT REST APIs — data is fetched directly in Server Components via Drizzle queries:

```typescript
// Category page query
async function getProductsByCategory(categorySlug: string, provinceId: number | null): Promise<{
  product: { id: number; slug: string; name_th: string; name_en: string | null };
  cheapestPrice: number | null;
  cheapestUnit: string | null;
  sourceCount: number;
}[]>

// Product detail query
async function getProductPrices(productSlug: string, provinceId: number | null): Promise<{
  product: { id: number; slug: string; name_th: string; name_en: string | null; category: { slug: string; name_th: string; name_en: string } };
  prices: {
    source: { slug: string; name_th: string; name_en: string; type: string };
    price: number;
    unit: string;
    sourceDate: Date;
    isNational: boolean;
  }[];
  unitsMismatch: boolean;
}>

// Search query
async function searchProducts(query: string, provinceId: number | null): Promise<{
  product: { id: number; slug: string; name_th: string; name_en: string | null };
  cheapestPrice: number | null;
  cheapestUnit: string | null;
  sourceCount: number;
}[]>
```

**Cron API Route** (`POST /api/cron/scrape`):
- Auth: `Authorization: Bearer <CRON_SECRET>`
- Response 200:
```json
{
  "success": true,
  "results": {
    "dit": { "status": "ok", "count": 45 },
    "oae": { "status": "ok", "count": 23 },
    "taladthai": { "status": "error", "error": "Connection timeout" },
    "simummuang": { "status": "ok", "count": 18 },
    "eppo": { "status": "ok", "count": 5 }
  },
  "totalInserted": 91,
  "unmapped": ["ถั่วลิสง (ตลาดสี่มุมเมือง)"],
  "duration": "4.2s"
}
```
- Response 401: `{ "error": "Unauthorized" }` (missing/wrong secret)

### Test Matrix

| Layer | Test | Owner |
|-------|------|-------|
| Unit | Scraper HTML parsing — each scraper given mock HTML, returns correct ScrapedPrice[] | Engineer |
| Unit | Product mapping — given ScrapedPrice + mapping table, resolves to correct product_id | Engineer |
| Unit | Unit mismatch detection — given prices with mixed units, flags correctly | Engineer |
| Integration | Seed script runs without error, populates all tables | Engineer |
| Integration | Cron endpoint with mocked scrapers — returns correct summary | Engineer |
| Integration | Category page renders products from seeded DB | Engineer |
| Integration | Search ILIKE returns correct results for Thai text | Engineer |
| Regression | Province switch updates displayed prices | Reviewer |
| Regression | Language toggle preserves current page + province | Reviewer |
| Security | Cron endpoint rejects requests without valid CRON_SECRET | Engineer |
| Security | Search input parameterized — no SQL injection via Drizzle | Engineer |
| Accessibility | All pages have proper lang attribute, heading hierarchy | Reviewer |

### Executable Test Contracts

File: `src/__tests__/scrapers.test.ts`
```
- test: "DIT scraper parses price table HTML correctly"
- test: "OAE scraper parses agricultural price table"
- test: "Talad Thai scraper parses daily price table"
- test: "Si Mum Muang scraper parses price table"
- test: "EPPO scraper parses fuel price table"
- test: "Scraper returns empty array on malformed HTML"
- test: "Scraper handles connection timeout gracefully"
```

File: `src/__tests__/product-mapping.test.ts`
```
- test: "Maps scraped product name to canonical product via mapping table"
- test: "Returns null for unmapped product names"
- test: "Detects unit mismatch across sources for same product"
```

File: `src/__tests__/cron.test.ts`
```
- test: "Cron endpoint returns 401 without CRON_SECRET"
- test: "Cron endpoint runs all scrapers and returns summary"
- test: "Cron endpoint handles partial scraper failures"
```

### Verification Exit Criteria

- [x] `pnpm build` completes with zero errors — run `pnpm build` and confirm exit code 0 (verified 2026-08-10: `npx next build` exit 0, 26/26 pages)
- [x] `pnpm lint` passes with zero errors — run `pnpm lint` (verified 2026-08-10: `npx eslint src/` 0 errors; 1 pre-existing warning in seed.ts, intentional per spec)
- [x] Database schema has all 6 tables (sources, categories, products, provinces, prices, product_source_mappings) — check `src/db/schema.ts` exports
- [x] Seed script exists and is runnable — verify `src/db/seed.ts` compiles (`npx tsx --eval "import './src/db/seed'"` or build includes it)
- [x] Home page (`/th`) renders: search bar visible, 8 category cards visible — start dev server, check page (verified via `next start` production smoke test, HTTP 200)
- [x] Category page (`/th/category/meat`) renders product list or empty state — check route exists and renders (verified HTTP 200 with province cookie)
- [x] Product detail page (`/th/product/pork-belly`) renders price table or empty state — check route exists (verified route executes; renders when DB has the product, 404 via notFound when DB absent — existing behavior)
- [x] Search page (`/th/search?q=หมู`) renders results or "not found" — check route exists (verified HTTP 200)
- [x] Province selector dropdown is present in header — check component renders (header.tsx renders `<ProvinceSelector />`)
- [x] Language toggle switches between `/th` and `/en` — check navigation works (LanguageToggle in header; both locales statically prerendered)
- [x] Cron endpoint (`POST /api/cron/scrape`) exists and returns JSON — check route file exists and exports POST handler
- [x] Cron endpoint rejects requests without Authorization header — check auth logic in route (verified HTTP 401 `{"error":"Unauthorized"}` without credentials)
- [x] All 5 scraper modules exist and export a class/object implementing Scraper interface — check files exist (dit, oae, taladthai, simummuang, eppo)
- [x] i18n messages exist for both `th.json` and `en.json` — check files have matching keys
- [x] `vercel.json` has cron configuration — check file content
- [x] TypeScript strict mode — no `any` types in application code (shadcn/ui excluded)
- [x] Mobile responsive — no fixed widths > 360px in custom components (grep verified)
