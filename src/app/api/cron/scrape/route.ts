import { normalizeAtIngest } from "@/lib/normalize-ingest";
import { NextRequest, NextResponse } from "next/server";
import { scrapers } from "@/lib/scrapers";
import { getDb } from "@/db";
import { prices, productSourceMappings, sources, provinces } from "@/db/schema";
import { eq, and } from "drizzle-orm";

/** Format a Date as local YYYY-MM-DD for the `date`-typed source_date column. */
function toDateOnly(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();
  const results: Record<string, { status: string; count?: number; error?: string }> = {};
  let totalInserted = 0;
  const unmapped: string[] = [];

  const scraperResults = await Promise.allSettled(scrapers.map((s) => s.scrape()));

  for (let i = 0; i < scrapers.length; i++) {
    const scraper = scrapers[i];
    const result = scraperResults[i];

    if (result.status === "fulfilled") {
      const scrapedPrices = result.value;
      results[scraper.sourceSlug] = { status: "ok", count: scrapedPrices.length };

      const db = getDb();
      if (!db) {
        results[scraper.sourceSlug] = { status: "error", error: "Database not available" };
        continue;
      }

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
                eq(productSourceMappings.sourceProductName, sp.sourceProductName)
              )
            )
            .limit(1);

          if (!mapping) {
            unmapped.push(sp.sourceProductName);
            continue;
          }

          let provinceId: number | null = null;
          if (sp.provinceCode) {
            const [prov] = await db.select().from(provinces).where(eq(provinces.code, sp.provinceCode)).limit(1);
            if (prov) provinceId = prov.id;
          }

          const normalized = normalizeAtIngest(
            sp.price,
            sp.unit,
            sp.productTitle ?? sp.sourceProductName,
          );

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
            .onConflictDoNothing();
          totalInserted++;
        } catch (err) {
          console.error(`[cron] Failed to upsert price for "${sp.sourceProductName}":`, err);
        }
      }
    } else {
      results[scraper.sourceSlug] = {
        status: "error",
        error: result.reason instanceof Error ? result.reason.message : "Unknown error",
      };
    }
  }

  return NextResponse.json({
    success: true,
    results,
    totalInserted,
    unmapped,
    duration: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
  });
}
