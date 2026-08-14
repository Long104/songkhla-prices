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
});
