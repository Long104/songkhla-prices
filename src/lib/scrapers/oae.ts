import type { Scraper, ScrapedPrice } from "./types";

/**
 * OAE (Office of Agricultural Economics) — MOCK DATA.
 *
 * REAL source status: the official daily agricultural price feed moved to the
 * NABC platform (nabc-catalog.oae.go.th) which requires a registered API key,
 * and oae.go.th itself is an Angular SPA with no server-rendered price table.
 * Public scraping is not possible without registration.
 *
 * MOCK: values below are realistic Thai national-average market prices as of
 * Aug 2026 (anchored to the real DIT Bangkok retail prices for the same week).
 * Replace with the NABC API once an API key is provisioned.
 */
const MOCK_PRICES: Array<{ name: string; price: number; unit: string }> = [
  // meat
  { name: "หมูสามชั้น", price: 178, unit: "บาท/กก." },
  { name: "หมูสะโพก", price: 152, unit: "บาท/กก." },
  { name: "หมูสับ", price: 145, unit: "บาท/กก." },
  { name: "ไก่สด", price: 68, unit: "บาท/กก." },
  { name: "เนื้อวัว", price: 220, unit: "บาท/กก." },
  // vegetables
  { name: "ผักบุ้ง", price: 28, unit: "บาท/กก." },
  { name: "ผักคะน้า", price: 31, unit: "บาท/กก." },
  { name: "ถั่วฝักยาว", price: 38, unit: "บาท/กก." },
  { name: "แตงกวา", price: 27, unit: "บาท/กก." },
  { name: "มะเขือเทศ", price: 40, unit: "บาท/กก." },
  { name: "พริกขี้หนู", price: 95, unit: "บาท/กก." },
  { name: "ผักกวางตุ้งฮุง", price: 35, unit: "บาท/กก." },
  // rice
  { name: "ข้าวหอมมะลิ", price: 42, unit: "บาท/กก." },
  { name: "ข้าวเหนียว", price: 38, unit: "บาท/กก." },
  { name: "ข้าวขาว", price: 33, unit: "บาท/กก." },
  // eggs & dairy
  { name: "ไข่ไก่", price: 4.5, unit: "บาท/ฟอง" },
  { name: "ไข่เป็ด", price: 6.5, unit: "บาท/ฟอง" },
  { name: "นมสด", price: 21, unit: "บาท/ลิตร" },
  // oil & fat
  { name: "น้ำมันปาล์ม", price: 49, unit: "บาท/ลิตร" },
  { name: "น้ำมันถั่วเหลือง", price: 66, unit: "บาท/ลิตร" },
  // seasoning
  { name: "น้ำตาลทราย", price: 24, unit: "บาท/กก." },
  // fruit
  { name: "ส้ม", price: 45, unit: "บาท/กก." },
  { name: "มะม่วง", price: 62, unit: "บาท/กก." },
  { name: "กล้วยน้ำว้า", price: 42, unit: "บาท/กก." },
  { name: "แตงโม", price: 26, unit: "บาท/กก." },
];

export const oaeScraper: Scraper = {
  sourceSlug: "oae",
  async scrape(): Promise<ScrapedPrice[]> {
    const today = new Date();
    return MOCK_PRICES.map((p) => ({
      sourceProductName: p.name,
      price: p.price,
      unit: p.unit,
      provinceCode: null, // national average reference
      sourceDate: today,
    }));
  },
};