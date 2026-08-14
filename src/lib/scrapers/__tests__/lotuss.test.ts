import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { lotussScraper } from "../lotuss";
import * as types from "../types";

vi.mock("../types", async (importOriginal) => {
  const original = await importOriginal<typeof types>();
  return {
    ...original,
    fetchJson: vi.fn(),
  };
});

interface LotusApiProduct {
  id: number;
  name: string;
  sku: string;
  priceRange: {
    minimumPrice: {
      finalPrice: {
        value: number;
      };
    };
  };
}

interface LotusSearchResponse {
  data: {
    products: LotusApiProduct[];
    hasMore: boolean;
  };
}

const makeProduct = (name: string, price: number, id: number = 1, sku: string = "sku"): LotusApiProduct => ({
  id,
  name,
  sku,
  priceRange: {
    minimumPrice: {
      finalPrice: {
        value: price,
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
