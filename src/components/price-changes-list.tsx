import Link from "next/link";
import { useTranslations } from "next-intl";
import { ChevronRight, TrendingUp } from "lucide-react";
import type { PriceChangeItem } from "@/db/queries";
import { shortUnit, formatDate } from "@/lib/utils";

interface PriceChangesListProps {
  items: PriceChangeItem[];
  locale: string;
}

/**
 * "ราคาที่เปลี่ยนวันนี้" — today's price updates from all sources.
 * Each row links to the product's price comparison page.
 */
export function PriceChangesList({ items, locale }: PriceChangesListProps) {
  const t = useTranslations("common");
  const tc = useTranslations("common");

  return (
    <ul className="space-y-2">
      {items.map((item) => {
        const display = locale === "th" ? item.nameTh : item.nameEn ?? item.nameTh;
        const source = locale === "th" ? item.sourceNameTh : item.sourceNameEn;
        return (
          <li key={item.slug}>
            <Link
              href={`/${locale}/product/${item.slug}`}
              aria-label={`${display} — ฿${Number(item.minPrice).toFixed(2)}`}
              className="group flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 transition hover:border-green-200 hover:bg-green-50/50"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
                <TrendingUp className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-zinc-800">{display}</p>
                <p className="mt-0.5 truncate text-xs text-zinc-600">
                  {t("cheapestAt")} {source} · {tc("updatedShort", { date: formatDate(item.sourceDate, locale) })}
                </p>
              </div>
              <p className="shrink-0 text-base font-bold text-orange-600">
                ฿{Number(item.minPrice).toFixed(2)}
                {item.minUnit && (
                  <span className="ml-0.5 text-xs font-normal text-zinc-600">
                    {shortUnit(item.minUnit)}
                  </span>
                )}
              </p>
              <ChevronRight className="h-4 w-4 shrink-0 text-zinc-300 transition group-hover:translate-x-0.5 group-hover:text-green-600" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}