import { CalendarDays, CircleDollarSign, HeartPulse, ShieldAlert, WalletCards } from "lucide-react";
import { useTk } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { TreasuryAttentionTraceDto, TreasuryOverviewDto } from "@/types/api";
import {
  formatCost,
  formatTokens,
  getBudgetSignal,
  getHealthSignal,
  getRiskSignal,
  type ProviderSpendSummary,
  type TreasurySignal,
} from "./treasuryModels";

export function TreasurySummary({
  overview,
  providers,
  traces,
  partial,
}: {
  overview: TreasuryOverviewDto | null;
  providers: ProviderSpendSummary[];
  traces: TreasuryAttentionTraceDto[];
  partial: boolean;
}) {
  const tk = useTk();
  const budget = getBudgetSignal(overview);
  const health = getHealthSignal(providers);
  const risk = getRiskSignal({ overview, providers, traces, partial });
  const metrics = [
    {
      label: tk("treasury.summary.today"),
      value: overview ? formatCost(overview.costToday) : "—",
      detail: overview ? tk("treasury.summary.tokens", { count: formatTokens(overview.totalTokensToday) }) : "—",
      icon: CircleDollarSign,
      signal: null,
    },
    {
      label: tk("treasury.summary.month"),
      value: overview ? formatCost(overview.costThisMonth) : "—",
      detail: overview ? tk("treasury.summary.calls", { count: overview.totalCallsAllTime }) : "—",
      icon: CalendarDays,
      signal: null,
    },
    { label: tk("treasury.summary.budget"), value: tk(budget.labelKey), detail: budgetDetail(overview, tk), icon: WalletCards, signal: budget },
    { label: tk("treasury.summary.risk"), value: tk(risk.labelKey), detail: riskDetail(traces, partial, tk), icon: ShieldAlert, signal: risk },
    { label: tk("treasury.summary.health"), value: tk(health.labelKey), detail: providerHealthDetail(providers, tk), icon: HeartPulse, signal: health },
  ];

  return (
    <section
      aria-label={tk("treasury.summary.aria")}
      className="grid min-w-0 grid-cols-2 divide-x divide-y divide-border border-y border-border lg:grid-cols-5 lg:divide-y-0"
    >
      {metrics.map(({ label, value, detail, icon: Icon, signal }) => (
        <div className="min-w-0 px-3 py-4 sm:px-4" key={label}>
          <div className="flex items-start justify-between gap-2">
            <div className={cn("break-words text-lg font-semibold tabular-nums", toneClass(signal))}>{value}</div>
            <Icon className={cn("h-4 w-4 shrink-0", toneClass(signal, true))} />
          </div>
          <div className="mt-1 text-xs font-medium text-foreground">{label}</div>
          <div className="mt-1 break-words text-xs leading-5 text-muted-foreground">{detail}</div>
        </div>
      ))}
    </section>
  );
}

function toneClass(signal: TreasurySignal | null, icon = false) {
  if (!signal) return icon ? "text-primary" : "text-foreground";
  if (signal.tone === "danger") return "text-red-400";
  if (signal.tone === "attention") return "text-amber-400";
  if (signal.tone === "healthy") return "text-emerald-400";
  return "text-muted-foreground";
}

function budgetDetail(overview: TreasuryOverviewDto | null, tk: ReturnType<typeof useTk>) {
  if (!overview) return "—";
  const { dailyLimit, monthlyLimit } = overview.budgetStatus;
  if (dailyLimit === null && monthlyLimit === null) return tk("treasury.guardrail.noLimit");
  if (overview.budgetStatus.dailyWarning || overview.budgetStatus.monthlyWarning) return tk("treasury.guardrail.reached");
  const remaining = dailyLimit !== null ? dailyLimit - overview.costToday : (monthlyLimit ?? 0) - overview.costThisMonth;
  return tk("treasury.guardrail.remaining", { amount: formatCost(Math.max(0, remaining)) });
}

function riskDetail(traces: TreasuryAttentionTraceDto[], partial: boolean, tk: ReturnType<typeof useTk>) {
  if (partial) return tk("treasury.summary.partialTelemetry");
  const failures = traces.filter((trace) => trace.attentionKind === "FAILED").length;
  return failures > 0 ? tk("treasury.summary.failedTraces", { count: failures }) : tk("treasury.summary.noAlerts");
}

function providerHealthDetail(providers: ProviderSpendSummary[], tk: ReturnType<typeof useTk>) {
  if (providers.length === 0) return tk("treasury.summary.noProviderEvidence");
  const healthy = providers.filter((provider) => provider.healthStatus === "HEALTHY").length;
  return tk("treasury.summary.providerHealthCount", { healthy, total: providers.length });
}
