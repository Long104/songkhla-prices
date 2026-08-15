
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "@/db";
import { prices, products, sources, productSourceMappings } from "@/db/schema";
import { writeScraperResults, toDateOnly } from "./db-writer";
import type { ScrapedPrice } from "./types";
import type { Scraper } from "./types";
import { eq, and } from "drizzle-orm";

describe("db-writer", () => {
  let db: NonNullable<ReturnType<typeof getDb>>;

  beforeAll(async () => {
    db = getDb()!;
    // Clean up previous test data
    await db.delete(prices);
    await db.delete(productSourceMappings);
    await db.delete(products);
    await db.delete(sources);
  });

  afterAll(async () => {
    // No-op for pool cleanup in test
  });

  it("should update an existing price on conflict", async () => {
    // 1. Seed initial data
    const [source] = await db.insert(sources).values({ slug: "test-source", nameTh: "Test", nameEn: "Test", url: "http://test.com", type: "supermarket" }).returning();
    const [product] = await db.insert(products).values({ slug: "test-product", nameTh: "Test Product", categoryId: 1 }).returning();
    await db.insert(productSourceMappings).values({ productId: product.id, sourceId: source.id, sourceProductName: "Test Product" });

    const today = new Date();
    const todayStr = toDateOnly(today);

    // 2. Insert initial price
    await db.insert(prices).values({
      productId: product.id,
      sourceId: source.id,
      price: "10.00",
      unit: "บาท/ชิ้น",
      scrapedAt: today,
      sourceDate: todayStr,
    });

    // 3. Scrape a new price for the same day
    const newPrice: ScrapedPrice = {
      sourceProductName: "Test Product",
      price: 20.00,
      unit: "บาท/ชิ้น",
      provinceCode: null,
      sourceDate: today,
      productTitle: "Test Product"
    };

    const scraper: Scraper = { sourceSlug: "test-source", scrape: async () => [newPrice] };
    const ctx = { results: {}, unmapped: [] };
    await writeScraperResults(scraper, [newPrice], ctx);

    // 4. Verify the price was updated
    const finalPrice = await db.query.prices.findFirst({
      where: and(
        eq(prices.productId, product.id),
        eq(prices.sourceId, source.id),
        eq(prices.unit, "บาท/ชิ้น"),
        eq(prices.sourceDate, todayStr)
      )
    });

    expect(finalPrice).toBeDefined();
    expect(Number(finalPrice!.price)).toBe(20.00);
  });
});
