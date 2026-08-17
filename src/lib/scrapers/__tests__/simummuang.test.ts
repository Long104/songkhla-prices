import { describe, it, expect, vi, beforeEach } from "vitest";
import { simummuangScraper } from "../simummuang";
import * as types from "../types";

vi.mock("../types", () => ({
  fetchJson: vi.fn(),
}));

describe("simummuangScraper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sourceSlug is 'simummuang'", () => {
    expect(simummuangScraper.sourceSlug).toBe("simummuang");
  });

  it("returns scraped prices from mocked response", async () => {
    vi.mocked(types.fetchJson).mockResolvedValue({
      statusCode: 200,
      data: {
        data: [
          {
            th: { name: "ผักคะน้า" },
            price: { small: { min: 10, max: 20 }, medium: { min: 15, max: 25 }, large: { min: 20, max: 30 } },
            prod_unit_id: { th: { name: "กิโลกรัม" } },
          },
        ],
        total: 1,
        totalPages: 1,
        currentPage: 1,
      },
    });

    const results = await simummuangScraper.scrape();
    expect(results).toHaveLength(1);
    expect(results[0].sourceProductName).toBe("ผักคะน้า");
    expect(results[0].price).toBe(15);
    expect(results[0].unit).toBe("บาท/กก.");
    expect(results[0].provinceCode).toBeNull();
  });

  it("all prices are positive numbers", async () => {
    vi.mocked(types.fetchJson).mockResolvedValue({
      statusCode: 200,
      data: {
        data: [
          {
            th: { name: "ผักคะน้า" },
            price: { small: { min: 10, max: 20 }, medium: { min: 15, max: 25 }, large: { min: 20, max: 30 } },
            prod_unit_id: { th: { name: "กิโลกรัม" } },
          },
        ],
        total: 1,
        totalPages: 1,
        currentPage: 1,
      },
    });
    const results = await simummuangScraper.scrape();
    for (const r of results) {
      expect(r.price).toBeGreaterThan(0);
    }
  });

  it("all items have non-empty unit strings", async () => {
    vi.mocked(types.fetchJson).mockResolvedValue({
      statusCode: 200,
      data: {
        data: [
          {
            th: { name: "ผักคะน้า" },
            price: { small: { min: 10, max: 20 }, medium: { min: 15, max: 25 }, large: { min: 20, max: 30 } },
            prod_unit_id: { th: { name: "กิโลกรัม" } },
          },
        ],
        total: 1,
        totalPages: 1,
        currentPage: 1,
      },
    });
    const results = await simummuangScraper.scrape();
    for (const r of results) {
      expect(r.unit).toBeTruthy();
      expect(r.unit.length).toBeGreaterThan(0);
    }
  });

  it("provinceCode is null", async () => {
    vi.mocked(types.fetchJson).mockResolvedValue({
      statusCode: 200,
      data: {
        data: [
          {
            th: { name: "ผักคะน้า" },
            price: { small: { min: 10, max: 20 }, medium: { min: 15, max: 25 }, large: { min: 20, max: 30 } },
            prod_unit_id: { th: { name: "กิโลกรัม" } },
          },
        ],
        total: 1,
        totalPages: 1,
        currentPage: 1,
      },
    });
    const results = await simummuangScraper.scrape();
    for (const r of results) {
      expect(r.provinceCode).toBeNull();
    }
  });

  describe("term matching logic", () => {
    const mockApiProduct = (name: string, price: number = 100) => ({
      th: { name },
      price: { medium: { min: price, max: price } },
      prod_unit_id: { th: { name: "กิโลกรัม" } },
    });

    const setupMockApi = (products: ReturnType<typeof mockApiProduct>[]) => {
      vi.mocked(types.fetchJson).mockResolvedValue({
        statusCode: 200,
        data: {
          data: products,
          total: products.length,
          totalPages: 1,
          currentPage: 1,
        },
      });
    };

    it("exact match term '=น้ำตาล' matches 'น้ำตาล' but not 'ส้มน้ำตาล'", async () => {
      // "ส้มน้ำตาล" is cheaper; if the "=น้ำตาล" term wrongly used substring
      // semantics it would pull the 50 บาท price into sugar. With exact match
      // the sugar price must come only from the "น้ำตาล" (100) product.
      setupMockApi([
        mockApiProduct("น้ำตาล", 100),
        mockApiProduct("ส้มน้ำตาล", 50),
      ]);
      const results = await simummuangScraper.scrape();
      const sugarMatch = results.find(p => p.sourceProductName === "น้ำตาลทราย");
      expect(sugarMatch).toBeDefined();
      expect(sugarMatch?.price).toBe(100);
    });

    it("'หมูสามชั้น' map entry matches real API name 'เนื้อสามชั้นหมู'", async () => {
      setupMockApi([mockApiProduct("เนื้อสามชั้นหมู")]);
      const results = await simummuangScraper.scrape();
      const porkBellyMatch = results.find(p => p.sourceProductName === "หมูสามชั้น");
      expect(porkBellyMatch).toBeDefined();
    });

    it("'ซี่โครงหมู' entry matches 'ซี่โครงกลางหมู' but NOT 'ซี่โครงไก่'", async () => {
       setupMockApi([
        mockApiProduct("ซี่โครงกลางหมู"),
        mockApiProduct("ซี่โครงไก่"),
      ]);
      const results = await simummuangScraper.scrape();
      const porkRibsMatch = results.find(p => p.sourceProductName === "ซี่โครงหมู");
      expect(porkRibsMatch).toBeDefined();
      expect(results.length).toBe(1);
    });

    it("unprefixed terms keep substring semantics ('คะน้า' still matches 'ต้นคะน้า')", async () => {
      setupMockApi([mockApiProduct("ต้นคะน้า")]);
      const results = await simummuangScraper.scrape();
      const kaleMatch = results.find(p => p.sourceProductName === "ผักคะน้า");
      expect(kaleMatch).toBeDefined();
    });
  });
});
