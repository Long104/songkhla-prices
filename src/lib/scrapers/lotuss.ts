import * as cheerio from "cheerio";
import { fetchRenderedHtml } from "./browserless";
import type { Scraper, ScrapedPrice } from "./types";
import { parsePrice } from "./types";

const SEARCH_TERMS = [
  "หมู", "ไก่", "ผัก", "ปลา", "ข้าว", "ไข่", "น้ำมัน",
  "ทิชชู่", "น้ำยาล้างจาน", "ผงซักฟอก", "สบู่", "แชมพู", "ยาสีฟัน",
  "ผ้าอ้อม", "อาหารแมว", "ปลากระป๋อง", "กาแฟ"
];

export const lotussScraper: Scraper = {
  sourceSlug: "lotuss",
  async scrape(): Promise<ScrapedPrice[]> {
    const allPrices: ScrapedPrice[] = [];
    const today = new Date();

    for (const term of SEARCH_TERMS) {
      const url = `https://www.lotuss.com/th/search/${encodeURIComponent(term)}`;
      const html = await fetchRenderedHtml(url, {
        gotoOptions: { waitUntil: "networkidle2", timeout: 35000 },
        waitForTimeout: 3000,
      });
      if (!html) continue;

      const $ = cheerio.load(html);
      const text = $("body").text();
      const parts = text.split("฿");

      for (let i = 1; i < parts.length; i++) {
        const prevChunk = parts[i - 1].slice(-80).trim();
        const priceMatch = parts[i].match(/^([0-9,]+(?:\.[0-9]{2})?)/);
        if (!priceMatch) continue;

        const price = parsePrice(priceMatch[1]);
        if (price <= 0) continue;

        const title = prevChunk
          .replace(
            /^.*?(?:ซื้อครบลดเพิ่ม|ซื้อเยอะ\s*ราคาส่ง|ผลลัพธ์สำหรับ[^\n]*|แสดงสินค้า[^\n]*)/g,
            ""
          )
          .replace(/[0-9.]+\/[ก-ฮa-zA-Z]+/g, "")
          .trim();

        if (title.length >= 3 && title.length < 100) {
          allPrices.push({
            sourceProductName: title,
            price,
            unit: "บาท/ชิ้น",
            provinceCode: null,
            sourceDate: today,
          });
        }
      }
    }
    return allPrices;
  },
};
