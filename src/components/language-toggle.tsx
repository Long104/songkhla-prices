"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale } from "next-intl";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { code: "th", label: "ไทย" },
  { code: "en", label: "EN" },
] as const;

/**
 * Segmented Thai/English toggle — the active language is a filled green pill,
 * so it's obvious which language the app is showing right now.
 */
export function LanguageToggle() {
  const pathname = usePathname();
  const currentLocale = useLocale();

  return (
    <nav aria-label="Language" className="flex items-center rounded-full border border-zinc-200 bg-white p-0.5">
      {OPTIONS.map((opt) => {
        const isActive = currentLocale === opt.code;
        const newPath = pathname.replace(`/${currentLocale}`, `/${opt.code}`);
        return (
          <Link
            key={opt.code}
            href={newPath}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "rounded-full px-2.5 py-1 text-xs font-semibold transition-colors",
              isActive
                ? "bg-green-600 text-white"
                : "text-zinc-500 hover:text-zinc-800"
            )}
          >
            {opt.label}
          </Link>
        );
      })}
    </nav>
  );
}