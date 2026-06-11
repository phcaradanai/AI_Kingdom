import { Activity, AlertTriangle, Archive, CheckCircle2, ClipboardList, Crown, FileText, FolderKanban, Inbox, Landmark, Scroll, ScrollText, Shield, Sparkles, Vault, ArrowRight, Clock } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AgentPortrait } from "@/components/AgentPortrait";
import { PageHeader } from "@/components/PageHeader";
import { TaskCard } from "@/components/TaskCard";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { PriorityBadge } from "@/components/ui/PriorityBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { api } from "@/lib/api";
import { getProviderModelDisplay } from "@/lib/providerDisplay";
import { cn, formatDate } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import { useKingdomStore } from "@/stores/kingdomStore";
import type { AgentActivityStatus, AgentDto, CurrentAgentActivityDto, HandoffBriefDto, ProjectDto, ProjectInboxItemDto, SecretaryBriefDto, WorkOrderDto } from "@/types/api";

const SEVERITY_COLORS = {
  critical: "text-destructive bg-destructive/10 border-destructive/30",
  warning: "text-amber-500 bg-amber-500/10 border-amber-500/30",
  info: "text-blue-400 bg-blue-500/10 border-blue-500/30"
};

const SEVERITY_ICONS = {
  critical: AlertTriangle,
  warning: AlertTriangle,
  info: CheckCircle2
};

const AGENT_ACTIVITY_STATUSES: AgentActivityStatus[] = [
  "IDLE",
  "QUEUED",
  "THINKING",
  "WAITING_PROVIDER",
  "RESPONDING",
  "SUMMARIZING",
  "EXTRACTING_MEMORY",
  "GENERATING_REPORT",
  "COMPLETED",
  "FAILED"
];

const AGENT_STATUS_META: Record<AgentActivityStatus, { label: string; Icon: typeof Clock; cardClass: string; badgeClass: string }> = {
  IDLE: {
    label: "Idle",
    Icon: Clock,
    cardClass: "agent-op-idle",
    badgeClass: "border-primary/20 bg-primary/10 text-primary/85"
  },
  QUEUED: {
    label: "Queued",
    Icon: Clock,
    cardClass: "agent-op-thinking",
    badgeClass: "border-primary/30 bg-primary/10 text-primary"
  },
  THINKING: {
    label: "Thinking",
    Icon: Sparkles,
    cardClass: "agent-op-thinking",
    badgeClass: "border-primary/40 bg-primary/10 text-primary"
  },
  WAITING_PROVIDER: {
    label: "Waiting Provider",
    Icon: Clock,
    cardClass: "agent-op-waiting-provider",
    badgeClass: "border-amber-400/40 bg-amber-400/10 text-amber-300"
  },
  RESPONDING: {
    label: "Responding",
    Icon: ScrollText,
    cardClass: "agent-op-responding",
    badgeClass: "border-primary/40 bg-primary/10 text-primary"
  },
  SUMMARIZING: {
    label: "Summarizing",
    Icon: Crown,
    cardClass: "agent-op-summarizing",
    badgeClass: "border-primary/40 bg-primary/10 text-primary"
  },
  EXTRACTING_MEMORY: {
    label: "Extracting Memory",
    Icon: Vault,
    cardClass: "agent-op-extracting-memory",
    badgeClass: "border-blue-300/35 bg-blue-300/10 text-blue-200"
  },
  GENERATING_REPORT: {
    label: "Generating Report",
    Icon: FileText,
    cardClass: "agent-op-generating-report",
    badgeClass: "border-primary/40 bg-primary/10 text-primary"
  },
  COMPLETED: {
    label: "Completed",
    Icon: CheckCircle2,
    cardClass: "agent-op-completed",
    badgeClass: "border-emerald-400/35 bg-emerald-400/10 text-emerald-300"
  },
  FAILED: {
    label: "Failed",
    Icon: AlertTriangle,
    cardClass: "agent-op-failed",
    badgeClass: "border-destructive/45 bg-destructive/10 text-destructive"
  }
};

function normalizeAgentStatus(status: string): AgentActivityStatus {
  return AGENT_ACTIVITY_STATUSES.includes(status as AgentActivityStatus) ? (status as AgentActivityStatus) : "IDLE";
}

function buildIdleAgentActivity(agent: AgentDto): CurrentAgentActivityDto {
  return {
    id: `idle:${agent.id}`,
    agent: {
      id: agent.id,
      slug: agent.slug,
      name: agent.name,
      title: agent.title,
      role: agent.role,
      specialty: agent.specialty,
      isActive: agent.isActive,
      displayName: agent.displayName ?? null,
      displayTitle: agent.displayTitle ?? null,
      avatarUrl: agent.avatarUrl ?? null,
      avatarVersion: agent.avatarVersion ?? 1
    },
    status: "IDLE",
    activityType: "IDLE",
    title: "Idle",
    detail: null,
    providerId: null,
    providerName: null,
    model: null,
    operation: null,
    traceId: null,
    attributionStatus: "LEGACY_UNATTRIBUTED",
    sourceType: null,
    sourceId: null,
    requestLabel: null,
    usageRecordId: null,
    reportId: null,
    projectId: null,
    taskId: null,
    councilSessionId: null,
    tokensUsed: 0,
    estimatedCostUSD: 0,
    startedAt: null,
    endedAt: null,
    heartbeatAt: null,
    errorMessage: null,
    isStale: false,
    displayTime: null,
    displayTimeType: "none",
    attributionWarning: null,
    links: {
      trace: null,
      project: null,
      task: null,
      council: null,
      report: null
    }
  };
}

function formatCost(value: number) {
  if (value <= 0) return "$0.00";
  if (value < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
}

function formatLastActive(activity: CurrentAgentActivityDto) {
  const timestamp = activity.endedAt ?? activity.heartbeatAt ?? activity.startedAt;
  return timestamp ? formatDate(timestamp) : "No recent activity";
}

function shortId(value: string) {
  return value.length > 10 ? value.slice(0, 8) : value;
}

function attributionLabel(status: CurrentAgentActivityDto["attributionStatus"]) {
  if (status === "TRUSTED") return "Verified source";
  if (status === "PARTIAL") return "Partial source";
  if (status === "UNKNOWN_SOURCE") return "Unknown source";
  return "Legacy / source unknown";
}

function humanLabel(value?: string | null) {
  if (!value) return null;
  return value.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function AgentOperationCard({ activity }: { activity: CurrentAgentActivityDto }) {
  const status = normalizeAgentStatus(activity.status);
  const meta = AGENT_STATUS_META[status];
  const StatusIcon = meta.Icon;
  const providerModel = activity.providerName || activity.model
    ? getProviderModelDisplay(activity.providerName, activity.model)
    : "";
  const detail = status === "FAILED" && activity.errorMessage ? activity.errorMessage : activity.detail;
  const isTrusted = activity.attributionStatus === "TRUSTED";
  const links = [
    activity.projectId ? { label: "View Project", id: activity.projectId, to: `/projects/${activity.projectId}` } : null,
    isTrusted && activity.taskId ? { label: "View Task", id: activity.taskId, to: "/throne-room" } : null,
    isTrusted && activity.councilSessionId ? { label: "View Council", id: activity.councilSessionId, to: "/council" } : null,
    activity.traceId ? { label: "View Trace", id: activity.traceId, to: `/usage-traces/${activity.traceId}` } : null
  ].filter(Boolean) as { label: string; id: string; to: string }[];

  return (
    <div className={cn("agent-operation-card relative overflow-hidden rounded-2xl border bg-card/70 p-4 backdrop-blur-xl", meta.cardClass)}>
      <div className="absolute inset-0 bg-[url('/noise.png')] opacity-[0.05] mix-blend-overlay pointer-events-none" aria-hidden="true" />
      <div className="relative flex items-start gap-4">
        <AgentPortrait agent={activity.agent} size="lg" status={status} />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate font-display text-lg font-bold tracking-wide text-foreground">{activity.agent.name}</div>
              <div className="truncate text-sm text-primary/75">{activity.agent.title}</div>
            </div>
            <div className={cn("inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest", meta.badgeClass)}>
              <span className="agent-op-dot h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
              <StatusIcon className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{meta.label}</span>
            </div>
          </div>
          <div className={cn(
            "inline-flex w-fit items-center rounded-md border px-2 py-1 text-[11px] font-semibold uppercase tracking-wider",
            isTrusted ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300" : "border-amber-400/30 bg-amber-400/10 text-amber-300"
          )}>
            {isTrusted ? attributionLabel(activity.attributionStatus) : `Source not verified: ${attributionLabel(activity.attributionStatus)}`}
          </div>

          <div>
            <div className="line-clamp-1 text-sm font-semibold text-foreground">{activity.title || meta.label}</div>
            {detail ? (
              <div className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{detail}</div>
            ) : (
              <div className="mt-1 text-xs text-muted-foreground">Awaiting the next royal operation.</div>
            )}
          </div>

          <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
            <div>
              <span className="font-semibold uppercase tracking-widest text-primary/65">Model</span>
              <div className="mt-0.5 truncate text-foreground/85">{providerModel || "No provider active"}</div>
            </div>
            <div>
              <span className="font-semibold uppercase tracking-widest text-primary/65">Usage</span>
              <div className="mt-0.5 text-foreground/85">{activity.tokensUsed.toLocaleString()} tokens / {formatCost(activity.estimatedCostUSD)}</div>
            </div>
          </div>

          {links.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {links.map((link) => (
                <Link
                  key={`${link.label}:${link.id}`}
                  to={link.to}
                  className="rounded-md border border-primary/20 bg-primary/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-primary/80 transition-colors hover:border-primary/40 hover:bg-primary/15"
                  title={`${link.label} ${link.id}`}
                >
                  {link.label}: <span className="font-mono normal-case tracking-normal">{shortId(link.id)}</span>
                </Link>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-primary/10 pt-3 text-[11px] uppercase tracking-widest text-muted-foreground">
            <span>{activity.displayTimeType === "ended" ? "Completed" : "Last active"}: {formatLastActive(activity)}</span>
            <div className="flex flex-wrap items-center gap-2">
              {activity.operation && <span className="rounded-md border border-border/80 px-2 py-1">{humanLabel(activity.operation)}</span>}
              {activity.isStale && <span className="rounded-md border border-amber-400/30 bg-amber-400/10 px-2 py-1 text-amber-300">Stale heartbeat</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function RunLivingLoopButton() {
  const [running, setRunning] = useState(false);
  async function runOnce() {
    setRunning(true);
    try { await api.runLivingLoopOnce(); } catch (e) { console.error(e); }
    setRunning(false);
  }
  return (
    <Button variant="outline" className="h-8 text-xs" onClick={runOnce} disabled={running}>
      {running ? "Running..." : "Run Once"}
    </Button>
  );
}

export function LivingLoopDashboardCard() {
  const [status, setStatus] = useState<{ pending: number; highCritical: number; runnerIssues: number; providerIssues: number; lastRun: string | null; autoValidationToday: number; validationFailures: number } | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.livingLoopStatus()
      .then(res => setStatus({
        pending: res.status.pendingCandidates,
        highCritical: res.status.highCriticalCandidates,
        runnerIssues: res.status.runnerIssues,
        providerIssues: res.status.providerIssues,
        lastRun: res.status.lastResult,
        autoValidationToday: res.status.autoValidation?.dailyCount ?? 0,
        validationFailures: res.status.autoValidation?.validationFailuresNeedingReview ?? 0
      }))
      .catch(() => { /* ignore */ })
      .finally(() => setLoading(false));
  }, []);
  if (loading) return <div className="text-xs text-muted-foreground">Loading...</div>;
  if (!status) return <div className="text-xs text-muted-foreground">Could not load loop status.</div>;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <StatCard className="bg-transparent border-none p-0" title="Pending" value={status.pending} />
        <StatCard className="bg-transparent border-none p-0" title="High/Critical" value={status.highCritical} trend={status.highCritical > 0 ? { value: "Urgent", isPositive: false } : undefined} />
        <StatCard className="bg-transparent border-none p-0" title="Runner Issues" value={status.runnerIssues} trend={status.runnerIssues > 0 ? { value: "Check", isPositive: false } : undefined} />
        <StatCard className="bg-transparent border-none p-0" title="Provider Issues" value={status.providerIssues} trend={status.providerIssues > 0 ? { value: "Check", isPositive: false } : undefined} />
        <StatCard className="bg-transparent border-none p-0" title="Auto Validation Today" value={status.autoValidationToday} />
        <StatCard className="bg-transparent border-none p-0" title="Validation Failures" value={status.validationFailures} trend={status.validationFailures > 0 ? { value: "Review", isPositive: false } : undefined} />
      </div>
      {status.lastRun && <div className="text-xs text-muted-foreground">Last run: {status.lastRun}</div>}
    </div>
  );
}

export function DashboardPage() {
  const { agents, tasks, reports, memories } = useKingdomStore();
  const user = useAuthStore((state) => state.user);
  const canCommand = user?.role === "KING" || user?.role === "CROWN_PRINCE" || user?.role === "MINISTER";
  
  const [brief, setBrief] = useState<SecretaryBriefDto | null>(null);
  const [workOrders, setWorkOrders] = useState<WorkOrderDto[]>([]);
  const [workOrdersHiddenCount, setWorkOrdersHiddenCount] = useState(0);
  const [handoffBriefs, setHandoffBriefs] = useState<HandoffBriefDto[]>([]);
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [projectInbox, setProjectInbox] = useState<ProjectInboxItemDto[]>([]);
  const [agentActivities, setAgentActivities] = useState<CurrentAgentActivityDto[]>([]);
  const [agentActivitiesError, setAgentActivitiesError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.secretaryBrief().catch(() => null),
      api.workOrders().catch(() => ({ workOrders: [], hiddenCount: 0 })),
      api.handoffBriefs().catch(() => ({ handoffBriefs: [] })),
      api.projects().catch(() => ({ projects: [] })),
      api.projectInbox({ status: "PENDING" }).catch(() => ({ inboxItems: [] })),
      api.getCurrentAgentActivities().catch((error) => {
        setAgentActivitiesError(error instanceof Error ? error.message : "Unable to load agent activity.");
        return { activities: [] };
      })
    ])
      .then(([briefRes, ordersRes, handoffsRes, projectsRes, inboxRes, activitiesRes]) => {
        if (briefRes) setBrief(briefRes);
        setWorkOrders(ordersRes.workOrders);
        setWorkOrdersHiddenCount(ordersRes.hiddenCount ?? 0);
        setHandoffBriefs(handoffsRes.handoffBriefs);
        setProjects(projectsRes.projects);
        setProjectInbox(inboxRes.inboxItems);
        setAgentActivities(activitiesRes.activities);
        if (activitiesRes.activities.length > 0) setAgentActivitiesError(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadAgentActivities() {
      try {
        const response = await api.getCurrentAgentActivities();
        if (cancelled) return;
        setAgentActivities(response.activities);
        setAgentActivitiesError(null);
      } catch (error) {
        if (cancelled) return;
        setAgentActivitiesError(error instanceof Error ? error.message : "Unable to load agent activity.");
      }
    }

    const interval = window.setInterval(() => {
      if (!document.hidden) void loadAgentActivities();
    }, 5000);

    const handleVisibilityChange = () => {
      if (!document.hidden) void loadAgentActivities();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const stats = [
    { label: "Royal Agents", value: agents.length, icon: Shield },
    { label: "Commands", value: tasks.length, icon: Landmark },
    { label: "Reports", value: reports.length, icon: ScrollText },
    { label: "Memories", value: memories.length, icon: Vault }
  ];

  const displayedAgentActivities = agentActivities.length > 0 ? agentActivities : agents.map(buildIdleAgentActivity);

  if (isLoading) {
    return <LoadingState message="Summoning royal briefings..." className="min-h-[60vh]" />;
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 slide-in-from-bottom-4">
      <PageHeader
        eyebrow="Morning Briefing"
        title="The Kingdom at a glance"
        description="Monitor agents, council deliberations, generated reports, and institutional memory from your command center."
      />

      {/* Issue Royal Decree CTA */}
      {canCommand && (
        <div>
          <Link to="/throne-room">
            <div className="group relative flex items-center gap-5 rounded-2xl border border-primary/30 bg-gradient-to-r from-primary/10 to-transparent px-6 py-5 transition-all duration-300 hover:border-primary/60 hover:shadow-[0_0_30px_rgba(214,170,87,0.15)] overflow-hidden">
              <div className="absolute inset-0 bg-[url('/noise.png')] opacity-10 mix-blend-overlay pointer-events-none"></div>
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-primary/40 bg-primary/20 transition-transform duration-500 group-hover:scale-105 group-hover:bg-primary/30 shadow-[0_0_15px_rgba(214,170,87,0.2)]">
                <Scroll className="h-7 w-7 text-primary drop-shadow-[0_0_5px_rgba(214,170,87,0.5)]" />
              </div>
              <div className="flex-1">
                <div className="font-display text-xl font-bold tracking-wide text-primary">Issue Royal Decree</div>
                <div className="mt-1 text-sm text-primary/70">Open the Throne Room and command the royal council</div>
              </div>
              <div className="shrink-0 flex items-center justify-center h-10 w-10 rounded-full bg-primary/10 text-primary opacity-60 transition-all duration-300 group-hover:opacity-100 group-hover:translate-x-1 group-hover:bg-primary/20">
                <ArrowRight className="h-5 w-5" />
              </div>
            </div>
          </Link>
        </div>
      )}

      {/* Quick stats */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <StatCard
            key={stat.label}
            title={stat.label}
            value={stat.value}
            icon={stat.icon}
          />
        ))}
      </div>

      {displayedAgentActivities.length > 0 && (
        <SectionCard
          title="Royal Agent Operations"
          icon={Shield}
          action={
            <div className="flex items-center gap-3">
              {agentActivitiesError && <span className="hidden text-xs font-semibold uppercase tracking-wider text-amber-300 sm:inline">Activity feed degraded</span>}
              <Link to="/agents" className="text-xs font-semibold uppercase tracking-wider text-primary hover:underline">Manage Agents</Link>
            </div>
          }
        >
          {agentActivitiesError && (
            <div className="mb-4 rounded-lg border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
              Live activity is temporarily unavailable. Showing local idle state where possible.
            </div>
          )}
          <div className="grid gap-4 xl:grid-cols-2">
            {displayedAgentActivities.map((activity) => (
              <AgentOperationCard key={activity.id} activity={activity} />
            ))}
          </div>
        </SectionCard>
      )}

      {/* Royal Secretary Brief */}
      {brief && (
        <div className="space-y-6">
          <div className="grid gap-6 xl:grid-cols-2">
            {/* Kingdom Status */}
            <SectionCard title="Kingdom Status" icon={Shield} action={<span className="text-xs uppercase tracking-widest text-muted-foreground font-bold">Royal Secretary</span>}>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <StatCard className="bg-transparent border-none p-0" title="Unread Notices" value={brief.kingdomStatus.unreadNotices} />
                <StatCard className="bg-transparent border-none p-0" title="Critical Notices" value={brief.kingdomStatus.criticalNotices} trend={brief.kingdomStatus.criticalNotices > 0 ? { value: "Action Required", isPositive: false } : undefined} />
                <StatCard className="bg-transparent border-none p-0" title="Open Matters" value={brief.kingdomStatus.openMatters} />
                <StatCard className="bg-transparent border-none p-0" title="Critical Matters" value={brief.kingdomStatus.criticalMatters} trend={brief.kingdomStatus.criticalMatters > 0 ? { value: "Action Required", isPositive: false } : undefined} />
                <StatCard className="bg-transparent border-none p-0" title="Awaiting Decision" value={brief.kingdomStatus.awaitingRoyalDecision} trend={brief.kingdomStatus.awaitingRoyalDecision > 0 ? { value: "Pending", isPositive: false } : undefined} />
                <StatCard className="bg-transparent border-none p-0" title="Failed Decrees" value={brief.kingdomStatus.failedTasks} trend={brief.kingdomStatus.failedTasks > 0 ? { value: "Requires Review", isPositive: false } : undefined} />
              </div>
            </SectionCard>

            {/* Recommended Actions */}
            <SectionCard title="Recommended Actions" icon={Landmark}>
              {brief.recommendedActions.length > 0 ? (
                <div className="space-y-3">
                  {brief.recommendedActions.map((action, i) => {
                    const colors = SEVERITY_COLORS[action.severity];
                    const Icon = SEVERITY_ICONS[action.severity];
                    const inner = (
                      <div className={cn("flex items-center gap-4 rounded-xl border px-4 py-3 text-sm transition-colors hover:bg-opacity-80", colors)}>
                        <div className="p-1.5 rounded-md bg-background/20"><Icon className="h-4 w-4 shrink-0" /></div>
                        <span className="font-medium tracking-wide">{action.action}</span>
                      </div>
                    );
                    return action.href ? (
                      <Link key={i} to={action.href} className="block transition-transform hover:-translate-y-0.5">{inner}</Link>
                    ) : (
                      <div key={i}>{inner}</div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState title="No Urgent Actions" description="The kingdom is currently stable." />
              )}
            </SectionCard>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            {/* Urgent Notices */}
            <SectionCard title="Urgent Notices" icon={AlertTriangle} action={<Link to="/notices" className="text-xs font-semibold uppercase tracking-wider text-primary hover:underline">View All</Link>}>
              {brief.urgentNotices.length > 0 ? (
                <div className="space-y-3">
                  {brief.urgentNotices.map((n) => (
                    <div key={n.id} className={cn("flex flex-col gap-1.5 rounded-lg border px-4 py-3", n.severity === "CRITICAL" ? "border-destructive/30 bg-destructive/10" : "border-amber-500/30 bg-amber-500/10")}>
                      <div className="flex items-center justify-between">
                        <div className="font-semibold">{n.title}</div>
                        <StatusBadge type={n.severity === "CRITICAL" ? "error" : "warning"} status={n.severity} />
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {formatDate(n.createdAt)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="No Urgent Notices" description="All clear on the horizon." />
              )}
            </SectionCard>

            {/* Awaiting Royal Decision */}
            <SectionCard title="Awaiting Royal Decision" icon={Scroll} action={<Link to="/matters" className="text-xs font-semibold uppercase tracking-wider text-primary hover:underline">View All</Link>}>
              {brief.awaitingRoyalDecision.length > 0 ? (
                <div className="space-y-3">
                  {brief.awaitingRoyalDecision.map((m) => (
                    <div key={m.id} className="rounded-lg border border-border bg-muted/20 px-4 py-3">
                      <div className="flex items-center justify-between">
                        <div className="font-semibold">{m.title}</div>
                        <PriorityBadge priority={m.priority} />
                      </div>
                      <div className="mt-1.5 text-xs text-muted-foreground uppercase tracking-widest font-semibold">{m.category}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="No Pending Decisions" description="Your desk is clear." />
              )}
            </SectionCard>
          </div>

          {/* Charter mission reminder */}
          {brief.charter && (
            <div className="relative overflow-hidden rounded-xl border border-primary/20 bg-primary/5 p-6 backdrop-blur-sm shadow-[0_0_20px_rgba(214,170,87,0.05)]">
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <Shield className="h-24 w-24 text-primary" />
              </div>
              <div className="relative z-10 flex flex-col gap-2">
                <span className="font-bold text-primary text-xs uppercase tracking-[0.3em]">Prime Directive</span>
                <p className="text-sm font-medium leading-relaxed text-foreground/90 max-w-3xl">
                  {brief.charter.mission}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        {/* Projects */}
        <SectionCard 
          title="Project Overview" 
          icon={FolderKanban}
          action={
            <Link to="/projects">
              <Button variant="outline" className="h-8 text-xs">Open Projects</Button>
            </Link>
          }
        >
          <div className="grid gap-4 sm:grid-cols-3 mb-6">
            <StatCard className="bg-transparent border-none p-0" title="Active Projects" value={projects.filter((project) => project.status === "ACTIVE").length} />
            <StatCard className="bg-transparent border-none p-0" title="Inbox Items" value={projectInbox.length} trend={projectInbox.length > 0 ? { value: "Review Needed", isPositive: false } : undefined} />
            <StatCard className="bg-transparent border-none p-0" title="Critical Matters" value={brief?.kingdomStatus.criticalMatters ?? 0} trend={(brief?.kingdomStatus.criticalMatters ?? 0) > 0 ? { value: "Action Required", isPositive: false } : undefined} />
          </div>
          
          {projects.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 mb-6">
              {projects.slice(0, 4).map((project) => (
                <Link key={project.id} to={`/projects/${project.id}`} className="group rounded-lg border border-border bg-muted/20 p-4 transition-all hover:border-primary/50 hover:bg-muted/40 hover:shadow-sm">
                  <div className="flex justify-between items-start">
                    <div className="font-semibold group-hover:text-primary transition-colors">{project.name}</div>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground line-clamp-1">{project.activeMilestone || project.priority}</div>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState className="mb-6 py-8" title="No Active Projects" description="Start a new initiative for the kingdom." />
          )}

          <div className="flex flex-wrap gap-3">
            <Link to="/project-inbox"><Button variant="secondary" className="h-9"><Inbox className="h-4 w-4 mr-2" />Project Inbox</Button></Link>
            <Link to="/artifacts"><Button variant="secondary" className="h-9"><Archive className="h-4 w-4 mr-2" />Artifacts</Button></Link>
          </div>
        </SectionCard>

        {/* External Work */}
        <SectionCard 
          title="External Work" 
          icon={ClipboardList}
          action={
            <Link to="/work-orders">
              <Button variant="outline" className="h-8 text-xs">Open Work Orders</Button>
            </Link>
          }
        >
          <div className="grid gap-4 sm:grid-cols-3 mb-6">
            <StatCard 
              className="bg-transparent border-none p-0" 
              title="Open Orders" 
              value={workOrders.filter((order) => ["DRAFT", "READY"].includes(order.status)).length} 
              description={workOrdersHiddenCount > 0 ? `${workOrdersHiddenCount} archived legacy work orders hidden` : undefined}
            />
            <StatCard className="bg-transparent border-none p-0" title="In Progress" value={workOrders.filter((order) => order.status === "IN_PROGRESS").length} />
            <StatCard className="bg-transparent border-none p-0" title="Needs Review" value={workOrders.filter((order) => order.status === "NEEDS_REVIEW").length} trend={workOrders.filter((order) => order.status === "NEEDS_REVIEW").length > 0 ? { value: "Review", isPositive: false } : undefined} />
          </div>

          {handoffBriefs[0] ? (
            <div className="mb-6 rounded-lg border border-border bg-muted/20 p-4">
              <div className="font-semibold tracking-wide text-foreground">{handoffBriefs[0].title}</div>
              <div className="mt-2 line-clamp-2 text-sm text-muted-foreground">{handoffBriefs[0].handoffPrompt}</div>
            </div>
          ) : (
             <EmptyState className="mb-6 py-8" title="No Handoff Briefs" description="No recent external operations." />
          )}

          <div className="flex flex-wrap gap-3">
            <Link to="/work-orders"><Button variant="secondary" className="h-9">Review Work Orders</Button></Link>
            <Link to="/work-orders"><Button variant="secondary" className="h-9">Review Handoffs</Button></Link>
          </div>
        </SectionCard>

        {/* Living Loop */}
        {(user?.role === "KING" || user?.role === "CROWN_PRINCE") && (
          <SectionCard
            title="Living Loop"
            icon={Activity}
            action={
              <div className="flex items-center gap-2">
                {user?.role === "KING" && <RunLivingLoopButton />}
                <Link to="/living-loop">
                  <Button variant="outline" className="h-8 text-xs">Open</Button>
                </Link>
              </div>
            }
          >
            <LivingLoopDashboardCard />
          </SectionCard>
        )}
      </div>

      {/* Recent decrees */}
      {tasks.length > 0 && (
        <div className="mt-8">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-xl tracking-wide">Recent Decrees</h2>
            <Link to="/throne-room" className="text-sm font-semibold uppercase tracking-wider text-primary hover:underline">View All</Link>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            {tasks.slice(0, 4).map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
