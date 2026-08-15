import { lotussScraper } from "@/lib/scrapers/lotuss";
import { makroScraper } from "@/lib/scrapers/makro";
import { simummuangScraper } from "@/lib/scrapers/simummuang";
import { writeScraperResults, type ScrapeContext } from "@/lib/scrapers/db-writer";

async function main() {
  const scrapers = [lotussScraper, makroScraper, simummuangScraper];
  for (const scraper of scrapers) {
    console.log(`Running scraper: ${scraper.sourceSlug}...`);
    const results = await scraper.scrape();
    const ctx: ScrapeContext = { results: {}, unmapped: [] };
    const inserted = await writeScraperResults(scraper, results, ctx);
    console.log(`  Inserted ${inserted} items for ${scraper.sourceSlug}`);
  }
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
