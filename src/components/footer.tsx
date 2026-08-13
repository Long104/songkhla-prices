import { useTranslations } from "next-intl";
import { ShoppingBasket } from "lucide-react";

export function Footer() {
  const t = useTranslations("footer");
  const tc = useTranslations("common");
  const sources = ["กรมการค้าภายใน", "แม็คโคร", "โลตัส", "ตลาดสี่มุมเมือง", "พลังงาน"];

  return (
    <footer className="mt-auto border-t border-zinc-100 bg-green-50/40 py-8">
      <div className="mx-auto max-w-5xl px-4">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-green-600 text-white">
            <ShoppingBasket className="h-3.5 w-3.5" />
          </span>
          <span className="text-sm font-bold text-zinc-800">{tc("appName")}</span>
        </div>
        <p className="mt-2 text-sm text-zinc-500">{t("tagline")}</p>
        <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
          {t("dataSources")}
        </p>
        <p className="mt-1 text-sm text-zinc-600">{sources.join(" · ")}</p>
        <p className="mt-2 text-xs text-zinc-400">{t("disclaimer")}</p>
      </div>
    </footer>
  );
}
