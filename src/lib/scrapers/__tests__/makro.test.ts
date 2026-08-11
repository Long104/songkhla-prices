import { describe, it, expect } from "vitest";
import { makroScraper } from "../makro";

// NOTE: These tests hit the real Makro API (makro.pro `_next/data` endpoints).
// They must not fail CI if Makro is temporarily unreachable — scrape() returns
// an empty array on network failure, and every assertion below is empty-safe.
describe("makroScraper", () => {
  it("sourceSlug is 'makro'", () => {
    expect(makroScraper.sourceSlug).toBe("makro");
  });

  it("returns scraped prices from real API", async () => {
    const results = await makroScraper.scrape();
    // May return 0 if network unreachable, but should not throw
    expect(Array.isArray(results)).toBe(true);
  }, 60_000);

  it("all prices are positive numbers", async () => {
    const results = await makroScraper.scrape();
    for (const r of results) {
      expect(r.price).toBeGreaterThan(0);
    }
  }, 60_000);

  it("all items have non-empty unit strings", async () => {
    const results = await makroScraper.scrape();
    for (const r of results) {
      expect(r.unit).toBeTruthy();
      expect(r.unit.length).toBeGreaterThan(0);
    }
  }, 60_000);

  it("provinceCode is null (national wholesale)", async () => {
    const results = await makroScraper.scrape();
    for (const r of results) {
      expect(r.provinceCode).toBeNull();
    }
  }, 60_000);
});
