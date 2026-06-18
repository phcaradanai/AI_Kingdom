import { X, AlertTriangle, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AgentRoutingPreviewDto, RouteAttemptPlanEntry } from "@/types/api";

const SOURCE_LABEL: Record<RouteAttemptPlanEntry["source"], string> = {
  PRIMARY_MODEL: "Primary model",
  FALLBACK_MODEL: "Fallback model",
  FALLBACK_PROVIDER: "Fallback provider",
  EMERGENCY_SANDBOX: "Emergency sandbox",
  SKIPPED: "Skipped"
};

const SOURCE_BADGE: Record<RouteAttemptPlanEntry["source"], string> = {
  PRIMARY_MODEL: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  FALLBACK_MODEL: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  FALLBACK_PROVIDER: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
  EMERGENCY_SANDBOX: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  SKIPPED: "bg-rose-500/15 text-rose-300 border-rose-500/30"
};

const SETTINGS: Array<{ name: string; detail: string }> = [
  { name: "Preferred Provider", detail: "The provider the agent should use first. When it is active and supports chat, it is always attempted before anything else." },
  { name: "Primary Model", detail: "The first model attempted on the preferred provider." },
  { name: "Fallback Models", detail: "Backup model IDs tried on the SAME preferred provider, in order, before switching providers." },
  { name: "Fallback Providers", detail: "Backup providers tried only after every model on the preferred provider has failed." },
  { name: "Routing Policy", detail: "Selects global routing vs. fixed routing. Note: whenever a Preferred Provider is set and usable, it is always tried first regardless of this policy; the system-wide global routing chain only applies when no usable preferred provider is configured." },
  { name: "Provider status", detail: "An inactive provider, invalid credentials, or failed model validation causes the provider to be skipped." },
  { name: "Budget limits (DAILY_BUDGET_LIMIT_USD / MONTHLY_BUDGET_LIMIT_USD)", detail: "When a budget is exceeded, paid providers are blocked and the route collapses toward free/sandbox options." },
  { name: "Paid provider setting (LIVING_LOOP_ALLOW_PAID_PROVIDERS)", detail: "If disabled, paid providers may be skipped for automated/loop work." },
  { name: "Production fallback in sandbox (ALLOW_PRODUCTION_FALLBACK_IN_SANDBOX)", detail: "If disabled, production/API providers used as fallbacks are skipped during local/dev runs." },
  { name: "Routing debug mode (ROUTING_DEBUG_MODE)", detail: "When enabled, skipped-provider reasons are recorded for review." },
  { name: "Model parameters", detail: "Some models fail if unsupported reasoning / stream / json parameters are sent. Use a compatible parameter mode." }
];

export function RoutingHelpModal({
  open,
  onClose,
  preview,
  agentName
}: {
  open: boolean;
  onClose: () => void;
  preview: AgentRoutingPreviewDto | null;
  agentName?: string;
}) {
  if (!open) return null;

  const plan = preview?.attemptPlan ?? [];
  const sandboxWarning = preview?.sandboxBeforeApiModels;
  const blocked = preview?.preferredProviderBlocked;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="How AI Kingdom chooses an AI model">
      <div className="bg-background rounded-lg border border-border shadow-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto space-y-5 p-6">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-base text-foreground">How AI Kingdom chooses an AI model</h3>
          <Button variant="ghost" className="h-7 w-7 p-0" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* 1. Attempt order */}
        <section className="space-y-2">
          <h4 className="text-sm font-semibold text-foreground">1. Attempt order</h4>
          <ol className="space-y-1 text-xs text-muted-foreground list-decimal list-inside">
            <li>The <span className="text-foreground font-medium">Primary model</span> is tried first.</li>
            <li><span className="text-foreground font-medium">Fallback models</span> are tried next, using the same preferred provider.</li>
            <li><span className="text-foreground font-medium">Fallback providers</span> are tried only after every model on the preferred provider fails.</li>
            <li><span className="text-foreground font-medium">Local Sandbox</span> is the emergency fallback and should normally be last.</li>
          </ol>
        </section>

        {/* 2. Settings that affect routing */}
        <section className="space-y-2">
          <h4 className="text-sm font-semibold text-foreground">2. Settings that affect routing</h4>
          <dl className="space-y-1.5 text-xs">
            {SETTINGS.map((s) => (
              <div key={s.name}>
                <dt className="text-foreground font-medium">{s.name}</dt>
                <dd className="text-muted-foreground">{s.detail}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* 3. Current effective route preview */}
        <section className="space-y-2">
          <h4 className="text-sm font-semibold text-foreground">
            3. Current effective route{agentName ? ` — ${agentName}` : ""}
          </h4>

          {sandboxWarning && (
            <div className="flex items-start gap-2 rounded border border-rose-500/40 bg-rose-500/10 p-2 text-xs text-rose-200">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>Sandbox is earlier than configured API models. This is usually wrong.</span>
            </div>
          )}
          {blocked && (
            <div className="flex items-start gap-2 rounded border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-200">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>
                Preferred provider is blocked by {blocked.settingKey ?? "a provider/route setting"}. The agent will not use this API provider until fixed.
                <span className="block text-amber-300/80 mt-0.5">{blocked.reason}</span>
              </span>
            </div>
          )}

          {plan.length === 0 ? (
            <p className="text-xs text-muted-foreground">No effective route preview available. Open an agent and refresh its routing preview.</p>
          ) : (
            <ol className="space-y-1">
              {plan.map((entry, i) => (
                <li key={`${entry.providerId}-${entry.model}-${i}`}>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground w-4 text-right">{i + 1}.</span>
                    <span className={cn("inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium", SOURCE_BADGE[entry.source])}>
                      {SOURCE_LABEL[entry.source]}
                    </span>
                    <span className="font-medium text-foreground">{entry.providerName}</span>
                    <span className="text-muted-foreground">/</span>
                    <span className="font-mono text-foreground truncate">{entry.model}</span>
                    <span className={cn(
                      "ml-auto text-[10px] font-medium",
                      entry.status === "READY" ? "text-emerald-300" : entry.status === "BLOCKED" ? "text-rose-300" : "text-muted-foreground"
                    )}>
                      {entry.status === "READY" ? "ready" : entry.status === "BLOCKED" ? "blocked" : "unknown"}
                    </span>
                  </div>
                  {entry.skipReason && (
                    <div className="ml-6 text-[11px] text-rose-300/80">
                      {entry.skipReason}
                      {entry.settingKey && <span className="text-muted-foreground"> · setting: {entry.settingKey}</span>}
                    </div>
                  )}
                  {i < plan.length - 1 && entry.status === "READY" && (
                    <div className="ml-1 text-muted-foreground/40"><ArrowDown className="h-2.5 w-2.5" /></div>
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>

        <div className="flex justify-end pt-1">
          <Button variant="outline" className="h-8 text-xs" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}
