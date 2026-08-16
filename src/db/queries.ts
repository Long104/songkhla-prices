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

export interface RawPriceRow {
  sourceId: number;
  sourceSlug: string;
  sourceNameTh: string;
  sourceNameEn: string | null;
  sourceType: string;
  price: string;
  unit: string;
  normalizedPrice: string | null;
  normalizedUnit: string | null;
  weightGrams: number | null;
  sourceDate: string;
  provinceId: number | null;
}

/**
 * Fetch the latest price per source AND per unit for a single product.
 *
 * This is the single source of truth for how the app reads a product's
 * current prices. It is shared by the product detail page and the category
 * listing so both surfaces always agree on which price is "latest".
 *
 * Uses `DISTINCT ON (source_id, unit)` so a source that reports the same
 * product in different units (e.g. per-kg and per-pack) keeps both rows.
 */
export interface RawPriceRowWithProduct extends RawPriceRow {
  productId: number;
}

export async function getLatestPricesForProduct(
  db: Db,
  productId: number,
  provinceId: number | null
): Promise<RawPriceRow[]> {
  const provinceCondition =
    provinceId !== null
      ? sql`prices.province_id = ${provinceId} OR prices.province_id IS NULL`
      : sql`prices.province_id IS NULL`;

  const result = await db.execute(sql`
    SELECT DISTINCT ON (prices.source_id, prices.unit)
      prices.source_id as "sourceId",
      sources.slug as "sourceSlug",
      sources.name_th as "sourceNameTh",
      sources.name_en as "sourceNameEn",
      sources.type as "sourceType",
      prices.price,
      prices.unit,
      prices.normalized_price as "normalizedPrice",
      prices.normalized_unit as "normalizedUnit",
      prices.weight_grams as "weightGrams",
      prices.source_date as "sourceDate",
      prices.province_id as "provinceId"
    FROM prices
    INNER JOIN sources ON prices.source_id = sources.id
    WHERE prices.product_id = ${productId}
      AND (${provinceCondition})
    ORDER BY prices.source_id, prices.unit, prices.source_date DESC, prices.scraped_at DESC
  `);

  return (Array.isArray(result) ? result : (result as { rows?: unknown[] }).rows ?? []) as RawPriceRow[];
}

export async function getLatestPricesForProducts(
  db: Db,
  productIds: number[],
  provinceId: number | null
): Promise<RawPriceRowWithProduct[]> {
  if (productIds.length === 0) return [];
  
  const provinceCondition =
    provinceId !== null
      ? sql`prices.province_id = ${provinceId} OR prices.province_id IS NULL`
      : sql`prices.province_id IS NULL`;
  
  const idsParam = sql.join(productIds.map(id => sql`${id}`), sql`, `);

  const result = await db.execute(sql`
    SELECT DISTINCT ON (prices.product_id, prices.source_id, prices.unit)
      prices.product_id as "productId",
      prices.source_id as "sourceId",
      sources.slug as "sourceSlug",
      sources.name_th as "sourceNameTh",
      sources.name_en as "sourceNameEn",
      sources.type as "sourceType",
      prices.price,
      prices.unit,
      prices.normalized_price as "normalizedPrice",
      prices.normalized_unit as "normalizedUnit",
      prices.weight_grams as "weightGrams",
      prices.source_date as "sourceDate",
      prices.province_id as "provinceId"
    FROM prices
    INNER JOIN sources ON prices.source_id = sources.id
    WHERE prices.product_id IN (${idsParam})
      AND (${provinceCondition})
    ORDER BY prices.product_id, prices.source_id, prices.unit, prices.source_date DESC, prices.scraped_at DESC
  `);

  return (Array.isArray(result) ? result : (result as { rows?: unknown[] }).rows ?? []) as RawPriceRowWithProduct[];
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
  cheapestSourceDate: string | null;
  sourceCount: number;
}

export async function getAllPricesForProduct(
  db: Db,
  productId: number,
  provinceId: number | null
): Promise<RawPriceRow[]> {
  const provinceCondition =
    provinceId !== null
      ? sql`prices.province_id = ${provinceId} OR prices.province_id IS NULL`
      : sql`prices.province_id IS NULL`;

  const result = await db.execute(sql`
    SELECT
      prices.source_id as "sourceId",
      sources.slug as "sourceSlug",
      sources.name_th as "sourceNameTh",
      sources.name_en as "sourceNameEn",
      sources.type as "sourceType",
      prices.price,
      prices.unit,
      prices.normalized_price as "normalizedPrice",
      prices.normalized_unit as "normalizedUnit",
      prices.weight_grams as "weightGrams",
      prices.source_date as "sourceDate",
      prices.province_id as "provinceId"
    FROM prices
    INNER JOIN sources ON prices.source_id = sources.id
    WHERE prices.product_id = ${productId}
      AND (${provinceCondition})
    ORDER BY prices.source_id, prices.unit, prices.source_date DESC, prices.scraped_at DESC
  `);

  return (Array.isArray(result) ? result : (result as { rows?: unknown[] }).rows ?? []) as RawPriceRow[];
}

/**
 * In-memory merge of product rows with their batched latest price rows.
 * Pure function — no DB access. Per-product failures yield a product with
 * no price data so pages keep rendering.
 */
export function mergeProductsWithPrices(
  productRows: Array<{ id: number; slug: string; nameTh: string; nameEn: string | null }>,
  allPrices: RawPriceRowWithProduct[]
): ProductWithCheapestPrice[] {
  const pricesByProduct = new Map<number, RawPriceRowWithProduct[]>();
  for (const price of allPrices) {
    if (!pricesByProduct.has(price.productId)) {
      pricesByProduct.set(price.productId, []);
    }
    pricesByProduct.get(price.productId)!.push(price);
  }

  return productRows.map((p) => {
    try {
      const priceRows = pricesByProduct.get(p.id) ?? [];
      const priceInputRows = priceRows.map((r) => ({
        price: r.normalizedPrice ? Number(r.normalizedPrice) : Number(r.price),
        unit: r.normalizedUnit ?? r.unit,
        sourceNameTh: r.sourceNameTh,
        sourceNameEn: r.sourceNameEn,
        sourceDate: r.sourceDate,
      }));

      const { primarySummary, secondarySummary } = summarizePriceFamilies(priceInputRows);

      const cheapestPrice = primarySummary?.minPrice ?? null;
      const cheapestUnit = primarySummary ? `บาท/${primarySummary.unitLabel}` : null;
      const cheapestSourceNameTh = primarySummary?.cheapestSourceNameTh ?? null;
      const cheapestSourceNameEn = primarySummary?.cheapestSourceNameEn ?? null;
      const cheapestSourceDate = primarySummary?.cheapestSourceDate ?? null;
      const maxPrice = primarySummary?.maxPrice ?? null;
      const maxUnit = primarySummary ? `บาท/${primarySummary.unitLabel}` : null;

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
        cheapestSourceDate,
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
        cheapestSourceDate: null,
        sourceCount: 0,
      };
    }
  });
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
  const productIds = productRows.map((p) => p.id);
  const allPrices = await getLatestPricesForProducts(db, productIds, provinceId);
  return mergeProductsWithPrices(productRows, allPrices);
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
