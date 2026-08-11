import * as cheerio from "cheerio";
import { fetchHtml, parsePrice, type Scraper, type ScrapedPrice } from "./types";

/**
 * DIT (Department of Internal Trade) — REAL data source.
 * https://pricelist.dit.go.th/main_price.php
 *
 * The site is a search form backed by two JSON endpoints and a POST report:
 *   1. getdata.php?ID=<protype>&TYPE=dit      → product groups
 *   2. getdata.php?ID=<group_id>&TYPE=product → products in a group
 *   3. main_price.php?seltime=multi (POST)    → one price table per selected
 *      product: header "<group> <product>  <unit>", rows "<date> <min - max> <avg>"
 *
 * We POST the "compare" report once per product group (all tracked codes at
 * once) and parse each product section. Prices are Bangkok retail ("ขายปลีก"),
 * stored with provinceCode = null so they act as the national reference price.
 */
const DIT_BASE = "https://pricelist.dit.go.th";

/** DIT catalog codes we track, grouped by the site's product group. */
const DIT_PRODUCTS: Record<string, string[]> = {
  // เนื้อสัตว์ (+ eggs live in this group on DIT)
  P11000: [
    "P11005", // สุกรชำแหละ เนื้อสามชั้น
    "P11003", // สุกรชำแหละ เนื้อแดง สะโพก (ตัดแต่ง)
    "P11009", // ไก่สดทั้งตัว (รวมเครื่องใน)
    "P11031", // เนื้อโค สะโพก
    "P11027", // ไข่ไก่ เบอร์ 2
    "P11021", // ไข่เป็ด กลาง
  ],
  // ผักสด
  P13000: [
    "P13001", // ผักคะน้า คละ
    "P13003", // ผักบุ้งจีน คละ
    "P13005", // ผักกวางตุ้ง คละ
    "P13022", // ถั่วฝักยาว คละ
    "P13024", // แตงกวา คละ
    "P13019", // มะเขือเทศผลใหญ่ คละ
    "P13091", // พริกขี้หนูสวน (เม็ดกลาง)
  ],
  // ราคาขายปลีกข้าวสาร
  R13000: [
    "R13001", // ข้าวสารเจ้า 100% ข้าวหอม ร้านค้าทั่วไป
    "R13003", // ข้าวสารเจ้า 100% ธรรมดา ร้านค้าทั่วไป
    "R13007", // ข้าวสารเหนียว สันป่าตอง (เขี้ยวงู) 100%
  ],
  // พืชน้ำมันและน้ำมันพืช
  P16000: [
    "P16011", // น้ำมันปาล์มสำเร็จรูป บรรจุขวด1 ลิตร
    "P16007", // น้ำมันถั่วเหลืองบริสุทธิ์ บรรจุขวด 1 ลิตร ตรากุ๊ก
  ],
  // ผลไม้
  P14000: [
    "P14001", // ส้มเขียวหวาน สายน้ำผึ้ง เบอร์ 4
    "P14012", // มะม่วงน้ำดอกไม้ เบอร์ 0
    "P14007", // กล้วยน้ำว้า
    "P14005", // แตงโม พันธุ์กินรี
  ],
};

const THAI_MONTHS: Record<string, number> = {
  "ม.ค.": 1,
  "ก.พ.": 2,
  "มี.ค.": 3,
  "เม.ย.": 4,
  "พ.ค.": 5,
  "มิ.ย.": 6,
  "ก.ค.": 7,
  "ส.ค.": 8,
  "ก.ย.": 9,
  "ต.ค.": 10,
  "พ.ย.": 11,
  "ธ.ค.": 12,
};

/** Parse "10 ส.ค. 2569" (Buddhist year) into a Gregorian Date. */
function parseThaiDate(raw: string): Date | null {
  const m = raw.trim().match(/^(\d{1,2})\s+(\S+)\s+(\d{4})$/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const month = THAI_MONTHS[m[2]];
  const year = parseInt(m[3], 10) - 543; // Buddhist → Gregorian
  if (!month || year < 2000) return null;
  return new Date(year, month - 1, day);
}

/** Format a Date as dd/mm/BBBB (the form's Buddhist-year format). */
function thaiDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear() + 543}`;
}

/**
 * Parse the multi-report response: one `<table class="table-striped">` per
 * product. Header cell is "<group> <product>  <unit>"; body rows are
 * "<date> <min - max> <avg>"; the final row is the period average ("ราคาเฉลี่ย").
 * We keep the most recent dated row per product.
 */
function parsePriceTable(html: string): ScrapedPrice[] {
  const $ = cheerio.load(html);
  const results: ScrapedPrice[] = [];

  $("table.table-striped").each((_, table) => {
    const header = $(table).find("thead tr th[colspan]").first().text().trim();
    // "เนื้อสัตว์\u00a0สุกรชำแหละ เนื้อสามชั้น\u00a0\u00a0บาท/กก."
    const parts = header.split("\u00a0").map((s) => s.trim());
    const sourceProductName = parts[1] ?? "";
    const unit = parts.find((p) => p.startsWith("บาท")) ?? "บาท/กก.";
    if (!sourceProductName) return;

    let lastRow: { date: Date; price: number } | null = null;
    // Note: use a real loop (not .each()) so TypeScript's control-flow analysis
    // sees the assignment — a closure-captured `let` narrows to `never` after.
    for (const rowEl of $(table).find("tbody tr").toArray()) {
      const row = $(rowEl);
      const cells = row.find("td");
      if (cells.length < 3) continue;
      const dateText = $(cells[0]).text().trim();
      if (!dateText || dateText === "ราคาเฉลี่ย") continue;
      const date = parseThaiDate(dateText);
      const price = parsePrice($(cells[2]).text());
      if (date && price > 0) lastRow = { date, price };
    }

    if (lastRow) {
      results.push({
        sourceProductName,
        price: lastRow.price,
        unit,
        // DIT prices are Bangkok retail; store as the national reference so
        // every province view (incl. Songkhla) sees them.
        provinceCode: null,
        sourceDate: lastRow.date,
      });
    }
  });

  return results;
}

export const ditScraper: Scraper = {
  sourceSlug: "dit",
  async scrape(): Promise<ScrapedPrice[]> {
    try {
      const today = new Date();
      const from = new Date(today);
      from.setDate(from.getDate() - 10); // DIT data lags a day or two
      const results: ScrapedPrice[] = [];

      for (const [group, codes] of Object.entries(DIT_PRODUCTS)) {
        const params = new URLSearchParams();
        params.set("day1", thaiDate(from));
        params.set("day2", thaiDate(today));
        params.set("protype", "1"); // ขายปลีก (retail)
        params.set("progroup", group);
        params.set("seltime", "multi");
        for (const code of codes) params.append("proname[]", code);

        const html = await fetchHtml(`${DIT_BASE}/main_price.php?seltime=multi`, {
          method: "POST",
          body: params,
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        });
        results.push(...parsePriceTable(html));
      }

      return results;
    } catch (error) {
      console.error("[DIT scraper] Error:", error);
      return [];
    }
  },
};