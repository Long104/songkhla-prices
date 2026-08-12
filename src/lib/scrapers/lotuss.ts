import * as cheerio from "cheerio";
import { fetchRenderedHtml } from "./browserless";
import type { Scraper, ScrapedPrice } from "./types";
import { parsePrice } from "./types";

const CATEGORIES = [
  { slug: "fresh-food", url: "https://www.lotuss.com/th/category/fresh-food" },
  { slug: "pantry-staples", url: "https://www.lotuss.com/th/category/pantry-staples" },
  { slug: "household", url: "https://www.lotuss.com/th/category/household" },
  { slug: "personal-care", url: "https://www.lotuss.com/th/category/personal-care" },
];

export const lotussScraper: Scraper = {
  sourceSlug: "lotuss",
  async scrape(): Promise<ScrapedPrice[]> {
    const allPrices: ScrapedPrice[] = [];
    const today = new Date();

    for (const cat of CATEGORIES) {
      const html = await fetchRenderedHtml(cat.url);
      if (!html) continue;

      const $ = cheerio.load(html);

      // 1. Next.js JSON payload extraction if present
      const nextDataJson = $("#__NEXT_DATA__").html();
      if (nextDataJson) {
        try {
          const nextData = JSON.parse(nextDataJson);
          const content = nextData?.props?.pageProps?.page?.data?.content ?? [];
          for (const item of content) {
            const products = item?.products ?? item?.data?.products ?? item?.category?.children ?? [];
            for (const p of products) {
              const title = p?.name ?? p?.title;
              const price = p?.price ?? p?.specialPrice;
              if (title && price) {
                allPrices.push({
                  sourceProductName: title,
                  price: typeof price === "number" ? price : parsePrice(String(price)),
                  unit: "ชิ้น",
                  provinceCode: null,
                  sourceDate: today,
                });
              }
            }
          }
        } catch {
          // ignore
        }
      }

      // 2. DOM extraction via Cheerio
      $("[data-testid='product-card'], .product-card, a[href*='/product/']").each((_, el) => {
        const title = $(el).find("h3, .product-name, [class*='title']").text().trim();
        const priceText = $(el).find(".price, [class*='price']").text();
        const price = parsePrice(priceText);

        if (title && price > 0) {
          allPrices.push({
            sourceProductName: title,
            price,
            unit: "ชิ้น",
            provinceCode: null,
            sourceDate: today,
          });
        }
      });
    }

    return allPrices;
  },
};
