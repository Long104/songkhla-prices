"use client";

import { useTranslations, useLocale } from "next-intl";
import { MapPin } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { provincesSeed, DEFAULT_PROVINCE_CODE, type ProvinceSeed } from "@/lib/provinces";
import { useState, useEffect } from "react";

export function ProvinceSelector() {
  const t = useTranslations("common");
  const locale = useLocale();
  const [province, setProvince] = useState(DEFAULT_PROVINCE_CODE);

  useEffect(() => {
    const saved = localStorage.getItem("province");
    // Intentional: apply saved province post-hydration (lazy initializer won't re-run on hydration)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved) setProvince(saved);
  }, []);

  const handleChange = (value: string) => {
    setProvince(value);
    localStorage.setItem("province", value);
    document.cookie = `province=${value}; path=/; max-age=31536000`; // 1 year
    window.dispatchEvent(new Event("province-change"));
  };

  const displayName = (p: ProvinceSeed) => (locale === "th" ? p.nameTh : p.nameEn);

  return (
    <Select value={province} onValueChange={handleChange}>
      <SelectTrigger className="w-[148px] rounded-full border-zinc-200 bg-white" aria-label={t("province")}>
        <MapPin className="size-3.5 shrink-0 text-green-600" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {provincesSeed.map((p: ProvinceSeed) => (
          <SelectItem key={p.code} value={p.code}>
            {displayName(p)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}