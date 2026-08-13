export function extractWeightFromTitle(title: string): { weightKg: number; rawText: string } | null {
  // Matches patterns like "150g", "1.5 kg", "150 กรัม", "1000 มล."
  const patterns = [
    { regex: /(\d+(?:\.\d+)?)\s*(?:กก\.?|กิโลกรัม|kg\.?)/i, multiplier: 1 },
    { regex: /(\d+(?:\.\d+)?)\s*(?:กรัม|g\.|ก\.(?![ก/]))/i, multiplier: 0.001 },
    { regex: /(\d+(?:\.\d+)?)\s*(?:มล\.|ml\.?)/i, multiplier: 0.001 },
  ];

  for (const { regex, multiplier } of patterns) {
    const match = title.match(regex);
    if (match) {
      const weight = parseFloat(match[1]);
      return {
        weightKg: weight * multiplier,
        rawText: match[0],
      };
    }
  }
  return null;
}

export function normalizePriceAndUnit(
  rawPrice: number,
  rawUnit: string,
  productName: string
): {
  normalizedPrice: number;
  normalizedUnit: string;
  originalPrice: number;
  originalUnit: string;
  weightText: string | null;
} {
  const weightInfo = extractWeightFromTitle(productName);

  // If unit is already per kg, keep as is
  if (rawUnit === "บาท/กก.") {
    return {
      normalizedPrice: rawPrice,
      normalizedUnit: "บาท/กก.",
      originalPrice: rawPrice,
      originalUnit: rawUnit,
      weightText: weightInfo?.rawText || null,
    };
  }

  // If we can parse weight and it's a pack unit, normalize
  if (weightInfo && (rawUnit === "บาท/ชิ้น" || rawUnit === "บาท/แพ็ค" || rawUnit === "บาท/ถุง")) {
    const normalizedPrice = Math.round((rawPrice / weightInfo.weightKg) * 100) / 100;
    return {
      normalizedPrice,
      normalizedUnit: "บาท/กก.",
      originalPrice: rawPrice,
      originalUnit: rawUnit,
      weightText: weightInfo.rawText,
    };
  }

  // Preserve other units (บาท/ฟอง, บาท/ตัว, บาท/ขวด, บาท/ลิตร)
  return {
    normalizedPrice: rawPrice,
    normalizedUnit: rawUnit,
    originalPrice: rawPrice,
    originalUnit: rawUnit,
    weightText: null,
  };
}
