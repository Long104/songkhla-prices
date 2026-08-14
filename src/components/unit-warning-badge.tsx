import { Info } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * Contextual info chip shown under the unit-family segmented control when a
 * product is sold in multiple unit families (e.g. per-kg AND per-pack).
 * Replaces the old red "unit mismatch" warning banner — different families are
 * now expected and handled by the tabs, so this is informational only.
 */
export function UnitInfoBanner({ familyCount }: { familyCount: number }) {
  const t = useTranslations("product");
  if (familyCount <= 1) return null;
  return (
    <div className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 border border-amber-200/60">
      <Info className="h-3.5 w-3.5 shrink-0 text-amber-600" />
      <span>{t("unitMultiInfo")}</span>
    </div>
  );
}

// Backwards-compatible alias — the old name was a red "mismatch" warning, but
// multi-unit products are now expected. Keep the import working for any caller.
export const UnitWarningBadge = UnitInfoBanner;
