import { describe, it, expect } from "vitest";
import { normalizeAtIngest, extractWeightGrams } from "../normalize-ingest";

describe("normalizeAtIngest weight-vs-piece", () => {
  it("converts per-piece priced 500g tray to per-kg", () => {
    const result = normalizeAtIngest(65, "บาท/ชิ้น", "หมูสามชั้น 500ก.");
    expect(result.normalizedPrice).toBe(130);
    expect(result.normalizedUnit).toBe("บาท/กก.");
  });

  it("extracts weight with various Thai format variations", () => {
    expect(extractWeightGrams("หมู 500ก")).toBe(500);
    expect(extractWeightGrams("หมู 500ก.")).toBe(500);
    expect(extractWeightGrams("หมู 500 ก")).toBe(500);
    expect(extractWeightGrams("หมู 500 ก.")).toBe(500);
    expect(extractWeightGrams("หมู 1กก")).toBe(1000);
    expect(extractWeightGrams("หมู 1กก.")).toBe(1000);
    expect(extractWeightGrams("หมู 1.5กก")).toBe(1500);
  });
});
