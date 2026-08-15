import { getDb } from "@/db";
import { prices, products, sources, productSourceMappings } from "@/db/schema";
import { lotussScraper } from "@/lib/scrapers/lotuss";
import { and, eq, desc } from "drizzle-orm";

async function main() {
  const db = getDb();
  if (!db) { console.error("DB not available"); process.exit(1); }

  const livePrices = await lotussScraper.scrape();
  
  const mappings = await db.select({ 
      sourceProductName: productSourceMappings.sourceProductName, 
      productId: productSourceMappings.productId 
    })
    .from(productSourceMappings)
    .innerJoin(sources, eq(productSourceMappings.sourceId, sources.id))
    .where(eq(sources.slug, "lotuss"));
  
  const mappingMap = new Map(mappings.map(m => [m.sourceProductName, m.productId]));

  let matches = 0;
  let mismatches = 0;

  for (const lp of livePrices) {
    const productId = mappingMap.get(lp.sourceProductName);
    if (!productId) continue; 

    const dbPrice = await db.select({ price: prices.price })
      .from(prices)
      .innerJoin(sources, eq(prices.sourceId, sources.id))
      .where(and(
        eq(prices.productId, productId),
        eq(sources.slug, "lotuss"),
        eq(prices.unit, lp.unit)
      ))
      .orderBy(desc(prices.sourceDate), desc(prices.scrapedAt))
      .limit(1);

    if (dbPrice.length > 0 && Math.abs(lp.price - Number(dbPrice[0].price)) < 0.01) {
      matches++;
    } else {
      mismatches++;
      console.log(`Mismatch: ${lp.sourceProductName} (${lp.unit}) - Live: ${lp.price} vs DB: ${dbPrice[0]?.price}`);
    }
  }

  console.log(`Results: ${matches} matches, ${mismatches} mismatches.`);
}

main().catch(console.error);
