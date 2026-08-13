import { getDb } from "@/db";
import { prices, products, productSourceMappings, sources } from "@/db/schema";
import { eq } from "drizzle-orm";
import { lotussScraper } from "@/lib/scrapers/lotuss";

/** Format a Date as local YYYY-MM-DD for the `date`-typed source_date column. */
function toDateOnly(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

async function main() {
  const db = getDb();
  if (!db) {
    console.error("Database not available.");
    process.exit(1);
  }

  console.log("Scraping Lotus's...");
  const results = await lotussScraper.scrape();
  console.log(`  Scraped ${results.length} prices`);

  const mappings = await db
    .select({
      productId: productSourceMappings.productId,
      sourceProductName: productSourceMappings.sourceProductName,
    })
    .from(productSourceMappings)
    .innerJoin(sources, eq(productSourceMappings.sourceId, sources.id))
    .where(eq(sources.slug, "lotuss"));

  const mappingMap = new Map(mappings.map((m) => [m.sourceProductName, m.productId]));

  const sourceRows = await db
    .select({ id: sources.id })
    .from(sources)
    .where(eq(sources.slug, "lotuss"))
    .limit(1);

  if (sourceRows.length === 0) {
    console.error("Lotus's source not found");
    process.exit(1);
  }

  const sourceId = sourceRows[0].id;
  let inserted = 0;
  for (const r of results) {
    const productId = mappingMap.get(r.sourceProductName);
    if (!productId) {
      console.warn(`  No mapping for "${r.sourceProductName}"`);
      continue;
    }

    try {
      await db.insert(prices).values({
        productId,
        sourceId: sourceId,
        price: r.price.toString(),
        unit: r.unit,
        sourceDate: toDateOnly(r.sourceDate),
        provinceId: null,
        scrapedAt: new Date(),
      }).onConflictDoNothing();
      inserted++;
    } catch (e) {
      console.error(`  Error inserting price for "${r.sourceProductName}":`, e);
    }
  }

  const allProducts = await db.select({ id: products.id }).from(products);
  const productsWithPrices = await db.selectDistinct({ productId: prices.productId }).from(prices);
  const withPriceSet = new Set(productsWithPrices.map(p => p.productId));
  
  const withoutPrices = allProducts.filter(p => !withPriceSet.has(p.id));

  console.log(`Inserted ${inserted} prices.`);
  console.log(`${withoutPrices.length} products still without prices.`);
}

main().catch(console.error);
