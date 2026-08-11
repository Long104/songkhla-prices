import type { Scraper, ScrapedPrice } from "./types";

/**
 * Si Mum Muang (ตลาดสี่มุมเมือง wholesale market) — MOCK DATA.
 *
 * REAL source status: simummuangmarket.com is a Next.js SPA whose price data
 * loads client-side from api.simummuangmarket.com, which returns 401 "Access
 * token not found" without an account. The public /pricing page renders
 * "แสดงสินค้า 0 จาก 0 รายการ" (0 items) for anonymous visitors, so there is
 * nothing to scrape without authentication.
 *
 * MOCK: values below are realistic Si Mum Muang wholesale prices as of Aug
 * 2026 (below DIT Bangkok retail for the same week). Replace with the market's
 * API once anonymous access or credentials are available.
 */
const MOCK_PRICES: Array<{ name: string; price: number; unit: string }> = [
  // meat
  { name: "หมูสามชั้น", price: 172, unit: "บาท/กก." },
  { name: "หมูสะโพก", price: 147, unit: "บาท/กก." },
  { name: "หมูสับ", price: 140, unit: "บาท/กก." },
  { name: "ไก่สด", price: 66, unit: "บาท/กก." },
  { name: "ไก่ย่าง", price: 85, unit: "บาท/ตัว" },
  { name: "เนื้อวัว", price: 215, unit: "บาท/กก." },
  // vegetables
  { name: "ผักบุ้ง", price: 26, unit: "บาท/กก." },
  { name: "ผักคะน้า", price: 29, unit: "บาท/กก." },
  { name: "ถั่วฝักยาว", price: 36, unit: "บาท/กก." },
  { name: "แตงกวา", price: 25, unit: "บาท/กก." },
  { name: "มะเขือเทศ", price: 38, unit: "บาท/กก." },
  { name: "พริกขี้หนู", price: 92, unit: "บาท/กก." },
  { name: "ผักกวางตุ้งฮุง", price: 33, unit: "บาท/กก." },
  // rice
  { name: "ข้าวหอมมะลิ", price: 41, unit: "บาท/กก." },
  { name: "ข้าวเหนียว", price: 37, unit: "บาท/กก." },
  { name: "ข้าวขาว", price: 32, unit: "บาท/กก." },
  // eggs & dairy
  { name: "ไข่ไก่", price: 4.2, unit: "บาท/ฟอง" },
  { name: "ไข่เป็ด", price: 6.2, unit: "บาท/ฟอง" },
  { name: "นมสด", price: 54, unit: "บาท/ลิตร" },
  // oil & fat
  { name: "น้ำมันปาล์ม", price: 49, unit: "บาท/ลิตร" },
  { name: "น้ำมันถั่วเหลือง", price: 64, unit: "บาท/ลิตร" },
  // seasoning
  { name: "น้ำตาลทราย", price: 23.5, unit: "บาท/กก." },
  { name: "นมข้นหวาน", price: 70, unit: "บาท/กระป๋อง" },
  { name: "น้ำปลา", price: 32, unit: "บาท/ขวด 700 มล." },
  { name: "เกลือ", price: 13, unit: "บาท/กก." },
  { name: "กะทิ", price: 36, unit: "บาท/กระป๋อง 400 มล." },
  // fruit
  { name: "ส้ม", price: 43, unit: "บาท/กก." },
  { name: "มะม่วง", price: 60, unit: "บาท/กก." },
  { name: "กล้วยน้ำว้า", price: 41, unit: "บาท/กก." },
  { name: "แตงโม", price: 24, unit: "บาท/กก." },
];

export const simummuangScraper: Scraper = {
  sourceSlug: "simummuang",
  async scrape(): Promise<ScrapedPrice[]> {
    const today = new Date();
    return MOCK_PRICES.map((p) => ({
      sourceProductName: p.name,
      price: p.price,
      unit: p.unit,
      provinceCode: null, // wholesale reference (market at Pathum Thani)
      sourceDate: today,
    }));
  },
};