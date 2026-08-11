import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const THAI_MONTHS_SHORT = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

/**
 * Shorten a DB unit for display next to the ฿ symbol.
 * Units are stored as full strings like "บาท/กก." — next to "฿" the "บาท" is
 * redundant, so "บาท/กก." becomes "/กก." and "บาท/ฟอง" becomes "/ฟอง".
 * Non-บาท units (e.g. "ลิตร") get a "/" prefix so they read as "฿33.45/ลิตร".
 */
export function shortUnit(unit: string): string {
  const cleaned = unit.trim();
  if (!cleaned) return "";
  if (cleaned.startsWith("บาท")) {
    const rest = cleaned.replace(/^บาท/, "").trim();
    if (!rest) return "";
    return rest.startsWith("/") ? rest : `/${rest}`;
  }
  return `/${cleaned}`;
}

/**
 * Format a `YYYY-MM-DD` date string for display.
 * Thai locale uses short Thai month names and the Buddhist era year (CE + 543).
 * Falls back to the raw string when the input is not a valid date.
 */
export function formatDate(dateStr: string, locale: string): string {
  const parts = dateStr.split("-").map(Number);
  const [y, m, d] = parts;
  if (parts.length !== 3 || !y || !m || !d) return dateStr;

  if (locale === "th") {
    return `${d} ${THAI_MONTHS_SHORT[m - 1] ?? ""} ${y + 543}`;
  }
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}