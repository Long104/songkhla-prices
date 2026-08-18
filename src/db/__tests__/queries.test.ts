import { describe, expect, it, beforeEach } from "vitest";
import { getLatestPricesForProducts, getLatestPricesForProduct, type RawPriceRowWithProduct } from "@/db/queries";
import { getDb } from "@/db";
import { sql } from "drizzle-orm";
import { sources, categories, products, provinces, prices } from "@/db/schema";

const db = getDb()!;

async function seedFixtures() {
  await db.execute(sql`TRUNCATE TABLE prices, products, categories, sources, provinces RESTART IDENTITY CASCADE`);
  await db.insert(sources).values([{ id: 100, slug: "dit", nameTh: "กรมการค้าภายใน", nameEn: "DIT", url: "http://dit.go.th", type: "government" }]);
  await db.insert(categories).values([{ id: 100, slug: "meat", nameTh: "เนื้อสัตว์", nameEn: "Meat" }]);
  await db.insert(products).values([
    { id: 100, slug: "pork-belly", nameTh: "หมูสามชั้น", categoryId: 100 },
    { id: 101, slug: "chicken-breast", nameTh: "อกไก่", categoryId: 100 },
  ]);
  await db.insert(provinces).values([{ id: 100, code: "90", nameTh: "สงขลา", nameEn: "Songkhla" }]);
  await db.insert(prices).values([
    { productId: 100, sourceId: 100, price: "150", unit: "บาท/กก.", sourceDate: "2026-08-13", scrapedAt: new Date("2026-08-13T10:00:00Z"), productTitle: "หมูสามชั้น", productUrl: "https://dit.go.th/1" },
    { productId: 100, sourceId: 100, provinceId: 100, price: "160", unit: "บาท/กก.", sourceDate: "2026-08-14", scrapedAt: new Date("2026-08-14T10:00:00Z"), productTitle: "หมูสามชั้น สด", productUrl: "https://dit.go.th/2" },
    { productId: 101, sourceId: 100, price: "80", unit: "บาท/กก.", sourceDate: "2026-08-14", scrapedAt: new Date("2026-08-14T10:00:00Z"), productTitle: "อกไก่", productUrl: "https://dit.go.th/3" },
  ]);
}

describe("getLatestPricesForProducts parity", () => {
  beforeEach(async () => {
    await seedFixtures();
  });

  it("returns batched output identical to per-product calls", async () => {
    const productIds = [100, 101];
    const batched = await getLatestPricesForProducts(db, productIds, 100);
    const perProduct1 = await getLatestPricesForProduct(db, 100, 100);
    const perProduct2 = await getLatestPricesForProduct(db, 101, 100);
    
    const expected = [
      ...perProduct1.map(r => ({ ...r, productId: 100 })), 
      ...perProduct2.map(r => ({ ...r, productId: 101 }))
    ];
    
    expect(batched.length).toEqual(expected.length);
    // Sort for comparison
    const sort = (a: RawPriceRowWithProduct, b: RawPriceRowWithProduct) =>
      a.productId - b.productId || a.sourceId - b.sourceId;
    expect(batched.sort(sort)).toEqual(expected.sort(sort));
  });

  it("selects productTitle and productUrl from the latest row", async () => {
    const rows = await getLatestPricesForProduct(db, 100, 100);
    expect(rows).toHaveLength(1);
    // The latest price is 160 from 2026-08-14
    expect(rows[0].price).toBe("160.00");
    // It must also select the metadata from that specific row
    expect(rows[0].productTitle).toBe("หมูสามชั้น สด");
    expect(rows[0].productUrl).toBe("https://dit.go.th/2");
  });

  it("returns empty array for empty productIds", async () => {
    const result = await getLatestPricesForProducts(db, [], null);
    expect(result).toEqual([]);
  });
});
