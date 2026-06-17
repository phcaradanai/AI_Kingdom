import { Activity, AlertTriangle, Archive, ArrowRight, CheckCircle2, Clock, ClipboardList, Cpu, Crown, FileText, FolderKanban, Inbox, Landmark, Scroll, ScrollText, Shield, Sparkles, Vault, Zap } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AgentPortrait } from "@/components/AgentPortrait";
import { PageHeader } from "@/components/PageHeader";
import { TaskCard } from "@/components/TaskCard";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { PriorityBadge } from "@/components/ui/PriorityBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { api } from "@/lib/api";
import { getProviderModelDisplay } from "@/lib/providerDisplay";
import { cn, formatDate } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import { useKingdomStore } from "@/stores/kingdomStore";
import type { AgentActivityStatus, AgentDto, CurrentAgentActivityDto, HandoffBriefDto, NextActionQueueDto, ProjectDto, ProjectInboxItemDto, RoyalBriefDto, SecretaryBriefDto, WorkOrderDto } from "@/types/api";

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

function formatAge(hours: number): string {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m ago`;
  if (hours < 24) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function DashboardSection({ title, description, action, children }: { title: string; description?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-display text-xl tracking-wide text-foreground">{title}</h2>
          {description && <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function SourceLinkCard({ icon: Icon, title, description, to, actionLabel = "Open source", secondary }: { icon: typeof Crown; title: string; description: string; to: string; actionLabel?: string; secondary?: { label: string; to: string } }) {
  return (
    <div className="rounded-xl border border-border bg-card/60 p-4 backdrop-blur-sm transition-colors hover:border-primary/40 hover:bg-card/80">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-primary/10">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-display text-base font-semibold tracking-wide text-foreground">{title}</div>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Link to={to} className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-primary hover:underline">
          {actionLabel}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
        {secondary && (
          <Link to={secondary.to} className="text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-primary hover:underline">
            {secondary.label}
          </Link>
        )}
      </div>
    </div>
  );
}

function MetricReviewCard({ title, value, to, reviewLabel = "Open source", description, trend, icon: Icon, className }: { title: string; value: React.ReactNode; to: string; reviewLabel?: string; description?: string; trend?: { value: string; isPositive: boolean }; icon?: typeof Crown; className?: string }) {
  return (
    <Link
      to={to}
      className={cn(
        "group block rounded-xl border border-border bg-card/60 p-4 backdrop-blur-sm transition-colors hover:border-primary/45 hover:bg-card/80",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</div>
        {Icon && <Icon className="h-4 w-4 text-primary/70" />}
      </div>
      <div className="mt-3 flex flex-wrap items-baseline gap-2">
        <div className="font-display text-3xl font-bold text-foreground">{value}</div>
        {trend && <div className={cn("text-xs font-semibold", trend.isPositive ? "text-emerald-500" : "text-red-500")}>{trend.value}</div>}
      </div>
      {description && <div className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</div>}
      <div className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-primary group-hover:underline">
        {reviewLabel}
        <ArrowRight className="h-3.5 w-3.5" />
      </div>
    </Link>
  );
}

function DashboardHeroAction({ nextActions, loading, error, fallbackBrief }: { nextActions: NextActionQueueDto | null; loading: boolean; error: string | null; fallbackBrief: RoyalBriefDto | null }) {
  const item = nextActions?.topAction ?? null;
  const fallbackDecision = fallbackBrief?.decisionsNeeded.items[0] ?? null;

  return (
    <div className="relative overflow-hidden rounded-xl border border-primary/30 bg-gradient-to-br from-primary/12 via-card/80 to-card/50 p-5 shadow-[0_0_30px_rgba(214,170,87,0.08)]">
      <div className="absolute inset-0 bg-[url('/noise.png')] opacity-[0.06] mix-blend-overlay pointer-events-none" aria-hidden="true" />
      <div className="relative space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.25em] text-primary/80">What should the King do next?</div>
            <h2 className="mt-2 font-display text-2xl font-bold tracking-wide text-foreground">Next Action</h2>
          </div>
          <Link to="/inbox" className="inline-flex items-center gap-1.5 rounded-md border border-primary/25 bg-primary/10 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-primary hover:border-primary/50">
            Kingdom Inbox
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {loading && (
          <div className="rounded-lg border border-border/70 bg-background/30 p-4 text-sm text-muted-foreground">
            Loading live next actions...
          </div>
        )}

        {!loading && error && (
          <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
            Kingdom Inbox is temporarily unavailable. Showing the Royal Brief fallback.
          </div>
        )}

        {!loading && item && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-primary">{item.riskLevel}</span>
              <span className="rounded-full border border-border bg-muted/30 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{item.abstractState.replace(/_/g, " ")}</span>
              <span className="rounded-full border border-border bg-muted/30 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{formatAge(item.ageHours)}</span>
            </div>
            <div>
              <div className="font-display text-xl font-semibold text-foreground">{item.title}</div>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.why}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Link to={item.routeTo}>
                <Button className="gap-2">
                  <Zap className="h-4 w-4" />
                  {item.actionLabel}
                </Button>
              </Link>
              <Link to="/inbox" className="text-xs font-bold uppercase tracking-wider text-primary hover:underline">Open source</Link>
            </div>
          </div>
        )}

        {!loading && !item && fallbackDecision && (
          <div className="space-y-4">
            <div>
              <div className="font-display text-xl font-semibold text-foreground">{fallbackDecision.title}</div>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{fallbackDecision.why}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Link to="/royal-brief"><Button className="gap-2"><Crown className="h-4 w-4" />Review Royal Brief</Button></Link>
              <Link to="/inbox" className="text-xs font-bold uppercase tracking-wider text-primary hover:underline">Check Kingdom Inbox</Link>
            </div>
          </div>
        )}

        {!loading && !item && !fallbackDecision && (
          <div className="rounded-lg border border-border bg-background/30 p-5">
            <EmptyState
              icon={CheckCircle2}
              title="No urgent command pending"
              description="The Dashboard has no live next action or Royal Brief decision to surface right now."
            />
          </div>
        )}
      </div>
    </div>
  );
}

function IssueRoyalDecreeCard({ canCommand }: { canCommand: boolean }) {
  if (!canCommand) {
    return (
      <div className="rounded-xl border border-border bg-card/60 p-5 backdrop-blur-sm">
        <div className="font-display text-xl font-bold tracking-wide text-foreground">Command access</div>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Royal decrees are available to command roles. Use the source links below to review current state.</p>
      </div>
    );
  }

  return (
    <Link to="/throne-room" className="group block h-full">
      <div className="relative flex h-full flex-col justify-between gap-5 overflow-hidden rounded-xl border border-primary/30 bg-primary/10 p-5 transition-all duration-300 hover:border-primary/60 hover:shadow-[0_0_30px_rgba(214,170,87,0.15)]">
        <div className="absolute inset-0 bg-[url('/noise.png')] opacity-10 mix-blend-overlay pointer-events-none" />
        <div className="relative flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-primary/40 bg-primary/20 transition-transform duration-500 group-hover:scale-105">
            <Scroll className="h-6 w-6 text-primary" />
          </div>
          <div>
            <div className="font-display text-xl font-bold tracking-wide text-primary">Issue Royal Decree</div>
            <div className="mt-1 text-sm leading-relaxed text-primary/75">Open the Throne Room and command the royal council.</div>
          </div>
        </div>
        <div className="relative inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary group-hover:underline">
          Open command source
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </div>
      </div>
    </Link>
  );
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
  const [status, setStatus] = useState<{ pending: number; highCritical: number; runnerIssues: number; providerIssues: number; lastRun: string | null; autoValidationToday: number; validationFailures: number; autoSandboxPatchToday: number; patchesPendingReview: number } | null>(null);
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
        validationFailures: res.status.autoValidation?.validationFailuresNeedingReview ?? 0,
        autoSandboxPatchToday: res.status.autoSandboxPatch?.dailyCount ?? 0,
        patchesPendingReview: res.status.patchesPendingReview ?? 0
      }))
      .catch(() => { /* ignore */ })
      .finally(() => setLoading(false));
  }, []);
  if (loading) return <div className="text-xs text-muted-foreground">Loading...</div>;
  if (!status) return <div className="text-xs text-muted-foreground">Could not load loop status.</div>;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <MetricReviewCard title="Pending" value={status.pending} to="/living-loop" />
        <MetricReviewCard title="High/Critical" value={status.highCritical} to="/living-loop" reviewLabel={status.highCritical > 0 ? "Review" : "Open source"} trend={status.highCritical > 0 ? { value: "Urgent", isPositive: false } : undefined} />
        <MetricReviewCard title="Runner Issues" value={status.runnerIssues} to="/automation-jobs" reviewLabel={status.runnerIssues > 0 ? "Review" : "Open source"} trend={status.runnerIssues > 0 ? { value: "Check", isPositive: false } : undefined} />
        <MetricReviewCard title="Provider Issues" value={status.providerIssues} to="/providers" reviewLabel={status.providerIssues > 0 ? "Review" : "Open source"} trend={status.providerIssues > 0 ? { value: "Check", isPositive: false } : undefined} />
        <MetricReviewCard title="Auto Validation Today" value={status.autoValidationToday} to="/automation-jobs" />
        <MetricReviewCard title="Validation Failures" value={status.validationFailures} to="/automation-jobs" reviewLabel={status.validationFailures > 0 ? "Review" : "Open source"} trend={status.validationFailures > 0 ? { value: "Review", isPositive: false } : undefined} />
        <MetricReviewCard title="Auto Patch Jobs Today" value={status.autoSandboxPatchToday} to="/automation-jobs" />
        <MetricReviewCard title="Patches Needing Review" value={status.patchesPendingReview} to="/automation-jobs" reviewLabel="Review" trend={status.patchesPendingReview > 0 ? { value: "Review", isPositive: false } : undefined} />
      </div>
      {status.lastRun && <div className="text-xs text-muted-foreground">Last run: {status.lastRun}</div>}
    </div>
  );
}

export function RoyalBriefDashboardCard() {
  const [brief, setBrief] = useState<RoyalBriefDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const user = useAuthStore((state) => state.user);

  useEffect(() => {
    api.latestRoyalBrief()
      .then((res) => setBrief(res.brief))
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load the Royal Brief."))
      .finally(() => setLoading(false));
  }, []);

  async function generateNow() {
    setGenerating(true);
    try {
      const res = await api.generateRoyalBrief();
      setBrief(res.brief);
    } catch (e) {
      console.error(e);
    }
    setGenerating(false);
  }

  if (loading) return <div className="text-xs text-muted-foreground">Loading...</div>;

  if (error) {
    return (
      <ErrorState
        title="Royal Brief unavailable"
        message="The Dashboard could not load the generated Daily Royal Brief."
        className="py-6"
      />
    );
  }

  if (!brief) {
    return (
      <div className="space-y-3">
        <EmptyState title="No Royal Brief Yet" description="Generate the first Daily Royal Brief to see a summary of Kingdom activity." />
        {user?.role === "KING" && (
          <Button variant="outline" className="h-8 text-xs" onClick={generateNow} disabled={generating}>
            {generating ? "Generating..." : "Generate Now"}
          </Button>
        )}
      </div>
    );
  }

  const runnerStatus = brief.runnerStatus as { onlineCount: number; offlineCount: number; errorCount: number };
  const patchSummary = brief.patchSummary as { patchesNeedingReview: unknown[] };
  const validationSummary = brief.validationSummary as { jobsFailed: number };
  const providerSummary = brief.providerSummary as { recentErrorCounts: unknown[] };

  return (
    <div className="space-y-3">
      <div className="text-sm text-foreground">{brief.summary}</div>
      <div className="grid grid-cols-2 gap-3">
        <MetricReviewCard title="Decisions Needed" value={brief.decisionsNeeded.items.length} to="/inbox" reviewLabel="Review" trend={brief.decisionsNeeded.items.length > 0 ? { value: "Review", isPositive: false } : undefined} />
        <MetricReviewCard title="Patches Needing Review" value={patchSummary.patchesNeedingReview.length} to="/automation-jobs" reviewLabel="Review" trend={patchSummary.patchesNeedingReview.length > 0 ? { value: "Review", isPositive: false } : undefined} />
        <MetricReviewCard title="Failed Validations" value={validationSummary.jobsFailed} to="/automation-jobs" reviewLabel={validationSummary.jobsFailed > 0 ? "Review" : "Open source"} trend={validationSummary.jobsFailed > 0 ? { value: "Check", isPositive: false } : undefined} />
        <MetricReviewCard title="Runners Online" value={`${runnerStatus.onlineCount}`} to="/automation-jobs" description={`${runnerStatus.offlineCount} offline, ${runnerStatus.errorCount} error`} />
        <MetricReviewCard title="Provider Issues" value={providerSummary.recentErrorCounts.length} to="/providers" reviewLabel={providerSummary.recentErrorCounts.length > 0 ? "Review" : "Open source"} trend={providerSummary.recentErrorCounts.length > 0 ? { value: "Check", isPositive: false } : undefined} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="text-xs text-muted-foreground">Generated {formatDate(brief.createdAt)}</div>
        <Link to="/royal-brief"><Button variant="outline" className="h-8 text-xs">Open Brief</Button></Link>
        {user?.role === "KING" && (
          <Button variant="outline" className="h-8 text-xs" onClick={generateNow} disabled={generating}>
            {generating ? "Generating..." : "Generate Now"}
          </Button>
        )}
      </div>
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
  const [nextActions, setNextActions] = useState<NextActionQueueDto | null>(null);
  const [nextActionsLoading, setNextActionsLoading] = useState(true);
  const [nextActionsError, setNextActionsError] = useState<string | null>(null);
  const [latestRoyalBrief, setLatestRoyalBrief] = useState<RoyalBriefDto | null>(null);
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

    async function loadCommandCenter() {
      setNextActionsLoading(true);
      const [nextActionRes, royalBriefRes] = await Promise.all([
        api.getNextActions({ limit: 5 }).catch((error) => {
          if (!cancelled) setNextActionsError(error instanceof Error ? error.message : "Unable to load next actions.");
          return null;
        }),
        api.latestRoyalBrief().catch(() => ({ brief: null }))
      ]);

      if (cancelled) return;
      setNextActions(nextActionRes);
      if (nextActionRes) setNextActionsError(null);
      setLatestRoyalBrief(royalBriefRes.brief);
      setNextActionsLoading(false);
    }

    void loadCommandCenter();

    return () => {
      cancelled = true;
    };
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
    { label: "Royal Agents", value: agents.length, icon: Shield, to: "/agents" },
    { label: "Commands", value: tasks.length, icon: Landmark, to: "/throne-room" },
    { label: "Reports", value: reports.length, icon: ScrollText, to: "/reports" },
    { label: "Memories", value: memories.length, icon: Vault, to: "/memory" }
  ];

  const displayedAgentActivities = agentActivities.length > 0 ? agentActivities : agents.map(buildIdleAgentActivity);

  if (isLoading) {
    return <LoadingState message="Summoning royal briefings..." className="min-h-[60vh]" />;
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 slide-in-from-bottom-4">
      <PageHeader
        eyebrow="Command Center"
        title="The Kingdom at a Glance"
        description="See what needs royal attention, then jump to the source-of-truth page to review or act."
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.8fr)]">
        <DashboardHeroAction
          nextActions={nextActions}
          loading={nextActionsLoading}
          error={nextActionsError}
          fallbackBrief={latestRoyalBrief}
        />
        <IssueRoyalDecreeCard canCommand={canCommand} />
      </div>

      <DashboardSection
        title="Source of Truth"
        description="The Dashboard summarizes state only. Open these pages to inspect, decide, edit, or execute."
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <SourceLinkCard icon={Zap} title="Kingdom Inbox" description="Live next actions ranked by the next-action engine." to="/inbox" actionLabel="Review live queue" />
          <SourceLinkCard icon={Crown} title="Royal Brief" description="Generated daily summary of decisions, risks, runners, patches, and providers." to="/royal-brief" actionLabel="Open brief" />
          <SourceLinkCard icon={ClipboardList} title="Work Orders" description="Implementation queue, handoffs, context binding, and review status." to="/work-orders" actionLabel="Review queue" />
          <SourceLinkCard icon={Activity} title="Automation Jobs" description="Runner jobs, validation output, patch imports, and approval status." to="/automation-jobs" actionLabel="Review jobs" />
          <SourceLinkCard icon={FolderKanban} title="Projects" description="Project context, source documents, inbox routing, and artifacts." to="/projects" actionLabel="Open projects" secondary={{ label: "Project Inbox", to: "/project-inbox" }} />
          <SourceLinkCard icon={Cpu} title="Treasury/Providers" description="Provider health, balances, routing, and cost visibility." to="/treasury" actionLabel="Open treasury" secondary={{ label: "Providers", to: "/providers" }} />
        </div>
      </DashboardSection>

      <DashboardSection
        title="Daily Royal Brief"
        description="Generated summary only. Use the links on each metric to review the owning page."
        action={<Link to="/royal-brief" className="text-xs font-semibold uppercase tracking-wider text-primary hover:underline">Open Brief</Link>}
      >
        <SectionCard className="border-primary/15" contentClassName="p-5">
          <RoyalBriefDashboardCard />
        </SectionCard>
      </DashboardSection>

      {/* Quick stats */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <MetricReviewCard
            key={stat.label}
            title={stat.label}
            value={stat.value}
            icon={stat.icon}
            to={stat.to}
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
                <MetricReviewCard title="Unread Notices" value={brief.kingdomStatus.unreadNotices} to="/notices" />
                <MetricReviewCard title="Critical Notices" value={brief.kingdomStatus.criticalNotices} to="/notices" reviewLabel={brief.kingdomStatus.criticalNotices > 0 ? "Review" : "Open source"} trend={brief.kingdomStatus.criticalNotices > 0 ? { value: "Action Required", isPositive: false } : undefined} />
                <MetricReviewCard title="Open Matters" value={brief.kingdomStatus.openMatters} to="/matters" />
                <MetricReviewCard title="Critical Matters" value={brief.kingdomStatus.criticalMatters} to="/matters" reviewLabel={brief.kingdomStatus.criticalMatters > 0 ? "Review" : "Open source"} trend={brief.kingdomStatus.criticalMatters > 0 ? { value: "Action Required", isPositive: false } : undefined} />
                <MetricReviewCard title="Awaiting Decision" value={brief.kingdomStatus.awaitingRoyalDecision} to="/inbox" reviewLabel="Review" trend={brief.kingdomStatus.awaitingRoyalDecision > 0 ? { value: "Pending", isPositive: false } : undefined} />
                <MetricReviewCard title="Failed Decrees" value={brief.kingdomStatus.failedTasks} to="/throne-room" reviewLabel={brief.kingdomStatus.failedTasks > 0 ? "Review" : "Open source"} trend={brief.kingdomStatus.failedTasks > 0 ? { value: "Requires Review", isPositive: false } : undefined} />
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
                    <Link key={n.id} to="/notices" className={cn("flex flex-col gap-1.5 rounded-lg border px-4 py-3 transition-colors hover:border-primary/45", n.severity === "CRITICAL" ? "border-destructive/30 bg-destructive/10" : "border-amber-500/30 bg-amber-500/10")}>
                      <div className="flex items-center justify-between">
                        <div className="font-semibold">{n.title}</div>
                        <StatusBadge type={n.severity === "CRITICAL" ? "error" : "warning"} status={n.severity} />
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {formatDate(n.createdAt)}
                      </div>
                    </Link>
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
                    <Link key={m.id} to="/matters" className="block rounded-lg border border-border bg-muted/20 px-4 py-3 transition-colors hover:border-primary/45 hover:bg-muted/35">
                      <div className="flex items-center justify-between">
                        <div className="font-semibold">{m.title}</div>
                        <PriorityBadge priority={m.priority} />
                      </div>
                      <div className="mt-1.5 text-xs text-muted-foreground uppercase tracking-widest font-semibold">{m.category}</div>
                    </Link>
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
            <MetricReviewCard title="Active Projects" value={projects.filter((project) => project.status === "ACTIVE").length} to="/projects" />
            <MetricReviewCard title="Inbox Items" value={projectInbox.length} to="/project-inbox" reviewLabel={projectInbox.length > 0 ? "Review" : "Open source"} trend={projectInbox.length > 0 ? { value: "Review Needed", isPositive: false } : undefined} />
            <MetricReviewCard title="Critical Matters" value={brief?.kingdomStatus.criticalMatters ?? 0} to="/matters" reviewLabel={(brief?.kingdomStatus.criticalMatters ?? 0) > 0 ? "Review" : "Open source"} trend={(brief?.kingdomStatus.criticalMatters ?? 0) > 0 ? { value: "Action Required", isPositive: false } : undefined} />
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
            <MetricReviewCard
              title="Open Orders" 
              value={workOrders.filter((order) => ["DRAFT", "READY"].includes(order.status)).length} 
              to="/work-orders"
              description={workOrdersHiddenCount > 0 ? `${workOrdersHiddenCount} archived legacy work orders hidden` : undefined}
            />
            <MetricReviewCard title="In Progress" value={workOrders.filter((order) => order.status === "IN_PROGRESS").length} to="/work-orders" />
            <MetricReviewCard title="Needs Review" value={workOrders.filter((order) => order.status === "NEEDS_REVIEW").length} to="/work-orders" reviewLabel="Review" trend={workOrders.filter((order) => order.status === "NEEDS_REVIEW").length > 0 ? { value: "Review", isPositive: false } : undefined} />
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
