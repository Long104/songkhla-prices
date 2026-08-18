import { describe, expect, it } from "vitest";
import { mapRawPricesToPriceRows } from "@/lib/price-row-mapping";
import type { RawPriceRow } from "@/db/queries";
import type { PriceRow } from "@/components/price-table";

function makeRawRow(overrides: Partial<RawPriceRow> = {}): RawPriceRow {
  return {
    sourceId: 1,
    sourceSlug: "makro",
    sourceNameTh: "แมคโคร",
    sourceNameEn: "Makro",
    sourceType: "retail",
    price: "139",
    unit: "บาท/กก.",
    normalizedPrice: null,
    normalizedUnit: null,
    weightGrams: null,
    sourceDate: "2026-08-14",
    provinceId: null,
    productTitle: "สันนอกหมูไทย 3D แช่แข็ง เซพแพ็ค",
    productUrl: "https://www.makro.pro/th/p/831499-123",
    ...overrides,
  };
}

describe("mapRawPricesToPriceRows", () => {
  it("carries productTitle and productUrl from raw rows into every PriceRow", () => {
    const raw = [
      makeRawRow({
        sourceSlug: "makro",
        productTitle: "สันนอกหมูไทย 3D แช่แข็ง เซพแพ็ค",
        productUrl: "https://www.makro.pro/th/p/831499-123",
      }),
      makeRawRow({
        sourceSlug: "lotuss",
        sourceNameTh: "โลตัส",
        sourceNameEn: "Lotus's",
        productTitle: "หมูสามชั้น CP สด",
        productUrl: "https://www.lotuss.com/products/pork-belly",
      }),
    ];

    const rows = mapRawPricesToPriceRows(raw, "หมูสามชั้น", new Map());

    expect(rows).toHaveLength(2);
    expect(rows[0].productTitle).toBe("สันนอกหมูไทย 3D แช่แข็ง เซพแพ็ค");
    expect(rows[0].productUrl).toBe("https://www.makro.pro/th/p/831499-123");
    expect(rows[1].productTitle).toBe("หมูสามชั้น CP สด");
    expect(rows[1].productUrl).toBe("https://www.lotuss.com/products/pork-belly");
  });

  it("maps nullable metadata as null rather than dropping the keys", () => {
    const rows = mapRawPricesToPriceRows(
      [makeRawRow({ productTitle: null, productUrl: null })],
      "หมูสามชั้น",
      new Map()
    );

    expect(rows[0]).toHaveProperty("productTitle", null);
    expect(rows[0]).toHaveProperty("productUrl", null);
    // Regression: the page previously omitted these fields entirely, so
    // rows rendered without title/badge/store link. Presence (even null)
    // is the contract the UI depends on.
    expect(Object.keys(rows[0])).toEqual(
      expect.arrayContaining(["productTitle", "productUrl"])
    );
  });

  it("keeps existing mapping behavior (names, national flag, change pct)", () => {
    const changes = new Map([["makro::บาท/กก.", { changePct: -3.5 }]]);
    const raw = [makeRawRow({ provinceId: 100 })];

    const rows = mapRawPricesToPriceRows(raw, "หมูสามชั้น", changes);
    const row: PriceRow = rows[0];

    expect(row.productName).toBe("หมูสามชั้น");
    expect(row.sourceSlug).toBe("makro");
    expect(row.sourceNameTh).toBe("แมคโคร");
    expect(row.sourceNameEn).toBe("Makro");
    expect(row.sourceType).toBe("retail");
    expect(row.price).toBe("139");
    expect(row.unit).toBe("บาท/กก.");
    expect(row.normalizedPrice).toBeNull();
    expect(row.normalizedUnit).toBeNull();
    expect(row.weightGrams).toBeNull();
    expect(row.sourceDate).toBe("2026-08-14");
    expect(row.isNational).toBe(false);
    expect(row.changePct).toBe(-3.5);
  });

  it("falls back to empty sourceNameEn and null changePct when absent", () => {
    const raw = [makeRawRow({ sourceNameEn: null })];
    const rows = mapRawPricesToPriceRows(raw, "หมูสามชั้น", new Map());

    expect(rows[0].sourceNameEn).toBe("");
    expect(rows[0].changePct).toBeNull();
    expect(rows[0].isNational).toBe(true);
  });
});
