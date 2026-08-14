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

        // Collect every ฿-prefixed price node with its position in the body
        // text so we can locate the nearest enclosing product container.
        const bodyText = $("body").text();
        const pricePattern = /฿([0-9,]+(?:\.[0-9]{2})?)/g;
        let match: RegExpExecArray | null;
        const priceNodes: { index: number; price: number }[] = [];

        while ((match = pricePattern.exec(bodyText)) !== null) {
          const price = parsePrice(match[1]);
          if (price < MIN_PRICE || price > MAX_PRICE) continue;
          priceNodes.push({ index: match.index, price });
        }

        if (priceNodes.length === 0) continue;

        // For each price node, find the nearest product container element in the
        // DOM (walk up from the text node that contains the ฿ symbol). Only the
        // text INSIDE that container is considered — this prevents cross-card
        // price contamination even when titles/weights are far from the price.
        const candidates: { price: number; containerText: string }[] = [];

        $("body")
          .find("*")
          .contents()
          .each((_i, node) => {
            if (node.type !== "text") return;
            const text = (node as unknown as { data?: string }).data ?? "";
            const bIndex = text.indexOf("฿");
            if (bIndex === -1) return;
            const globalPos = bodyText.indexOf(text, 0);
            if (globalPos === -1) return;
            const absPos = globalPos + bIndex;

            // Match this text node to one of our collected price nodes.
            const matched = priceNodes.find(
              (p) => p.index === absPos || (p.index >= absPos && p.index <= absPos + text.length),
            );
            if (!matched) return;

            // Walk up the DOM to the nearest sensible product container.
            const el = (node as unknown as { parent?: unknown }).parent;
            if (!el) return;
            const $el = $(el as Parameters<typeof $>[0]);
            const container =
              $el.closest("article, [class*='product'], [class*='card'], [data-product], li, div").first();
            const containerEl = container.length > 0 ? container : $el.closest("div").first();
            const containerText = containerEl.length > 0 ? containerEl.text() : $el.text();

            if (containerText.includes(trackedName)) {
              candidates.push({ price: matched.price, containerText });
            }
          });

        if (candidates.length === 0) continue;

        // Keep the cheapest matching price (likely the base variant) and use its
        // container text as the weight-bearing product title.
        const cheapestCandidate = candidates.reduce((a, b) => (a.price < b.price ? a : b));
        allPrices.push({
          sourceProductName: trackedName, // EXACT canonical name — matches product_source_mappings
          price: cheapestCandidate.price,
          unit: "บาท/ชิ้น",
          provinceCode: null,
          sourceDate: today,
          productTitle: cheapestCandidate.containerText.trim(),
        });
      } catch (error) {
        console.error(`[Lotus's] Error scraping "${trackedName}":`, error);
      }
    }

    return allPrices;
  },
};
