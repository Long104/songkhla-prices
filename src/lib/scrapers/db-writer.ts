import { normalizeAtIngest } from "@/lib/normalize-ingest";
import { getDb } from "@/db";
import { prices, productSourceMappings, sources, provinces } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import type { ScrapedPrice, Scraper } from "./types";

/** Format a Date as local YYYY-MM-DD for the `date`-typed source_date column. */
export function toDateOnly(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export interface ScrapeContext {
  results: Record<string, { status: string; count?: number; error?: string }>;
  unmapped: string[];
}

export async function writeScraperResults(
  scraper: Scraper,
  scrapedPrices: ScrapedPrice[],
  ctx: ScrapeContext,
): Promise<number> {
  ctx.results[scraper.sourceSlug] = { status: "ok", count: scrapedPrices.length };

  const db = getDb();
  if (!db) {
    ctx.results[scraper.sourceSlug] = { status: "error", error: "Database not available" };
    return 0;
  }

  let insertedCount = 0;
  for (const sp of scrapedPrices) {
    try {
      const [source] = await db.select().from(sources).where(eq(sources.slug, scraper.sourceSlug)).limit(1);
      if (!source) continue;

      const [mapping] = await db
        .select()
        .from(productSourceMappings)
        .where(
          and(
            eq(productSourceMappings.sourceId, source.id),
            eq(productSourceMappings.sourceProductName, sp.sourceProductName),
          ),
        )
        .limit(1);

      if (!mapping) {
        ctx.unmapped.push(sp.sourceProductName);
        continue;
      }

      let provinceId: number | null = null;
      if (sp.provinceCode) {
        const [prov] = await db.select().from(provinces).where(eq(provinces.code, sp.provinceCode)).limit(1);
        if (prov) provinceId = prov.id;
      }

      const normalized = normalizeAtIngest(sp.price, sp.unit, sp.productTitle ?? sp.sourceProductName);

      await db
        .insert(prices)
        .values({
          productId: mapping.productId,
          sourceId: source.id,
          provinceId,
          price: sp.price.toString(),
          unit: sp.unit,
          normalizedPrice: normalized.normalizedPrice.toString(),
          normalizedUnit: normalized.normalizedUnit,
          weightGrams: normalized.weightGrams,
          scrapedAt: new Date(),
          sourceDate: toDateOnly(sp.sourceDate),
        })
        .onConflictDoUpdate({
          target: [prices.productId, prices.sourceId, prices.provinceId, prices.sourceDate, prices.unit],
          set: {
            price: sp.price.toString(),
            unit: sp.unit,
            normalizedPrice: normalized.normalizedPrice.toString(),
            normalizedUnit: normalized.normalizedUnit,
            weightGrams: normalized.weightGrams,
            scrapedAt: new Date(),
            sourceDate: toDateOnly(sp.sourceDate),
          },
        });
      insertedCount++;
    } catch (err) {
      console.error(`[cron] Failed to upsert price for "${sp.sourceProductName}":`, err);
    }
  }
  return insertedCount;
}
