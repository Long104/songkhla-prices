import { lotussScraper } from "@/lib/scrapers/lotuss";
import { writeScraperResults, type ScrapeContext } from "@/lib/scrapers/db-writer";
import { getDb } from "@/db";

async function main() {
  console.log("Running Lotus scraper...");
  const start = Date.now();

  const scrapedPrices = await lotussScraper.scrape();
  const ctx: ScrapeContext = { results: {}, unmapped: [] };
  const inserted = await writeScraperResults(lotussScraper, scrapedPrices, ctx);

  const durationMs = Date.now() - start;
  console.log(JSON.stringify({ scraped: scrapedPrices.length, inserted, durationMs }, null, 2));
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
