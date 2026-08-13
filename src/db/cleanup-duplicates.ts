import { sql } from "drizzle-orm";
import { getDb } from "./index";

export async function cleanupDuplicatePrices() {
  const db = getDb();
  if (!db) return;
  await db.execute(sql`
    DELETE FROM prices
    WHERE id NOT IN (
      SELECT DISTINCT ON (product_id, source_id) id
      FROM prices
      ORDER BY product_id, source_id, source_date DESC, scraped_at DESC
    )
  `);
}
