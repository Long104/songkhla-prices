import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { makroScraper } from "../makro";
import * as types from "../types";

vi.mock("../types", () => ({
  fetchHtml: vi.fn(),
  fetchJson: vi.fn(),
}));

// Local types for tests
interface MakroProductDocument {
  title: string;
  titleEn: string;
  displayPrice: number;
  originalPrice: number;
  packagingWeight: number;
  brand: string;
  brandEn: string;
  makroId: number | string;
  id: number | string;
  images: string[];
  inStock: number;
  categories: string[];
  unitSize: string;
  unitType: string;
  unitFactor: number;
}
interface MakroSearchHit {
  document: MakroProductDocument;
}
interface MakroCategoryResponse {
  pageProps: {
    initialSearchResult: {
      found: number;
      hits: MakroSearchHit[];
      page: number;
    };
  };
}

function makeDoc(
  title: string,
  displayPrice: number,
  packagingWeight: number = 1.0, // default 1kg for easy price assertions
): MakroProductDocument {
  return {
    title,
    titleEn: "",
    displayPrice,
    originalPrice: displayPrice,
    packagingWeight,
    brand: "Makro",
    brandEn: "MAKRO",
    makroId: "1",
    id: "1",
    images: [],
    inStock: 1,
    categories: [],
    unitSize: "",
    unitType: "",
    unitFactor: 1,
  };
}

function mockCategoryResponse(
  hits: MakroSearchHit[],
  page: number = 1,
  found: number = hits.length,
): MakroCategoryResponse {
  return {
    pageProps: {
      initialSearchResult: {
        found,
        hits,
        page,
      },
    },
  };
}

describe("makroScraper", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(types.fetchHtml).mockResolvedValue(
      `<html><script id="__NEXT_DATA__">{"buildId":"test-build-id"}</script></html>`,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  async function runScrape(): Promise<ReturnType<typeof makroScraper.scrape>> {
    const promise = makroScraper.scrape();
    await vi.runAllTimersAsync();
    return promise;
  }

  it("sourceSlug is 'makro'", () => {
    expect(makroScraper.sourceSlug).toBe("makro");
  });

  it("matches pork-neck alias on page 2 (when API honors pagination)", async () => {
    const page1Hits = [{ document: makeDoc("หมูสามชั้น", 99) }];
    const page2Hits = [{ document: makeDoc("หมูสันคอสไลซ์ 1 กก.", 159) }];

    vi.mocked(types.fetchJson).mockImplementation(async (url: string) => {
      if (typeof url === "string" && url.includes("meat/pork")) {
        if (url.includes("page=2")) return mockCategoryResponse(page2Hits, 2, 1);
        // Page 1: mock without page param
        return mockCategoryResponse(page1Hits, 1, 1);
      }
      return mockCategoryResponse([], 1, 0);
    });

    const results = await runScrape();
    const porkNeck = results.find((r) => r.sourceProductName === "หมูคอสไลซ์");
    expect(porkNeck).toBeDefined();
    expect(porkNeck?.price).toBe(159);
    expect(vi.mocked(types.fetchJson).mock.calls.some((c) => String(c[0]).includes("page=2"))).toBe(true);
  });

  it("stops requesting further pages when API echoes page 1", async () => {
    const page1Hits = [{ document: makeDoc("หมูสันคอสไลซ์ 1 กก.", 159) }];
    const fetchCalls: string[] = [];

    vi.mocked(types.fetchJson).mockImplementation(async (url: string) => {
      fetchCalls.push(url as string);
      if (typeof url === "string" && url.includes("meat/pork")) {
        // API ignores ?page=2 and echoes page 1 content and page number
        return mockCategoryResponse(page1Hits, 1, 1);
      }
      return mockCategoryResponse([], 1, 0);
    });

    await runScrape();
    const porkCategoryPage1 = fetchCalls.filter((c) => c.includes("meat/pork") && !c.includes("page="));
    const porkCategoryPage2 = fetchCalls.filter((c) => c.includes("meat/pork") && c.includes("page=2"));
    expect(porkCategoryPage1.length >= 1 || porkCategoryPage2.length >= 1).toBe(true);
    expect(fetchCalls.some((c) => c.includes("meat/pork") && c.includes("page=2"))).toBe(true);
    expect(fetchCalls.some((c) => c.includes("meat/pork") && c.includes("page=3"))).toBe(false);
  });

  it("matches reversed 'คอหมู' alias", async () => {
    const hits = [{ document: makeDoc("คอหมูสําเร็จย่าง 1 กก.", 179) }];
    vi.mocked(types.fetchJson).mockImplementation(async (url: string) => {
      if (typeof url === "string" && url.includes("meat/pork")) {
        return mockCategoryResponse(hits, 1, 1);
      }
      return mockCategoryResponse([], 1, 0);
    });

    const results = await runScrape();
    const porkNeck = results.find((r) => r.sourceProductName === "หมูคอสไลซ์");
    expect(porkNeck).toBeDefined();
    expect(porkNeck?.price).toBe(179);
  });

  it("matches branded/frozen pork-neck alias and rejects generic sliced pork", async () => {
    const hits = [
      { document: makeDoc("เอโร่ หมูคอสไลซ์ แช่แข็ง 1 กก.", 89) },
      { document: makeDoc("หมูสไลซ์ 1 กก.", 50) },
      { document: makeDoc("หมูคอสไลซ์ 1 กก.", 199) },
    ];
    vi.mocked(types.fetchJson).mockImplementation(async (url: string) => {
      if (typeof url === "string" && url.includes("meat/pork")) {
        return mockCategoryResponse(hits, 1, 3);
      }
      return mockCategoryResponse([], 1, 0);
    });
    const results = await runScrape();
    const porkNeck = results.find((r) => r.sourceProductName === "หมูคอสไลซ์");
    expect(porkNeck).toBeDefined();
    expect(porkNeck?.price).toBe(89);
  });

  it("stops after an empty Makro page", async () => {
    const page1Hits = [{ document: makeDoc("หมูคอสไลซ์ 1 กก.", 129) }];
    vi.mocked(types.fetchJson).mockImplementation(async (url: string) => {
      if (typeof url === "string" && url.includes("meat/pork")) {
        if (url.includes("page=2")) return mockCategoryResponse([], 2, 0);
        return mockCategoryResponse(page1Hits, 1, 1);
      }
      return mockCategoryResponse([], 1, 0);
    });
    const results = await runScrape();
    const porkNeck = results.find((r) => r.sourceProductName === "หมูคอสไลซ์");
    expect(porkNeck).toBeDefined();
    expect(porkNeck?.price).toBe(129);
    expect(vi.mocked(types.fetchJson).mock.calls.some((c) => String(c[0]).includes("page=3"))).toBe(false);
  });

  it("continues when one Makro page payload is malformed", async () => {
    vi.mocked(types.fetchJson).mockImplementation(async (url: string) => {
      if (typeof url === "string" && url.includes("meat/pork")) {
        // Page 1 (no page param) fails with a malformed payload
        if (!url.includes("page=")) throw new Error("Malformed response");
        if (url.includes("page=2")) return mockCategoryResponse([{ document: makeDoc("หมูคอสไลซ์ 1 กก.", 129) }], 2, 1);
        return mockCategoryResponse([], 3, 0);
      }
      return mockCategoryResponse([], 1, 0);
    });
    const results = await runScrape();
    const porkNeck = results.find((r) => r.sourceProductName === "หมูคอสไลซ์");
    expect(porkNeck).toBeDefined();
    expect(porkNeck?.price).toBe(129);
  });
});
