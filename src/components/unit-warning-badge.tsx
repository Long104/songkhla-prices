import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";

export function UnitWarningBadge() {
  const t = useTranslations("common");
  return (
    <Badge variant="destructive" className="gap-1">
      <AlertTriangle className="h-3 w-3" />
      {t("unitMismatch")}
    </Badge>
  );
}
