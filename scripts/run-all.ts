import { makroScraper } from "@/lib/scrapers/makro";
import { simummuangScraper } from "@/lib/scrapers/simummuang";
import { writeScraperResults } from "@/lib/scrapers/db-writer";

async function main() {
  const scrapers = [makroScraper, simummuangScraper];
  for (const scraper of scrapers) {
    console.log(`Running ${scraper.sourceSlug}...`);
    const scraped = await scraper.scrape();
    const ctx = {
      results: {} as Record<string, { status: string; count?: number; error?: string }>,
      unmapped: [] as string[],
    };
    const inserted = await writeScraperResults(scraper, scraped, ctx);
    console.log(
      JSON.stringify({ source: scraper.sourceSlug, scraped: scraped.length, inserted, unmapped: ctx.unmapped.length }),
    );
  }
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});