const SIMUMMUANG_API = "https://api.simummuangmarket.com/api/app/products";
const RATE_LIMIT_MS = 2000;
const PAGE_LIMIT = 100;

import type { Scraper, ScrapedPrice } from "./types";
import { fetchJson } from "./types";

interface SmmPriceTier {
  min: number;
  max: number;
}
interface SmmPrice {
  small: SmmPriceTier;
  medium: SmmPriceTier;
  large: SmmPriceTier;
}
interface SmmProduct {
  th?: { name?: string };
  en?: { name?: string };
  prod_unit_id?: { th?: { name?: string } };
  price?: SmmPrice;
  isShow?: boolean;
  isActive?: boolean;
}
interface SmmResponse {
  data: {
    data: SmmProduct[];
    total: number;
    totalPages: number;
    currentPage: number;
  };
  statusCode: number;
}

const PRODUCT_MATCH_MAP: Record<string, string[]> = {
  // Existing veg/fruit
  "ผักคะน้า": ["คะน้า"],
  "ผักบุ้ง": ["ผักบุ้ง"],
  "ถั่วฝักยาว": ["ถั่วฝักยาว"],
  "แตงกวา": ["แตงกวา"],
  "มะเขือเทศ": ["มะเขือเทศ"],
  "พริกขี้หนู": ["พริกขี้หนู"],
  "ผักกวางตุ้งฮุง": ["กวางตุ้ง"],
  "ส้ม": ["ส้ม"],
  "มะม่วง": ["มะม่วง"],
  "กล้วยน้ำว้า": ["กล้วย"],
  "แตงโม": ["แตงโม"],
  // Additions (found in API and mapped to seed products)
  "ไข่ไก่": ["ไข่ไก่"],
  "ไข่เป็ด": ["ไข่เป็ด"],
  "กุ้งขาว": ["กุ้งขาว"],
  "ปูม้า": ["ปูม้า"],
  "ปลาหมึก": ["หมึกไข่"],
};

function extractPrice(price: SmmPrice | undefined): number | null {
  if (!price) return null;
  // Prefer medium, fall back to large, then small
  for (const tier of [price.medium, price.large, price.small]) {
    if (tier && tier.min > 0) return tier.min;
  }
  return null;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const simummuangScraper: Scraper = {
  sourceSlug: "simummuang",
  async scrape(): Promise<ScrapedPrice[]> {
    const allProducts: SmmProduct[] = [];
    let totalPages = 1;

    try {
      // Fetch page 1 to get totalPages
      const initialResponse = await fetchJson<SmmResponse>(
        `${SIMUMMUANG_API}?page=1&limit=${PAGE_LIMIT}`
      );
      if (initialResponse?.data?.data) {
        allProducts.push(...initialResponse.data.data);
        totalPages = initialResponse.data.totalPages;
      }

      // Fetch remaining pages
      for (let page = 2; page <= totalPages; page++) {
        await sleep(RATE_LIMIT_MS);
        try {
          const response = await fetchJson<SmmResponse>(
            `${SIMUMMUANG_API}?page=${page}&limit=${PAGE_LIMIT}`
          );
          if (response?.data?.data) {
            allProducts.push(...response.data.data);
          }
        } catch (e) {
          console.error(`[SimumMuang] Failed to fetch page ${page}:`, e);
        }
      }
    } catch (e) {
      console.error("[SimumMuang] Fatal error fetching products:", e);
      return [];
    }

    const scrapedPrices: ScrapedPrice[] = [];

    for (const [canonicalName, searchTerms] of Object.entries(PRODUCT_MATCH_MAP)) {
      const matches = allProducts.filter((p) => {
        const name = p.th?.name || "";
        return searchTerms.some((term) => name.includes(term));
      });

      let bestPrice: number | null = null;
      for (const p of matches) {
        const price = extractPrice(p.price);
        if (price !== null) {
          if (bestPrice === null || price < bestPrice) {
            bestPrice = price;
          }
        }
      }

      if (bestPrice !== null) {
        const unitName = allProducts.find((p) => {
          const name = p.th?.name || "";
          return searchTerms.some((term) => name.includes(term)) && extractPrice(p.price) === bestPrice;
        })?.prod_unit_id?.th?.name || "กิโลกรัม";

        scrapedPrices.push({
          sourceProductName: canonicalName,
          price: bestPrice,
          unit: unitName === "กิโลกรัม" ? "บาท/กก." : `บาท/${unitName}`,
          provinceCode: null,
          sourceDate: new Date(),
        });
      }
    }

    console.log(
      `[SimumMuang] Fetched ${allProducts.length} products across ${totalPages} pages, matched ${scrapedPrices.length} tracked products.`
    );
    return scrapedPrices;
  },
};
