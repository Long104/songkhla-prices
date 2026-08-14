import { setRequestLocale } from "next-intl/server";
import { useTranslations } from "next-intl";
import { cookies } from "next/headers";
import { SearchBar } from "@/components/search-bar";
import { ProductCard } from "@/components/product-card";
import { EmptyState } from "@/components/empty-state";
import { getDb } from "@/db";
import { products } from "@/db/schema";
import { ilike, or } from "drizzle-orm";
import { Suspense } from "react";
import { DEFAULT_PROVINCE_CODE } from "@/lib/provinces";
import { getProvinceIdByCode, getProductsWithCheapestPrice, type ProductWithCheapestPrice } from "@/db/queries";

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { locale } = await params;
  const { q } = await searchParams;
  setRequestLocale(locale);

  const cookieStore = await cookies();
  const provinceCode = cookieStore.get("province")?.value ?? DEFAULT_PROVINCE_CODE;

  let results: ProductWithCheapestPrice[] = [];
  if (q && q.trim()) {
    try {
      const db = getDb();
      if (db) {
        const provinceId = await getProvinceIdByCode(db, provinceCode);
        const matched = await db
          .select({ id: products.id, slug: products.slug, nameTh: products.nameTh, nameEn: products.nameEn })
          .from(products)
          .where(or(ilike(products.nameTh, `%${q}%`), ilike(products.nameEn, `%${q}%`)));
        results = await getProductsWithCheapestPrice(db, matched, provinceId);
      }
    } catch {
      // DB not available
    }
  }

  return <SearchContent locale={locale} results={results} query={q ?? ""} />;
}

function SearchContent({ locale, results, query }: { locale: string; results: ProductWithCheapestPrice[]; query: string }) {
  const tc = useTranslations("common");
  const ts = useTranslations("search");

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mx-auto mb-6 max-w-2xl">
        <Suspense>
          <SearchBar size="lg" />
        </Suspense>
      </div>

      <div className="mb-4">
        <h1 className="text-xl font-bold text-zinc-900">
          {query ? ts("resultsTitle", { query }) : ts("title")}
        </h1>
        {query && results.length > 0 && (
          <p className="mt-0.5 text-sm text-zinc-500">
            {ts("resultsCount", { count: results.length })}
          </p>
        )}
      </div>

      {results.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((p) => (
            <ProductCard
              key={p.slug}
              slug={p.slug}
              nameTh={p.nameTh}
              nameEn={p.nameEn}
              primarySummary={p.primarySummary}
              secondarySummary={p.secondarySummary}
              cheapestSourceNameTh={p.cheapestSourceNameTh}
              cheapestSourceNameEn={p.cheapestSourceNameEn}
              sourceCount={p.sourceCount}
              locale={locale}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon="🔍"
          title={query ? tc("noResultsFriendlyTitle", { query }) : tc("searchPromptTitle")}
          hint={query ? tc("noResultsFriendlyHint") : tc("searchPromptHint")}
          actionLabel={tc("viewCategory")}
          actionHref={`/${locale}`}
        />
      )}
    </div>
  );
}