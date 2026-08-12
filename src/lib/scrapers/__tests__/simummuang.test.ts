import { describe, it, expect } from "vitest";
import { simummuangScraper } from "../simummuang";

describe("simummuangScraper", () => {
  it("sourceSlug is 'simummuang'", () => {
    expect(simummuangScraper.sourceSlug).toBe("simummuang");
  });

  it("returns scraped prices from real API", async () => {
    const results = await simummuangScraper.scrape();
    expect(Array.isArray(results)).toBe(true);
  }, 60_000);

  it("all prices are positive numbers", async () => {
    const results = await simummuangScraper.scrape();
    for (const r of results) {
      expect(r.price).toBeGreaterThan(0);
    }
  }, 60_000);

  it("all items have non-empty unit strings", async () => {
    const results = await simummuangScraper.scrape();
    for (const r of results) {
      expect(r.unit).toBeTruthy();
      expect(r.unit.length).toBeGreaterThan(0);
    }
  }, 60_000);

  it("provinceCode is null (national wholesale)", async () => {
    const results = await simummuangScraper.scrape();
    for (const r of results) {
      expect(r.provinceCode).toBeNull();
    }
  }, 60_000);
});
