import { buildDisplayUnit, UNIT_CATEGORY, parseUnitWord } from "./unit-dictionary";

/**
 * Weight extraction regex patterns.
 * Matches: "150 กรัม", "1.5 กก.", "500 g", "1000 มล.", "1 ลิตร"
 */
const WEIGHT_PATTERNS = [
  { regex: /(\d+(?:\.\d+)?)\s*(?:กก\.?|กิโลกรัม|kg\.?|kilo)/i, multiplier: 1000 },
  { regex: /(\d+(?:\.\d+)?)\s*(?:กรัม|g|g\.|ก\.?)/i, multiplier: 1 },
  { regex: /(\d+(?:\.\d+)?)\s*(?:มล\.?|ml\.?|cc)/i, multiplier: 1 },
  { regex: /(\d+(?:\.\d+)?)\s*(?:ลิตร|[ลl]\.?(?!\d))/i, multiplier: 1000 },
];

export interface NormalizedPriceResult {
  normalizedPrice: number;
  normalizedUnit: string;
  weightGrams: number | null;
}

/**
 * Extract weight in grams from a product title or context string.
 * Returns null when no weight pattern is found.
 */
export function extractWeightGrams(text: string): number | null {
  for (const { regex, multiplier } of WEIGHT_PATTERNS) {
    const match = text.match(regex);
    if (match) {
      return Math.round(parseFloat(match[1]) * multiplier);
    }
  }
  return null;
}

/**
 * Normalize a scraped price at ingest time.
 * 
 * Logic:
 * 1. Build canonical display unit from raw unit (e.g., "บาท/ชิ้น" → "บาท/แพ็ค")
 * 2. If weight is extractable from product name/context AND unit is count-type,
 *    convert to per-kg: normalizedPrice = rawPrice / (weightGrams / 1000)
 * 3. If weight is not available, keep raw price with canonical unit word
 * 
 * @param rawPrice - The scraped price (e.g., 49.00)
 * @param rawUnit - The scraped unit (e.g., "บาท/ชิ้น")
 * @param productNameOrContext - Product name or body text containing weight info
 * @returns NormalizedPriceResult with normalizedPrice, normalizedUnit, weightGrams
 */
export function normalizeAtIngest(
  rawPrice: number,
  rawUnit: string,
  productNameOrContext: string,
): NormalizedPriceResult {
  const canonicalUnit = buildDisplayUnit(rawUnit);
  const category = UNIT_CATEGORY[parseUnitWord(canonicalUnit)];
  const weightGrams = extractWeightGrams(productNameOrContext);

  // If we have weight AND the unit is count-type (pack/piece), convert to per-kg
  if (weightGrams && weightGrams > 0 && category === "count") {
    const normalizedPrice = Math.round((rawPrice / (weightGrams / 1000)) * 100) / 100;
    return {
      normalizedPrice,
      normalizedUnit: "บาท/กก.",
      weightGrams,
    };
  }

  // Otherwise: keep raw price, just standardize the unit word
  return {
    normalizedPrice: rawPrice,
    normalizedUnit: canonicalUnit,
    weightGrams,
  };
}
