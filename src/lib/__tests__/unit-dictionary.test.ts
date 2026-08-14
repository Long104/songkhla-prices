import { describe, it, expect } from "vitest";
import { canonicalizeUnit, parseUnitWord, buildDisplayUnit } from "../unit-dictionary";

describe("unit-dictionary", () => {
  it("maps ชิ้น to แพ็ค", () => {
    expect(canonicalizeUnit("ชิ้น")).toBe("แพ็ค");
  });
  it("maps ถาด to แพ็ค", () => {
    expect(canonicalizeUnit("ถาด")).toBe("แพ็ค");
  });
  it("maps กิโลกรัม to กก.", () => {
    expect(canonicalizeUnit("กิโลกรัม")).toBe("กก.");
  });
  it("passes through unknown units unchanged", () => {
    expect(canonicalizeUnit("unknown")).toBe("unknown");
  });
  it("parses unit word from full unit string", () => {
    expect(parseUnitWord("บาท/ชิ้น")).toBe("ชิ้น");
    expect(parseUnitWord("บาท/")).toBe("");
  });
  it("builds display unit with บาท/ prefix", () => {
    expect(buildDisplayUnit("บาท/ชิ้น")).toBe("บาท/แพ็ค");
    expect(buildDisplayUnit("บาท/กก.")).toBe("บาท/กก.");
  });
});
