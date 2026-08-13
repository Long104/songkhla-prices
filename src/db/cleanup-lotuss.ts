import { getDb } from "@/db";
import { eq } from "drizzle-orm";
import { prices, sources } from "@/db/schema";

async function main() {
  const db = getDb();
  if (!db) {
    console.error("Database not available: DATABASE_URL is not set.");
    process.exit(1);
  }
  console.log("DB connection acquired.");

  const sourcesTable = await db.select().from(sources);
  console.log("Sources found:", sourcesTable.length);

  const [lotussSource] = await db
    .select({ id: sources.id })
    .from(sources)
    .where(eq(sources.slug, "lotuss"))
    .limit(1);

  if (!lotussSource) {
    console.log("Lotus's source not found — nothing to clean.");
    process.exit(0);
  }

  console.log("Found Lotus's source, deleting prices...");
  await db
    .delete(prices)
    .where(eq(prices.sourceId, lotussSource.id));

  console.log("Cleanup completed successfully.");
}

main().catch((err) => {
  console.error("Cleanup failed:", err);
  process.exit(1);
});
