import { describe, it, expect, vi } from "vitest";
import { lotussScraper } from "../lotuss";
import * as browserless from "../browserless";

vi.mock("../browserless", () => ({
  fetchRenderedHtml: vi.fn(),
}));

describe("lotussScraper", () => {
  it("scrapes products correctly using search terms and text splitting", async () => {
    const mockHtml = `
      <html>
        <body>
          <div>Some content... สบู่หอม ฿59.00 ...</div>
          <div>ปลากระป๋องตราหอย ฿25.00 ...</div>
        </body>
      </html>
    `;
    vi.spyOn(browserless, "fetchRenderedHtml").mockResolvedValue(mockHtml);

    const results = await lotussScraper.scrape();

    expect(results.length).toBeGreaterThan(0);
    
    // Find our mocked items
    const soap = results.find((r) => r.sourceProductName.includes("สบู่หอม"));
    expect(soap).toBeDefined();
    expect(soap?.price).toBe(59);
    expect(soap?.unit).toBe("บาท/ชิ้น");

    const fish = results.find((r) => r.sourceProductName.includes("ปลากระป๋องตราหอย"));
    expect(fish).toBeDefined();
    expect(fish?.price).toBe(25);
    expect(fish?.unit).toBe("บาท/ชิ้น");
  });

  it("calls fetchRenderedHtml with correct options", async () => {
    const mockFetch = vi.spyOn(browserless, "fetchRenderedHtml").mockResolvedValue("<html></html>");
    
    await lotussScraper.scrape();
    
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("https://www.lotuss.com/th/search/"),
      {
        gotoOptions: { waitUntil: "networkidle2", timeout: 35000 },
        waitForTimeout: 3000,
      }
    );
  });
});
