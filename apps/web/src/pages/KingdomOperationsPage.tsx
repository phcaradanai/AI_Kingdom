import {
  Activity,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Eye,
  RefreshCw,
  Users,
  Zap
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { SectionCard } from "@/components/ui/SectionCard";
import { api } from "@/lib/api";
import { cn, formatDate } from "@/lib/utils";
import type {
  AgentPresenceDto,
  AgentPresenceState,
  KingdomActivityItemDto,
  KingdomActivityStreamDto,
  KingdomActivityType,
  KingdomHealthDto,
  KingdomHealthItemDto,
  KingdomHealthStatus,
  KingdomPresenceDto
} from "@/types/api";

// ── State colors ──────────────────────────────────────────────────────────────

const STATE_COLORS: Record<AgentPresenceState, string> = {
  IDLE: "border-border bg-muted/30 text-muted-foreground",
  THINKING: "border-blue-500/40 bg-blue-500/10 text-blue-400",
  COUNCIL: "border-violet-500/40 bg-violet-500/10 text-violet-400",
  WORKING: "border-indigo-500/40 bg-indigo-500/10 text-indigo-400",
  RUNNING: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
  WAITING_REVIEW: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  BLOCKED: "border-orange-500/40 bg-orange-500/10 text-orange-400",
  ERROR: "border-destructive/50 bg-destructive/10 text-destructive"
};

const STATE_DOT: Record<AgentPresenceState, string> = {
  IDLE: "bg-muted-foreground/50",
  THINKING: "bg-blue-400",
  COUNCIL: "bg-violet-400",
  WORKING: "bg-indigo-400",
  RUNNING: "bg-emerald-400",
  WAITING_REVIEW: "bg-amber-400",
  BLOCKED: "bg-orange-400",
  ERROR: "bg-destructive"
};

const HEALTH_COLORS: Record<KingdomHealthStatus, string> = {
  HEALTHY: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
  WARNING: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  CRITICAL: "border-destructive/50 bg-destructive/10 text-destructive"
};

const ACTIVITY_TYPE_COLORS: Record<KingdomActivityType, string> = {
  COUNCIL: "border-violet-500/40 bg-violet-500/10 text-violet-400",
  WORK_ORDER: "border-blue-500/40 bg-blue-500/10 text-blue-400",
  AUTOMATION_JOB: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
  RUNNER_EVENT: "border-indigo-500/40 bg-indigo-500/10 text-indigo-400",
  REVIEW: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  KNOWLEDGE: "border-primary/40 bg-primary/10 text-primary"
};

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function initials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? "")
    .join("");
}

// ── Agent Presence Card ───────────────────────────────────────────────────────

function AgentCard({ agent }: { agent: AgentPresenceDto }) {
  const displayName = agent.displayName ?? agent.name;
  const stateColor = STATE_COLORS[agent.state];
  const dot = STATE_DOT[agent.state];
  const isActive = agent.state !== "IDLE";

  return (
    <div
      className={cn(
        "rounded-lg border p-3 transition-colors",
        isActive
          ? "border-border/60 bg-card/80"
          : "border-border/30 bg-muted/10"
      )}
    >
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-bold",
          isActive ? "border-primary/30 bg-primary/10 text-primary" : "border-border bg-muted text-muted-foreground"
        )}>
          {initials(displayName)}
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-foreground">{displayName}</span>
            <span
              className={cn(
                "ml-auto flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                stateColor
              )}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />
              {agent.state}
            </span>
          </div>

          <div className="mt-0.5 text-[11px] text-muted-foreground truncate">{agent.role}</div>

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

          <div className="flex items-center gap-2 mt-1.5">
            {agent.progress && (
              <span className="text-[10px] text-muted-foreground">{agent.progress}</span>
            )}
            {agent.lastActivityAt && (
              <span className="text-[10px] text-muted-foreground ml-auto">{timeAgo(agent.lastActivityAt)}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Health Strip ──────────────────────────────────────────────────────────────

function HealthIcon({ status }: { status: KingdomHealthStatus }) {
  if (status === "CRITICAL") return <AlertCircle className="h-3.5 w-3.5" />;
  if (status === "WARNING") return <AlertTriangle className="h-3.5 w-3.5" />;
  return <CheckCircle2 className="h-3.5 w-3.5" />;
}

function HealthStrip({ health }: { health: KingdomHealthDto }) {
  return (
    <div className="rounded-xl border border-border bg-card/60 p-4 backdrop-blur-sm">
      <div className="flex items-center gap-2 mb-3">
        <Eye className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">Kingdom Health</span>
        <span
          className={cn(
            "ml-auto rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
            HEALTH_COLORS[health.overallStatus]
          )}
        >
          {health.overallStatus}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {health.items.map(item => (
          <HealthPill key={item.key} item={item} />
        ))}
      </div>
    </div>
  );
}

function HealthPill({ item }: { item: KingdomHealthItemDto }) {
  const color = HEALTH_COLORS[item.status];
  const content = (
    <span
      title={item.reason + (item.recommendedAction ? `\n→ ${item.recommendedAction}` : "")}
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
      <Link to={item.sourceReference} title={item.reason}>
        {content}
      </Link>
    );
  }
  return content;
}

// ── Current Operations ────────────────────────────────────────────────────────

function CurrentOps({
  presence,
  activity
}: {
  presence: KingdomPresenceDto | null;
  activity: KingdomActivityStreamDto | null;
}) {
  const runningAgents = presence?.agents.filter(a => a.state === "RUNNING") ?? [];
  const workingAgents = presence?.agents.filter(a => a.state === "COUNCIL" || a.state === "THINKING" || a.state === "WORKING") ?? [];
  const waitingAgents = presence?.agents.filter(a => a.state === "WAITING_REVIEW") ?? [];
  const blockedAgents = presence?.agents.filter(a => a.state === "BLOCKED" || a.state === "ERROR") ?? [];

  const recentJobs = activity?.activities.filter(a => a.type === "AUTOMATION_JOB").slice(0, 5) ?? [];

  return (
    <div className="space-y-4">
      {/* Active work summary */}
      <div className="grid grid-cols-2 gap-2">
        <OpsStatBox label="Running" count={runningAgents.length} color="text-emerald-400" />
        <OpsStatBox label="Thinking" count={workingAgents.length} color="text-blue-400" />
        <OpsStatBox label="Awaiting Review" count={waitingAgents.length} color="text-amber-400" />
        <OpsStatBox label="Blocked" count={blockedAgents.length} color="text-destructive" />
      </div>

      {/* Waiting review — action items */}
      {waitingAgents.length > 0 && (
        <div>
          <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Needs Review</div>
          <div className="space-y-1.5">
            {waitingAgents.map(agent => (
              <div key={agent.id} className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
                <span className="truncate text-xs text-foreground">{agent.displayName ?? agent.name}</span>
                {agent.currentWorkOrder && (
                  <Link
                    to="/automation-jobs"
                    className="ml-auto shrink-0 text-[10px] text-amber-400 hover:underline"
                  >
                    Review
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent job events */}
      {recentJobs.length > 0 && (
        <div>
          <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Recent Jobs</div>
          <div className="space-y-1.5">
            {recentJobs.map(job => (
              <div key={job.id} className="flex items-start gap-2 rounded-lg border border-border/40 bg-muted/10 px-3 py-2">
                <Cpu className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate text-xs text-foreground/80">{job.summary}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground">{timeAgo(job.timestamp)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {runningAgents.length === 0 && waitingAgents.length === 0 && recentJobs.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-4">No active operations.</p>
      )}
    </div>
  );
}

function OpsStatBox({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className="rounded-lg border border-border/40 bg-muted/10 p-2.5">
      <div className={cn("text-xl font-bold", count > 0 ? color : "text-muted-foreground/50")}>{count}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

// ── Activity Stream ───────────────────────────────────────────────────────────

function ActivityFeed({ activities }: { activities: KingdomActivityItemDto[] }) {
  if (activities.length === 0) {
    return <p className="text-center text-sm text-muted-foreground py-4">No recent activity.</p>;
  }
  return (
    <div className="space-y-2">
      {activities.slice(0, 30).map(item => (
        <ActivityRow key={item.id} item={item} />
      ))}
    </div>
  );
}

function ActivityRow({ item }: { item: KingdomActivityItemDto }) {
  const typeColor = ACTIVITY_TYPE_COLORS[item.type] ?? "border-border bg-muted/20 text-muted-foreground";
  const content = (
    <div className="flex items-start gap-2.5 rounded-lg border border-border/30 bg-card/40 px-3 py-2.5 hover:bg-card/70 transition-colors">
      <div className={cn("mt-0.5 shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider", typeColor)}>
        {item.type.replace("_", " ")}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs text-foreground/90 leading-snug truncate">{item.summary}</div>
        <div className="mt-0.5 flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">{item.actor}</span>
          <span className="text-[10px] text-muted-foreground/50">·</span>
          <span className="text-[10px] text-muted-foreground">{timeAgo(item.timestamp)}</span>
        </div>
      </div>
    </div>
  );

  return (
    <Link to={item.sourceReference.routeTo} className="block">
      {content}
    </Link>
  );
}

const POLL_INTERVAL_MS = 30_000;

// ── Main page ─────────────────────────────────────────────────────────────────

export function KingdomOperationsPage() {
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

  if (loading) return <LoadingState message="Loading operations..." />;
  if (error) return <ErrorState title="Unable to load Kingdom Operations." message={error} onRetry={() => void load()} />;

  const agents = presence?.agents ?? [];
  const activeAgentCount = agents.filter(a => a.state !== "IDLE").length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations"
        title="Kingdom Operations"
        description="Real-time visibility into agents, work, and system health"
        action={
          <Button
            variant="outline"
            onClick={() => void load(true)}
            disabled={refreshing}
            className="gap-2"
          >
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
            {refreshing ? "Refreshing…" : "Refresh"}
          </Button>
        }
      />

      {/* Inline refresh error — keeps existing data visible */}
      {refreshError && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-300">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="flex-1">Refresh failed: {refreshError}. Showing last-known data.</span>
          <button
            type="button"
            onClick={() => void load(true)}
            className="shrink-0 text-xs text-amber-300/80 hover:text-amber-300 underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Kingdom Health strip */}
      {health && <HealthStrip health={health} />}

      {/* 3-column grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Column 1: Agent Presence */}
        <SectionCard
          title="Agent Presence"
          icon={Users}
          action={
            activeAgentCount > 0 ? (
              <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[11px] font-bold text-primary">
                {activeAgentCount} active
              </span>
            ) : undefined
          }
          contentClassName="p-3"
        >
          {agents.length === 0 ? (
            <EmptyState title="No agents configured." />
          ) : (
            <div className="space-y-2">
              {agents.map(agent => (
                <AgentCard key={agent.id} agent={agent} />
              ))}
            </div>
          )}
        </SectionCard>

        {/* Column 2: Current Operations */}
        <SectionCard title="Current Operations" icon={Zap} contentClassName="p-3">
          <CurrentOps presence={presence} activity={activity} />
        </SectionCard>

        {/* Column 3: Activity Stream */}
        <SectionCard
          title="Activity Stream"
          icon={Activity}
          action={
            activity ? (
              <span className="text-[11px] text-muted-foreground">last 48h</span>
            ) : undefined
          }
          contentClassName="p-3 max-h-[600px] overflow-y-auto"
        >
          <ActivityFeed activities={activity?.activities ?? []} />
        </SectionCard>
      </div>

      {lastUpdated && (
        <p className="text-center text-[11px] text-muted-foreground">
          Updated {timeAgo(lastUpdated.toISOString())}
          {refreshing ? " · Refreshing…" : " · Auto-refreshes every 30s"}
          {" · "}Data from AgentActivity, AutomationJobs, CouncilSessions
        </p>
      )}
    </div>
  );
}
