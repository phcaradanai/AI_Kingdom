import {
  Activity,
  AlertTriangle,
  RefreshCw,
  Users,
  Zap
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AgentPortrait } from "@/components/AgentPortrait";
import { PageHeader } from "@/components/PageHeader";
import { ProvenanceLinks } from "@/components/ProvenanceLinks";
import { GoalPlannerPanel } from "@/components/kingdom/GoalPlannerPanel";
import { KingdomActivityFeed } from "@/components/kingdom/KingdomActivityFeed";
import { KingdomHealthStrip } from "@/components/kingdom/KingdomHealthStrip";
import { STATE_COLORS, STATE_DOT } from "@/components/kingdom/agentPresence";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { SectionCard } from "@/components/ui/SectionCard";
import { api } from "@/lib/api";
import { getAgentDisplayName, getAgentDisplayTitle } from "@/lib/agentPortraits";
import { useTk } from "@/lib/i18n";
import { cn, timeAgo } from "@/lib/utils";
import type {
  AgentPresenceDto,
  KingdomActivityStreamDto,
  KingdomHealthDto,
  KingdomPresenceDto
} from "@/types/api";

// ── Agent Presence Card ───────────────────────────────────────────────────────

function AgentCard({ agent }: { agent: AgentPresenceDto }) {
  const tk = useTk();
  const displayName = getAgentDisplayName(agent);
  const displayTitle = getAgentDisplayTitle(agent) || agent.role;
  const stateColor = STATE_COLORS[agent.state];
  const dot = STATE_DOT[agent.state];
  const stateLabel = tk(`presence.state.${agent.state}`);
  const isActive = agent.state !== "IDLE";

  return (
    <div
      className={cn(
        "px-2 py-3 transition-colors",
        isActive ? "bg-muted/15" : "bg-transparent"
      )}
    >
      <div className="flex items-start gap-3">
        <AgentPortrait agent={agent} size="xs" showStatusRing={false} />

        {/* Info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-foreground">{displayName}</span>
            <span
              title={tk("presence.stateTooltip", { state: agent.state })}
              className={cn(
                "ml-auto flex max-w-[55%] shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-center text-[10px] font-bold leading-3",
                stateColor
              )}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />
              {stateLabel}
            </span>
          </div>

          <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{displayTitle}</div>

          {agent.currentTask && (
            <div className="mt-1.5 truncate text-xs text-foreground/80">{agent.currentTask}</div>
          )}

          {agent.currentWorkOrder && (
            <Link
              to="/work-orders"
              className="mt-1 block truncate text-[11px] text-primary/80 hover:text-primary underline-offset-2 hover:underline"
            >
              {agent.currentWorkOrder.title}
            </Link>
          )}

          {agent.blockingReason && (
            <div className="mt-1 text-[11px] text-destructive truncate">{agent.blockingReason}</div>
          )}

          <p className="mt-2 text-[10px] leading-4 text-muted-foreground">
            <span className="font-semibold text-foreground/75">{tk("activity.whyLabel")}</span> {tk(`presence.reason.${agent.state}`)}
          </p>

          <div className="mt-1.5 flex items-center gap-2">
            {agent.progress && (
              <span className="text-[10px] text-muted-foreground">{agent.progress}</span>
            )}
            {agent.lastActivityAt && (
              <span className="ml-auto text-[10px] text-muted-foreground">{timeAgo(agent.lastActivityAt)}</span>
            )}
          </div>

          <ProvenanceLinks
            className="mt-2"
            source={agent.currentWorkOrder
              ? { label: `WorkOrder: ${agent.currentWorkOrder.title}`, to: `/work-orders?focus=${encodeURIComponent(agent.currentWorkOrder.id)}` }
              : { label: `Agent: ${displayName}`, to: `/living-agents/${agent.id}` }}
            related={agent.currentWorkOrder ? [{ label: `Agent: ${displayName}`, to: `/living-agents/${agent.id}` }] : undefined}
            updatedAt={agent.lastActivityAt}
          />
        </div>
      </div>
    </div>
  );
}

// ── Current Operations ────────────────────────────────────────────────────────

function CurrentOps({
  presence,
  activity
}: {
  presence: KingdomPresenceDto | null;
  activity: KingdomActivityStreamDto | null;
}) {
  const tk = useTk();
  const runningAgents = presence?.agents.filter(a => a.state === "RUNNING") ?? [];
  const workingAgents = presence?.agents.filter(a => a.state === "COUNCIL" || a.state === "THINKING" || a.state === "WORKING") ?? [];
  const waitingAgents = presence?.agents.filter(a => a.state === "WAITING_REVIEW") ?? [];
  const blockedAgents = presence?.agents.filter(a => a.state === "BLOCKED" || a.state === "ERROR") ?? [];

  const recentJobs = activity?.activities.filter(a => a.type === "AUTOMATION_JOB").slice(0, 5) ?? [];

  return (
    <div className="space-y-5">
      {/* Active work summary */}
      <div className="grid grid-cols-2 gap-2">
        <OpsStatBox label={tk("kingdomOps.opStat.running")} count={runningAgents.length} color="text-emerald-400" />
        <OpsStatBox label={tk("kingdomOps.opStat.thinking")} count={workingAgents.length} color="text-blue-400" />
        <OpsStatBox label={tk("kingdomOps.opStat.awaitingReview")} count={waitingAgents.length} color="text-amber-400" />
        <OpsStatBox label={tk("kingdomOps.opStat.blocked")} count={blockedAgents.length} color="text-destructive" />
      </div>

      {/* Waiting review — action items */}
      {waitingAgents.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-semibold text-muted-foreground">{tk("kingdomOps.needsReview")}</div>
          <div className="space-y-1.5">
            {waitingAgents.map(agent => (
              <div key={agent.id} className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
                  <span className="truncate text-xs text-foreground">{agent.displayName ?? agent.name}</span>
                  <Link to="/automation-jobs" className="ml-auto shrink-0 text-[10px] text-amber-400 hover:underline">
                    {tk("kingdomOps.reviewJob")}
                  </Link>
                </div>
                <p className="mt-1.5 text-[10px] leading-4 text-muted-foreground">
                  <span className="font-semibold text-foreground/75">{tk("activity.whyLabel")}</span> {tk("presence.reason.WAITING_REVIEW")}
                </p>
                <ProvenanceLinks
                  className="mt-2"
                  source={agent.currentWorkOrder
                    ? { label: `WorkOrder: ${agent.currentWorkOrder.title}`, to: `/work-orders?focus=${encodeURIComponent(agent.currentWorkOrder.id)}` }
                    : { label: `Agent: ${agent.displayName ?? agent.name}`, to: `/living-agents/${agent.id}` }}
                  related={[{ label: "Automation Jobs", to: "/automation-jobs" }]}
                  updatedAt={agent.lastActivityAt}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent job events */}
      {recentJobs.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-semibold text-muted-foreground">{tk("kingdomOps.recentJobs")}</div>
          <KingdomActivityFeed activities={recentJobs} limit={5} />
        </div>
      )}

      {runningAgents.length === 0 && waitingAgents.length === 0 && recentJobs.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-4">{tk("kingdomOps.noActiveOps")}</p>
      )}
    </div>
  );
}

function OpsStatBox({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className="min-h-20 rounded-md border border-border/50 bg-muted/10 p-3">
      <div className={cn("text-xl font-semibold tabular-nums", count > 0 ? color : "text-muted-foreground/50")}>{count}</div>
      <div className="mt-1 text-xs leading-4 text-muted-foreground">{label}</div>
    </div>
  );
}

const POLL_INTERVAL_MS = 30_000;

// ── Main page ─────────────────────────────────────────────────────────────────

export function KingdomOperationsPage() {
  const tk = useTk();
  const [presence, setPresence] = useState<KingdomPresenceDto | null>(null);
  const [activity, setActivity] = useState<KingdomActivityStreamDto | null>(null);
  const [health, setHealth] = useState<KingdomHealthDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
      setRefreshError(null);
    } else {
      setLoading(true);
      setError(null);
    }
    try {
      const [p, a, h] = await Promise.all([
        api.getKingdomPresence(),
        api.getKingdomActivity(50),
        api.getKingdomHealth()
      ]);
      setPresence(p);
      setActivity(a);
      setHealth(h);
      setLastUpdated(new Date());
      setRefreshError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load operations data";
      if (isRefresh) {
        setRefreshError(msg);
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Auto-refresh every 30s while the page is mounted (refresh errors don't stop the interval)
  useEffect(() => {
    if (loading || error) return;
    const id = setInterval(() => void load(true), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [load, loading, error]);

  if (loading) return <LoadingState message={tk("kingdomOps.loading")} />;
  if (error) return <ErrorState title={tk("kingdomOps.errorTitle")} message={error} onRetry={() => void load()} />;

  const agents = presence?.agents ?? [];
  const activeAgentCount = agents.filter(a => a.state !== "IDLE").length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={tk("kingdomOps.eyebrow")}
        title={tk("kingdomOps.title")}
        description={tk("kingdomOps.description")}
        action={
          <Button
            variant="outline"
            onClick={() => void load(true)}
            disabled={refreshing}
            className="gap-2"
          >
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
            {refreshing ? tk("kingdomOps.refreshing") : tk("kingdomOps.refresh")}
          </Button>
        }
      />

      {/* Inline refresh error — keeps existing data visible */}
      {refreshError && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-300">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="flex-1">{tk("kingdomOps.refreshFailed", { error: refreshError })}</span>
          <button
            type="button"
            onClick={() => void load(true)}
            className="shrink-0 text-xs text-amber-300/80 hover:text-amber-300 underline"
          >
            {tk("kingdomOps.retry")}
          </button>
        </div>
      )}

      {/* Kingdom Health strip */}
      {health && <KingdomHealthStrip health={health} />}

      {/* Equal-height operational zones keep the page scannable without one feed dominating it. */}
      <div className="grid items-stretch gap-4 xl:grid-cols-3" data-testid="operations-zones">
        {/* Column 1: Agent Presence */}
        <SectionCard
          title={tk("kingdomOps.section.agentPresence")}
          icon={Users}
          action={
            activeAgentCount > 0 ? (
              <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[11px] font-bold text-primary">
                {tk("kingdomOps.activeCount", { count: activeAgentCount })}
              </span>
            ) : undefined
          }
          className="flex flex-col xl:h-[clamp(32rem,calc(100vh-20rem),42rem)]"
          contentClassName="min-h-0 flex-1 p-2 xl:overflow-y-auto"
        >
          {agents.length === 0 ? (
            <EmptyState title={tk("kingdomOps.noAgents")} />
          ) : (
            <div className="divide-y divide-border/60">
              {agents.map(agent => (
                <AgentCard key={agent.id} agent={agent} />
              ))}
            </div>
          )}
        </SectionCard>

        {/* Column 2: Current Operations */}
        <SectionCard
          title={tk("kingdomOps.section.currentOps")}
          icon={Zap}
          className="flex flex-col xl:h-[clamp(32rem,calc(100vh-20rem),42rem)]"
          contentClassName="min-h-0 flex-1 p-3 xl:overflow-y-auto"
        >
          <CurrentOps presence={presence} activity={activity} />
        </SectionCard>

        {/* Column 3: Activity Stream */}
        <SectionCard
          title={tk("kingdomOps.section.activityStream")}
          icon={Activity}
          action={
            activity ? (
              <span className="text-[11px] text-muted-foreground">{tk("kingdomOps.last48h")}</span>
            ) : undefined
          }
          className="flex flex-col xl:h-[clamp(32rem,calc(100vh-20rem),42rem)]"
          contentClassName="min-h-0 flex-1 p-3 xl:overflow-y-auto"
        >
          <KingdomActivityFeed activities={activity?.activities ?? []} />
        </SectionCard>
      </div>

      {/* Goal Decomposition Engine */}
      <GoalPlannerPanel />

      {lastUpdated && (
        <p className="text-center text-[11px] text-muted-foreground">
          {tk("kingdomOps.updated", { age: timeAgo(lastUpdated.toISOString()) })}
          {refreshing ? tk("kingdomOps.refreshingSuffix") : tk("kingdomOps.autoRefreshSuffix")}
          {tk("kingdomOps.dataSource")}
        </p>
      )}
    </div>
  );
}
