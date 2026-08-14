import { Badge } from "@/components/ui/badge";
import { UnitWarningBadge } from "./unit-warning-badge";
import { useTranslations } from "next-intl";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

export interface PriceRow {
  productName: string;
  sourceSlug: string;
  sourceNameTh: string;
  sourceNameEn: string;
  sourceType: string;
  price: string;
  unit: string;
  normalizedPrice: string | null;
  normalizedUnit: string | null;
  weightGrams: number | null;
  sourceDate: string;
  isNational: boolean;
}

interface PriceTableProps {
  rows: PriceRow[];
  locale: string;
}

export function PriceTable({ rows, locale }: PriceTableProps) {
  const t = useTranslations("product");
  const tc = useTranslations("common");

  if (rows.length === 0) return null;

  const normalizedRows = rows.map((r) => ({
    ...r,
    displayPrice: r.normalizedPrice ? parseFloat(r.normalizedPrice) : parseFloat(r.price),
    displayUnit: r.normalizedUnit ?? r.unit,
    originalPrice: parseFloat(r.price),
    originalUnit: r.unit,
    weightText: r.weightGrams ? `${r.weightGrams} กรัม` : null,
  }));

  const sorted = [...normalizedRows].sort((a, b) => a.displayPrice - b.displayPrice);
  const cheapestPrice = sorted[0].displayPrice;
  const units = new Set(normalizedRows.map((r) => r.displayUnit));
  const hasMismatch = units.size > 1;

  return (
    <div className="space-y-3">
      {hasMismatch && <UnitWarningBadge />}

        <div className="hidden grid-cols-[1fr,auto,auto] items-center gap-4 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2 text-xs font-semibold text-zinc-500 md:grid">
          <span>{t("source")}</span>
          <span className="text-right">{t("price")}</span>
          <span className="text-right">{t("date")}</span>
        </div>
        <ul className="space-y-2">
        {sorted.map((row, i) => {
          const isCheapest = row.displayPrice === cheapestPrice;
          const name = locale === "th" ? row.sourceNameTh : row.sourceNameEn;
          const showSecondary = row.displayUnit === "บาท/กก." && row.originalUnit !== "บาท/กก.";

          return (
            <li
              key={`${row.sourceSlug}-${i}`}
              className={cn(
                "rounded-xl border bg-white px-4 py-3 md:grid md:grid-cols-[1fr,auto,auto] md:items-center md:gap-4 md:py-2",
                isCheapest
                  ? "border-green-200 bg-green-50/80 ring-1 ring-green-200"
                  : "border-zinc-200"
              )}
            >
              <div className="flex items-center justify-between gap-3 md:justify-start">
                <div className="flex min-w-0 items-center gap-2">
                  <p className="truncate text-sm font-semibold text-zinc-800">
                    {name.replace("ราคากลางทั่วประเทศ", "")}
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
              </div>
              <div className="mt-2 text-right md:mt-0">
                <p
                  className={cn(
                    "shrink-0 text-base font-bold",
                    isCheapest ? "text-green-700" : "text-zinc-800"
                  )}
                >
                  ฿{row.displayPrice.toFixed(2)}/{row.displayUnit.split("/")[1] || "unit"}
                </p>
                {showSecondary && (
                  <p className="text-[10px] text-zinc-400">
                    ({t("from")} ฿{row.originalPrice.toFixed(2)} / {row.weightText})
                  </p>
                )}
              </div>
              <div className="mt-2 flex items-center justify-end text-xs text-zinc-400 md:mt-0 md:justify-end">
                <span>
                  {t("source_date")}: {formatDate(row.sourceDate, locale)}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
