import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { filterLotusCandidates, lotussScraper, type LotusApiProduct, type LotusSearchResponse } from "../lotuss";
import * as types from "../types";

vi.mock("../types", async (importOriginal) => {
  const original = await importOriginal<typeof types>();
  return {
    ...original,
    fetchJson: vi.fn(),
  };
});

const makePackProduct = (
  name: string,
  finalPrice: number,
  id: number = 1,
  sku: string = "sku",
): LotusApiProduct => ({
  id,
  name,
  sku,
  priceRange: {
    minimumPrice: {
      finalPrice: {
        value: finalPrice,
        currency: "THB",
        currencyPrefix: "฿",
      },
    },
  },
});

const makeWeightProduct = (
  name: string,
  finalPrice: number, // tray price
  finalPricePerUOW: number, // per-kg price
  uow: string = "KG",
  id: number = 1,
  sku: string = "sku",
): LotusApiProduct => ({
  id,
  name,
  sku,
  sellingType: "weight",
  uow,
  priceRange: {
    minimumPrice: {
      finalPrice: {
        value: finalPrice,
        currency: "THB",
        currencyPrefix: "฿",
      },
      finalPricePerUOW: {
        value: finalPricePerUOW,
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

  describe("pricing logic (regression from bug #2)", () => {
    it("weight item emits finalPricePerUOW as บาท/กก. price, not tray price", async () => {
      vi.mocked(types.fetchJson).mockImplementation(async (_url, init) => {
        const body = JSON.parse(init?.body as string);
        if (body.keyword === "หมูบด") {
          return mockApiResponse([makeWeightProduct("หมูบด กก.ละ", 25.8, 129)]);
        }
        return mockApiResponse([]);
      });
      const results = await runScrape();
      const pork = results.find((r) => r.sourceProductName === "หมูบด");
      expect(results).toHaveLength(1);
      expect(pork?.price).toBe(129);
      expect(pork?.unit).toBe("บาท/กก.");
    });

    it("pack item emits finalPrice as บาท/ชิ้น", async () => {
      vi.mocked(types.fetchJson).mockImplementation(async (_url, init) => {
        const body = JSON.parse(init?.body as string);
        if (body.keyword === "หมูบด") {
          return mockApiResponse([makePackProduct("ซีพี หมูบดอนามัย 800g", 125)]);
        }
        return mockApiResponse([]);
      });
      const results = await runScrape();
      const pork = results.find((r) => r.sourceProductName === "หมูบด");
      expect(results).toHaveLength(1);
      expect(pork?.price).toBe(125);
      expect(pork?.unit).toBe("บาท/ชิ้น");
    });

    it("emits BOTH weight and pack rows when both candidate families exist", async () => {
      vi.mocked(types.fetchJson).mockImplementation(async (_url, init) => {
        const body = JSON.parse(init?.body as string);
        if (body.keyword === "หมูบด") {
          return mockApiResponse([
            makeWeightProduct("หมูบด กก.ละ", 25.8, 129),
            makePackProduct("ซีพี หมูบดอนามัย 800g", 125),
          ]);
        }
        return mockApiResponse([]);
      });
      const results = await runScrape();
      expect(results).toHaveLength(2);
      const weight = results.find((r) => r.unit === "บาท/กก.");
      const pack = results.find((r) => r.unit === "บาท/ชิ้น");
      expect(weight?.price).toBe(129);
      expect(pack?.price).toBe(125);
    });

    it("emits single pack row when only pack candidates exist", async () => {
      vi.mocked(types.fetchJson).mockImplementation(async (_url, init) => {
        const body = JSON.parse(init?.body as string);
        if (body.keyword === "หมูบด") {
          return mockApiResponse([
            makePackProduct("ซีพี หมูบดอนามัย 800g", 125),
            makePackProduct("โลตัส หมูบด 250g", 39),
          ]);
        }
        return mockApiResponse([]);
      });
      const results = await runScrape();
      expect(results).toHaveLength(1);
      expect(results[0].price).toBe(39);
      expect(results[0].unit).toBe("บาท/ชิ้น");
    });

    it("drops weight candidates below 60 บาท/กก. sanity bound", async () => {
      vi.mocked(types.fetchJson).mockImplementation(async (_url, init) => {
        const body = JSON.parse(init?.body as string);
        if (body.keyword === "หมูบด") {
          return mockApiResponse([
            makeWeightProduct("หมูบดลดราคาพิเศษ", 10, 55), // Unreasonable price
            makeWeightProduct("หมูบดปกติ", 25.8, 129),
          ]);
        }
        return mockApiResponse([]);
      });
      const results = await runScrape();
      const weightItems = results.filter((r) => r.unit === "บาท/กก.");
      expect(weightItems).toHaveLength(1);
      expect(weightItems[0].price).toBe(129);
    });
  });

  it("emits บาท/กก. row for หมูสะโพก when API returns only reversed titles", async () => {
    vi.mocked(types.fetchJson).mockImplementation(async (_url, init) => {
      const body = JSON.parse(init?.body as string);
      if (body.keyword === "หมูสะโพก") {
        return mockApiResponse([makeWeightProduct("สะโพกหมู กก.ละ", 42.5, 170)]);
      }
      return mockApiResponse([]);
    });

    const results = await runScrape();
    const pork = results.find((r) => r.sourceProductName === "หมูสะโพก");
    expect(pork?.price).toBe(170);
    expect(pork?.unit).toBe("บาท/กก.");
  });

  it("skips term when API returns empty product list", async () => {
    vi.mocked(types.fetchJson).mockImplementation(async (_url, init) => {
      const body = JSON.parse(init?.body as string);
      if (body.keyword === "unobtainium") return mockApiResponse([]);
      return mockApiResponse([makePackProduct(body.keyword, 89)]);
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
      if (body.keyword === errorTerm) return Promise.reject(new Error("API error"));
      return mockApiResponse([makePackProduct(`${body.keyword} a`, 100)]);
    });

    const results = await runScrape();
    const failedProduct = results.find((r) => r.sourceProductName === errorTerm);
    expect(failedProduct).toBeUndefined();
    expect(results.length).toBeGreaterThan(0);
  });

  it("skips products outside 5–2000 price bounds", async () => {
    vi.mocked(types.fetchJson).mockImplementation(async (_url, init) => {
      const body = JSON.parse(init?.body as string);
      if (body.keyword === "ซี่โครงหมู") {
        return mockApiResponse([
          makePackProduct("โลตัส ซี่โครงหมู", 2001),
          makePackProduct("โลตัส ซี่โครงหมู", 4),
          makePackProduct("โลตัส ซี่โครงหมู", 100),
        ]);
      }
      return mockApiResponse([]);
    });
    const results = await runScrape();
    const porkRibs = results.filter((r) => r.sourceProductName === "ซี่โครงหมู");
    expect(porkRibs).toHaveLength(1);
    expect(porkRibs[0].price).toBe(100);
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

  it("fetches page 2 and returns cheapest of each family", async () => {
    vi.mocked(types.fetchJson).mockImplementation(async (url, init) => {
      const body = JSON.parse(init?.body as string);
      if (body.keyword === "ซี่โครงหมู") {
        if (String(url).includes("page=2")) {
          return mockApiResponse([
             makeWeightProduct("ซี่โครงหมู หน้า2", 20, 100), // cheaper weight
          ], false);
        }
        return mockApiResponse([
          makePackProduct("ซี่โครงหมู หน้า1 แพค", 90), // cheaper pack
          makeWeightProduct("ซี่โครงหมู หน้า1", 25, 120),
        ], true);
      }
      return mockApiResponse([]);
    });

    const results = await runScrape();
    const porkRibs = results.filter((r) => r.sourceProductName === "ซี่โครงหมู");
    expect(porkRibs).toHaveLength(2);

    const weight = porkRibs.find(p => p.unit === 'บาท/กก.');
    const pack = porkRibs.find(p => p.unit === 'บาท/ชิ้น');
    expect(weight?.price).toBe(100);
    expect(pack?.price).toBe(90);

    const fetchCalls = vi.mocked(types.fetchJson).mock.calls;
    expect(fetchCalls.some((c) => String(c[0]).includes("page=2"))).toBe(true);
  });
});

describe("filterLotusCandidates", () => {
  it("selects strict matches when available", () => {
    const products = [makePackProduct("หมูสับ แพ็คสุดคุ้ม", 100)];
    const result = filterLotusCandidates(products, "หมูสับ");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("หมูสับ แพ็คสุดคุ้ม");
  });

  it("falls back to alias 'หมูบดอนามัย' for 'หมูสับ' if no strict match", () => {
    const products = [makePackProduct("หมูบดอนามัย", 110), makePackProduct("หมูบดธรรมดา", 90)];
    const result = filterLotusCandidates(products, "หมูสับ");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("หมูบดอนามัย");
  });

  it("falls back to alias 'เนื้อหมูบด' for 'หมูสับ' if no strict match", () => {
    const products = [makePackProduct("เนื้อหมูบด", 110), makePackProduct("หมูบดธรรมดา", 90)];
    const result = filterLotusCandidates(products, "หมูสับ");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("เนื้อหมูบด");
  });

  it("does NOT fall back to plain 'หมูบด' for 'หมูสับ'", () => {
    const products = [makePackProduct("หมูบด", 90)];
    const result = filterLotusCandidates(products, "หมูสับ");
    expect(result).toHaveLength(0);
  });

  it("matches 'หมูคอสไลซ์' using 'สันคอ'", () => {
    const products = [makePackProduct("หมูสันคอสไลซ์ 500กรัม", 150)];
    const result = filterLotusCandidates(products, "หมูคอสไลซ์");
    expect(result).toHaveLength(1);
  });

  it("matches 'หมูคอสไลซ์' using 'คอหมู'", () => {
    const products = [makePackProduct("สุดคุ้ม คอหมูสไลซ์แช่แข็ง", 140)];
    const result = filterLotusCandidates(products, "หมูคอสไลซ์");
    expect(result).toHaveLength(1);
  });

  it("matches 'หมูคอสไลซ์' using 'หมูคอ'", () => {
    const products = [makePackProduct("เนื้อหมูคอ สไลซ์", 160)];
    const result = filterLotusCandidates(products, "หมูคอสไลซ์");
    expect(result).toHaveLength(1);
  });

  it("does NOT match 'คอไก่' for 'หมูคอสไลซ์'", () => {
    const products = [makePackProduct("คอไก่ย่าง", 50)];
    const result = filterLotusCandidates(products, "หมูคอสไลซ์");
    expect(result).toHaveLength(0);
  });

  it("returns empty array if no matches are found", () => {
    const products = [makePackProduct("ไก่สด", 99)];
    const result = filterLotusCandidates(products, "หมูสับ");
    expect(result).toHaveLength(0);
  });

  it("falls back to reversed-order 'สะโพกหมู' for 'หมูสะโพก' when no strict match", () => {
    const products = [
      makePackProduct("สะโพกหมู กก.ละ", 155),
      makePackProduct("ซีพี สะโพกหมูแต่งตัดชิ้น กก.ละ", 165),
      makePackProduct("หมูสามชั้น กก.ละ", 180),
    ];
    const result = filterLotusCandidates(products, "หมูสะโพก");
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("สะโพกหมู กก.ละ");
    expect(result[1].name).toBe("ซีพี สะโพกหมูแต่งตัดชิ้น กก.ละ");
  });

  it("strict forward-order 'หมูสะโพก' titles win over reversed fallback", () => {
    const products = [
      makePackProduct("หมูสะโพก แพ็ค", 100),
      makePackProduct("สะโพกหมู กก.ละ", 90),
    ];
    const result = filterLotusCandidates(products, "หมูสะโพก");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("หมูสะโพก แพ็ค");
  });

  it("does NOT match 'สะโพกไก่' for 'หมูสะโพก'", () => {
    const products = [makePackProduct("สะโพกไก่ กก.ละ", 60)];
    const result = filterLotusCandidates(products, "หมูสะโพก");
    expect(result).toHaveLength(0);
  });
});

