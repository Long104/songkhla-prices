export type VariantType = "frozen" | "chilled" | "fresh";

/**
 * Classifies product title into temperature variant.
 * Precedence: แช่แข็ง (frozen) > แช่เย็น (chilled) > สด (fresh).
 * Conservative: returns null if no exact known marker is found.
 */
export function classifyVariant(title: string | null | undefined): VariantType | null {
  if (!title) return null;
  if (title.includes("แช่แข็ง")) return "frozen";
  if (title.includes("แช่เย็น")) return "chilled";
  if (title.includes("สด")) return "fresh";
  return null;
}

/**
 * Validates product URL to ensure it is a safe, absolute HTTPS URL.
 * Rejects javascript:, http:, relative URLs, or invalid URLs.
 */
export function isValidProductUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}
