import { useTk } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { ProviderHealthStatus } from "@/types/api";
import { healthDotClass, healthTone } from "./routingModels";

export function HealthDot({ status }: { status: ProviderHealthStatus }) {
  return (
    <span
      className={cn("inline-block h-2.5 w-2.5 shrink-0 rounded-full", healthDotClass(status))}
      title={status}
    />
  );
}

export function HealthLabel({ status }: { status: ProviderHealthStatus }) {
  return (
    <span className={cn("text-xs font-semibold", healthTone(status))} title={status}>
      {status}
    </span>
  );
}

export function ChainStatusBadge({ active }: { active: boolean }) {
  const tk = useTk();
  return (
    <span
      className={cn(
        "inline-flex min-h-7 items-center border px-2 text-xs font-semibold",
        active
          ? "border-emerald-400/25 bg-emerald-400/8 text-emerald-200"
          : "border-muted-foreground/20 bg-muted/30 text-muted-foreground",
      )}
    >
      {active ? tk("routing.status.active") : tk("routing.status.disabled")}
    </span>
  );
}

export function CredentialBadge({ configured }: { configured: boolean }) {
  const tk = useTk();
  return (
    <span
      className={cn(
        "inline-flex min-h-7 items-center border px-2 text-xs font-semibold",
        configured
          ? "border-emerald-400/25 bg-emerald-400/8 text-emerald-200"
          : "border-amber-400/25 bg-amber-400/8 text-amber-200",
      )}
    >
      {configured
        ? tk("routing.credentials.configured")
        : tk("routing.credentials.missing")}
    </span>
  );
}
