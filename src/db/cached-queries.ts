import { unstable_cache } from "next/cache";
import { getDb } from "@/db";
import {
  getProvinceIdByCode,
  getCategoryProductCounts,
  getRecentPriceChanges,
  getLatestPricesForProducts,
  getLatestPricesForProduct,
  getAllPricesForProduct,
  mergeProductsWithPrices,
} from "./queries";
import type {
  ProductWithCheapestPrice,
  RawPriceRow,
  PriceChangeItem,
  CategoryProductCount,
} from "./queries";

export type {
  ProductWithCheapestPrice,
  RawPriceRow,
  PriceChangeItem,
  CategoryProductCount,
};

/**
 * Cached data-layer wrappers for pages. `unstable_cache` keys are the
 * serializable primitive args passed to each wrapper (plus the tag array),
 * so different provinces / product sets never collide.
 *
 * Every wrapper calls `getDb()` itself and degrades to an empty result when
 * the DB is unavailable, matching the null-DB path of the raw queries.
 *
 * Revalidation windows: province 86400s, counts 3600s, prices 300s.
 */

export const getProvinceIdByCodeCached = unstable_cache(
  async (code: string) => {
    const db = getDb();
    if (!db) return null;
    return getProvinceIdByCode(db, code);
  },
  ["provinceIdByCode"],
  { revalidate: 86400 }
);

export const getCategoryProductCountsCached = unstable_cache(
  async () => {
    const db = getDb();
    if (!db) return [];
    return getCategoryProductCounts(db);
  },
  ["categoryProductCounts"],
  { revalidate: 3600 }
);

export const getRecentPriceChangesCached = unstable_cache(
  async (provinceId: number | null) => {
    const db = getDb();
    if (!db) return [];
    return getRecentPriceChanges(db, provinceId);
  },
  ["recentPriceChanges"],
  { revalidate: 300 }
);

export const getLatestPricesForProductsCached = unstable_cache(
  async (productIds: number[], provinceId: number | null) => {
    const db = getDb();
    if (!db) return [];
    return getLatestPricesForProducts(db, productIds, provinceId);
  },
  ["latestPricesForProducts"],
  { revalidate: 300 }
);

export const getLatestPricesForProductCached = unstable_cache(
  async (productId: number, provinceId: number | null) => {
    const db = getDb();
    if (!db) return [];
    return getLatestPricesForProduct(db, productId, provinceId);
  },
  ["latestPricesForProduct"],
  { revalidate: 300 }
);

export const getAllPricesForProductCached = unstable_cache(
  async (productId: number, provinceId: number | null) => {
    const db = getDb();
    if (!db) return [];
    return getAllPricesForProduct(db, productId, provinceId);
  },
  ["allPricesForProduct"],
  { revalidate: 300 }
);

/**
 * Composes the cached batch price fetch with an in-memory merge so the
 * expensive DB round-trip is cached while the cheap JS grouping runs per
 * request. The productRows (names/ids) come fresh from the caller's query.
 */
export async function getProductsWithCheapestPriceCached(
  productRows: Array<{ id: number; slug: string; nameTh: string; nameEn: string | null }>,
  provinceId: number | null
): Promise<ProductWithCheapestPrice[]> {
  const productIds = productRows.map((p) => p.id);
  const allPrices = await getLatestPricesForProductsCached(productIds, provinceId);
  return mergeProductsWithPrices(productRows, allPrices);
}