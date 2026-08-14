import { NextRequest, NextResponse } from "next/server";
import { scrapers } from "@/lib/scrapers";
import { writeScraperResults } from "@/lib/scrapers/db-writer";

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(message));
    }, ms);

    promise
      .then((val) => {
        clearTimeout(timer);
        resolve(val);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();
  const ctx = {
    results: {} as Record<string, { status: string; count?: number; error?: string }>,
    unmapped: [] as string[],
  };
  let totalInserted = 0;
  const PER_SCRAPER_TIMEOUT_MS = 240_000;

  // Settle-as-you-go: each scraper's rows are written to the DB the moment
  // that scraper settles, so one slow/hung scraper cannot starve the others.
  await Promise.allSettled(
    scrapers.map(async (scraper) => {
      try {
        const scraped = await withTimeout(
          scraper.scrape(),
          PER_SCRAPER_TIMEOUT_MS,
          `${scraper.sourceSlug} timed out`,
        );
        const inserted = await writeScraperResults(scraper, scraped, ctx);
        totalInserted += inserted;
      } catch (err) {
        ctx.results[scraper.sourceSlug] = {
          status: "error",
          error: err instanceof Error ? err.message : "Unknown error",
        };
      }
    }),
  );

  return NextResponse.json({
    success: true,
    results: ctx.results,
    totalInserted,
    unmapped: ctx.unmapped,
    duration: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
  });
}
