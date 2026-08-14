import { describe, it, expect, vi } from "vitest";
import { lotussScraper } from "../lotuss";
import * as browserless from "../browserless";

vi.mock("../browserless", () => ({
  fetchRenderedHtml: vi.fn(),
}));

describe("lotussScraper", () => {
  it("extracts valid product prices within ฿5–฿2000 range", async () => {
    const mockHtml = `
      <html><body>
        <div>
          <p>หมูสามชั้น 150 กรัม</p>
          <span>฿39.00</span>
        </div>
        <div>
          <p>หมูสามชั้น 300 กรัม</p>
          <span>฿69.00</span>
        </div>
      </body></html>
    `;
    vi.mocked(browserless.fetchRenderedHtml).mockResolvedValue(mockHtml);

    const results = await lotussScraper.scrape();

    const porkBelly = results.find((r) => r.sourceProductName === "หมูสามชั้น");
    expect(porkBelly).toBeDefined();
    expect(porkBelly?.price).toBe(39); // cheapest variant
    expect(porkBelly?.unit).toBe("บาท/ชิ้น");
  });

  it("filters out prices above ฿2000 (phone numbers, cart totals)", async () => {
    const mockHtml = `
      <html><body>
        <div>หมูสามชั้น ฿45.00</div>
        <div>โทร. 02-150-9999 ฿2500</div>
        <div>ราคากลางทั่วประเทศ ฿2339</div>
      </body></html>
    `;
    vi.mocked(browserless.fetchRenderedHtml).mockResolvedValue(mockHtml);

    const results = await lotussScraper.scrape();

    const porkBelly = results.find((r) => r.sourceProductName === "หมูสามชั้น");
    expect(porkBelly).toBeDefined();
    expect(porkBelly?.price).toBe(45); // only the valid price
  });

  it("outputs canonical tracked name as sourceProductName", async () => {
    const mockHtml = `<html><body><div>หมูสามชั้นสไลซ์ 150 กรัม ฿39.00</div></body></html>`;
    vi.mocked(browserless.fetchRenderedHtml).mockResolvedValue(mockHtml);
    const results = await lotussScraper.scrape();
    const exact = results.find((r) => r.sourceProductName === "หมูสามชั้น");
    expect(exact).toBeDefined();
  });

  it("returns empty when no valid prices found", async () => {
    const mockHtml = `<html><body>ไม่มีสินค้า ฿0 หรือ ฿9999</body></html>`;
    vi.mocked(browserless.fetchRenderedHtml).mockResolvedValue(mockHtml);
    const results = await lotussScraper.scrape();
    expect(results.filter((r) => r.sourceProductName === "หมูสามชั้น").length).toBe(0);
  });

  it("handles browserless returning null gracefully", async () => {
    vi.mocked(browserless.fetchRenderedHtml).mockResolvedValue(null);
    const results = await lotussScraper.scrape();
    expect(results.length).toBe(0);
  });

  it("extracts Lotus weight and title from the nearest product card", async () => {
    const mockHtml = `
      <html><body>
        <article>
          <h3>Some other product</h3>
          <span>฿99</span>
        </article>
        <article>
          <h3>หมูคอสไลซ์ แพ็คสุดคุ้ม 500 กรัม อร่อยมากจริงๆนะ</h3>
          <p>This is a very long description that goes on and on and on for more than 200 characters just to prove a point about the context window being too small for this kind of extraction and why it is important to scope the text search to the product card instead of the whole body text. Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>
          <span>฿159.50</span>
        </article>
      </body></html>
    `;
    vi.mocked(browserless.fetchRenderedHtml).mockResolvedValue(mockHtml);

    const results = await lotussScraper.scrape();
    const porkNeck = results.find((r) => r.sourceProductName === "หมูคอสไลซ์");

    expect(porkNeck).toBeDefined();
    expect(porkNeck?.price).toBe(159.5);
    expect(porkNeck?.productTitle).toContain("หมูคอสไลซ์ แพ็คสุดคุ้ม 500 กรัม");
    expect(porkNeck?.productTitle).not.toContain("Some other product");
  });

  it("does not associate a price with a neighboring Lotus card", async () => {
    const mockHtml = `
      <html><body>
        <div class="product-card">
          <h4>หมูคอสไลซ์ -- สินค้าหมด</h4>
          <p>ขออภัย, สินค้าหมดสต็อกชั่วคราว</p>
        </div>
        <div class="product-card">
          <h4>ไก่ทอดคาราเกะ</h4>
          <p>อร่อย</p>
          <span>฿129.00</span>
        </div>
      </body></html>
    `;
    vi.mocked(browserless.fetchRenderedHtml).mockResolvedValue(mockHtml);
    const results = await lotussScraper.scrape();
    const porkNeck = results.find((r) => r.sourceProductName === "หมูคอสไลซ์");
    expect(porkNeck).toBeUndefined();
  });
});
