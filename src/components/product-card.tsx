import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { shortUnit } from "@/lib/utils";

interface ProductCardProps {
  slug: string;
  nameTh: string;
  nameEn: string | null;
  cheapestPrice: number | null;
  cheapestUnit: string | null;
  maxPrice: number | null;
  maxUnit: string | null;
  cheapestSourceNameTh: string | null;
  cheapestSourceNameEn: string | null;
  sourceCount: number;
  locale: string;
}

export function ProductCard({
  slug,
  nameTh,
  nameEn,
  cheapestPrice,
  cheapestUnit,
  maxPrice,
  maxUnit,
  cheapestSourceNameTh,
  cheapestSourceNameEn,
  sourceCount,
  locale,
}: ProductCardProps) {
  const t = useTranslations("common");
  const display = locale === "th" ? nameTh : nameEn ?? nameTh;
  const subtitle = locale === "th" ? nameEn : nameTh;

  return (
    <Link href={`/${locale}/product/${slug}`} className="group">
      <Card className="h-full p-4 transition duration-200 group-hover:-translate-y-0.5 group-hover:shadow-md">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-zinc-800">{display}</p>
            {subtitle && (
              <p className="mt-0.5 truncate text-xs text-zinc-400">{subtitle}</p>
            )}
          </div>
          {sourceCount > 0 && (
            <Badge variant="secondary" className="shrink-0 text-[11px]">
              {t("sourcesCount", { count: sourceCount })}
            </Badge>
          )}
        </div>

        {cheapestPrice !== null ? (
          <div className="mt-3">
            <p className="text-lg font-bold text-orange-600">
              ฿{Number(cheapestPrice).toFixed(2)}
              {maxPrice !== null && Number(maxPrice) > Number(cheapestPrice) && (
                <span className="text-sm font-normal text-zinc-400">
                  {" "}
                  – ฿{Number(maxPrice).toFixed(2)}
                  {maxUnit && maxUnit !== cheapestUnit && (
                    <span className="text-xs">{shortUnit(maxUnit)}</span>
                  )}
                </span>
              )}
              {cheapestUnit && (
                <span className="ml-1 text-xs font-normal text-zinc-400">
                  {shortUnit(cheapestUnit)}
                </span>
              )}
            </p>
            {cheapestSourceNameTh && (
              <p className="mt-1 flex items-center gap-1 text-xs text-green-700">
                <span className="rounded-full bg-green-50 px-1.5 py-0.5 font-medium">
                  {t("cheapestAt")} {locale === "th" ? cheapestSourceNameTh : cheapestSourceNameEn}
                </span>
              </p>
            )}
          </div>
        ) : (
          <p className="mt-3 text-sm text-zinc-400">{t("noData")}</p>
        )}

        <div className="mt-3 flex items-center justify-end text-green-700">
          <span className="text-xs font-medium">{t("viewPrices")}</span>
          <ChevronRight className="ml-0.5 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </div>
      </Card>
    </Link>
  );
}