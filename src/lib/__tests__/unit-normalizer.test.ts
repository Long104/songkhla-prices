import { describe, it, expect } from "vitest";
import { normalizePriceAndUnit } from "../unit-normalizer";

describe("unitNormalizer", () => {
  it("extracts grams and calculates per-kg price", () => {
    const res = normalizePriceAndUnit(39, "บาท/ชิ้น", "หมูสามชั้น 150 กรัม");
    expect(res.normalizedPrice).toBe(260);
    expect(res.normalizedUnit).toBe("บาท/กก.");
    expect(res.weightText).toBe("150 กรัม");
  });

  it("extracts kg and keeps per-kg price", () => {
    const res = normalizePriceAndUnit(180, "บาท/กก.", "หมูสามชั้น 1 กิโลกรัม");
    expect(res.normalizedPrice).toBe(180);
    expect(res.normalizedUnit).toBe("บาท/กก.");
  });

  it("preserves count units without converting to per-kg", () => {
    const res = normalizePriceAndUnit(4, "บาท/ฟอง", "ไข่ไก่ เบอร์ 2");
    expect(res.normalizedPrice).toBe(4);
    expect(res.normalizedUnit).toBe("บาท/ฟอง");
    expect(res.weightText).toBeNull();
  });
});
