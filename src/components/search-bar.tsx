"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";

interface SearchBarProps {
  /** "lg" renders a large, hero-style search bar */
  size?: "default" | "lg";
}

export function SearchBar({ size = "default" }: SearchBarProps) {
  const t = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");

  const go = useCallback(
    (value: string) => {
      if (value.trim()) {
        router.push(`/${locale}/search?q=${encodeURIComponent(value.trim())}`);
      }
    },
    [router, locale]
  );

  const debouncedSearch = useCallback(
    (value: string) => {
      if (value.trim()) go(value);
    },
    [go]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      if (query.trim() && query !== (searchParams.get("q") ?? "")) {
        debouncedSearch(query);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [query, debouncedSearch, searchParams]);

  const isLarge = size === "lg";

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        go(query);
      }}
      className="flex w-full items-center gap-2"
    >
      <div className="relative flex-1">
        <Search
          className={cn(
            "absolute top-1/2 -translate-y-1/2 text-zinc-400",
            isLarge ? "left-4 h-5 w-5" : "left-3 h-4 w-4"
          )}
        />
        <Input
          type="search"
          placeholder={t("search")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={t("search")}
          className={cn(
            "bg-white",
            isLarge
              ? "h-13 rounded-full border-zinc-200 pl-11 pr-4 text-base shadow-sm focus-visible:border-green-500 focus-visible:ring-green-500/20"
              : "pl-9"
          )}
        />
      </div>
      {isLarge && (
        <Button
          type="submit"
          className="hidden h-13 shrink-0 rounded-full px-6 text-base sm:inline-flex"
        >
          {t("searchButton")}
        </Button>
      )}
    </form>
  );
}