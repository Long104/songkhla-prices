import { describe, it, expect, vi } from "vitest";
import { lotussScraper } from "../lotuss";
import * as browserless from "../browserless";

vi.mock("../browserless", () => ({
  fetchRenderedHtml: vi.fn(),
}));

describe("lotussScraper", () => {
  it("scrapes products correctly from mocked HTML", async () => {
    const mockHtml = `
      <div class="product-card">
        <h3 class="product-name">Test Product</h3>
        <span class="price">฿100.00</span>
      </div>
    `;
    vi.spyOn(browserless, "fetchRenderedHtml").mockResolvedValue(mockHtml);

    const results = await lotussScraper.scrape();
    // Check if at least one result matches the structure
    expect(results.length).toBeGreaterThan(0);
    const item = results[0];
    expect(item.sourceProductName).toBe("Test Product");
    expect(item.price).toBe(100);
    expect(item.unit).toBe("ชิ้น");
  });
});
