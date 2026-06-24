import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Cpu,
} from "lucide-react";
import { AgentPortrait } from "@/components/AgentPortrait";
import { useTk } from "@/lib/i18n";
import { getModelDisplayName } from "@/lib/providerDisplay";
import { cn, formatDate } from "@/lib/utils";
import type { LivingAgentProfileDto } from "@/types/api";
import {
  ACTIVE_ACTIVITY_STATUSES,
  getPortraitStatus,
  getProfileName,
  getProfileTitle,
  getStatusTone,
} from "./profileModels";

export function LivingAgentProfileHeader({
  profile,
}: {
  profile: LivingAgentProfileDto;
}) {
  const tk = useTk();
  const { agent } = profile;
  const title = getProfileTitle(agent);
  const name = getProfileName(agent);
  return (
    <header className="grid min-w-0 gap-5 border border-border bg-card/40 p-4 sm:grid-cols-[112px_minmax(0,1fr)] sm:p-5">
      <AgentPortrait
        agent={agent}
        size="lg"
        shape="portrait-card"
        status={getPortraitStatus(agent.currentStatus)}
        showStatusRing
        clickToView
      />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-primary">
            {agent.role.replaceAll("_", " ")}
          </span>
          {!agent.isActive ? (
            <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
              {tk("agentProfile.inactive")}
            </span>
          ) : null}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="break-words text-2xl font-semibold leading-tight text-foreground">
            {title}
          </h1>
          <span
            className={cn(
              "inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2 text-xs font-semibold",
              getStatusTone(agent.currentStatus),
            )}
          >
            <span
              className={cn(
                "h-2 w-2 rounded-full bg-current",
                ACTIVE_ACTIVITY_STATUSES.has(agent.currentStatus) &&
                  "motion-safe:animate-pulse",
              )}
            />
            {tk(`agentProfile.status.${agent.currentStatus}`)}
          </span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {name} · {agent.specialty}
        </p>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
          {agent.defaultModel ? (
            <span className="inline-flex items-center gap-1">
              <Cpu className="h-3.5 w-3.5" />
              {getModelDisplayName(agent.defaultModel)}
            </span>
          ) : null}
          {agent.lastActivityAt ? (
            <span className="inline-flex items-center gap-1">
              <Clock3 className="h-3.5 w-3.5" />
              {tk("agentProfile.lastActive", {
                date: formatDate(agent.lastActivityAt),
              })}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1">
            <Activity className="h-3.5 w-3.5" />
            {tk("agentProfile.calls", { count: agent.totalCalls })}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {agent.trustedTraceCount > 0 ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {tk("agentProfile.verified", { count: agent.trustedTraceCount })}
            </span>
          ) : null}
          {agent.legacyUnattributedCount > 0 ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5" />
              {tk("agentProfile.legacy", {
                count: agent.legacyUnattributedCount,
              })}
            </span>
          ) : null}
        </div>
      </div>
    </header>
  );
}
