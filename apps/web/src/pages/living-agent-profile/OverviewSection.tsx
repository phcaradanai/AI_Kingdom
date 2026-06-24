import {
  Activity,
  ArrowUpRight,
  Bot,
  Cpu,
  FolderKanban,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useTk } from "@/lib/i18n";
import {
  getModelDisplayName,
  getProviderDisplayName,
} from "@/lib/providerDisplay";
import { formatDate } from "@/lib/utils";
import type { LivingAgentProfileDto } from "@/types/api";
import { formatTokens } from "./profileModels";

export function OverviewSection({
  profile,
}: {
  profile: LivingAgentProfileDto;
}) {
  const tk = useTk();
  const { agent, currentActivity, traceSummary, usageSummary } = profile;
  return (
    <section
      aria-label={tk("agentProfile.overview.aria")}
      className="min-w-0 border border-border bg-card/30"
    >
      {currentActivity ? (
        <div className="border-b border-border p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">
              {tk("agentProfile.currentActivity")}
            </h2>
            {currentActivity.isStale ? (
              <span className="text-xs font-semibold text-amber-400">
                {tk("agentProfile.stale")}
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-sm font-semibold text-foreground">
            {currentActivity.title}
          </p>
          {currentActivity.detail ? (
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {currentActivity.detail}
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span>{currentActivity.status}</span>
            {currentActivity.providerName ? (
              <span>
                {getProviderDisplayName(currentActivity.providerName)}
                {currentActivity.model
                  ? ` · ${getModelDisplayName(currentActivity.model)}`
                  : ""}
              </span>
            ) : null}
            {currentActivity.startedAt ? (
              <span>{formatDate(currentActivity.startedAt)}</span>
            ) : null}
          </div>
        </div>
      ) : null}
      <div
        className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4"
        data-testid="agent-profile-metrics"
      >
        <Metric
          label={tk("agentProfile.metric.calls")}
          value={String(usageSummary.totalCalls)}
        />
        <Metric
          label={tk("agentProfile.metric.tokens")}
          value={formatTokens(usageSummary.totalTokens)}
        />
        <Metric
          label={tk("agentProfile.metric.cost")}
          value={`$${usageSummary.totalEstimatedCostUSD.toFixed(4)}`}
        />
        <Metric
          label={tk("agentProfile.metric.verified")}
          value={String(traceSummary.trustedCount)}
        />
      </div>
      <div className="grid min-w-0 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.7fr)]">
        <div className="min-w-0 border-b border-border p-4 lg:border-b-0 lg:border-r">
          <h2 className="text-sm font-semibold text-foreground">
            {tk("agentProfile.description")}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {agent.description || tk("agentProfile.descriptionNone")}
          </p>
        </div>
        <div className="min-w-0 p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <ShieldCheck className="h-4 w-4 text-primary" />
            {tk("agentProfile.sources")}
          </h2>
          <div className="mt-2 divide-y divide-border">
            <SourceLink
              icon={Bot}
              label={tk("agentProfile.source.agent")}
              aria={tk("agentProfile.source.openAgent")}
              to="/agents"
            />
            <SourceLink
              icon={FolderKanban}
              label={tk("agentProfile.source.work")}
              aria={tk("agentProfile.source.openWork")}
              to="/work-orders"
            />
            <SourceLink
              icon={Cpu}
              label={tk("agentProfile.source.providers")}
              aria={tk("agentProfile.source.openProviders")}
              to="/providers"
            />
            <SourceLink
              icon={Zap}
              label={tk("agentProfile.source.traces")}
              aria={tk("agentProfile.source.openTraces")}
              to="/treasury"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 bg-card/70 p-3 sm:p-4">
      <strong className="block truncate text-lg font-semibold text-foreground">
        {value}
      </strong>
      <span className="block truncate text-[11px] text-muted-foreground">
        {label}
      </span>
    </div>
  );
}
function SourceLink({
  icon: Icon,
  label,
  aria,
  to,
}: {
  icon: typeof Activity;
  label: string;
  aria: string;
  to: string;
}) {
  return (
    <Link
      aria-label={aria}
      className="flex min-h-11 min-w-0 items-center gap-2 text-sm transition-colors hover:text-primary"
      to={to}
    >
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <ArrowUpRight className="h-4 w-4 shrink-0" />
    </Link>
  );
}
