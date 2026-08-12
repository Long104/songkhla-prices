import type { Scraper, ScrapedPrice } from "./types";

/**
 * Lotus's (โลตัส) — BLOCKED scraper.
 *
 * Lotus's prices are loaded entirely client-side via RBAC-gated BFF API calls
 * that return 503 from server-side HTTP. The BFF endpoint
 * (api-o2o.lotuss.com/lotuss-mobile-bff/product/v2/products) requires browser
 * session cookies + Cloudflare clearance tokens. The Next.js SSR pages return
 * `productDetailSSR: {}` with price = ฿0.00. The Strapi backend
 * (lotuss-strapi-backend-th.prod.o2o.it-lotus.com) times out from server-side.
 *
 * Without Playwright/browser automation (excluded by project constraint), real
 * price data cannot be obtained. This scraper returns [] gracefully.
 *
 * Verified blocked: 2026-08-12 via direct curl testing.
 */
export const lotussScraper: Scraper = {
  sourceSlug: "lotuss",
  async scrape(): Promise<ScrapedPrice[]> {
    console.log(
      "[Lotus's] Prices require browser session (BFF returns 503 server-side). Returning empty."
    );
    return [];
  },
};
