import { Badge } from "@/components/ui/badge";
import { UnitWarningBadge } from "./unit-warning-badge";
import { useTranslations } from "next-intl";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

export interface PriceRow {
  sourceSlug: string;
  sourceNameTh: string;
  sourceNameEn: string;
  sourceType: string;
  price: string;
  unit: string;
  sourceDate: string;
  isNational: boolean;
}

interface PriceTableProps {
  rows: PriceRow[];
  locale: string;
}

/**
 * Price comparison list — the core of the product page.
 *
 * Rows are sorted cheapest-first; the cheapest source is highlighted with a
 * green background and a "ถูกที่สุด" badge. Rendered as stacked cards (not a
 * table) so it never overflows on small phones.
 */
export function PriceTable({ rows, locale }: PriceTableProps) {
  const t = useTranslations("product");
  const tc = useTranslations("common");

  if (rows.length === 0) return null;

  const sorted = [...rows].sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
  const cheapestPrice = parseFloat(sorted[0].price);
  const units = new Set(rows.map((r) => r.unit));
  const hasMismatch = units.size > 1;

  return (
    <div className="space-y-3">
      {hasMismatch && <UnitWarningBadge />}

      {/* Column labels — desktop only */}
      <div className="hidden grid-cols-[1fr_auto_auto_auto] gap-3 px-4 text-xs font-medium text-zinc-400 sm:grid">
        <span>{t("source")}</span>
        <span className="w-24 text-right">{t("price")}</span>
        <span className="w-16">{t("unit")}</span>
        <span className="w-24 text-right">{t("date")}</span>
      </div>

      <ul className="space-y-2">
        {sorted.map((row, i) => {
          const isCheapest = parseFloat(row.price) === cheapestPrice;
          const name = locale === "th" ? row.sourceNameTh : row.sourceNameEn;
          return (
            <li
              key={`${row.sourceSlug}-${i}`}
              className={cn(
                "rounded-xl border bg-white px-4 py-3",
                isCheapest
                  ? "border-green-200 bg-green-50/80 ring-1 ring-green-200"
                  : "border-zinc-200"
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <p className="truncate text-sm font-semibold text-zinc-800">
                    {name}
                    {isCheapest && (
                      <Badge className="ml-2 bg-green-600 text-[11px]">
                        {tc("cheapest")}
                      </Badge>
                    )}
                    {row.isNational && (
                      <Badge variant="outline" className="ml-1.5 text-[11px]">
                        {tc("national")}
                      </Badge>
                    )}
                  </p>
                </div>
                <p
                  className={cn(
                    "shrink-0 text-base font-bold",
                    isCheapest ? "text-green-700" : "text-zinc-800"
                  )}
                >
                  ฿{Number(row.price).toFixed(2)}
                </p>
              </div>
              <div className="mt-1.5 flex items-center justify-between text-xs text-zinc-400">
                <span>
                  {t("unit")}: {row.unit}
                </span>
                <span>{formatDate(row.sourceDate, locale)}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}