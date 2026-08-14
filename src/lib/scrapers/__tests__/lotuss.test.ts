import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { filterLotusCandidates, lotussScraper, type LotusApiProduct } from "../lotuss";
import * as types from "../types";

vi.mock("../types", async (importOriginal) => {
  const original = await importOriginal<typeof types>();
  return {
    ...original,
    fetchJson: vi.fn(),
  };
});

const makeProduct = (name: string, price: number, id: number = 1, sku: string = "sku"): LotusApiProduct => ({
  id,
  name,
  sku,
  priceRange: {
    minimumPrice: {
      finalPrice: {
        value: price,
        currency: "THB",
        currencyPrefix: "฿",
      },
    },
  },
});

const mockApiResponse = (products: LotusApiProduct[], hasMore: boolean = false): LotusSearchResponse => ({
  data: {
    products,
    hasMore,
  },
});

describe("lotussScraper", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  async function runScrape(): Promise<types.ScrapedPrice[]> {
    const promise = lotussScraper.scrape();
    await vi.runAllTimersAsync();
    return promise;
  }

  it("returns cheapest matching product per tracked term", async () => {
    vi.mocked(types.fetchJson).mockImplementation(async (_url, init) => {
      const body = JSON.parse(init?.body as string);
      if (body.keyword === "ซี่โครงหมู") {
        return mockApiResponse([
          makeProduct("ซีพี ซี่โครงหมูหั่นชิ้น 500 กรัม", 129),
          makeProduct("โลตัส ซี่โครงหมู 250 กรัม", 89),
          makeProduct("ไก่สด", 99),
        ]);
      }
      return mockApiResponse([]);
    });

    const results = await runScrape();
    const porkRibs = results.find((r) => r.sourceProductName === "ซี่โครงหมู");

    expect(porkRibs).toBeDefined();
    expect(porkRibs?.price).toBe(89);
  });

  it("productTitle is the full API title with weight text", async () => {
    const fullTitle = "โลตัส ซี่โครงหมู 250 กรัม";
    vi.mocked(types.fetchJson).mockImplementation(async (_url, init) => {
      const body = JSON.parse(init?.body as string);
      if (body.keyword === "ซี่โครงหมู") {
        return mockApiResponse([makeProduct(fullTitle, 89)]);
      }
      return mockApiResponse([]);
    });

    const results = await runScrape();
    const porkRibs = results.find((r) => r.sourceProductName === "ซี่โครงหมู");

    expect(porkRibs).toBeDefined();
    expect(porkRibs?.productTitle).toBe(fullTitle);
  });

  it("sourceProductName equals dictionary key, not the API title", async () => {
    const fullTitle = "โลตัส ซี่โครงหมู 250 กรัม";
    vi.mocked(types.fetchJson).mockImplementation(async (_url, init) => {
      const body = JSON.parse(init?.body as string);
      if (body.keyword === "ซี่โครงหมู") {
        return mockApiResponse([makeProduct(fullTitle, 89)]);
      }
      return mockApiResponse([]);
    });

    const results = await runScrape();
    const porkRibs = results.find((r) => r.price === 89);

    expect(porkRibs).toBeDefined();
    expect(porkRibs?.sourceProductName).toBe("ซี่โครงหมู");
  });

  it("skips products outside 5–2000 price bounds", async () => {
    vi.mocked(types.fetchJson).mockImplementation(async (_url, init) => {
      const body = JSON.parse(init?.body as string);
      if (body.keyword === "ซี่โครงหมู") {
        return mockApiResponse([
          makeProduct("โลตัส ซี่โครงหมู", 2001),
          makeProduct("โลตัส ซี่โครงหมู", 4),
          makeProduct("โลตัส ซี่โครงหมู", 100),
        ]);
      }
      return mockApiResponse([]);
    });

    const results = await runScrape();
    const porkRibs = results.find((r) => r.sourceProductName === "ซี่โครงหมู");

    expect(porkRibs).toBeDefined();
    expect(porkRibs?.price).toBe(100);
  });

  it("skips term when API returns empty product list", async () => {
    vi.mocked(types.fetchJson).mockImplementation(async (_url, init) => {
      const body = JSON.parse(init?.body as string);
      if (body.keyword === "unobtainium") {
        return mockApiResponse([]);
      }
      return mockApiResponse([makeProduct(body.keyword, 89)]);
    });

    const results = await runScrape();
    const unobtainium = results.find((r) => r.sourceProductName === "unobtainium");
    const otherProducts = results.filter((r) => r.sourceProductName !== "unobtainium");

    expect(unobtainium).toBeUndefined();
    expect(otherProducts.length).toBeGreaterThan(0);
  });

  it("continues other terms when one term's fetch rejects", async () => {
    const errorTerm = "หมูสะโพก";
    vi.mocked(types.fetchJson).mockImplementation(async (_url, init) => {
      const body = JSON.parse(init?.body as string);
      if (body.keyword === errorTerm) {
        return Promise.reject(new Error("API error"));
      }
      return mockApiResponse([makeProduct(`${body.keyword} a`, 100)]);
    });

    const results = await runScrape();
    const failedProduct = results.find((r) => r.sourceProductName === errorTerm);

    expect(failedProduct).toBeUndefined();
    expect(results.length).toBeGreaterThan(0);
  });

  it("fetches page 2 when page 1 signals more pages and returns cheapest", async () => {
    vi.mocked(types.fetchJson).mockImplementation(async (url, init) => {
      const body = JSON.parse(init?.body as string);
      if (body.keyword === "ซี่โครงหมู") {
        if (String(url).includes("page=2")) {
          return mockApiResponse([makeProduct("โลตัส ซี่โครงหมู หน้า2", 90)], false);
        }
        return mockApiResponse([makeProduct("โลตัส ซี่โครงหมู หน้า1", 100)], true);
      }
      return mockApiResponse([]);
    });

    const results = await runScrape();
    const porkRibs = results.find((r) => r.sourceProductName === "ซี่โครงหมู");

    expect(porkRibs?.price).toBe(90);
    const fetchCalls = vi.mocked(types.fetchJson).mock.calls;
    expect(fetchCalls.some((c) => String(c[0]).includes("page=2"))).toBe(true);
  });

  it("sends captured browser headers in every request", async () => {
    vi.mocked(types.fetchJson).mockResolvedValue(mockApiResponse([]));

    await runScrape();

    const fetchCalls = vi.mocked(types.fetchJson).mock.calls;
    expect(fetchCalls.length).toBeGreaterThan(0);

    for (const call of fetchCalls) {
      const init = call[1];
      expect(init?.headers).toEqual({
        "content-type": "application/json",
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      });
    }
  });
});

describe("filterLotusCandidates", () => {
  it("selects strict matches when available", () => {
    const products = [makeProduct("หมูสับ แพ็คสุดคุ้ม", 100)];
    const result = filterLotusCandidates(products, "หมูสับ");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("หมูสับ แพ็คสุดคุ้ม");
  });

  it("falls back to alias 'หมูบดอนามัย' for 'หมูสับ' if no strict match", () => {
    const products = [makeProduct("หมูบดอนามัย", 110), makeProduct("หมูบดธรรมดา", 90)];
    const result = filterLotusCandidates(products, "หมูสับ");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("หมูบดอนามัย");
  });

  it("falls back to alias 'เนื้อหมูบด' for 'หมูสับ' if no strict match", () => {
    const products = [makeProduct("เนื้อหมูบด", 110), makeProduct("หมูบดธรรมดา", 90)];
    const result = filterLotusCandidates(products, "หมูสับ");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("เนื้อหมูบด");
  });

  it("does NOT fall back to plain 'หมูบด' for 'หมูสับ'", () => {
    const products = [makeProduct("หมูบด", 90)];
    const result = filterLotusCandidates(products, "หมูสับ");
    expect(result).toHaveLength(0);
  });

  it("matches 'หมูคอสไลซ์' using 'สันคอ'", () => {
    const products = [makeProduct("หมูสันคอสไลซ์ 500กรัม", 150)];
    const result = filterLotusCandidates(products, "หมูคอสไลซ์");
    expect(result).toHaveLength(1);
  });

  it("matches 'หมูคอสไลซ์' using 'คอหมู'", () => {
    const products = [makeProduct("สุดคุ้ม คอหมูสไลซ์แช่แข็ง", 140)];
    const result = filterLotusCandidates(products, "หมูคอสไลซ์");
    expect(result).toHaveLength(1);
  });

  it("matches 'หมูคอสไลซ์' using 'หมูคอ'", () => {
    const products = [makeProduct("เนื้อหมูคอ สไลซ์", 160)];
    const result = filterLotusCandidates(products, "หมูคอสไลซ์");
    expect(result).toHaveLength(1);
  });

  it("does NOT match 'คอไก่' for 'หมูคอสไลซ์'", () => {
    const products = [makeProduct("คอไก่ย่าง", 50)];
    const result = filterLotusCandidates(products, "หมูคอสไลซ์");
    expect(result).toHaveLength(0);
  });

  it("returns empty array if no matches are found", () => {
    const products = [makeProduct("ไก่สด", 99)];
    const result = filterLotusCandidates(products, "หมูสับ");
    expect(result).toHaveLength(0);
  });
});
