"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ShoppingBasket } from "lucide-react";
import { SearchBar } from "./search-bar";
import { ProvinceSelector } from "./province-selector";
import { LanguageToggle } from "./language-toggle";

export function Header() {
  const t = useTranslations("common");
  const locale = useLocale();

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-100 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-4">
        <Link href={`/${locale}`} className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-green-600 text-white">
            <ShoppingBasket className="h-4.5 w-4.5" />
          </span>
          <span className="truncate text-base font-bold text-zinc-900">
            {t("appName")}
            <span className="ml-1.5 hidden text-xs font-normal text-zinc-600 sm:inline">
              {t("tagline")}
            </span>
          </span>
        </Link>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <ProvinceSelector />
          <LanguageToggle />
        </div>
      </div>
      <div className="mx-auto max-w-5xl px-4 pb-3">
        <Suspense>
          <SearchBar />
        </Suspense>
      </div>
    </header>
  );
}