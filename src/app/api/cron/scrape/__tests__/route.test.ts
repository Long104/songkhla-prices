import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "../route";
import { NextRequest } from "next/server";
import { sources, productSourceMappings, provinces, prices } from "@/db/schema";
import type { Scraper, ScrapedPrice } from "@/lib/scrapers/types";

// --- Mutable scrapers fixture (live ESM binding to the mocked module) ---
const scrapersFixture = vi.hoisted(() => ({
  scrapers: [] as Scraper[],
}));

vi.mock("@/lib/scrapers", () => scrapersFixture);

// --- Mocked db getDb ---
const dbMock = vi.hoisted(() => ({
  getDb: vi.fn(),
}));

vi.mock("@/db", () => dbMock);

interface DbOptions {
  source?: { id: number; slug: string } | null;
  mapping?: { productId: number } | null;
  province?: { id: number } | null;
}

function makeDb(opts: DbOptions) {
  const insertFn = vi.fn(() => ({
    values: vi.fn(() => ({
      onConflictDoNothing: vi.fn(async () => undefined),
    })),
  }));

  const selectFrom = (table: unknown) => {
    if (table === sources) {
      return { where: () => ({ limit: async () => (opts.source ? [opts.source] : []) }) };
    }
    if (table === productSourceMappings) {
      return { where: () => ({ limit: async () => (opts.mapping ? [opts.mapping] : []) }) };
    }
    if (table === provinces) {
      return { where: () => ({ limit: async () => (opts.province ? [opts.province] : []) }) };
    }
    return { where: () => ({ limit: async () => [] }) };
  };

  return {
    insert: insertFn,
    select: () => ({ from: (table: unknown) => selectFrom(table) }),
  };
}

function setScrapers(list: Scraper[]) {
  scrapersFixture.scrapers.length = 0;
  scrapersFixture.scrapers.push(...list);
}

const okRow = (sourceProductName: string): ScrapedPrice => ({
  sourceProductName,
  price: 89,
  unit: "บาท/ชิ้น",
  provinceCode: null,
  sourceDate: new Date(),
  productTitle: "โลตัส ซี่โครงหมู 250 กรัม",
});

function makeReq() {
  return new NextRequest("http://localhost/api/cron/scrape", {
    method: "POST",
    headers: { authorization: "Bearer test-secret" },
  });
}

describe("POST /api/cron/scrape", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    process.env.CRON_SECRET = "test-secret";
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.CRON_SECRET;
  });

  it("returns 401 without Bearer CRON_SECRET", async () => {
    const req = new NextRequest("http://localhost/api/cron/scrape", {
      method: "POST",
      headers: { authorization: "Invalid secret" },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: "Unauthorized" });
  });

  it("writes scraper A rows when scraper B rejects", async () => {
    setScrapers([
      { sourceSlug: "a", scrape: vi.fn(async () => [okRow("ซี่โครงหมู")]) },
      {
        sourceSlug: "b",
        scrape: vi.fn(async () => {
          throw new Error("Scraper B exploded");
        }),
      },
    ]);
    const db = makeDb({ source: { id: 1, slug: "a" }, mapping: { productId: 1 } });
    dbMock.getDb.mockReturnValue(db);

    const res = await POST(makeReq());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.results.a.status).toBe("ok");
    expect(body.results.a.count).toBe(1);
    expect(body.results.b.status).toBe("error");
    expect(body.results.b.error).toContain("Scraper B exploded");
    // A's row was written (insert called once), B wrote nothing
    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(db.insert).toHaveBeenCalledWith(prices);
  });

  it("times out a hung scraper but still writes the fast one", async () => {
    setScrapers([
      { sourceSlug: "a", scrape: vi.fn(async () => [okRow("ซี่โครงหมู")]) },
      // Never settles
      { sourceSlug: "b", scrape: vi.fn(() => new Promise<never>(() => {})) },
    ]);
    const db = makeDb({ source: { id: 1, slug: "a" }, mapping: { productId: 1 } });
    dbMock.getDb.mockReturnValue(db);

    const resPromise = POST(makeReq());
    // Advance past PER_SCRAPER_TIMEOUT_MS (240_000) so the hung scraper times out
    await vi.advanceTimersByTimeAsync(240_000);
    const res = await resPromise;
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.results.a.status).toBe("ok");
    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(body.results.b.status).toBe("error");
    expect(body.results.b.error).toContain("timed out");
  });

  it("collects unmapped product names", async () => {
    setScrapers([
      { sourceSlug: "a", scrape: vi.fn(async () => [okRow("ซี่โครงหมู")]) },
    ]);
    // source found, but no mapping → unmapped
    const db = makeDb({ source: { id: 1, slug: "a" }, mapping: null });
    dbMock.getDb.mockReturnValue(db);

    const res = await POST(makeReq());
    const body = await res.json();

    expect(body.results.a.status).toBe("ok");
    expect(body.unmapped).toContain("ซี่โครงหมู");
    // No insert because mapping missing
    expect(db.insert).not.toHaveBeenCalled();
  });
});
