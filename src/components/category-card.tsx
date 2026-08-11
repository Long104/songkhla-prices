import Link from "next/link";
import { Card } from "@/components/ui/card";
import { useTranslations } from "next-intl";

interface CategoryCardProps {
  slug: string;
  icon: string;
  productCount?: number;
  locale: string;
}

export function CategoryCard({ slug, icon, productCount, locale }: CategoryCardProps) {
  const t = useTranslations("categories");
  const tc = useTranslations("common");

  return (
    <Link href={`/${locale}/category/${slug}`} className="group">
      <Card className="flex h-full flex-col items-center justify-center gap-2 p-4 py-6 transition duration-200 group-hover:-translate-y-0.5 group-hover:shadow-md sm:p-5">
        <span
          aria-hidden
          className="flex h-14 w-14 items-center justify-center rounded-2xl bg-green-50 text-3xl transition group-hover:bg-green-100"
        >
          {icon}
        </span>
        <span className="text-[15px] font-semibold text-zinc-800">{t(slug)}</span>
        {productCount !== undefined && (
          <span className="text-xs text-zinc-400">
            {tc("productsCount", { count: productCount })}
          </span>
        )}
      </Card>
    </Link>
  );
}