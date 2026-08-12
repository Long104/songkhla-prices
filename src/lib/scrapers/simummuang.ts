import * as cheerio from "cheerio";
import type { Scraper, ScrapedPrice } from "./types";
import { fetchHtml, fetchJson, parsePrice } from "./types";

/**
 * Si Mum Muang (ตลาดสี่มุมเมือง wholesale market) — REAL scraper attempt.
 *
 * REAL source status: simummuangmarket.com is a Next.js SPA whose price data
 * loads client-side from api.simummuangmarket.com, which returns 401 "Access
 * token not found" without an account. The public /pricing page renders
 * "แสดงสินค้า 0 จาก 0 รายการ" (0 items) for anonymous visitors.
 *
 * This scraper first attempts the JSON API, falls back to parsing any price
 * table on the public /pricing HTML page, and — because anonymous access is
 * not possible — logs and returns [] without fabricating data.
 */

const SIMUMMUANG_API = "https://api.simummuangmarket.com/api/pricing";
const SIMUMMUANG_PRICING_PAGE = "https://www.simummuangmarket.com/pricing";

interface SimummuangApiItem {
  /** Fields are defensive — the exact API shape is only visible behind auth. */
  name?: unknown;
  productName?: unknown;
  product_name?: unknown;
  price?: unknown;
  priceValue?: unknown;
  unit?: unknown;
}

/**
 * Parse a value from the API response into a price number (or null).
 * Accepts numbers and numeric strings ("85.50", "85,50").
 */
function toPrice(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  if (typeof v === "string") {
    const num = parsePrice(v.replace(/,/g, ""));
    return num > 0 ? num : null;
  }
  return null;
}

/** Parse the API response (array, `{ data: [...] }` or `{ items: [...] }`). */
function parseApiPrices(payload: unknown): ScrapedPrice[] {
  const items: SimummuangApiItem[] = [];
  if (Array.isArray(payload)) {
    items.push(...(payload as SimummuangApiItem[]));
  } else if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    const data = obj.data ?? obj.items ?? obj.result;
    if (Array.isArray(data)) items.push(...(data as SimummuangApiItem[]));
  }

  const results: ScrapedPrice[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const name = String(item.name ?? item.productName ?? item.product_name ?? "").trim();
    const price = toPrice(item.price ?? item.priceValue);
    if (!name || price === null) continue;
    const unit = String(item.unit ?? "").trim();
    results.push({
      sourceProductName: name,
      price,
      unit: unit.startsWith("บาท") ? unit : unit ? `บาท/${unit}` : "บาท/กก.",
      provinceCode: null, // wholesale reference (market at Pathum Thani)
      sourceDate: new Date(),
    });
  }
  return results;
}

/**
 * Parse price tables from the public /pricing HTML page. Best-effort: finds
 * `<table>` rows whose cells contain a Thai name + a numeric price, with the
 * unit taken from a "บาท/..." cell when present.
 */
function parseHtmlPrices(html: string): ScrapedPrice[] {
  const $ = cheerio.load(html);
  const results: ScrapedPrice[] = [];

  $("table").each((_, table) => {
    for (const rowEl of $(table).find("tbody tr, tr").toArray()) {
      const cells = $(rowEl).find("td, th");
      if (cells.length < 2) continue;

      let name = "";
      let price: number | null = null;
      let unit = "บาท/กก.";
      for (const cellEl of cells.toArray()) {
        const text = $(cellEl).text().trim();
        if (!text) continue;
        const num = parsePrice(text.replace(/,/g, ""));
        if (/บาท/.test(text)) {
          // Prefer the last "บาท/..." cell as the unit column.
          unit = text;
        } else if (num > 0 && !/[กก.ล.ฟองขวดกระป๋องตัวชิ้น]/.test(text)) {
          // A bare numeric cell (price column), not a unit-tagged size.
          if (price === null) price = num;
        } else if (!name && /[\u0E00-\u0E7F]/.test(text) && num === 0) {
          // First Thai-text cell without an embedded number is the name.
          name = text;
        }
      }

      // Fallback: name may sit in the first cell alongside a number (e.g. "หมูสับ 85.00").
      if (!name) {
        const firstText = $(cells[0]).text().trim();
        if (/[\u0E00-\u0E7F]/.test(firstText)) name = firstText;
      }

      if (name && price !== null && price > 0) {
        results.push({
          sourceProductName: name,
          price,
          unit: unit.startsWith("บาท") ? unit : `บาท/${unit}`,
          provinceCode: null,
          sourceDate: new Date(),
        });
      }
    }
  });

  return results;
}

export const simummuangScraper: Scraper = {
  sourceSlug: "simummuang",
  async scrape(): Promise<ScrapedPrice[]> {
    // Attempt 1: JSON API.
    try {
      const payload = await fetchJson<unknown>(SIMUMMUANG_API);
      const prices = parseApiPrices(payload);
      if (prices.length > 0) return prices;
    } catch {
      // 401/404/etc — fall through to the HTML page.
    }

    // Attempt 2: public pricing page (renders 0 rows anonymously today).
    try {
      const html = await fetchHtml(SIMUMMUANG_PRICING_PAGE);
      const prices = parseHtmlPrices(html);
      if (prices.length > 0) return prices;
    } catch {
      // fall through — nothing anonymous to scrape
    }

    console.log("[SimumMuang] API requires authentication, returning empty");
    return [];
  },
};
