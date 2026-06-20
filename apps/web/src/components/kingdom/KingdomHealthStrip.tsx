import { AlertCircle, AlertTriangle, CheckCircle2, Eye } from "lucide-react";
import { Link } from "react-router-dom";
import { useTk } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { KingdomHealthDto, KingdomHealthItemDto, KingdomHealthStatus } from "@/types/api";

export const HEALTH_COLORS: Record<KingdomHealthStatus, string> = {
  HEALTHY: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
  WARNING: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  CRITICAL: "border-destructive/50 bg-destructive/10 text-destructive"
};

export function HealthIcon({ status }: { status: KingdomHealthStatus }) {
  if (status === "CRITICAL") return <AlertCircle className="h-3.5 w-3.5" />;
  if (status === "WARNING") return <AlertTriangle className="h-3.5 w-3.5" />;
  return <CheckCircle2 className="h-3.5 w-3.5" />;
}

function HealthPill({ item }: { item: KingdomHealthItemDto }) {
  const color = HEALTH_COLORS[item.status];
  const title = item.reason + (item.recommendedAction ? `\n→ ${item.recommendedAction}` : "");
  const content = (
    <span
      title={title}
      className={cn(
        "inline-flex cursor-default items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold",
        color
      )}
    >
      <HealthIcon status={item.status} />
      {item.label}
    </span>
  );

  if (item.sourceReference) {
    return (
      <Link to={item.sourceReference} title={title}>
        {content}
      </Link>
    );
  }
  return content;
}

/**
 * Kingdom Health at a glance — five purpose-keyed pills (Context / Providers / Runners /
 * Reviews / Automation) rendered green / yellow / red. WARNING and CRITICAL pills link to
 * their source page so the King can act in one click. Shared by the Dashboard and the
 * Kingdom Operations Center.
 */
export function KingdomHealthStrip({ health, className }: { health: KingdomHealthDto; className?: string }) {
  const tk = useTk();
  return (
    <div className={cn("rounded-xl border border-border bg-card/60 p-4 backdrop-blur-sm", className)}>
      <div className="mb-3 flex items-center gap-2">
        <Eye className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">{tk("health.title")}</span>
        <span
          title={health.overallStatus}
          className={cn(
            "ml-auto rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
            HEALTH_COLORS[health.overallStatus]
          )}
        >
          {tk(`health.status.${health.overallStatus}`)}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {health.items.map((item) => (
          <HealthPill key={item.key} item={item} />
        ))}
      </div>
    </div>
  );
}
