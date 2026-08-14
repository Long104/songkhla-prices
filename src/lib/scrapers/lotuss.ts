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
  // Baby
  "ผ้าอ้อมเด็ก": "ผ้าอ้อม",
  "นมผง": "นมผงเด็ก",
  "สบู่เด็ก": "สบู่เด็ก",
  // Bakery
  "ขนมปัง": "ขนมปัง",
  // Beverages
  "น้ำผลไม้": "น้ำผลไม้",
  "น้ำอัดลม": "น้ำอัดลม",
  // Canned Goods
  "ผลไม้กระป๋อง": "ผลไม้กระป๋อง",
  "ปลากระป๋อง": "ปลากระป๋อง",
  "ผักกาดดอง": "ผักกาดดอง",
  // Coffee & Tea
  "กาแฟ 3in1": "กาแฟ 3in1",
  "กาแฟคั่วบด": "กาแฟคั่วบด",
  "ชาเขียว": "ชาเขียว",
  // Frozen
  "อาหารพร้อมทานแช่แข็ง": "อาหารสำเร็จรูปแช่แข็ง",
  "ไส้กรอก": "ไส้กรอก",
  "นักเก็ตไก่": "นักเก็ตไก่",
  // Household
  "น้ำยาล้างห้องน้ำ": "น้ำยาทำความสะอาดห้องน้ำ",
  "น้ำยาถูพื้น": "น้ำยาถูพื้น",
  "ทิชชู่": "ทิชชู่",
  // Noodles
  "เส้นหมี่": "เส้นหมี่",
  "วุ้นเส้น": "วุ้นเส้น",
  // Personal Care
  "ครีมอาบน้ำ": "ครีมอาบน้ำ",
  "ผ้าอนามัย": "ผ้าอนามัย",
  "สบู่ก้อน": "สบู่ก้อน",
  // Pet
  "ทรายแมว": "ทรายแมว",
  "อาหารสุนัข": "อาหารสุนัข",
  "อาหารแมว": "อาหารแมว",
  // Seasoning
  "กะทิ": "กะทิ",
  "เกลือ": "เกลือ",
  "นมข้นหวาน": "นมข้นหวาน",
  // Snacks
  "มันฝรั่งทอด": "มันฝรั่งทอด",
  "บิสกิต": "บิสกิต",
  "คุกกี้": "คุกกี้",
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
const MAX_PRICE = 2000;

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
        const candidates: { price: number; precedingText: string }[] = [];

        while ((match = pricePattern.exec(bodyText)) !== null) {
          const price = parsePrice(match[1]);
          if (price < MIN_PRICE || price > MAX_PRICE) continue;

          // Check if the tracked product name appears within 200 chars
          // BEFORE this price occurrence (same product card)
          const priceStart = match.index;
          const windowStart = Math.max(0, priceStart - 200);
          const precedingText = bodyText.slice(windowStart, priceStart);

          if (precedingText.includes(trackedName)) {
            candidates.push({ price, precedingText });
          }
        }

        if (candidates.length === 0) continue;

        // Keep the cheapest matching price (likely the base variant)
        const cheapestCandidate = candidates.reduce((a, b) => (a.price < b.price ? a : b));
        allPrices.push({
          sourceProductName: trackedName, // EXACT canonical name — matches product_source_mappings
          price: cheapestCandidate.price,
          unit: "บาท/ชิ้น",
          provinceCode: null,
          sourceDate: today,
          productTitle: cheapestCandidate.precedingText,
        });
      } catch (error) {
        console.error(`[Lotus's] Error scraping "${trackedName}":`, error);
      }
    }

    return allPrices;
  },
};
