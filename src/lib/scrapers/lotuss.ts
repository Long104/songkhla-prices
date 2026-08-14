import type { Scraper, ScrapedPrice } from "./types";
import { fetchJson } from "./types";

const LOTUS_TRACKED_PRODUCTS: Record<string, string> = {
  "หมูสามชั้น": "หมูสามชั้น",
  "หมูสะโพก": "หมูสะโพก",
  "หมูสับ": "หมูสับ",
  "ซี่โครงหมู": "ซี่โครงหมู",
  "หมูคอสไลซ์": "หมูคอสไลซ์",
  "หมูบด": "หมูบด",
  "ไก่สด": "ไก่สด",
  "ไก่บด": "ไก่บด",
  "ไก่ย่าง": "ไก่ย่าง",
  "ปีกไก่": "ปีกไก่",
  "อกไก่": "อกไก่",
  "น่องไก่": "น่องไก่",
  "เนื้อวัว": "เนื้อวัว",
  "เนื้อวัวสไลซ์": "เนื้อวัวสไลซ์",
  "ผักคะน้า": "ผักคะน้า",
  "ผักบุ้ง": "ผักบุ้ง",
  "พริกขี้หนู": "พริกขี้หนู",
  "มะเขือเทศ": "มะเขือเทศ",
  "แตงกวา": "แตงกวา",
  "ถั่วฝักยาว": "ถั่วฝักยาว",
  "ปลาทู": "ปลาทู",
  "ข้าวหอมมะลิ": "ข้าวหอมมะลิ",
  "ข้าวขาว": "ข้าวขาว",
  "ไข่ไก่": "ไข่ไก่",
  "น้ำมันปาล์ม": "น้ำมันปาล์ม",
  "น้ำมันถั่วเหลือง": "น้ำมันถั่วเหลือง",
  "น้ำตาลทราย": "น้ำตาลทราย",
  "ผ้าอ้อมเด็ก": "ผ้าอ้อม",
  "นมผง": "นมผงเด็ก",
  "สบู่เด็ก": "สบู่เด็ก",
  "ขนมปัง": "ขนมปัง",
  "น้ำผลไม้": "น้ำผลไม้",
  "น้ำอัดลม": "น้ำอัดลม",
  "ผลไม้กระป๋อง": "ผลไม้กระป๋อง",
  "ปลากระป๋อง": "ปลากระป๋อง",
  "ผักกาดดอง": "ผักกาดดอง",
  "กาแฟ 3in1": "กาแฟ 3in1",
  "กาแฟคั่วบด": "กาแฟคั่วบด",
  "ชาเขียว": "ชาเขียว",
  "อาหารพร้อมทานแช่แข็ง": "อาหารสำเร็จรูปแช่แข็ง",
  "ไส้กรอก": "ไส้กรอก",
  "นักเก็ตไก่": "นักเก็ตไก่",
  "น้ำยาล้างห้องน้ำ": "น้ำยาทำความสะอาดห้องน้ำ",
  "น้ำยาถูพื้น": "น้ำยาถูพื้น",
  "ทิชชู่": "ทิชชู่",
  "เส้นหมี่": "เส้นหมี่",
  "วุ้นเส้น": "วุ้นเส้น",
  "ครีมอาบน้ำ": "ครีมอาบน้ำ",
  "ผ้าอนามัย": "ผ้าอนามัย",
  "สบู่ก้อน": "สบู่ก้อน",
  "ทรายแมว": "ทรายแมว",
  "อาหารสุนัข": "อาหารสุนัข",
  "อาหารแมว": "อาหารแมว",
  "กะทิ": "กะทิ",
  "เกลือ": "เกลือ",
  "นมข้นหวาน": "นมข้นหวาน",
  "มันฝรั่งทอด": "มันฝรั่งทอด",
  "บิสกิต": "บิสกิต",
  "คุกกี้": "คุกกี้",
  "ผงซักฟอก": "ผงซักฟอก",
  "น้ำยาล้างจาน": "น้ำยาล้างจาน",
  "แชมพู": "แชมพู",
  "ยาสีฟัน": "ยาสีฟัน",
};

const LOTUS_SEARCH_API = "https://api-o2o.lotuss.com/lotuss-mobile-bff/product/v6/search?sort=relevance:DESC&limit=15&page={page}&seller_id=3";
const LOTUS_HEADERS: Record<string, string> = {
  "content-type": "application/json",
  "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
};
const MIN_PRICE = 5;
const MAX_PRICE = 2000;
const SEARCH_CONCURRENCY = 5;
const PER_TERM_TIMEOUT_MS = 15_000;
const MAX_PAGES_PER_TERM = 2;
const RETRY_DELAY_MS = 2000;

interface LotusPriceValue {
  currency: string;
  currencyPrefix: string;
  value: number;
}

interface LotusMinimumPrice {
  finalPrice: LotusPriceValue;
}

interface LotusApiProduct {
  id: number;
  name: string;
  sku: string;
  priceRange: {
    minimumPrice: LotusMinimumPrice;
  };
}

interface LotusSearchResponse {
  data: {
    products: LotusApiProduct[];
    hasMore: boolean;
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchSearchPage(term: string, page: number): Promise<LotusSearchResponse> {
  const url = LOTUS_SEARCH_API.replace("{page}", String(page));
  const init: RequestInit = {
    method: "POST",
    headers: LOTUS_HEADERS,
    body: JSON.stringify({ keyword: term }),
    signal: AbortSignal.timeout(PER_TERM_TIMEOUT_MS),
  };

  try {
    return await fetchJson<LotusSearchResponse>(url, init);
  } catch (error) {
    if (error instanceof Error && error.message.includes("429")) {
      await sleep(RETRY_DELAY_MS);
      return await fetchJson<LotusSearchResponse>(url, init);
    }
    throw error;
  }
}

async function searchTerm(term: string): Promise<LotusApiProduct[]> {
  const products: LotusApiProduct[] = [];
  for (let page = 1; page <= MAX_PAGES_PER_TERM; page++) {
    let response: LotusSearchResponse;
    try {
      response = await fetchSearchPage(term, page);
    } catch (error) {
      if (page === 1) throw error;
      console.error(`[Lotus's] Failed to fetch page ${page} for "${term}":`, error);
      break;
    }
    products.push(...response.data.products);
    if (!response.data.hasMore) break;
  }
  return products;
}

export const lotussScraper: Scraper = {
  sourceSlug: "lotuss",
  async scrape(): Promise<ScrapedPrice[]> {
    const allPrices: ScrapedPrice[] = [];
    const today = new Date();
    const entries = Object.entries(LOTUS_TRACKED_PRODUCTS);

    for (let i = 0; i < entries.length; i += SEARCH_CONCURRENCY) {
      const chunk = entries.slice(i, i + SEARCH_CONCURRENCY);
      const chunkResults = await Promise.all(
        chunk.map(async ([trackedName, term]) => {
          try {
            const products = await searchTerm(term);
            const candidates = products
              .map((p) => ({ product: p, price: p.priceRange.minimumPrice.finalPrice.value }))
              .filter((c) => c.product.name.includes(trackedName))
              .filter((c) => c.price >= MIN_PRICE && c.price <= MAX_PRICE);

            if (candidates.length === 0) return null;

            const cheapest = candidates.reduce((a, b) => (a.price < b.price ? a : b));
            return {
              sourceProductName: trackedName,
              price: cheapest.price,
              productTitle: cheapest.product.name,
            };
          } catch (error) {
            console.error(`[Lotus's] Error scraping "${trackedName}":`, error);
            return null;
          }
        }),
      );

      for (const result of chunkResults) {
        if (result === null) continue;
        allPrices.push({
          sourceProductName: result.sourceProductName,
          price: result.price,
          unit: "บาท/ชิ้น",
          provinceCode: null,
          sourceDate: today,
          productTitle: result.productTitle,
        });
      }
    }

    return allPrices;
  },
};
