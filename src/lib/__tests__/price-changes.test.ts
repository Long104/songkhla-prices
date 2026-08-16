import { describe, expect, it } from "vitest";
import { computePriceChanges } from "../price-changes";

describe("computePriceChanges", () => {
  it("computes percentage increase correctly with 1 decimal place rounding", () => {
    const rows = [
      { sourceSlug: "lotuss", unit: "บาท/กก.", price: "105.2" },
      { sourceSlug: "lotuss", unit: "บาท/กก.", price: "100.0" },
    ];
    const changes = computePriceChanges(rows);
    expect(changes.get("lotuss::บาท/กก.")).toEqual({ changePct: 5.2 });
  });

  it("computes percentage decrease correctly", () => {
    const rows = [
      { sourceSlug: "dit", unit: "บาท/กก.", price: "90.0" },
      { sourceSlug: "dit", unit: "บาท/กก.", price: "100.0" },
    ];
    const changes = computePriceChanges(rows);
    expect(changes.get("dit::บาท/กก.")).toEqual({ changePct: -10 });
  });

  it("returns null changePct when only a single price entry exists", () => {
    const rows = [
      { sourceSlug: "makro", unit: "บาท/แพ็ค", price: "150.0" },
    ];
    const changes = computePriceChanges(rows);
    expect(changes.get("makro::บาท/แพ็ค")).toEqual({ changePct: null });
  });

  it("returns null changePct when previous price is zero", () => {
    const rows = [
      { sourceSlug: "dit", unit: "บาท/กก.", price: "100.0" },
      { sourceSlug: "dit", unit: "บาท/กก.", price: "0.0" },
    ];
    const changes = computePriceChanges(rows);
    expect(changes.get("dit::บาท/กก.")).toEqual({ changePct: null });
  });
});