import { setRequestLocale } from "next-intl/server";
import { useTranslations } from "next-intl";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { ProductCard } from "@/components/product-card";
import { EmptyState } from "@/components/empty-state";
import { getDb } from "@/db";
import { products, categories } from "@/db/schema";
import { eq } from "drizzle-orm";
import { DEFAULT_PROVINCE_CODE } from "@/lib/provinces";
import { getProvinceIdByCode, getProductsWithCheapestPrice, type ProductWithCheapestPrice } from "@/db/queries";

const VALID_SLUGS = [
  "pork", "chicken", "beef",
  "vegetables", "rice", "eggs", "oil", "seasoning", "fuel", "fruit",
  "fish", "shrimp", "shellfish-crab",
  "beverages", "noodles", "bakery",
  "household", "personal-care", "baby", "pet",
  "frozen", "snacks", "coffee-tea", "canned-goods",
  "meat", "seafood",
];

export function generateStaticParams() {
  return VALID_SLUGS.map((slug) => ({ slug }));
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  if (!VALID_SLUGS.includes(slug)) notFound();
  setRequestLocale(locale);

  const cookieStore = await cookies();
  const provinceCode = cookieStore.get("province")?.value ?? DEFAULT_PROVINCE_CODE;

  let categoryIcon: string | null = null;
  let productList: ProductWithCheapestPrice[] = [];

  try {
    const db = getDb();
    if (db) {
      const provinceId = await getProvinceIdByCode(db, provinceCode);
      const iconRows = await db
        .select({ icon: categories.icon })
        .from(categories)
        .where(eq(categories.slug, slug))
        .limit(1);
      categoryIcon = iconRows.length > 0 ? iconRows[0].icon : null;

      const result = await db
        .select({ id: products.id, slug: products.slug, nameTh: products.nameTh, nameEn: products.nameEn })
        .from(products)
        .innerJoin(categories, eq(products.categoryId, categories.id))
        .where(eq(categories.slug, slug));
      productList = await getProductsWithCheapestPrice(db, result, provinceId);
    }
  } catch {
    // DB not available
  }

  return <CategoryContent locale={locale} slug={slug} icon={categoryIcon} productList={productList} />;
}

function CategoryContent({
  locale,
  slug,
  icon,
  productList,
}: {
  locale: string;
  slug: string;
  icon: string | null;
  productList: ProductWithCheapestPrice[];
}) {
  const t = useTranslations("categories");
  const tc = useTranslations("common");
  const tcat = useTranslations("category");

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <Breadcrumb className="mb-4">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href={`/${locale}`}>{tc("appName")}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{t(slug)}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Category header */}
      <div className="flex items-center gap-3">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-green-50 text-3xl">
          <span aria-hidden>{icon ?? "🛒"}</span>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">{t(slug)}</h1>
          <p className="text-sm text-zinc-500">
            {tcat("productsCount", { count: productList.length })}
          </p>
        </div>
      </div>

      {productList.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon="🧺"
            title={tc("noDataFriendlyTitle")}
            hint={tc("noDataFriendlyHint")}
            actionLabel={tc("backHome")}
            actionHref={`/${locale}`}
          />
        </div>
      ) : (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {productList.map((p) => (
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
      )}
    </div>
  );
}