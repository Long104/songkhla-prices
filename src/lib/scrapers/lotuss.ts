import * as cheerio from "cheerio";
import { fetchRenderedHtml } from "./browserless";
import type { Scraper, ScrapedPrice } from "./types";
import { parsePrice } from "./types";

/**
 * Tracked Lotus's products mapped to their search terms.
 * The key is the EXACT sourceProductName used in product_source_mappings.
 * The value is the search term for lotuss.com/th/search/.
 */
const LOTUS_TRACKED_PRODUCTS: Record<string, string> = {
  // Pork
  "หมูสามชั้น": "หมูสามชั้น",
  "หมูสะโพก": "หมูสะโพก",
  "หมูสับ": "หมูสับ",
  "ซี่โครงหมู": "ซี่โครงหมู",
  "หมูคอสไลซ์": "หมูคอสไลซ์",
  "หมูบด": "หมูบด",
  // Chicken
  "ไก่สด": "ไก่สด",
  "ไก่บด": "ไก่บด",
  "ไก่ย่าง": "ไก่ย่าง",
  "ปีกไก่": "ปีกไก่",
  "อกไก่": "อกไก่",
  "น่องไก่": "น่องไก่",
  // Beef
  "เนื้อวัว": "เนื้อวัว",
  "เนื้อวัวสไลซ์": "เนื้อวัวสไลซ์",
  // Vegetables
  "ผักคะน้า": "ผักคะน้า",
  "ผักบุ้ง": "ผักบุ้ง",
  "พริกขี้หนู": "พริกขี้หนู",
  "มะเขือเทศ": "มะเขือเทศ",
  "แตงกวา": "แตงกวา",
  "ถั่วฝักยาว": "ถั่วฝักยาว",
  // Fish/Seafood
  "ปลาทู": "ปลาทู",
  // Rice
  "ข้าวหอมมะลิ": "ข้าวหอมมะลิ",
  "ข้าวขาว": "ข้าวขาว",
  // Eggs
  "ไข่ไก่": "ไข่ไก่",
  // Oil
  "น้ำมันปาล์ม": "น้ำมันปาล์ม",
  "น้ำมันถั่วเหลือง": "น้ำมันถั่วเหลือง",
  // Seasoning
  "น้ำตาลทราย": "น้ำตาลทราย",
  // Household
  "ผงซักฟอก": "ผงซักฟอก",
  "น้ำยาล้างจาน": "น้ำยาล้างจาน",
  // Personal Care
  "แชมพู": "แชมพู",
  "ยาสีฟัน": "ยาสีฟัน",
};

/** Minimum plausible grocery price (filters phone numbers, footer years) */
const MIN_PRICE = 5;
/** Maximum plausible grocery price per unit at Lotus's */
const MAX_PRICE = 500;

export const lotussScraper: Scraper = {
  sourceSlug: "lotuss",
  async scrape(): Promise<ScrapedPrice[]> {
    const allPrices: ScrapedPrice[] = [];
    const today = new Date();

    for (const [trackedName, searchTerm] of Object.entries(LOTUS_TRACKED_PRODUCTS)) {
      try {
        const url = `https://www.lotuss.com/th/search/${encodeURIComponent(searchTerm)}`;
        const html = await fetchRenderedHtml(url, {
          gotoOptions: { waitUntil: "networkidle2", timeout: 35000 },
          waitForTimeout: 3000,
        });
        if (!html) continue;

        const $ = cheerio.load(html);
        const bodyText = $("body").text();

        // Find all ฿-prefixed prices in the body text
        const pricePattern = /฿([0-9,]+(?:\.[0-9]{2})?)/g;
        let match: RegExpExecArray | null;
        const candidates: number[] = [];

        while ((match = pricePattern.exec(bodyText)) !== null) {
          const price = parsePrice(match[1]);
          if (price < MIN_PRICE || price > MAX_PRICE) continue;

          // Check if the tracked product name appears within 200 chars
          // BEFORE this price occurrence (same product card)
          const priceStart = match.index;
          const windowStart = Math.max(0, priceStart - 200);
          const precedingText = bodyText.slice(windowStart, priceStart);

          if (precedingText.includes(trackedName)) {
            candidates.push(price);
          }
        }

        if (candidates.length === 0) continue;

        // Keep the cheapest matching price (likely the base variant)
        const cheapest = Math.min(...candidates);
        allPrices.push({
          sourceProductName: trackedName, // EXACT canonical name — matches product_source_mappings
          price: cheapest,
          unit: "บาท/ชิ้น",
          provinceCode: null,
          sourceDate: today,
        });
      } catch (error) {
        console.error(`[Lotus's] Error scraping "${trackedName}":`, error);
      }
    }

    return allPrices;
  },
};
