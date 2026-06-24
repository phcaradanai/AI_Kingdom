import { AlertTriangle, ArrowUpRight, BarChart3, Cpu, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import { useTk } from "@/lib/i18n";
import {
  getModelDisplayName,
  getProviderDisplayName,
} from "@/lib/providerDisplay";
import type { LivingAgentProfileDto } from "@/types/api";
import { formatTokens } from "./profileModels";

export function UsageTracesSection({
  profile,
}: {
  profile: LivingAgentProfileDto;
}) {
  const tk = useTk();
  const { agent, traceSummary, usageSummary } = profile;
  const traces = profile.recentTimeline.filter((item) => item.links.trace);
  const metrics = [
    {
      label: tk("agentProfile.usage.calls"),
      value: String(usageSummary.totalCalls),
    },
    {
      label: tk("agentProfile.usage.tokens"),
      value: formatTokens(usageSummary.totalTokens),
    },
    {
      label: tk("agentProfile.usage.cost"),
      value: `$${usageSummary.totalEstimatedCostUSD.toFixed(4)}`,
    },
    {
      label: tk("agentProfile.usage.traces"),
      value: String(traceSummary.totalCount),
    },
    {
      label: tk("agentProfile.usage.verified"),
      value: String(traceSummary.trustedCount),
    },
    {
      label: tk("agentProfile.usage.legacy"),
      value: String(traceSummary.legacyUnattributedCount),
    },
  ];
  return (
    <section
      aria-label={tk("agentProfile.usage.aria")}
      className="min-w-0 border border-border bg-card/30"
    >
      <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3">
        {metrics.map((item) => (
          <div className="min-w-0 bg-card/70 p-3 sm:p-4" key={item.label}>
            <strong className="block text-lg font-semibold text-foreground">
              {item.value}
            </strong>
            <span className="block truncate text-[11px] text-muted-foreground">
              {item.label}
            </span>
          </div>
        ))}
      </div>
      {traceSummary.legacyUnattributedCount > 0 ? (
        <div className="border-y border-amber-400/25 bg-amber-400/5 p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-amber-400">
            <AlertTriangle className="h-4 w-4" />
            {tk("agentProfile.usage.legacyTitle")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {tk("agentProfile.usage.legacyDescription", {
              count: traceSummary.legacyUnattributedCount,
            })}
          </p>
        </div>
      ) : null}
      <div className="grid min-w-0 lg:grid-cols-2">
        <div className="min-w-0 border-b border-border p-4 lg:border-b-0 lg:border-r">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Cpu className="h-4 w-4 text-primary" />
            {tk("agentProfile.usage.providers")}
          </h2>
          <div className="mt-2 divide-y divide-border">
            {usageSummary.byProvider.map((row, index) => (
              <div
                className="flex min-w-0 flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between"
                key={`${row.provider}-${row.model}-${index}`}
              >
                <span className="min-w-0 truncate text-sm font-semibold text-foreground">
                  {getProviderDisplayName(row.provider)} ·{" "}
                  {getModelDisplayName(row.model)}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {tk("agentProfile.usage.providerSummary", {
                    calls: row.callCount,
                    tokens: formatTokens(row.totalTokens),
                    cost: row.totalCostUSD.toFixed(4),
                  })}
                </span>
              </div>
            ))}
            {agent.topOperations.length ? (
              <div className="pt-3">
                <h3 className="text-xs font-semibold text-muted-foreground">
                  {tk("agentProfile.usage.operations")}
                </h3>
                {agent.topOperations.map((op) => (
                  <div
                    className="mt-2 flex justify-between text-xs"
                    key={op.operation}
                  >
                    <span className="font-mono text-foreground">
                      {op.operation}
                    </span>
                    <span className="text-muted-foreground">{op.count}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <div className="min-w-0 p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Zap className="h-4 w-4 text-primary" />
            {tk("agentProfile.usage.recentTraces")}
          </h2>
          <div className="mt-2 divide-y divide-border">
            {traces.length ? (
              traces.slice(0, 6).map((item) => (
                <Link
                  aria-label={tk("agentProfile.usage.openTrace", {
                    title: item.title,
                  })}
                  className="flex min-h-14 min-w-0 items-center gap-3 py-2 transition-colors hover:text-primary"
                  key={item.id}
                  to={item.links.trace!}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-foreground">
                      {item.title}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {item.status}
                    </span>
                  </span>
                  <ArrowUpRight className="h-4 w-4 shrink-0" />
                </Link>
              ))
            ) : (
              <p className="py-4 text-sm text-muted-foreground">
                {tk("agentProfile.usage.noTraces")}
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
