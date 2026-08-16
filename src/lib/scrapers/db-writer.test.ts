
import { describe, it, expect, beforeEach } from "vitest";
import { getDb } from "@/db";
import { categories, prices, products, sources, productSourceMappings } from "@/db/schema";
import { writeScraperResults, toDateOnly } from "./db-writer";
import type { ScrapedPrice } from "./types";
import type { Scraper } from "./types";
import { eq, and, sql } from "drizzle-orm";

describe("db-writer", () => {
  let db: NonNullable<ReturnType<typeof getDb>>;

  beforeEach(async () => {
    db = getDb()!;
    // Clean up previous test data
    await db.execute(sql`TRUNCATE TABLE prices, product_source_mappings, products, sources, categories RESTART IDENTITY CASCADE`);
  });

  it("should update an existing price on conflict", async () => {
    // 1. Seed initial data
    const [category] = await db.insert(categories).values({ id: 200, slug: "test-cat", nameTh: "Test", nameEn: "Test", sortOrder: 0 }).returning();
    const [source] = await db.insert(sources).values({ id: 200, slug: "test-source", nameTh: "Test", nameEn: "Test", url: "http://test.com", type: "supermarket" }).returning();
    const [product] = await db.insert(products).values({ id: 200, slug: "test-product", nameTh: "Test Product", categoryId: category.id }).returning();
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
