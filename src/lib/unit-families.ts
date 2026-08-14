import {
  canonicalizeUnit,
  parseUnitWord,
} from "@/lib/unit-dictionary";

export type UnitFamily = "weight" | "volume" | "pack" | "count";

// Extends the old UNIT_CATEGORY with the new 'pack' family.
export const CANONICAL_TO_FAMILY: Record<string, UnitFamily> = {
  // Weight
  "กก.": "weight",
  "กรัม": "weight",
  "ขีด": "weight",
  "g": "weight",
  "kg": "weight",
  "ถัง 15 กก.": "weight",
  // Volume
  "ลิตร": "volume",
  "ml": "volume",
  "cc": "volume",
  // Pack
  "แพ็ค": "pack",
  "ถุง": "pack",
  "ถาด": "pack",
  "ชิ้น": "pack",
  // Count
  "ฟอง": "count",
  "ขวด": "count",
  "ซอง": "count",
  "ตัว": "count",
  "มัด": "count",
  "ลูก": "count",
};

/**
 * Classifies a canonical unit (e.g., "กก.", "แพ็ค") into its family.
 * Returns null if the family is unknown.
 */
export function getUnitFamily(
  canonicalUnit: string | null
): UnitFamily | null {
  if (!canonicalUnit) return null;
  // Handle cases like 'บาท/กก.' -> 'กก.'
  const unitOnly = canonicalUnit.includes("/") ? canonicalUnit.split("/")[1] : canonicalUnit;
  return CANONICAL_TO_FAMILY[unitOnly] ?? null;
}

/**
 * Processes a raw full unit string (e.g., "บาท/กิโลกรัม") into its
 * canonical form and then classifies it into a unit family.
 */
export function classifyUnit(rawFullUnit: string): UnitFamily | null {
  const word = parseUnitWord(rawFullUnit);
  const canonical = canonicalizeUnit(word);
  return getUnitFamily(canonical);
}

export interface UnitFamilySummary {
  family: UnitFamily;
  unitLabel: string; // e.g., "กก.", "แพ็ค", "ฟอง"
  minPrice: number;
  maxPrice: number | null;
  cheapestSourceNameTh: string | null;
  cheapestSourceNameEn: string | null;
}

export interface PriceInputRow {
  price: number;
  unit: string;
  sourceNameTh: string;
  sourceNameEn: string | null;
}

const FAMILY_PRECEDENCE: UnitFamily[] = ["weight", "volume", "pack", "count"];

/**
 * Groups price rows by unit family, computes min/max and cheapest source per family,
 * and returns primarySummary and secondarySummary according to family precedence:
 * weight > volume > pack > count.
 */
export function summarizePriceFamilies(rows: PriceInputRow[]): {
  primarySummary: UnitFamilySummary | null;
  secondarySummary: UnitFamilySummary | null;
} {
  if (rows.length === 0) {
    return { primarySummary: null, secondarySummary: null };
  }

  // Map from family -> list of rows
  const byFamily = new Map<UnitFamily, PriceInputRow[]>();

  for (const r of rows) {
    const family = classifyUnit(r.unit);
    if (!family) continue;
    const existing = byFamily.get(family) ?? [];
    existing.push(r);
    byFamily.set(family, existing);
  }

  const summaries: UnitFamilySummary[] = [];

  for (const fam of FAMILY_PRECEDENCE) {
    const familyRows = byFamily.get(fam);
    if (!familyRows || familyRows.length === 0) continue;

    // Find min and max price within this family
    let minRow = familyRows[0];
    let maxPrice = familyRows[0].price;

    for (const r of familyRows) {
      if (r.price < minRow.price) {
        minRow = r;
      }
      if (r.price > maxPrice) {
        maxPrice = r.price;
      }
    }

    // Get unit label: parse short canonical unit (e.g. "บาท/กก." -> "กก.")
    const word = parseUnitWord(minRow.unit);
    const unitLabel = canonicalizeUnit(word);

    summaries.push({
      family: fam,
      unitLabel,
      minPrice: minRow.price,
      maxPrice: maxPrice > minRow.price ? maxPrice : null,
      cheapestSourceNameTh: minRow.sourceNameTh,
      cheapestSourceNameEn: minRow.sourceNameEn,
    });
  }

  return {
    primarySummary: summaries[0] ?? null,
    secondarySummary: summaries[1] ?? null,
  };
}
