import { describe, it, expect } from "vitest";
import { classifyVariant, isValidProductUrl } from "../variant";

describe("classifyVariant", () => {
  it("returns frozen for แช่แข็ง", () => {
    expect(classifyVariant("หมูสามชั้นแช่แข็ง 1 กก.")).toBe("frozen");
  });

  it("returns chilled for แช่เย็น", () => {
    expect(classifyVariant("หมูสดแช่เย็น 500g")).toBe("chilled");
  });

  it("returns fresh for สด", () => {
    expect(classifyVariant("หมูสด 1 กก.")).toBe("fresh");
  });

  it("returns null for missing or ambiguous marker", () => {
    expect(classifyVariant(null)).toBeNull();
    expect(classifyVariant(undefined)).toBeNull();
    expect(classifyVariant("หมูสามชั้น 1 กก.")).toBeNull();
    expect(classifyVariant("")).toBeNull();
  });

  it("prioritizes frozen over chilled and fresh when multiple markers exist", () => {
    expect(classifyVariant("หมูสดแช่แข็ง")).toBe("frozen");
    expect(classifyVariant("หมูแช่เย็นสด")).toBe("chilled");
  });
});

describe("isValidProductUrl", () => {
  it("accepts valid HTTPS product URLs", () => {
    expect(isValidProductUrl("https://www.makro.pro/th/p/831499-123456")).toBe(true);
    expect(isValidProductUrl("https://www.lotuss.com/shop/p/pork-ham-1234")).toBe(true);
  });

  it("rejects non-HTTPS, relative, or malformed URLs", () => {
    expect(isValidProductUrl(null)).toBe(false);
    expect(isValidProductUrl(undefined)).toBe(false);
    expect(isValidProductUrl("http://www.makro.pro/th/p/123")).toBe(false);
    expect(isValidProductUrl("javascript:alert(1)")).toBe(false);
    expect(isValidProductUrl("/shop/p/pork-ham-1234")).toBe(false);
    expect(isValidProductUrl("not a url")).toBe(false);
  });
});
