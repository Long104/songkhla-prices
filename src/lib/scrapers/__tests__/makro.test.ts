import { describe, it, expect } from "vitest";
import { makroScraper } from "../makro";

describe("makroScraper", () => {
  it("returns array of scraped prices", async () => {
    const results = await makroScraper.scrape();
    expect(results.length).toBeGreaterThan(0);
  });

  it("includes seafood products", async () => {
    const results = await makroScraper.scrape();
    const seafood = results.filter((r) =>
      ["ปลาทู", "กุ้งกุลาดำ", "ปลาหมึก"].includes(r.sourceProductName),
    );
    expect(seafood.length).toBeGreaterThanOrEqual(3);
  });

  it("all prices are positive numbers", async () => {
    const results = await makroScraper.scrape();
    for (const r of results) {
      expect(r.price).toBeGreaterThan(0);
    }
  });

  it("all items have non-empty unit strings", async () => {
    const results = await makroScraper.scrape();
    for (const r of results) {
      expect(r.unit).toBeTruthy();
      expect(r.unit.length).toBeGreaterThan(0);
    }
  });

  it("sourceSlug is 'makro'", () => {
    expect(makroScraper.sourceSlug).toBe("makro");
  });

  it("provinceCode is null (national wholesale)", async () => {
    const results = await makroScraper.scrape();
    for (const r of results) {
      expect(r.provinceCode).toBeNull();
    }
  });
});