import type { PriceRow } from "@/components/price-table";
import type { RawPriceRow } from "@/db/queries";
import type { PriceChange } from "./price-changes";

export function mapRawPricesToPriceRows(
  rawPrices: RawPriceRow[],
  productName: string,
  priceChangesMap: Map<string, PriceChange>
): PriceRow[] {
  return rawPrices.map((r) => {
    const key = `${r.sourceSlug}::${r.unit}`;
    const changePct = priceChangesMap.get(key)?.changePct ?? null;
    return {
      productName,
      sourceSlug: r.sourceSlug,
      sourceNameTh: r.sourceNameTh,
      sourceNameEn: r.sourceNameEn ?? "",
      sourceType: r.sourceType,
      price: r.price,
      unit: r.unit,
      normalizedPrice: r.normalizedPrice,
      normalizedUnit: r.normalizedUnit,
      weightGrams: r.weightGrams,
      sourceDate: r.sourceDate,
      isNational: r.provinceId === null,
      changePct,
      productTitle: r.productTitle,
      productUrl: r.productUrl,
    };
  });
}
