# Songkhla Prices (ราคาสินค้าสงขลา)

> Consumer price tracking, commodity comparison, and fuel monitoring platform for Songkhla province, Thailand.

---

## Overview

**Songkhla Prices** is a fullstack web platform that aggregates, normalizes, and tracks prices for essential consumer goods, meats, vegetables, and fuel across Songkhla province. It collects data from government sources (DIT, EPPO) and major commercial markets/retailers (Lotus's, Makro, Simummuang), providing historical trends and localized comparisons.

### Key Highlights

- **Automated Web Scraper Pipeline** — Daily collection of consumer prices from DIT, EPPO, Lotus's, Makro, and Simummuang via Vercel Cron.
- **Multilingual Support (i18n)** — Full internationalization support for Thai (`th`) and English (`en`) using `next-intl`.
- **Hybrid Database Architecture** — PostgreSQL via Drizzle ORM (`pg` for local development, `@neondatabase/serverless` for production) with dynamic build-time fallback.

---

## Tech Stack

| Component | Technology |
| :--- | :--- |
| **Framework** | Next.js 15 (App Router) |
| **UI & Styling** | React 19, Tailwind CSS v4, Lucide Icons |
| **Localization** | `next-intl` (Thai & English) |
| **Database & ORM** | PostgreSQL, Drizzle ORM, `@neondatabase/serverless` |
| **Testing** | Vitest |
| **Scraper** | Cheerio |

---

## Quick Start

### Prerequisites

| Tool | Version |
| :--- | :--- |
| **Node.js** | v20+ |
| **pnpm** | v11.5.3 |
| **PostgreSQL** | Local instance or Neon Serverless |

### Installation

```bash
# Clone the repository
git clone https://github.com/pantorn/songkhla-prices.git
cd songkhla-prices

# Install dependencies
pnpm install

# Configure environment variables
cp .env.example .env.local
```

### Environment Configuration

Required values in `.env.local`:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/songkhla_prices"
CRON_SECRET="your_cron_secret"
```

### Database Seeding & Migration

```bash
# Seed initial canonical data (provinces, categories, sources)
pnpm seed

# Generate/Push Drizzle migrations
pnpm db:generate
pnpm db:push
```

### Development & Testing

```bash
# Start development server
pnpm dev

# Run ESLint audit
pnpm lint

# Run Vitest suite
pnpm test
```

---

## Project Structure

```
songkhla-prices/
├── src/
│   ├── app/                ← Next.js App Router ([locale] i18n & API routes)
│   ├── components/         ← Reusable UI components
│   ├── db/                 ← Drizzle schema, DB client, and seed scripts
│   ├── i18n/               ← i18n configuration & translation dictionaries
│   ├── lib/                ← Core utility modules & web scrapers
│   └── middleware.ts       ← next-intl routing middleware
├── tests/                  ← Vitest integration & unit test suite
├── vitest.config.mts       ← Test runner configuration
└── package.json            ← Dependencies and scripts
```

---

## License

This project is open-source under the MIT License.
