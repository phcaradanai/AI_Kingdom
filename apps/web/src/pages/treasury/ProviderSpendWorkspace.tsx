import { Activity, ArrowRight, Coins, Database, Route } from "lucide-react";
import { Link } from "react-router-dom";
import { useTk } from "@/lib/i18n";
import { getModelDisplayName } from "@/lib/providerDisplay";
import { cn, formatDate } from "@/lib/utils";
import type { TreasuryAttentionTraceDto, UsageRecordDto } from "@/types/api";
import { formatBalance, formatCost, formatTokens, traceMatchesProvider, type ProviderSpendSummary } from "./treasuryModels";

export function ProviderSpendWorkspace({
  providers,
  selected,
  onSelect,
  traces,
  records,
}: {
  providers: ProviderSpendSummary[];
  selected: ProviderSpendSummary | null;
  onSelect: (key: string) => void;
  traces: TreasuryAttentionTraceDto[];
  records: UsageRecordDto[];
}) {
  const tk = useTk();
  return (
    <section className="mt-6 grid min-w-0 gap-5 lg:grid-cols-[minmax(280px,380px)_minmax(0,1fr)]">
      <div className="min-w-0 border border-border bg-card/20">
        <div className="border-b border-border px-4 py-4">
          <h2 className="font-semibold">{tk("treasury.registry.title")}</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{tk("treasury.registry.description")}</p>
        </div>
        {providers.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <Database className="mx-auto h-5 w-5 text-muted-foreground" />
            <div className="mt-3 text-sm font-medium">{tk("treasury.registry.empty")}</div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{tk("treasury.registry.emptyDescription")}</p>
          </div>
        ) : (
          <div aria-label={tk("treasury.registry.aria")} className="divide-y divide-border" role="list">
            {providers.map((provider) => (
              <button
                aria-label={tk("treasury.registry.select", { name: provider.name })}
                aria-pressed={selected?.key === provider.key}
                className={cn(
                  "flex min-h-16 w-full min-w-0 items-center gap-3 border-l-2 px-4 py-3 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary",
                  selected?.key === provider.key
                    ? "border-l-primary bg-primary/8"
                    : "border-l-transparent hover:bg-muted/40",
                )}
                key={provider.key}
                onClick={() => onSelect(provider.key)}
                type="button"
              >
                <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", healthDot(provider.healthStatus))} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{provider.name}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {tk("treasury.registry.calls", { count: provider.calls })} · {tk("treasury.registry.models", { count: provider.models.length })}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-mono text-sm font-semibold tabular-nums">{formatCost(provider.spend)}</span>
                  <span className="text-[11px] text-muted-foreground">{tk("treasury.registry.spend")}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <ProviderDetail provider={selected} traces={traces} records={records} />
    </section>
  );
}

function ProviderDetail({
  provider,
  traces,
  records,
}: {
  provider: ProviderSpendSummary | null;
  traces: TreasuryAttentionTraceDto[];
  records: UsageRecordDto[];
}) {
  const tk = useTk();
  if (!provider) {
    return (
      <div className="flex min-h-72 items-center justify-center border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        {tk("treasury.detail.prompt")}
      </div>
    );
  }
  const latestAttentionTrace = traces.find((trace) => traceMatchesProvider(trace, provider));
  const latestUsage = records.find((record) =>
    record.providerId === provider.key || record.provider === provider.type,
  );
  const traceId = latestAttentionTrace?.traceId ?? latestUsage?.traceId ?? null;

  return (
    <div className="min-w-0 border border-border bg-card/20">
      <div className="border-b border-border px-4 py-4 sm:px-5">
        <div className="text-xs font-semibold text-primary">{tk("treasury.detail.eyebrow")}</div>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <h2 className="break-words text-xl font-semibold">{provider.name}</h2>
          <span className={cn("text-xs font-semibold", healthText(provider.healthStatus))}>
            {tk(`providers.health.${provider.healthStatus}`)}
          </span>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {provider.lastSyncAt ? tk("treasury.detail.lastSync", { date: formatDate(provider.lastSyncAt) }) : tk("treasury.detail.noSync")}
        </div>
      </div>

      <div className="grid grid-cols-2 divide-x divide-y divide-border border-b border-border sm:grid-cols-4 sm:divide-y-0">
        <EvidenceMetric icon={Coins} label={tk("treasury.detail.spend")} value={formatCost(provider.spend)} />
        <EvidenceMetric icon={Activity} label={tk("treasury.detail.calls")} value={String(provider.calls)} />
        <EvidenceMetric icon={Database} label={tk("treasury.detail.tokens")} value={formatTokens(provider.tokens)} />
        <EvidenceMetric icon={Coins} label={tk("treasury.detail.balance")} value={formatBalance(provider.balance)} />
      </div>

      <div className="px-4 py-5 sm:px-5">
        <h3 className="text-sm font-semibold">{tk("treasury.detail.modelBreakdown")}</h3>
        <div className="mt-3 divide-y divide-border border-y border-border">
          {provider.models.length === 0 ? (
            <p className="py-5 text-sm text-muted-foreground">{tk("treasury.detail.noModels")}</p>
          ) : provider.models.map((model) => (
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-3 py-3" key={`${model.provider}:${model.model}`}>
              <div className="min-w-0">
                <div className="break-words text-sm font-medium">{getModelDisplayName(model.model)}</div>
                <div className="mt-1 text-xs text-muted-foreground">{tk("treasury.registry.calls", { count: model.callCount })} · {tk("treasury.evidence.tokens", { count: formatTokens(model.totalTokens) })}</div>
              </div>
              <div className="font-mono text-sm font-semibold tabular-nums">{formatCost(model.totalCostUSD)}</div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">{tk("treasury.detail.estimatedNote")}</p>

        <div className="mt-4 flex flex-wrap gap-2">
          <SourceButton icon={Database} label={tk("treasury.detail.openProvider")} to="/providers" />
          <SourceButton icon={Route} label={tk("treasury.detail.openRouting")} to="/routing" />
          {traceId ? <SourceButton icon={Activity} label={tk("treasury.detail.openTrace")} to={`/usage-traces/${traceId}`} /> : null}
        </div>
      </div>
    </div>
  );
}

function EvidenceMetric({ icon: Icon, label, value }: { icon: typeof Coins; label: string; value: string }) {
  return (
    <div className="min-w-0 px-3 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="break-words font-mono text-base font-semibold tabular-nums">{value}</span>
        <Icon className="h-4 w-4 shrink-0 text-primary" />
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function SourceButton({ icon: Icon, label, to }: { icon: typeof Coins; label: string; to: string }) {
  return (
    <Link className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border px-3 text-sm font-semibold hover:bg-muted" to={to}>
      <Icon className="h-4 w-4" />
      {label}
      <ArrowRight className="h-3.5 w-3.5" />
    </Link>
  );
}

function healthDot(status: ProviderSpendSummary["healthStatus"]) {
  if (status === "HEALTHY") return "bg-emerald-400";
  if (status === "DEGRADED") return "bg-amber-400";
  if (status === "DOWN") return "bg-red-400";
  return "bg-muted-foreground";
}

function healthText(status: ProviderSpendSummary["healthStatus"]) {
  if (status === "HEALTHY") return "text-emerald-400";
  if (status === "DEGRADED") return "text-amber-400";
  if (status === "DOWN") return "text-red-400";
  return "text-muted-foreground";
}
