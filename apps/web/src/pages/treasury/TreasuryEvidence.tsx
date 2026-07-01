import { AlertTriangle, ArrowRight, FileSearch, Route, Settings, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { Link } from "react-router-dom";
import { useTk } from "@/lib/i18n";
import { getModelDisplayName, getProviderDisplayName } from "@/lib/providerDisplay";
import { cn, formatDate } from "@/lib/utils";
import type {
  TreasuryAttentionTraceDto,
  TreasuryDailyDto,
  TreasuryFallbackAnalyticsDto,
  TreasuryMonthlyDto,
  TreasuryOverviewDto,
} from "@/types/api";
import { formatCost, formatTokens } from "./treasuryModels";

export function TreasuryEvidence({
  overview,
  traces,
  fallbackAnalytics,
  daily,
  monthly,
}: {
  overview: TreasuryOverviewDto | null;
  traces: TreasuryAttentionTraceDto[];
  fallbackAnalytics: TreasuryFallbackAnalyticsDto[];
  daily: TreasuryDailyDto[];
  monthly: TreasuryMonthlyDto[];
}) {
  return (
    <>
      <div className="mt-6 grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.75fr)]">
        <AttentionTraces traces={traces} fallbackAnalytics={fallbackAnalytics} />
        <BudgetGuardrail overview={overview} />
      </div>
      <div className="mt-6 grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
        <SpendTrend daily={daily} monthly={monthly} />
        <SourceOwnership traces={traces} />
      </div>
    </>
  );
}

function AttentionTraces({ traces, fallbackAnalytics }: { traces: TreasuryAttentionTraceDto[]; fallbackAnalytics: TreasuryFallbackAnalyticsDto[] }) {
  const tk = useTk();
  const failedAttempts = fallbackAnalytics.reduce((sum, item) => sum + item.failureCount + item.timeoutCount, 0);
  return (
    <section className="min-w-0 border border-border bg-card/20" id="usage-evidence">
      <div className="border-b border-border px-4 py-4 sm:px-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">{tk("treasury.evidence.title")}</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{tk("treasury.evidence.description")}</p>
          </div>
          {failedAttempts > 0 ? (
            <span className="shrink-0 text-xs font-semibold text-amber-400">{tk("treasury.evidence.routeFailures", { count: failedAttempts })}</span>
          ) : null}
        </div>
      </div>
      {traces.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-muted-foreground">{tk("treasury.evidence.empty")}</div>
      ) : (
        <div className="divide-y divide-border">
          {traces.map((trace) => (
            <div className="grid min-w-0 gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:px-5" key={trace.traceId}>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn("text-xs font-semibold", trace.attentionKind === "FAILED" ? "text-red-400" : "text-amber-400")}>
                    {tk(trace.attentionKind === "FAILED" ? "treasury.evidence.failed" : "treasury.evidence.expensive")}
                  </span>
                  <span className="text-xs text-muted-foreground">{formatDate(trace.startedAt)}</span>
                </div>
                <div className="mt-1 break-words text-sm font-medium">{trace.purpose || trace.operation}</div>
                <div className="mt-1 break-words text-xs text-muted-foreground">
                  {getProviderDisplayName(trace.providerId ?? trace.providerType ?? trace.providerName ?? "unknown")}
                  {trace.model ? ` · ${getModelDisplayName(trace.model)}` : ""}
                  {trace.failureCount > 0 ? ` · ${tk("treasury.evidence.failures", { count: trace.failureCount })}` : ""}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                <div className="text-left sm:text-right">
                  <div className="font-mono text-sm font-semibold tabular-nums">{tk("treasury.evidence.cost", { cost: formatCost(trace.totalCostUSD) })}</div>
                  <div className="text-xs text-muted-foreground">{tk("treasury.evidence.tokens", { count: formatTokens(trace.totalTokens) })}</div>
                </div>
                <Link className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border px-3 text-sm font-semibold hover:bg-muted" to={`/usage-traces/${trace.traceId}`}>
                  {tk("treasury.evidence.open")}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function BudgetGuardrail({ overview }: { overview: TreasuryOverviewDto | null }) {
  const tk = useTk();
  return (
    <section className="min-w-0 border border-border bg-card/20">
      <div className="border-b border-border px-4 py-4 sm:px-5">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <h2 className="font-semibold">{tk("treasury.guardrail.title")}</h2>
        </div>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">{tk("treasury.guardrail.description")}</p>
      </div>
      <div className="space-y-4 px-4 py-5 sm:px-5">
        <BudgetRow label={tk("treasury.guardrail.daily")} limit={overview?.budgetStatus.dailyLimit ?? null} spent={overview?.costToday ?? 0} warning={overview?.budgetStatus.dailyWarning ?? false} />
        <BudgetRow label={tk("treasury.guardrail.monthly")} limit={overview?.budgetStatus.monthlyLimit ?? null} spent={overview?.costThisMonth ?? 0} warning={overview?.budgetStatus.monthlyWarning ?? false} />
        <div className="flex flex-wrap gap-2 pt-1">
          <Link className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border px-3 text-sm font-semibold hover:bg-muted" to="/settings">
            <Settings className="h-4 w-4" />{tk("treasury.guardrail.settings")}
          </Link>
          <Link className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border px-3 text-sm font-semibold hover:bg-muted" to="/routing">
            <Route className="h-4 w-4" />{tk("treasury.guardrail.routing")}
          </Link>
        </div>
      </div>
    </section>
  );
}

function BudgetRow({ label, limit, spent, warning }: { label: string; limit: number | null; spent: number; warning: boolean }) {
  const tk = useTk();
  const percentage = limit && limit > 0 ? Math.min(100, (spent / limit) * 100) : 0;
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="font-medium">{label}</span>
        <span className={cn("font-mono text-xs tabular-nums", warning ? "text-red-400" : "text-muted-foreground")}>
          {limit === null ? tk("treasury.guardrail.noLimit") : `${formatCost(spent)} / ${formatCost(limit)}`}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden bg-muted">
        <div className={cn("h-full", warning ? "bg-red-400" : "bg-primary")} style={{ width: `${percentage}%` }} />
      </div>
      {limit !== null ? (
        <div className={cn("mt-1.5 text-xs", warning ? "text-red-300" : "text-muted-foreground")}>
          {warning ? tk("treasury.guardrail.reached") : tk("treasury.guardrail.remaining", { amount: formatCost(Math.max(0, limit - spent)) })}
        </div>
      ) : null}
    </div>
  );
}

function SpendTrend({ daily, monthly }: { daily: TreasuryDailyDto[]; monthly: TreasuryMonthlyDto[] }) {
  const tk = useTk();
  const visible = daily.slice(-10);
  const max = Math.max(...visible.map((item) => item.totalCostUSD), 0);
  const latestMonth = monthly.at(-1);
  return (
    <section className="min-w-0 border border-border bg-card/20">
      <div className="border-b border-border px-4 py-4 sm:px-5">
        <h2 className="font-semibold">{tk("treasury.trend.title")}</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{tk("treasury.trend.description")}</p>
      </div>
      <div className="px-4 py-5 sm:px-5">
        {visible.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{tk("treasury.trend.empty")}</p>
        ) : (
          <div className="space-y-2">
            {visible.map((item) => (
              <div className="grid grid-cols-[76px_minmax(0,1fr)_76px] items-center gap-3 text-xs" key={item.date}>
                <span className="text-muted-foreground">{item.date.slice(5)}</span>
                <span className="h-2 min-w-0 bg-muted"><span className="block h-full bg-primary" style={{ width: `${max > 0 ? Math.max(2, item.totalCostUSD / max * 100) : 0}%` }} /></span>
                <span className="text-right font-mono tabular-nums">{formatCost(item.totalCostUSD)}</span>
              </div>
            ))}
          </div>
        )}
        {latestMonth ? <div className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">{tk("treasury.trend.monthly", { month: latestMonth.month, cost: formatCost(latestMonth.totalCostUSD) })}</div> : null}
      </div>
    </section>
  );
}

function SourceOwnership({ traces }: { traces: TreasuryAttentionTraceDto[] }) {
  const tk = useTk();
  const sources = [
    { icon: FileSearch, title: tk("treasury.source.trace"), description: tk("treasury.source.traceDescription"), to: traces[0] ? `/usage-traces/${traces[0].traceId}` : "#usage-evidence" },
    { icon: SlidersHorizontal, title: tk("treasury.source.providers"), description: tk("treasury.source.providersDescription"), to: "/providers" },
    { icon: Route, title: tk("treasury.source.routing"), description: tk("treasury.source.routingDescription"), to: "/routing" },
    { icon: AlertTriangle, title: tk("treasury.source.audit"), description: tk("treasury.source.auditDescription"), to: "/audit" },
  ];
  return (
    <section className="min-w-0 border border-border bg-card/20">
      <div className="border-b border-border px-4 py-4 sm:px-5">
        <h2 className="font-semibold">{tk("treasury.sources.title")}</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{tk("treasury.sources.description")}</p>
      </div>
      <div className="divide-y divide-border">
        {sources.map(({ icon: Icon, title, description, to }) => (
          <Link className="grid min-h-16 min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 hover:bg-muted/40 sm:px-5" key={title} to={to}>
            <Icon className="h-4 w-4 text-primary" />
            <span className="min-w-0">
              <span className="block text-sm font-medium">{title}</span>
              <span className="mt-0.5 block break-words text-xs leading-5 text-muted-foreground">{description}</span>
            </span>
            <span className="sr-only">{tk("treasury.source.open")}</span>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        ))}
      </div>
    </section>
  );
}
