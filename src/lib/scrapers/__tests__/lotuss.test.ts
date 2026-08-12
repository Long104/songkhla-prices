import { describe, it, expect } from "vitest";
import { lotussScraper } from "../lotuss";

describe("lotussScraper", () => {
  it("sourceSlug is 'lotuss'", () => {
    expect(lotussScraper.sourceSlug).toBe("lotuss");
  });

  it("returns empty array (blocked, graceful fallback)", async () => {
    const results = await lotussScraper.scrape();
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(0);
  });
});
