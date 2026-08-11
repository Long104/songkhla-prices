"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export function PriceTypeToggle() {
  const t = useTranslations("priceType");
  const [priceType, setPriceType] = useState("retail");

  useEffect(() => {
    const saved = localStorage.getItem("priceType");
    // Intentional: apply saved priceType post-hydration (lazy initializer won't re-run on hydration)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved === "retail" || saved === "wholesale") setPriceType(saved);
  }, []);

  const handleChange = (value: string) => {
    setPriceType(value);
    localStorage.setItem("priceType", value);
    document.cookie = `priceType=${value}; path=/; max-age=31536000`;
    window.dispatchEvent(new Event("price-type-change"));
  };

  return (
    <div className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 p-0.5">
      <button
        onClick={() => handleChange("retail")}
        className={cn(
          "rounded-full px-3 py-1 text-xs font-medium transition-colors",
          priceType === "retail"
            ? "bg-green-600 text-white"
            : "text-zinc-500 hover:text-zinc-700"
        )}
      >
        {t("retail")}
      </button>
      <button
        onClick={() => handleChange("wholesale")}
        className={cn(
          "rounded-full px-3 py-1 text-xs font-medium transition-colors",
          priceType === "wholesale"
            ? "bg-blue-600 text-white"
            : "text-zinc-500 hover:text-zinc-700"
        )}
      >
        {t("wholesale")}
      </button>
    </div>
  );
}