import type { Scraper, ScrapedPrice } from "./types";

/**
 * Talad Thai (ตลาดไท wholesale market) — MOCK DATA.
 *
 * REAL source status: taladthai.com is a placeholder site (Start Bootstrap
 * landing page); /product/price_daily and every other price path returns
 * 404/406 (Mod_Security). The market's public price feed is no longer
 * reachable, so there is nothing to scrape.
 *
 * MOCK: values below are realistic Talad Thai wholesale prices as of Aug 2026
 * (below DIT Bangkok retail for the same week). Replace with the market's API
 * if it comes back online.
 */
const MOCK_PRICES: Array<{ name: string; price: number; unit: string }> = [
  // meat
  { name: "หมูสามชั้น", price: 170, unit: "บาท/กก." },
  { name: "หมูสะโพก", price: 145, unit: "บาท/กก." },
  { name: "หมูสับ", price: 138, unit: "บาท/กก." },
  { name: "ไก่สด", price: 65, unit: "บาท/กก." },
  { name: "ไก่ย่าง", price: 80, unit: "บาท/ตัว" },
  { name: "เนื้อวัว", price: 210, unit: "บาท/กก." },
  // vegetables
  { name: "ผักบุ้ง", price: 25, unit: "บาท/กก." },
  { name: "ผักคะน้า", price: 28, unit: "บาท/กก." },
  { name: "ถั่วฝักยาว", price: 35, unit: "บาท/กก." },
  { name: "แตงกวา", price: 24, unit: "บาท/กก." },
  { name: "มะเขือเทศ", price: 36, unit: "บาท/กก." },
  { name: "พริกขี้หนู", price: 88, unit: "บาท/กก." },
  { name: "ผักกวางตุ้งฮุง", price: 32, unit: "บาท/กก." },
  // rice
  { name: "ข้าวหอมมะลิ", price: 40, unit: "บาท/กก." },
  { name: "ข้าวเหนียว", price: 36, unit: "บาท/กก." },
  { name: "ข้าวขาว", price: 31, unit: "บาท/กก." },
  // eggs & dairy
  { name: "ไข่ไก่", price: 4.0, unit: "บาท/ฟอง" },
  { name: "ไข่เป็ด", price: 6.0, unit: "บาท/ฟอง" },
  { name: "นมสด", price: 52, unit: "บาท/ลิตร" },
  // oil & fat
  { name: "น้ำมันปาล์ม", price: 48, unit: "บาท/ลิตร" },
  { name: "น้ำมันถั่วเหลือง", price: 63, unit: "บาท/ลิตร" },
  // seasoning
  { name: "น้ำตาลทราย", price: 23, unit: "บาท/กก." },
  { name: "นมข้นหวาน", price: 68, unit: "บาท/กระป๋อง" },
  { name: "น้ำปลา", price: 30, unit: "บาท/ขวด 700 มล." },
  { name: "เกลือ", price: 12, unit: "บาท/กก." },
  { name: "กะทิ", price: 35, unit: "บาท/กระป๋อง 400 มล." },
  // fruit
  { name: "ส้ม", price: 42, unit: "บาท/กก." },
  { name: "มะม่วง", price: 58, unit: "บาท/กก." },
  { name: "กล้วยน้ำว้า", price: 40, unit: "บาท/กก." },
  { name: "แตงโม", price: 23, unit: "บาท/กก." },
  // seafood
  { name: "ปลาทู", price: 80, unit: "บาท/กก." },
  { name: "กุ้งกุลาดำ", price: 355, unit: "บาท/กก." },
  { name: "กุ้งขาว", price: 188, unit: "บาท/กก." },
  { name: "ปลาหมึก", price: 163, unit: "บาท/กก." },
  { name: "ปูม้า", price: 183, unit: "บาท/กก." },
  { name: "หอยแมลงภั่ง", price: 60, unit: "บาท/กก." },
  { name: "ปลาสำเตร็ง", price: 72, unit: "บาท/กก." },
  { name: "ปลานิล", price: 57, unit: "บาท/กก." },
];

export const taladthaiScraper: Scraper = {
  sourceSlug: "taladthai",
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