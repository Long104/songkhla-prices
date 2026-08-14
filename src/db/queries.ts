import { eq, isNull, max, or, sql, type SQL } from "drizzle-orm";
import { categories, prices, products, provinces, sources } from "@/db/schema";
import type { Db } from "@/db";
import { summarizePriceFamilies, type UnitFamilySummary } from "@/lib/unit-families";

/**
 * Resolve a DOPA province code (e.g. "90" = Songkhla) to its DB id.
 * Returns null when the code is unknown or the lookup fails.
 */
export async function getProvinceIdByCode(db: Db, code: string): Promise<number | null> {
  try {
    const [prov] = await db
      .select({ id: provinces.id })
      .from(provinces)
      .where(eq(provinces.code, code))
      .limit(1);
    return prov ? prov.id : null;
  } catch {
    return null;
  }
}

/**
 * SQL filter matching prices for a province OR national (province_id IS NULL).
 * Falls back to national-only when the province is unknown (provinceId === null).
 */
export function provincePriceFilter(provinceId: number | null): SQL | undefined {
  if (provinceId === null) return isNull(prices.provinceId);
  return or(eq(prices.provinceId, provinceId), isNull(prices.provinceId));
}

export interface ProductWithCheapestPrice {
  id: number;
  slug: string;
  nameTh: string;
  nameEn: string | null;
  primarySummary: UnitFamilySummary | null;
  secondarySummary: UnitFamilySummary | null;
  cheapestPrice: number | null;
  cheapestUnit: string | null;
  maxPrice: number | null;
  maxUnit: string | null;
  cheapestSourceNameTh: string | null;
  cheapestSourceNameEn: string | null;
  sourceCount: number;
}

/**
 * Enrich a product list with the cheapest price (province or national), its unit,
 * the highest price, the cheapest source name, and the number of distinct sources
 * reporting a price. Never throws — per-product failures yield a product with no
 * price data so pages keep rendering.
 */
export async function getProductsWithCheapestPrice(
  db: Db,
  productRows: Array<{ id: number; slug: string; nameTh: string; nameEn: string | null }>,
  provinceId: number | null
): Promise<ProductWithCheapestPrice[]> {
  return Promise.all(
    productRows.map(async (p) => {
      try {
        const result = await db.execute(sql`
          SELECT DISTINCT ON (prices.source_id)
            prices.price,
            prices.unit,
            prices.normalized_price as "normalizedPrice",
            prices.normalized_unit as "normalizedUnit",
            prices.weight_grams as "weightGrams",
            prices.source_id as "sourceId",
            sources.name_th as "sourceNameTh",
            sources.name_en as "sourceNameEn"
          FROM prices
          INNER JOIN sources ON prices.source_id = sources.id
          WHERE prices.product_id = ${p.id}
          ORDER BY prices.source_id, prices.source_date DESC, prices.scraped_at DESC
        `);
        const priceRows = result.rows as unknown as Array<{
          price: string;
          unit: string;
          normalizedPrice: string | null;
          normalizedUnit: string | null;
          weightGrams: number | null;
          sourceId: number;
          sourceNameTh: string;
          sourceNameEn: string | null;
        }>;

        const priceInputRows = priceRows.map((r) => ({
          price: r.normalizedPrice ? Number(r.normalizedPrice) : Number(r.price),
          unit: r.normalizedUnit ?? r.unit,
          sourceNameTh: r.sourceNameTh,
          sourceNameEn: r.sourceNameEn,
        }));

        const { primarySummary, secondarySummary } = summarizePriceFamilies(priceInputRows);

        let cheapestPrice: number | null = null;
        let cheapestUnit: string | null = null;
        let cheapestSourceNameTh: string | null = null;
        let cheapestSourceNameEn: string | null = null;
        let maxPrice: number | null = null;
        let maxUnit: string | null = null;

        for (const r of priceRows) {
          const normPrice = r.normalizedPrice ? Number(r.normalizedPrice) : Number(r.price);
          const normUnit = r.normalizedUnit ?? r.unit;
          
          if (cheapestPrice === null || normPrice < cheapestPrice) {
            cheapestPrice = normPrice;
            cheapestUnit = normUnit;
            cheapestSourceNameTh = r.sourceNameTh;
            cheapestSourceNameEn = r.sourceNameEn;
          }
          if (maxPrice === null || normPrice > maxPrice) {
            maxPrice = normPrice;
            maxUnit = normUnit;
          }
        }

        return {
          ...p,
          primarySummary,
          secondarySummary,
          cheapestPrice,
          cheapestUnit,
          maxPrice,
          maxUnit,
          cheapestSourceNameTh,
          cheapestSourceNameEn,
          sourceCount: priceRows.length,
        };
      } catch {
        return {
          ...p,
          primarySummary: null,
          secondarySummary: null,
          cheapestPrice: null,
          cheapestUnit: null,
          maxPrice: null,
          maxUnit: null,
          cheapestSourceNameTh: null,
          cheapestSourceNameEn: null,
          sourceCount: 0,
        };
      }
    })
  );
}

export interface CategoryProductCount {
  slug: string;
  count: number;
}

/** Product count per category for the home page category cards. */
export async function getCategoryProductCounts(db: Db): Promise<CategoryProductCount[]> {
  try {
    const rows = await db
      .select({ slug: categories.slug, count: sql<number>`count(${products.id})` })
      .from(categories)
      .leftJoin(products, eq(products.categoryId, categories.id))
      .groupBy(categories.slug);
    return rows.map((r) => ({ slug: r.slug, count: Number(r.count) }));
  } catch {
    return [];
  }
}

export interface PriceChangeItem {
  slug: string;
  nameTh: string;
  nameEn: string | null;
  minPrice: number;
  minUnit: string;
  sourceNameTh: string;
  sourceNameEn: string;
  sourceDate: string;
}

/**
 * Products with prices reported on the most recent source date, showing each
 * product's cheapest price and the source that reported it. Used for the home
 * page "ราคาที่เปลี่ยนวันนี้" (today's price updates) section.
 */
export async function getRecentPriceChanges(
  db: Db,
  provinceId: number | null,
  limit = 8
): Promise<PriceChangeItem[]> {
  try {
    const [latest] = await db
      .select({ d: max(prices.sourceDate) })
      .from(prices);
    if (!latest?.d) return [];

    const rows = await db
      .select({
        slug: products.slug,
        nameTh: products.nameTh,
        nameEn: products.nameEn,
        price: prices.price,
        unit: prices.unit,
        normalizedPrice: prices.normalizedPrice,
        normalizedUnit: prices.normalizedUnit,
        sourceNameTh: sources.nameTh,
        sourceNameEn: sources.nameEn,
        sourceDate: prices.sourceDate,
      })
      .from(prices)
      .innerJoin(products, eq(prices.productId, products.id))
      .innerJoin(sources, eq(prices.sourceId, sources.id))
      .where(eq(prices.sourceDate, latest.d));

    const byProduct = new Map<string, PriceChangeItem>();
    for (const r of rows) {
      const num = r.normalizedPrice ? Number(r.normalizedPrice) : Number(r.price);
      const unit = r.normalizedUnit ?? r.unit;
      const existing = byProduct.get(r.slug);
      if (!existing || num < existing.minPrice) {
        byProduct.set(r.slug, {
          slug: r.slug,
          nameTh: r.nameTh,
          nameEn: r.nameEn,
          minPrice: num,
          minUnit: unit,
          sourceNameTh: r.sourceNameTh,
          sourceNameEn: r.sourceNameEn,
          sourceDate: r.sourceDate,
        });
      }
    }
    return [...byProduct.values()]
      .sort((a, b) => a.minPrice - b.minPrice)
      .slice(0, limit);
  } catch {
    return [];
  }
}
