import type { Scraper, ScrapedPrice } from "./types";

/**
 * Makro Pro (makro.pro) — MOCK DATA.
 *
 * REAL source status: makro.pro is a Next.js app behind Cloudflare with a
 * Strapi backend at siammakro.cloud. All API endpoints require business
 * authentication (CP Axtra account). No public API exists. Server-side fetch
 * is blocked by Cloudflare bot protection.
 *
 * MOCK: values below are realistic Makro wholesale prices as of Aug 2026.
 * Makro is a cash-and-carry wholesaler — prices are above wholesale market
 * (Talad Thai / Si Mum Muang) but below retail (DIT). Primary differentiator:
 * Makro has comprehensive seafood coverage that no other source provides.
 *
 * NOTE: all mock wholesale prices use "บาท/กก." (or retail-equivalent units)
 * for comparability. Real Makro data ships in bulk units (บาท/กล่อง 5 กก.),
 * which will require a unitNormalization layer before display — Phase 3.
 *
 * Replace with real API integration once CP Axtra partnership credentials
 * are obtained.
 */
const MOCK_PRICES: Array<{ name: string; price: number; unit: string }> = [
  // seafood (Makro's key differentiator)
  { name: "ปลาทู", price: 85, unit: "บาท/กก." },
  { name: "กุ้งกุลาดำ", price: 365, unit: "บาท/กก." },
  { name: "กุ้งขาว", price: 195, unit: "บาท/กก." },
  { name: "ปลาหมึก", price: 170, unit: "บาท/กก." },
  { name: "ปูม้า", price: 190, unit: "บาท/กก." },
  { name: "หอยแมลงภั่ง", price: 65, unit: "บาท/กก." },
  { name: "ปลาสำเตร็ง", price: 75, unit: "บาท/กก." },
  { name: "ปลานิล", price: 62, unit: "บาท/กก." },
  // dry goods (bulk sizes)
  { name: "ข้าวหอมมะลิ", price: 42, unit: "บาท/กก." },
  { name: "ข้าวขาว", price: 33, unit: "บาท/กก." },
  { name: "น้ำตาลทราย", price: 24, unit: "บาท/กก." },
  { name: "น้ำมันปาล์ม", price: 47, unit: "บาท/ลิตร" },
  { name: "น้ำมันถั่วเหลือง", price: 63, unit: "บาท/ลิตร" },
  { name: "น้ำปลา", price: 32, unit: "บาท/ขวด 700 มล." },
  { name: "น้ำดื่ม", price: 4.5, unit: "บาท/ขวด" },
  { name: "บะหมี่กึ่งสำเร็จรูป", price: 5.5, unit: "บาท/ซอง" },
  { name: "แป้งสาลี", price: 27, unit: "บาท/กก." },
  { name: "ไข่ไก่", price: 4.0, unit: "บาท/ฟอง" },
];

export const makroScraper: Scraper = {
  sourceSlug: "makro",
  async scrape(): Promise<ScrapedPrice[]> {
    const today = new Date();
    return MOCK_PRICES.map((p) => ({
      sourceProductName: p.name,
      price: p.price,
      unit: p.unit,
      provinceCode: null, // national wholesale reference
      sourceDate: today,
    }));
  },
};