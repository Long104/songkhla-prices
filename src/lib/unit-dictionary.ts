/**
 * Canonical unit dictionary for price normalization.
 * Maps raw Thai unit words to canonical display forms.
 */

/** Raw unit word → canonical display word */
export const UNIT_SYNONYMS: Record<string, string> = {
  // Pack/piece synonyms → แพ็ค
  "ชิ้น": "แพ็ค",
  "ถาด": "แพ็ค",
  "แพ็ค": "แพ็ค",
  // Weight synonyms → กก.
  "กก.": "กก.",
  "กิโลกรัม": "กก.",
  "kg": "กก.",
  "kg.": "กก.",
  // Volume synonyms → ลิตร
  "ลิตร": "ลิตร",
  "ล.": "ลิตร",
  // Count units (already canonical)
  "ฟอง": "ฟอง",
  "ขวด": "ขวด",
  "ซอง": "ซอง",
  "ถุง": "ถุง",
  "ตัว": "ตัว",
  // Special fixed-weight
  "ถัง 15 กก.": "ถัง 15 กก.",
};

export type UnitCategory = "weight" | "volume" | "count";

/** Canonical unit → measurement category */
export const UNIT_CATEGORY: Record<string, UnitCategory> = {
  "กก.": "weight",
  "ลิตร": "volume",
  "แพ็ค": "count",
  "ถุง": "count",
  "ฟอง": "count",
  "ขวด": "count",
  "ซอง": "count",
  "ตัว": "count",
  "ถัง 15 กก.": "weight",
};

/**
 * Parse the unit word from a full unit string like "บาท/ชิ้น" → "ชิ้น".
 * Returns the raw unit word (before dictionary mapping).
 */
export function parseUnitWord(fullUnit: string): string {
  // Split on "/" and take the part after "บาท"
  const parts = fullUnit.split("/");
  if (parts.length > 1 && parts[1] === "") return "";
  return parts[1]?.trim() || fullUnit;
}

/**
 * Map a raw unit word to its canonical display form.
 * Falls back to the raw word if no synonym found.
 */
export function canonicalizeUnit(rawUnitWord: string): string {
  return UNIT_SYNONYMS[rawUnitWord] ?? rawUnitWord;
}

/**
 * Build the full display unit string: "บาท/<canonical>"
 */
export function buildDisplayUnit(rawFullUnit: string): string {
  const word = parseUnitWord(rawFullUnit);
  const canonical = canonicalizeUnit(word);
  return `บาท/${canonical}`;
}
