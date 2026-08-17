/**
 * Test contracts for the coverage audit script (specs/coverage-audit.md).
 *
 * All tests are pure — no database access. Query results are injected as
 * plain objects so the classification/formatting logic is fully unit-tested.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  classifyCoverage,
  formatReport,
  toCoverageRow,
  KNOWN_GAPS,
  type CoverageRow,
  type MappedCoverage,
  type UnmappedProduct,
} from "../coverage-audit";

// --- Test Fixtures -----------------------------------------------------------

const NOW = new Date("2026-08-15T12:00:00Z");

const HOUR = 60 * 60 * 1000;

function hoursAgo(h: number): Date {
  return new Date(NOW.getTime() - h * HOUR);
}

const makro = { id: 10, slug: "makro" };
const lotuss = { id: 11, slug: "lotuss" };
const dit = { id: 12, slug: "dit" };
const eppo = { id: 13, slug: "eppo" };

const porkProduct = { id: 1, slug: "pork-belly", nameTh: "หมูสามชั้น" };
const chickenProduct = { id: 2, slug: "chicken-whole", nameTh: "ไก่สด" };
const eggProduct = { id: 3, slug: "chicken-egg", nameTh: "ไข่ไก่" };
const oilProduct = { id: 4, slug: "palm-oil", nameTh: "น้ำมันปาล์ม" };
const chineseCabbageProduct = { id: 5, slug: "chinese-cabbage", nameTh: "ผักกวางตุ้งฮุง" };
const mangoProduct = { id: 6, slug: "mango", nameTh: "มะม่วง" };

/** Base cadence used across tests (DIT 72h, EPPO 168h, default 48h). */
const mockCadence: Record<string, number> = {
  DIT: 72,
  EPPO: 168,
  MAKRO: 48,
  LOTUSS: 48,
  SIMUMMUANG: 48,
};

const DEFAULT_WINDOW = 48;

// --- classifyCoverage ---------------------------------------------------------

describe("classifyCoverage", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns PRESENT for a price within the default 48h window", () => {
    vi.setSystemTime(NOW);
    const mapping: MappedCoverage = {
      product: porkProduct,
      source: makro,
      unit: "บาท/กก.",
      latestPrice: { scrapedAt: hoursAgo(24), price: "150" },
    };
    expect(classifyCoverage(mapping, DEFAULT_WINDOW, mockCadence).status).toBe("PRESENT");
  });

  it("returns PRESENT for a price exactly at the cutoff boundary", () => {
    vi.setSystemTime(NOW);
    const mapping: MappedCoverage = {
      product: porkProduct,
      source: makro,
      unit: "บาท/กก.",
      latestPrice: { scrapedAt: hoursAgo(48), price: "150" },
    };
    expect(classifyCoverage(mapping, DEFAULT_WINDOW, mockCadence).status).toBe("PRESENT");
  });

  it("returns STALE for a price just outside the cutoff", () => {
    vi.setSystemTime(NOW);
    const mapping: MappedCoverage = {
      product: porkProduct,
      source: makro,
      unit: "บาท/กก.",
      latestPrice: { scrapedAt: hoursAgo(49), price: "150" },
    };
    const result = classifyCoverage(mapping, DEFAULT_WINDOW, mockCadence);
    expect(result.status).toBe("STALE");
    expect(result.reason).toContain("49");
  });

  it("returns MISSING when there is no price row at all", () => {
    vi.setSystemTime(NOW);
    const mapping: MappedCoverage = {
      product: chickenProduct,
      source: makro,
      unit: null,
      latestPrice: null,
    };
    const result = classifyCoverage(mapping, DEFAULT_WINDOW, mockCadence);
    expect(result.status).toBe("MISSING");
    expect(result.reason).toContain("no historical price row");
  });

  it("applies per-source cadence override (DIT 72h not flagged as STALE at 60h)", () => {
    vi.setSystemTime(NOW);
    const mapping: MappedCoverage = {
      product: eggProduct,
      source: dit,
      unit: "บาท/ฟอง",
      latestPrice: { scrapedAt: hoursAgo(60), price: "4" },
    };
    expect(classifyCoverage(mapping, DEFAULT_WINDOW, mockCadence).status).toBe("PRESENT");
  });

  it("flags DIT price outside its 72h cadence as STALE", () => {
    vi.setSystemTime(NOW);
    const mapping: MappedCoverage = {
      product: eggProduct,
      source: dit,
      unit: "บาท/ฟอง",
      latestPrice: { scrapedAt: hoursAgo(80), price: "4" },
    };
    expect(classifyCoverage(mapping, DEFAULT_WINDOW, mockCadence).status).toBe("STALE");
  });

  it("applies per-source cadence override (EPPO 168h not flagged as STALE at 120h)", () => {
    vi.setSystemTime(NOW);
    const mapping: MappedCoverage = {
      product: oilProduct,
      source: eppo,
      unit: "บาท/ลิตร",
      latestPrice: { scrapedAt: hoursAgo(120), price: "35" },
    };
    expect(classifyCoverage(mapping, DEFAULT_WINDOW, mockCadence).status).toBe("PRESENT");
  });

  it("flags EPPO price outside its 168h cadence as STALE", () => {
    vi.setSystemTime(NOW);
    const mapping: MappedCoverage = {
      product: oilProduct,
      source: eppo,
      unit: "บาท/ลิตร",
      latestPrice: { scrapedAt: hoursAgo(200), price: "35" },
    };
    expect(classifyCoverage(mapping, DEFAULT_WINDOW, mockCadence).status).toBe("STALE");
  });

  it("falls back to the default window for sources without a cadence entry", () => {
    vi.setSystemTime(NOW);
    const unknown = { id: 99, slug: "unknown-source" };
    const mapping: MappedCoverage = {
      product: porkProduct,
      source: unknown,
      unit: "บาท/กก.",
      latestPrice: { scrapedAt: hoursAgo(60), price: "150" },
    };
    expect(classifyCoverage(mapping, DEFAULT_WINDOW, mockCadence).status).toBe("STALE");
  });

  it("does not mutate the mapping", () => {
    vi.setSystemTime(NOW);
    const mapping: MappedCoverage = {
      product: porkProduct,
      source: makro,
      unit: "บาท/กก.",
      latestPrice: { scrapedAt: hoursAgo(10), price: "150" },
    };
    classifyCoverage(mapping, DEFAULT_WINDOW, mockCadence);
    expect(mapping.latestPrice?.price).toBe("150");
  });

  it("returns EXPLAINED for a missing row that is on the KNOWN_GAPS allowlist", () => {
    vi.setSystemTime(NOW);
    const mapping: MappedCoverage = {
      product: chineseCabbageProduct,
      source: makro,
      unit: null,
      latestPrice: null,
    };
    const result = classifyCoverage(mapping, DEFAULT_WINDOW, mockCadence);
    expect(result.status).toBe("EXPLAINED");
    expect(result.reason).toContain("Typesense category rotation");
  });

  it("returns EXPLAINED for a stale row that is on the KNOWN_GAPS allowlist", () => {
    vi.setSystemTime(NOW);
    const mapping: MappedCoverage = {
      product: mangoProduct,
      source: dit,
      unit: "บาท/กก.",
      latestPrice: { scrapedAt: hoursAgo(500), price: "50" },
    };
    const result = classifyCoverage(mapping, DEFAULT_WINDOW, mockCadence);
    expect(result.status).toBe("EXPLAINED");
    expect(result.reason).toContain("seasonal");
  });

  it("returns PRESENT for a KNOWN_GAPS item if its price is current", () => {
    vi.setSystemTime(NOW);
    const mapping: MappedCoverage = {
      product: chineseCabbageProduct, // This is in KNOWN_GAPS
      source: makro,
      unit: "บาท/กก.",
      latestPrice: { scrapedAt: hoursAgo(2), price: "25" }, // but it's fresh
    };
    const result = classifyCoverage(mapping, DEFAULT_WINDOW, mockCadence);
    expect(result.status).toBe("PRESENT");
  });
});

// --- toCoverageRow -------------------------------------------------------------

describe("toCoverageRow", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("maps a classified mapping into a printable row", () => {
    vi.setSystemTime(NOW);
    const mapping: MappedCoverage = {
      product: porkProduct,
      source: makro,
      unit: "บาท/กก.",
      latestPrice: { scrapedAt: hoursAgo(10), price: "150" },
    };
    const row = toCoverageRow(mapping, DEFAULT_WINDOW, mockCadence);
    expect(row.productSlug).toBe("pork-belly");
    expect(row.source).toBe("makro");
    expect(row.unit).toBe("บาท/กก.");
    expect(row.status).toBe("PRESENT");
    expect(row.lastScraped).toEqual(hoursAgo(10));
  });

  it("produces a MISSING row for a mapping with no price", () => {
    vi.setSystemTime(NOW);
    const mapping: MappedCoverage = {
      product: chickenProduct,
      source: lotuss,
      unit: null,
      latestPrice: null,
    };
    const row = toCoverageRow(mapping, DEFAULT_WINDOW, mockCadence);
    expect(row.status).toBe("MISSING");
    expect(row.lastScraped).toBeNull();
    expect(row.unit).toBeNull();
  });
});

// --- formatReport ---------------------------------------------------------------

describe("formatReport", () => {
  const rows: CoverageRow[] = [
    {
      productSlug: "chicken-whole",
      source: "lotuss",
      unit: "บาท/กก.",
      status: "STALE",
      lastScraped: hoursAgo(72),
      reason: "latest 72.0h > 48h cutoff",
    },
    {
      productSlug: "pork-belly",
      source: "lotuss",
      unit: "บาท/กก.",
      status: "PRESENT",
      lastScraped: hoursAgo(2),
      reason: "latest 2.0h <= 48h cutoff",
    },
    {
      productSlug: "pork-belly",
      source: "makro",
      unit: "บาท/กก.",
      status: "MISSING",
      lastScraped: null,
      reason: "no historical price row for this mapping",
    },
    {
      productSlug: "pork-belly",
      source: "makro",
      unit: "บาท/แพ็ค",
      status: "PRESENT",
      lastScraped: hoursAgo(5),
      reason: "latest 5.0h <= 48h cutoff",
    },
  ];

  const unmapped: UnmappedProduct[] = [
    {
      source: { slug: "makro" },
      rawProductName: "เนื้อวัวสไลซ์",
      unit: "บาท/กก.",
      scrapedAt: hoursAgo(3),
    },
  ];

  it("counts mapped/present/stale/missing/explained/unmapped correctly", () => {
    const { counts } = formatReport(rows, unmapped);
    expect(counts).toEqual({
      mapped: 4,
      present: 2,
      stale: 1,
      missing: 1,
      explained: 0,
      unmapped: 1,
    });
  });

  it("prints the header line with all counts", () => {
    const { report } = formatReport(rows, unmapped);
    expect(report.split("\n")[0]).toBe(
      "mapped=4 present=2 stale=1 missing=1 explained=0 unmapped=1",
    );
  });

  it("prints one matrix row per mapping with productSlug|source|unit|status|lastScraped", () => {
    const { report } = formatReport(rows, unmapped);
    const lines = report.split("\n");
    // Header + column header + 4 matrix rows + blank + unmapped header + 1 unmapped row + blank + summary = 11
    expect(lines).toHaveLength(11);

    // Deterministic ordering: productSlug asc, then source asc, then unit asc.
    const matrix = lines.slice(2, 6);
    expect(matrix[0]).toContain("chicken-whole");
    expect(matrix[0]).toContain("lotuss");
    expect(matrix[0]).toContain("STALE");
    expect(matrix[1]).toContain("pork-belly");
    expect(matrix[1]).toContain("lotuss");
    expect(matrix[1]).toContain("PRESENT");
    expect(matrix[2]).toContain("pork-belly");
    expect(matrix[2]).toContain("makro");
    expect(matrix[2]).toContain("บาท/กก.");
    expect(matrix[2]).toContain("MISSING");
    expect(matrix[3]).toContain("pork-belly");
    expect(matrix[3]).toContain("makro");
    expect(matrix[3]).toContain("บาท/แพ็ค");
    expect(matrix[3]).toContain("PRESENT");
  });

  it("includes the unmapped products section with source, raw name, unit, date", () => {
    const { report } = formatReport(rows, unmapped);
    expect(report).toContain("UNMAPPED (1)");
    expect(report).toContain("makro");
    expect(report).toContain("เนื้อวัวสไลซ์");
    expect(report).toContain("บาท/กก.");
  });

  it("omits the unmapped section when there are none", () => {
    const { report } = formatReport(rows, []);
    expect(report).not.toContain("UNMAPPED");
  });

  it("prints a final summary line with PASS/FAIL", () => {
    const { report } = formatReport(rows, unmapped);
    const last = report.trimEnd().split("\n").at(-1);
    expect(last).toContain("summary:");
    expect(last).toContain("FAIL");
  });

  it("returns exit code 1 when any stale or missing row exists", () => {
    expect(formatReport(rows, unmapped).exitCode).toBe(1);
  });

  it("returns exit code 0 when all rows are present", () => {
    const allPresent: CoverageRow[] = rows.map((r) => ({ ...r, status: "PRESENT" as const }));
    const { exitCode, report } = formatReport(allPresent, []);
    expect(exitCode).toBe(0);
    expect(report).toContain("PASS");
  });

  it("handles an empty mapping set", () => {
    const { counts, exitCode, report } = formatReport([], []);
    expect(counts.mapped).toBe(0);
    expect(exitCode).toBe(0);
    expect(report.split("\n")[0]).toBe("mapped=0 present=0 stale=0 missing=0 explained=0 unmapped=0");
  });

  it("reports EXPLAINED rows in the table with the gap reason and does not count them as missing", () => {
    const explainedRows: CoverageRow[] = [
      {
        productSlug: "chinese-cabbage",
        source: "makro",
        unit: null,
        status: "EXPLAINED",
        lastScraped: null,
        reason: "Typesense category rotation — covered by search fallback on most runs",
      },
      {
        productSlug: "pork-belly",
        source: "makro",
        unit: "บาท/กก.",
        status: "PRESENT",
        lastScraped: hoursAgo(2),
        reason: "latest 2.0h <= 48h cutoff",
      },
    ];
    const { counts, report, exitCode } = formatReport(explainedRows, []);
    expect(counts.explained).toBe(1);
    expect(counts.missing).toBe(0);
    expect(report).toContain("EXPLAINED");
    expect(report).toContain("Typesense category rotation");
    expect(exitCode).toBe(0);
    expect(report).toContain("PASS");
  });

  it("exits 1 when a gap is NOT on the allowlist (unresolved missing remains)", () => {
    const unresolvedRows: CoverageRow[] = [
      {
        productSlug: "pork-belly",
        source: "makro",
        unit: null,
        status: "MISSING",
        lastScraped: null,
        reason: "no historical price row for this mapping",
      },
    ];
    const { counts, exitCode } = formatReport(unresolvedRows, []);
    expect(counts.missing).toBe(1);
    expect(counts.explained).toBe(0);
    expect(exitCode).toBe(1);
  });

  it("summary line includes explained=N and is PASS when only explained gaps remain", () => {
    const explainedRows: CoverageRow[] = [
      {
        productSlug: "mango",
        source: "dit",
        unit: null,
        status: "EXPLAINED",
        lastScraped: null,
        reason: "seasonal — gov report omits it off-season",
      },
    ];
    const { report } = formatReport(explainedRows, []);
    const last = report.trimEnd().split("\n").at(-1);
    expect(last).toBe(
      "summary: mapped=1 present=0 stale=0 missing=0 explained=1 unmapped=0 -> PASS",
    );
  });
});
