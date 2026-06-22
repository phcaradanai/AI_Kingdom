import { ArrowRight, BarChart3, BriefcaseBusiness, DollarSign, ShieldAlert, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTk } from "@/lib/i18n";
import type { StrategyOverviewDto } from "@/types/api";
import { cn } from "@/lib/utils";
import { money, type StrategySection } from "./strategyModels";

export function StrategyOverview({
  overview,
  onOpenSection,
}: {
  overview: StrategyOverviewDto;
  onOpenSection: (section: StrategySection) => void;
}) {
  const tk = useTk();
  const attention =
    overview.objectives.atRiskMetrics > 0
      ? {
          section: "objectives" as const,
          title: tk("strategy.attention.metrics", {
            count: overview.objectives.atRiskMetrics,
          }),
          detail: tk("strategy.attention.metricsDetail"),
        }
      : overview.opportunities.inbox > 0
        ? {
            section: "opportunities" as const,
            title: tk("strategy.attention.opportunities", {
              count: overview.opportunities.inbox,
            }),
            detail: tk("strategy.attention.opportunitiesDetail"),
          }
        : overview.opportunities.validating > 0
          ? {
              section: "opportunities" as const,
              title: tk("strategy.attention.validating", {
                count: overview.opportunities.validating,
              }),
              detail: tk("strategy.attention.validatingDetail"),
            }
          : {
              section: "objectives" as const,
              title: tk("strategy.attention.stable"),
              detail: tk("strategy.attention.stableDetail"),
            };

  return (
    <section
      aria-label={tk("strategy.overview.region")}
      className="overflow-hidden rounded-lg border border-border bg-card/70"
    >
      <div className="grid grid-cols-2 border-b border-border lg:grid-cols-4">
        <Metric
          icon={DollarSign}
          label={tk("strategy.metric.monthlyNet")}
          value={money(overview.revenue.monthlyNet)}
          detail={tk("strategy.metric.revenueCost", {
            revenue: money(overview.revenue.monthlyRevenue),
            cost: money(overview.revenue.monthlyCost),
          })}
        />
        <Metric
          icon={Target}
          label={tk("strategy.metric.activeObjectives")}
          value={overview.objectives.active}
          detail={tk("strategy.metric.metricsAttention", {
            count: overview.objectives.atRiskMetrics,
          })}
        />
        <Metric
          icon={BriefcaseBusiness}
          label={tk("strategy.metric.opportunities")}
          value={overview.opportunities.inbox + overview.opportunities.reviewing + overview.opportunities.validating}
          detail={tk("strategy.metric.validationApproved", {
            validating: overview.opportunities.validating,
            approved: overview.opportunities.approved,
          })}
        />
        <Metric
          icon={BarChart3}
          label={tk("strategy.metric.monetizingAssets")}
          value={overview.assets.monetizing}
          detail={tk("strategy.metric.activeAssets", {
            count: overview.assets.active,
          })}
        />
      </div>
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.55fr)]">
        <div className="flex min-w-0 items-start gap-3 p-4 sm:p-5">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-amber-400/30 bg-amber-400/10 text-amber-300">
            <ShieldAlert className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase text-muted-foreground">{tk("strategy.nextAction")}</div>
            <h2 className="mt-1 text-base font-semibold leading-6">{attention.title}</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{attention.detail}</p>
          </div>
        </div>
        <div className="flex items-center border-t border-border p-4 lg:border-l lg:border-t-0">
          <Button
            className="min-h-11 w-full justify-between"
            variant="outline"
            onClick={() => onOpenSection(attention.section)}
          >
            {tk(`strategy.open.${attention.section}`)}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </section>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof DollarSign;
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <div
      className={cn(
        "min-w-0 border-border p-4",
        "[&:nth-child(odd)]:border-r lg:[&:not(:last-child)]:border-r",
        "[&:nth-child(-n+2)]:border-b lg:[&:nth-child(-n+2)]:border-b-0",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium leading-5 text-muted-foreground">{label}</span>
        <Icon className="h-4 w-4 shrink-0 text-primary" />
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
      <div className="mt-1 break-words text-xs leading-5 text-muted-foreground">{detail}</div>
    </div>
  );
}
