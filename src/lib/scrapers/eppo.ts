import { fetchJson, parsePrice, type Scraper, type ScrapedPrice } from "./types";

/**
 * EPPO (Energy Policy and Planning Office) — REAL data source.
 * https://www.eppo.go.th/wp-json/oil-api/v1/oil-prices
 *
 * Public WordPress REST API returning retail fuel prices per brand. We use PTT
 * (the reference retailer with the widest coverage). LPG comes from the
 * /lpg-prices endpoint (controlled 15kg cylinder price).
 */
const OIL_API = "https://www.eppo.go.th/wp-json/oil-api/v1/oil-prices";
const LPG_API = "https://www.eppo.go.th/wp-json/oil-api/v1/lpg-prices";

interface OilApiResponse {
  status: string;
  last_updated: string;
  data: {
    ptt: Record<string, string>;
  };
}

interface LpgApiResponse {
  status: string;
  last_updated: string;
  data: {
    ptt: Record<string, string>;
  };
}

/** Products tracked from the oil-prices endpoint (PTT retail, ฿/litre). */
const OIL_PRODUCTS: Array<{ name: string; key: string }> = [
  { name: "เบนซิน 95", key: "oil_ptt_gl95" },
  { name: "แก๊สโซฮอล์ 91", key: "oil_ptt_gh91" },
  { name: "แก๊สโซฮอล์ E20", key: "oil_ptt_e20" },
  { name: "ดีเซล", key: "oil_ptt_ds" },
];

/** Parse "2026-08-06" into a Date; falls back to now when missing. */
function parseApiDate(raw: string | undefined): Date {
  if (!raw) return new Date();
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return new Date();
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export const eppoScraper: Scraper = {
  sourceSlug: "eppo",
  async scrape(): Promise<ScrapedPrice[]> {
    try {
      const [oilApi, lpgApi] = await Promise.all([
        fetchJson<OilApiResponse>(OIL_API),
        fetchJson<LpgApiResponse>(LPG_API),
      ]);

      const results: ScrapedPrice[] = [];
      const ptt = oilApi.data?.ptt;
      const oilDate = parseApiDate(ptt?.oil_ptt_date);

      for (const p of OIL_PRODUCTS) {
        const value = ptt?.[p.key];
        if (!value || value === "-") continue;
        results.push({
          sourceProductName: p.name,
          price: parsePrice(value),
          unit: "บาท/ลิตร",
          provinceCode: null, // national retail reference
          sourceDate: oilDate,
        });
      }

      // LPG: controlled 15kg cylinder price (PTT).
      const pttLpg = lpgApi.data?.ptt;
      const lpgCylinder = pttLpg?.lpg_ptt_15kg;
      if (lpgCylinder && lpgCylinder !== "-") {
        results.push({
          sourceProductName: "แก๊สหุงต้ม (LPG)",
          price: parsePrice(lpgCylinder),
          unit: "บาท/ถัง 15 กก.",
          provinceCode: null,
          sourceDate: parseApiDate(pttLpg?.lpg_ptt_date),
        });
      }

      return results;
    } catch (error) {
      console.error("[EPPO scraper] Error:", error);
      return [];
    }
  },
};