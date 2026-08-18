"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { UnitInfoBanner } from "./unit-warning-badge";
import { useTranslations } from "next-intl";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { classifyUnit, type UnitFamily } from "@/lib/unit-families";
import { parseUnitWord, canonicalizeUnit } from "@/lib/unit-dictionary";
import { classifyVariant, isValidProductUrl } from "@/lib/variant";

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
  changePct?: number | null;
  productTitle?: string | null;
  productUrl?: string | null;
}

interface PriceTableProps {
  rows: PriceRow[];
  locale: string;
}

const FAMILY_PRECEDENCE: UnitFamily[] = ["weight", "volume", "pack", "count"];

export function PriceTable({ rows, locale }: PriceTableProps) {
  const t = useTranslations("product");
  const tc = useTranslations("common");

  // Enrich rows with classified family & prices
  const processedRows = rows.map((r) => {
    const rawPrice = parseFloat(r.price);
    const normPrice = r.normalizedPrice ? parseFloat(r.normalizedPrice) : rawPrice;

    // Determine family from raw unit first, fallback to normalizedUnit
    const family = classifyUnit(r.unit) ?? classifyUnit(r.normalizedUnit ?? "") ?? "weight";

    const rawUnitWord = canonicalizeUnit(parseUnitWord(r.unit));
    const normUnitWord = canonicalizeUnit(parseUnitWord(r.normalizedUnit ?? r.unit));

    return {
      ...r,
      family,
      rawPrice,
      normPrice,
      rawUnitWord,
      normUnitWord,
    };
  });

  // Group by family
  const familyMap = new Map<UnitFamily, typeof processedRows>();
  for (const r of processedRows) {
    const list = familyMap.get(r.family) ?? [];
    list.push(r);
    familyMap.set(r.family, list);
  }

  const availableFamilies = FAMILY_PRECEDENCE.filter((f) => familyMap.has(f) && (familyMap.get(f)?.length ?? 0) > 0);

  // Default active tab: first available in precedence order
  const [activeFamily, setActiveFamily] = useState<UnitFamily>(
    availableFamilies[0] ?? "weight"
  );

  if (rows.length === 0) return null;

  const currentFamily = availableFamilies.includes(activeFamily)
    ? activeFamily
    : availableFamilies[0] ?? "weight";

  const activeRows = familyMap.get(currentFamily) ?? [];

  // In active tab, calculate display prices & sort ascending
  const displayRows = activeRows.map((r) => {
    // For pack family: show original pack price as primary (e.g. ฿49.00/แพ็ค)
    // and if weightGrams present, compute per-kg equivalent subtext (≈ ฿245.00/กก. · 200g)
    if (r.family === "pack") {
      const primaryPrice = r.rawPrice;
      const primaryUnit = r.rawUnitWord;
      let perKgEquivalent: number | null = null;
      if (r.weightGrams && r.weightGrams > 0) {
        perKgEquivalent = Math.round((r.rawPrice / (r.weightGrams / 1000)) * 100) / 100;
      } else if (r.normalizedUnit === "บาท/กก." && r.normalizedPrice) {
        perKgEquivalent = r.normPrice;
      }

      return {
        ...r,
        sortPrice: primaryPrice,
        displayPriceText: `฿${primaryPrice.toFixed(2)}/${primaryUnit}`,
        perKgEquivalent,
      };
    }

    // For weight/volume/count: show display price
    const primaryPrice = r.rawPrice;
    const primaryUnit = r.rawUnitWord;
    return {
      ...r,
      sortPrice: primaryPrice,
      displayPriceText: `฿${primaryPrice.toFixed(2)}/${primaryUnit}`,
      perKgEquivalent: null,
    };
  });

  displayRows.sort((a, b) => a.sortPrice - b.sortPrice);

  const cheapestPrice = displayRows.length > 0 ? displayRows[0].sortPrice : null;

  const getFamilyTabLabel = (fam: UnitFamily, count: number) => {
    switch (fam) {
      case "weight":
        return `${t("unitFamilyWeight")} (${count})`;
      case "volume":
        return `${t("unitFamilyVolume")} (${count})`;
      case "pack":
        return `${t("unitFamilyPack")} (${count})`;
      case "count": {
        const firstCountUnit = activeRows[0]?.rawUnitWord ?? "ชิ้น";
        return `${t("unitFamilyCount", { unit: firstCountUnit })} (${count})`;
      }
    }
  };

  return (
    <div className="space-y-3">
      {/* Segmented control tabs (hidden if only 1 family) */}
      {availableFamilies.length > 1 && (
        <div className="flex flex-wrap gap-1.5 rounded-xl bg-zinc-100 p-1">
          {availableFamilies.map((fam) => {
            const count = familyMap.get(fam)?.length ?? 0;
            const isActive = fam === currentFamily;
            return (
              <button
                key={fam}
                onClick={() => setActiveFamily(fam)}
                className={cn(
                  "flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition-all sm:text-sm",
                  isActive
                    ? "bg-white text-zinc-900 shadow-sm"
                    : "text-zinc-500 hover:text-zinc-700"
                )}
              >
                {getFamilyTabLabel(fam, count)}
              </button>
            );
          })}
        </div>
      )}

      {/* Multi-unit info banner */}
      <UnitInfoBanner familyCount={availableFamilies.length} />

      {/* Table header */}
      <div className="hidden grid-cols-[1fr,auto,auto] items-center gap-4 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2 text-xs font-semibold text-zinc-500 md:grid">
        <span>{t("source")}</span>
        <span className="text-right">{t("price")}</span>
        <span className="text-right">{t("date")}</span>
      </div>

      {/* Price row list */}
      <ul className="space-y-2">
        {displayRows.map((row, i) => {
          const isCheapest = cheapestPrice !== null && row.sortPrice === cheapestPrice;
          const name = locale === "th" ? row.sourceNameTh : row.sourceNameEn;

          // Variant badge logic
          const variant = classifyVariant(row.productTitle ?? null);
          const variantLabel = variant ? t("variantLabel", { variant: t(variant) }) : null;

          // Product URL link logic
          const productUrl = isValidProductUrl(row.productUrl) ? row.productUrl : null;
          const linkText = t("viewAtStore");

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
                      <Badge className="ml-2 bg-green-600 text-[11px] text-white">
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

              {row.productTitle && (
                <div className="mt-2 md:mt-0">
                  <p className="text-xs text-zinc-500 truncate" title={row.productTitle ?? undefined}>
                    {row.productTitle}
                  </p>
                  {variant && (
                    <Badge
                      variant="secondary"
                      className="mt-1 text-xs"
                      title={variantLabel ?? undefined}
                    >
                      {t(variant)}
                    </Badge>
                  )}
                </div>
              )}

              <div className="mt-2 text-right md:mt-0">
                <p
                  className={cn(
                    "shrink-0 text-base font-bold flex items-center gap-1 justify-end",
                    isCheapest ? "text-green-700" : "text-zinc-800"
                  )}
                >
                  {row.displayPriceText}
                  {row.changePct !== undefined && row.changePct !== null && row.changePct !== 0 && (
                    <span
                      className={cn(
                        "text-xs font-semibold",
                        row.changePct > 0 ? "text-red-600" : "text-green-600"
                      )}
                      aria-label={
                        row.changePct > 0
                          ? t("priceUp", { pct: Math.abs(row.changePct).toFixed(1) })
                          : t("priceDown", { pct: Math.abs(row.changePct).toFixed(1) })
                      }
                    >
                      {row.changePct > 0 ? `▲ +${row.changePct.toFixed(1)}%` : `▼ ${Math.abs(row.changePct).toFixed(1)}%`}
                    </span>
                  )}
                </p>

                {row.perKgEquivalent !== null && (
                  <p className="text-[11px] text-zinc-500">
                    (≈ ฿{row.perKgEquivalent.toFixed(2)}/กก. · {row.weightGrams}g)
                  </p>
                )}
              </div>

              <div className="mt-2 flex items-center justify-end text-xs text-zinc-600 md:mt-0 md:justify-end">
                <span>
                  {t("source_date")}: {formatDate(row.sourceDate, locale)}
                </span>
              </div>

              {productUrl && (
                <div className="mt-2 flex items-center justify-end md:mt-0 md:justify-end">
                  <a
                    href={productUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 min-h-[44px]"
                    aria-label={variantLabel ? `${linkText} (${variantLabel})` : linkText}
                  >
                    {linkText}
                    <svg
                      className="h-3 w-3"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 20"
                      />
                    </svg>
                  </a>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
