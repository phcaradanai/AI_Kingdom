import { Activity } from "lucide-react";
import { useTk } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { ProviderHealthStatus } from "@/types/api";
import type { ProviderReadiness } from "./providerModels";

const readinessTone: Record<ProviderReadiness, string> = {
  READY: "border-emerald-400/35 bg-emerald-400/10 text-emerald-300",
  ATTENTION: "border-amber-400/35 bg-amber-400/10 text-amber-300",
  INACTIVE: "border-border bg-muted/25 text-muted-foreground",
};

const healthTone: Record<ProviderHealthStatus, string> = {
  HEALTHY: "text-emerald-300",
  DEGRADED: "text-amber-300",
  DOWN: "text-destructive",
  UNKNOWN: "text-muted-foreground",
};

export function ProviderReadinessBadge({
  readiness,
}: {
  readiness: ProviderReadiness;
}) {
  const tk = useTk();
  return (
    <span
      className={cn(
        "inline-flex min-h-7 items-center rounded-full border px-2 text-[11px] font-semibold",
        readinessTone[readiness],
      )}
      title={readiness}
    >
      {tk(`providers.readiness.${readiness}`)}
    </span>
  );
}

export function ProviderHealthBadge({
  status = "UNKNOWN",
}: {
  status?: ProviderHealthStatus;
}) {
  const tk = useTk();
  return (
    <span
      className={cn(
        "inline-flex min-h-7 items-center gap-1 text-[11px] font-semibold",
        healthTone[status],
      )}
      title={status}
    >
      <Activity className="h-3.5 w-3.5" />
      {tk(`providers.health.${status}`)}
    </span>
  );
}
