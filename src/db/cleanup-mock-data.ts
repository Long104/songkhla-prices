/**
 * One-time cleanup: wipe all legacy mock price data.
 *
 *  - Deletes all `prices` rows whose source is oae / taladthai / simummuang
 *  - Deletes the `oae` and `taladthai` source records entirely (hard DELETE)
 *  - Deletes product-source mappings for the removed sources (FK prevents
 *    deleting a source that mappings still reference; mappings are reference
 *    data that `pnpm seed` wipes and re-inserts anyway)
 *  - KEEPS the `simummuang` source record (its real scraper is expected to
 *    start emitting prices once API access is available)
 *
 * Usage:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/songkhla_prices \
 *     npx tsx src/db/cleanup-mock-data.ts
 */
import { getDb } from "@/db";
import { eq, inArray } from "drizzle-orm";
import { prices, productSourceMappings, sources } from "@/db/schema";

const MOCK_SLUGS = ["oae", "taladthai", "simummuang"] as const;
const REMOVE_SOURCE_SLUGS = ["oae", "taladthai"] as const;

async function main() {
  const db = getDb();
  if (!db) {
    console.error("Database not available: DATABASE_URL is not set.");
    process.exit(1);
  }

  // 1. Resolve source IDs for the mock slugs.
  const sourceRows = await db
    .select({ id: sources.id, slug: sources.slug })
    .from(sources)
    .where(inArray(sources.slug, [...MOCK_SLUGS]));
  const sourceIdBySlug = new Map(sourceRows.map((s) => [s.slug, s.id]));
  const mockSourceIds = sourceRows.map((s) => s.id);
  console.log(
    `Found mock sources: ${
      sourceRows.length > 0
        ? sourceRows.map((s) => `${s.slug} (id=${s.id})`).join(", ")
        : "none"
    }`,
  );

  // 2. Delete all prices for the mock sources.
  if (mockSourceIds.length > 0) {
    const priceRows = await db
      .select({ id: prices.id })
      .from(prices)
      .where(inArray(prices.sourceId, mockSourceIds));
    if (priceRows.length > 0) {
      await db.delete(prices).where(inArray(prices.sourceId, mockSourceIds));
    }
    console.log(
      `Deleted ${priceRows.length} price rows (sources: ${MOCK_SLUGS.join(", ")})`,
    );
  } else {
    console.log("No mock source IDs found — skipping price deletion");
  }

  // 3. Delete product-source mappings for the sources being removed (FK-safe).
  for (const slug of REMOVE_SOURCE_SLUGS) {
    const id = sourceIdBySlug.get(slug);
    if (!id) continue;
    const mappingRows = await db
      .select({ id: productSourceMappings.id })
      .from(productSourceMappings)
      .where(eq(productSourceMappings.sourceId, id));
    if (mappingRows.length > 0) {
      await db
        .delete(productSourceMappings)
        .where(eq(productSourceMappings.sourceId, id));
    }
    console.log(`Deleted ${mappingRows.length} product-source mappings for "${slug}"`);
  }

  // 4. Hard-delete the oae and taladthai sources (simummuang is KEPT).
  for (const slug of REMOVE_SOURCE_SLUGS) {
    const id = sourceIdBySlug.get(slug);
    if (!id) {
      console.log(`Source "${slug}" not found — skipping`);
      continue;
    }
    await db.delete(sources).where(eq(sources.slug, slug));
    console.log(`Deleted source ${slug} (id=${id})`);
  }

  // 5. Report the remaining source list.
  const remaining = await db.select({ slug: sources.slug }).from(sources);
  console.log(`Remaining sources (${remaining.length}): ${remaining.map((s) => s.slug).join(", ")}`);
  console.log("Cleanup completed successfully");
}

main().catch((err) => {
  console.error("Cleanup failed:", err);
  process.exit(1);
});
