import { describe, expect, it } from "vitest";
import {
  classifyUnit,
  getUnitFamily,
  summarizePriceFamilies,
} from "../unit-families";

describe("unit-families classifier", () => {
  it("classifies weight family units correctly", () => {
    expect(getUnitFamily("กก.")).toBe("weight");
    expect(classifyUnit("บาท/กิโลกรัม")).toBe("weight");
    expect(classifyUnit("บาท/กก.")).toBe("weight");
    expect(classifyUnit("บาท/kg")).toBe("weight");
  });

  it("classifies volume family units correctly", () => {
    expect(getUnitFamily("ลิตร")).toBe("volume");
    expect(classifyUnit("บาท/ลิตร")).toBe("volume");
    expect(classifyUnit("บาท/ล.")).toBe("volume");
  });

  it("classifies pack family units correctly", () => {
    expect(getUnitFamily("แพ็ค")).toBe("pack");
    expect(classifyUnit("บาท/แพ็ค")).toBe("pack");
    expect(classifyUnit("บาท/ชิ้น")).toBe("pack");
    expect(classifyUnit("บาท/ถุง")).toBe("pack");
    expect(classifyUnit("บาท/ถาด")).toBe("pack");
  });

  it("classifies count family units correctly", () => {
    expect(getUnitFamily("ฟอง")).toBe("count");
    expect(classifyUnit("บาท/ฟอง")).toBe("count");
    expect(classifyUnit("บาท/ขวด")).toBe("count");
    expect(classifyUnit("บาท/ซอง")).toBe("count");
    expect(classifyUnit("บาท/ตัว")).toBe("count");
  });

  it("returns null for unknown units", () => {
    expect(getUnitFamily("unknown")).toBeNull();
    expect(classifyUnit("บาท/unknown")).toBeNull();
  });
});

describe("summarizePriceFamilies", () => {
  it("returns null summaries for empty input", () => {
    expect(summarizePriceFamilies([])).toEqual({
      primarySummary: null,
      secondarySummary: null,
    });
  });

  it("prefers weight as primary family and pack as secondary", () => {
    const { primarySummary, secondarySummary } = summarizePriceFamilies([
      { price: 78, unit: "บาท/กก.", sourceNameTh: "Lotus's", sourceNameEn: "Lotus's" },
      { price: 95, unit: "บาท/กก.", sourceNameTh: "Makro", sourceNameEn: "Makro" },
      { price: 21.5, unit: "บาท/แพ็ค", sourceNameTh: "ตลาดศรีเมือง", sourceNameEn: "Sri Muang Market" },
      { price: 49, unit: "บาท/แพ็ค", sourceNameTh: "Lotus's", sourceNameEn: "Lotus's" },
    ]);

    expect(primarySummary).toEqual({
      family: "weight",
      unitLabel: "กก.",
      minPrice: 78,
      maxPrice: 95,
      cheapestSourceNameTh: "Lotus's",
      cheapestSourceNameEn: "Lotus's",
      cheapestSourceDate: null,
    });
    expect(secondarySummary).toEqual({
      family: "pack",
      unitLabel: "แพ็ค",
      minPrice: 21.5,
      maxPrice: 49,
      cheapestSourceNameTh: "ตลาดศรีเมือง",
      cheapestSourceNameEn: "Sri Muang Market",
      cheapestSourceDate: null,
    });
  });

  it("falls back to volume when no weight prices exist", () => {
    const { primarySummary, secondarySummary } = summarizePriceFamilies([
      { price: 60, unit: "บาท/ลิตร", sourceNameTh: "Makro", sourceNameEn: "Makro" },
      { price: 72, unit: "บาท/ลิตร", sourceNameTh: "Lotus's", sourceNameEn: "Lotus's" },
      { price: 30, unit: "บาท/ขวด", sourceNameTh: "7-Eleven", sourceNameEn: "7-Eleven" },
    ]);

    expect(primarySummary?.family).toBe("volume");
    expect(primarySummary?.minPrice).toBe(60);
    expect(primarySummary?.maxPrice).toBe(72);
    expect(secondarySummary?.family).toBe("count");
  });

  it("handles a single price (no range) with maxPrice null", () => {
    const { primarySummary, secondarySummary } = summarizePriceFamilies([
      { price: 5, unit: "บาท/ฟอง", sourceNameTh: "ตลาดศรีเมือง", sourceNameEn: "Sri Muang Market" },
    ]);

    expect(primarySummary).toEqual({
      family: "count",
      unitLabel: "ฟอง",
      minPrice: 5,
      maxPrice: null,
      cheapestSourceNameTh: "ตลาดศรีเมือง",
      cheapestSourceNameEn: "Sri Muang Market",
      cheapestSourceDate: null,
    });
    expect(secondarySummary).toBeNull();
  });

  it("propagates cheapestSourceDate from the min row", () => {
    const { primarySummary } = summarizePriceFamilies([
      { price: 78, unit: "บาท/กก.", sourceNameTh: "Lotus's", sourceNameEn: "Lotus's", sourceDate: "2026-08-14" },
      { price: 95, unit: "บาท/กก.", sourceNameTh: "Makro", sourceNameEn: "Makro", sourceDate: "2026-08-15" },
    ]);

    expect(primarySummary?.cheapestSourceDate).toBe("2026-08-14");
  });

  it("returns null cheapestSourceDate when no rows carry a date", () => {
    const { primarySummary } = summarizePriceFamilies([
      { price: 78, unit: "บาท/กก.", sourceNameTh: "Lotus's", sourceNameEn: "Lotus's" },
    ]);

    expect(primarySummary?.cheapestSourceDate).toBeNull();
  });

  it("ignores rows with unknown units", () => {
    const { primarySummary, secondarySummary } = summarizePriceFamilies([
      { price: 10, unit: "บาท/unknown", sourceNameTh: "X", sourceNameEn: "X" },
    ]);
    expect(primarySummary).toBeNull();
    expect(secondarySummary).toBeNull();
  });
});