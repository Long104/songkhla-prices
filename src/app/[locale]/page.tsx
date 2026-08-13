import { setRequestLocale } from "next-intl/server";
import { useTranslations } from "next-intl";
import { cookies } from "next/headers";
import { Suspense } from "react";
import { MapPin } from "lucide-react";
import { CategoryCard } from "@/components/category-card";
import { SearchBar } from "@/components/search-bar";
import { ProvinceSelector } from "@/components/province-selector";
import { PriceTypeToggle } from "@/components/price-type-toggle";
import { PriceChangesList } from "@/components/price-changes-list";
import { EmptyState } from "@/components/empty-state";
import { getDb } from "@/db";
import { getCategoryProductCounts, getProvinceIdByCode, getRecentPriceChanges, type PriceChangeItem } from "@/db/queries";
import { DEFAULT_PROVINCE_CODE } from "@/lib/provinces";

const CATEGORIES = [
  { slug: "pork", icon: "🥓" },
  { slug: "chicken", icon: "🍗" },
  { slug: "beef", icon: "🥩" },
  { slug: "vegetables", icon: "🥬" },
  { slug: "rice", icon: "🍚" },
  { slug: "eggs", icon: "🥚" },
  { slug: "oil", icon: "🛢️" },
  { slug: "seasoning", icon: "🧂" },
  { slug: "fuel", icon: "⛽" },
  { slug: "fruit", icon: "🍎" },
  { slug: "fish", icon: "🐟" },
  { slug: "shrimp", icon: "🦐" },
  { slug: "shellfish-crab", icon: "🦀" },
  { slug: "beverages", icon: "🥤" },
  { slug: "noodles", icon: "🍜" },
  { slug: "bakery", icon: "🍞" },
  { slug: "household", icon: "🧹" },
  { slug: "personal-care", icon: "🧴" },
  { slug: "baby", icon: "🍼" },
  { slug: "pet", icon: "🐱" },
  { slug: "frozen", icon: "🧊" },
  { slug: "snacks", icon: "🍿" },
  { slug: "coffee-tea", icon: "☕" },
  { slug: "canned-goods", icon: "🥫" },
];

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const cookieStore = await cookies();
  const provinceCode = cookieStore.get("province")?.value ?? DEFAULT_PROVINCE_CODE;

  let counts = new Map<string, number>();
  let changes: PriceChangeItem[] = [];

  try {
    const db = getDb();
    if (db) {
      const provinceId = await getProvinceIdByCode(db, provinceCode);
      const [countRows, changeRows] = await Promise.all([
        getCategoryProductCounts(db),
        getRecentPriceChanges(db, provinceId, 8),
      ]);
      counts = new Map(countRows.map((c) => [c.slug, c.count]));
      changes = changeRows;
    }
  } catch {
    // DB not available — render empty states
  }

  return <HomeContent locale={locale} counts={counts} changes={changes} />;
}

function HomeContent({
  locale,
  counts,
  changes,
}: {
  locale: string;
  counts: Map<string, number>;
  changes: PriceChangeItem[];
}) {
  const t = useTranslations("home");
  const tc = useTranslations("common");

  return (
    <div className="pb-12">
      {/* Hero */}
      <section className="bg-gradient-to-b from-green-50/80 via-green-50/40 to-white">
        <div className="mx-auto max-w-3xl px-4 pb-10 pt-10 text-center sm:pt-14">
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
            {t("heroTitle")}
          </h1>
          <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-zinc-500">
            {t("heroSubtitle")}
          </p>

          <div className="mt-7">
            <Suspense>
              <SearchBar size="lg" />
            </Suspense>
          </div>

          {/* Province selector — prominent under the search */}
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <MapPin className="h-4 w-4 text-green-600" />
            <span className="text-sm font-medium text-zinc-600">{tc("province")}:</span>
            <ProvinceSelector />
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="mx-auto max-w-5xl px-4 pt-8">
        <div className="mb-4">
          <h2 className="text-xl font-bold text-zinc-900">{t("shopByCategory")}</h2>
          <p className="mt-0.5 text-sm text-zinc-500">{t("shopByCategoryHint")}</p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {CATEGORIES.map((cat) => (
            <CategoryCard
              key={cat.slug}
              slug={cat.slug}
              icon={cat.icon}
              productCount={counts.get(cat.slug) ?? 0}
              locale={locale}
            />
          ))}
        </div>
      </section>

      {/* Today's price updates */}
      <section className="mx-auto max-w-5xl px-4 pt-10">
        <div className="mb-4">
          <h2 className="text-xl font-bold text-zinc-900">{t("trendingTitle")}</h2>
          <p className="mt-0.5 text-sm text-zinc-500">{t("trendingHint")}</p>
        </div>
        {changes.length > 0 ? (
          <PriceChangesList items={changes} locale={locale} />
        ) : (
          <EmptyState
            icon="🌤️"
            title={t("trendingEmptyTitle")}
            hint={t("trendingEmptyHint")}
          />
        )}
      </section>
    </div>
  );
}