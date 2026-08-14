import { describe, it, expect } from "vitest";
import { normalizeAtIngest, extractWeightGrams } from "../normalize-ingest";

describe("normalizeAtIngest", () => {
  it("converts pack price to per-kg when weight is known", () => {
    const result = normalizeAtIngest(50, "บาท/ชิ้น", "หมูสามชั้น 500 กรัม");
    expect(result.normalizedPrice).toBe(100);
    expect(result.normalizedUnit).toBe("บาท/กก.");
    expect(result.weightGrams).toBe(500);
  });

  it("keeps pack price when weight is unknown", () => {
    const result = normalizeAtIngest(50, "บาท/ชิ้น", "หมูสามชั้น");
    expect(result.normalizedPrice).toBe(50);
    expect(result.normalizedUnit).toBe("บาท/แพ็ค");
    expect(result.weightGrams).toBeNull();
  });

  it("standardizes ชิ้น to แพ็ค in normalized unit", () => {
    const result = normalizeAtIngest(50, "บาท/ชิ้น", "test");
    expect(result.normalizedUnit).toBe("บาท/แพ็ค");
  });

  it("keeps per-kg price unchanged", () => {
    const result = normalizeAtIngest(100, "บาท/กก.", "หมูสามชั้น 1 กก.");
    expect(result.normalizedPrice).toBe(100);
    expect(result.normalizedUnit).toBe("บาท/กก.");
  });

  it("keeps egg price (บาท/ฟอง) unchanged", () => {
    const result = normalizeAtIngest(4, "บาท/ฟอง", "ไข่ไก่");
    expect(result.normalizedPrice).toBe(4);
    expect(result.normalizedUnit).toBe("บาท/ฟอง");
  });

  it("extracts weight in grams from Thai title", () => {
    expect(extractWeightGrams("หมู 500 กรัม")).toBe(500);
    expect(extractWeightGrams("น้ำมัน 1 ลิตร")).toBe(1000);
  });

  it("extracts weight in grams from English title", () => {
    expect(extractWeightGrams("Pork 500g")).toBe(500);
    expect(extractWeightGrams("Oil 1kg")).toBe(1000);
  });

  it("returns null weight when no pattern matches", () => {
    expect(extractWeightGrams("หมูสามชั้น")).toBeNull();
  });
});
