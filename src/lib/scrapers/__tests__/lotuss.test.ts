import { describe, it, expect, vi } from "vitest";
import { lotussScraper } from "../lotuss";
import * as browserless from "../browserless";

vi.mock("../browserless", () => ({
  fetchRenderedHtml: vi.fn(),
}));

describe("lotussScraper", () => {
  it("extracts valid product prices within ฿5–฿500 range", async () => {
    const mockHtml = `
      <html><body>
        หมูสามชั้น 150 กรัม ฿39.00 ซื้อครบลดเพิ่ม
        หมูสามชั้น 300 กรัม ฿69.00
      </body></html>
    `;
    vi.spyOn(browserless, "fetchRenderedHtml").mockResolvedValue(mockHtml);

    const results = await lotussScraper.scrape();

    const porkBelly = results.find((r) => r.sourceProductName === "หมูสามชั้น");
    expect(porkBelly).toBeDefined();
    expect(porkBelly?.price).toBe(39); // cheapest variant
    expect(porkBelly?.unit).toBe("บาท/ชิ้น");
  });

  it("filters out prices above ฿500 (phone numbers, cart totals)", async () => {
    const mockHtml = `
      <html><body>
        หมูสามชั้น ฿45.00
        โทร. 02-150-9999 ฿1509
        ราคากลางทั่วประเทศ ฿1339
      </body></html>
    `;
    vi.spyOn(browserless, "fetchRenderedHtml").mockResolvedValue(mockHtml);

    const results = await lotussScraper.scrape();

    const porkBelly = results.find((r) => r.sourceProductName === "หมูสามชั้น");
    expect(porkBelly).toBeDefined();
    expect(porkBelly?.price).toBe(45); // only the valid price
    expect(porkBelly?.price).not.toBe(1509);
    expect(porkBelly?.price).not.toBe(1339);
  });

  it("outputs canonical tracked name as sourceProductName", async () => {
    const mockHtml = `<html><body>หมูสามชั้นสไลซ์ 150 กรัม ฿39.00</body></html>`;
    vi.spyOn(browserless, "fetchRenderedHtml").mockResolvedValue(mockHtml);

    const results = await lotussScraper.scrape();

    // Must be exact "หมูสามชั้น" not the raw scraped title
    const exact = results.find((r) => r.sourceProductName === "หมูสามชั้น");
    expect(exact).toBeDefined();
  });

  it("returns empty when no valid prices found", async () => {
    const mockHtml = `<html><body>ไม่มีสินค้า ฿0 หรือ ฿9999</body></html>`;
    vi.spyOn(browserless, "fetchRenderedHtml").mockResolvedValue(mockHtml);

    const results = await lotussScraper.scrape();
    expect(results.length).toBe(0);
  });

  it("handles browserless returning null gracefully", async () => {
    vi.spyOn(browserless, "fetchRenderedHtml").mockResolvedValue(null);
    const results = await lotussScraper.scrape();
    expect(results.length).toBe(0);
  });
});
