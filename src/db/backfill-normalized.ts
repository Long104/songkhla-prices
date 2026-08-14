/**
 * One-time backfill: normalize all existing price rows.
 * Reads each row, computes normalized values, updates in place.
 * 
 * Usage: npx tsx src/db/backfill-normalized.ts
 */
import { getDb } from "@/db";
import { prices, products } from "@/db/schema";
import { eq, isNull } from "drizzle-orm";
import { normalizeAtIngest } from "@/lib/normalize-ingest";

async function main() {
  const db = getDb();
  if (!db) {
    console.error("Database not available.");
    process.exit(1);
  }

  // Fetch all rows where normalized_unit is NULL
  const rows = await db
    .select({
      id: prices.id,
      price: prices.price,
      unit: prices.unit,
      productId: prices.productId,
    })
    .from(prices)
    .where(isNull(prices.normalizedUnit));

  console.log(`Found ${rows.length} rows to backfill`);

  // Build a product-name lookup for weight extraction
  const productRows = await db
    .select({ id: products.id, nameTh: products.nameTh })
    .from(products);
  const productNameMap = new Map(productRows.map((p) => [p.id, p.nameTh]));

  let updated = 0;
  for (const row of rows) {
    const productName = productNameMap.get(row.productId) ?? "";
    const normalized = normalizeAtIngest(Number(row.price), row.unit, productName);
    
    await db
      .update(prices)
      .set({
        normalizedPrice: normalized.normalizedPrice.toString(),
        normalizedUnit: normalized.normalizedUnit,
        weightGrams: normalized.weightGrams,
      })
      .where(eq(prices.id, row.id));
    
    updated++;
    if (updated % 50 === 0) {
      console.log(`  Backfilled ${updated}/${rows.length}`);
    }
  }

  console.log(`Done. Backfilled ${updated} rows.`);
}

main().catch(console.error);
