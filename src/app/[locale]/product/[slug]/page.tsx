import { setRequestLocale } from "next-intl/server";
import { useTranslations } from "next-intl";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { PriceTable, type PriceRow } from "@/components/price-table";
import { EmptyState } from "@/components/empty-state";
import { getDb } from "@/db";
import { products, categories } from "@/db/schema";
import { eq } from "drizzle-orm";
import { DEFAULT_PROVINCE_CODE } from "@/lib/provinces";
import { getProvinceIdByCodeCached, getLatestPricesForProductCached, getAllPricesForProductCached } from "@/db/cached-queries";
import { computePriceChanges } from "@/lib/price-changes";
import { formatDate } from "@/lib/utils";
import { mapRawPricesToPriceRows } from "@/lib/price-row-mapping";

export default async function ProductPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const cookieStore = await cookies();
  const provinceCode = cookieStore.get("province")?.value ?? DEFAULT_PROVINCE_CODE;

  let product: { nameTh: string; nameEn: string | null; categoryNameTh: string; categorySlug: string; categoryIcon: string | null } | null = null;
  let priceRows: PriceRow[] = [];

  try {
    const db = getDb();
    if (db) {
      const provinceId = await getProvinceIdByCodeCached(provinceCode);
      const rows = await db
        .select({
          id: products.id,
          nameTh: products.nameTh,
          nameEn: products.nameEn,
          categoryNameTh: categories.nameTh,
          categorySlug: categories.slug,
          categoryIcon: categories.icon,
        })
        .from(products)
        .innerJoin(categories, eq(products.categoryId, categories.id))
        .where(eq(products.slug, slug))
        .limit(1);

        if (rows.length > 0) {
        const productRow = rows[0];
        product = productRow;
        const rawPrices = await getLatestPricesForProductCached(productRow.id, provinceId);
        const allPrices = await getAllPricesForProductCached(productRow.id, provinceId);
        const priceChangesMap = computePriceChanges(allPrices);

        priceRows = mapRawPricesToPriceRows(rawPrices, productRow.nameTh, priceChangesMap);
      }
    }
  } catch {
    // DB not available
  }

  if (!product) notFound();
  return <ProductContent locale={locale} product={product} priceRows={priceRows} />;
}

function ProductContent({
  locale,
  product,
  priceRows,
}: {
  locale: string;
  product: { nameTh: string; nameEn: string | null; categoryNameTh: string; categorySlug: string; categoryIcon: string | null };
  priceRows: PriceRow[];
}) {
  const tc = useTranslations("common");
  const tp = useTranslations("product");
  const display = locale === "th" ? product.nameTh : product.nameEn ?? product.nameTh;
  const subtitle = locale === "th" ? product.nameEn : product.nameTh;

  const lastUpdated = priceRows.reduce<string | null>(
    (latest, row) => (latest === null || row.sourceDate > latest ? row.sourceDate : latest),
    null
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <Breadcrumb className="mb-4">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href={`/${locale}`}>{tc("appName")}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href={`/${locale}/category/${product.categorySlug}`}>
                {product.categoryNameTh}
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{display}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Product header */}
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-green-50 text-4xl">
          <span aria-hidden>{product.categoryIcon ?? "🛒"}</span>
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-zinc-900 sm:text-3xl">{display}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-zinc-600">{subtitle}</p>}
          <Link
            href={`/${locale}/category/${product.categorySlug}`}
            className="mt-1.5 inline-flex items-center gap-0.5 text-xs font-medium text-green-700 hover:underline"
          >
            {product.categoryNameTh}
            <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      {/* Price comparison */}
      <section className="mt-8">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-zinc-900">{tp("title")}</h2>
            <p className="text-xs text-zinc-600">{tp("subtitle")}</p>
          </div>
          {lastUpdated && (
            <p className="text-xs text-zinc-600">
              {tc("updatedOn", { date: formatDate(lastUpdated, locale) })}
            </p>
          )}
        </div>

        {priceRows.length > 0 ? (
          <PriceTable rows={priceRows} locale={locale} />
        ) : (
          <EmptyState
            icon="🥕"
            title={tc("noDataFriendlyTitle")}
            hint={tc("noDataFriendlyHint")}
            actionLabel={tc("viewCategory")}
            actionHref={`/${locale}/category/${product.categorySlug}`}
          />
        )}
      </section>
    </div>
  );
}