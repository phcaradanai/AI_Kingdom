import { Activity, AlertTriangle, ArrowRight, Bot, CheckCircle2, ClipboardList, FolderKanban, Scroll, Zap } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { ProvenanceLinks, provenanceFromNextAction } from "@/components/ProvenanceLinks";
import { KingdomActivityFeed } from "@/components/kingdom/KingdomActivityFeed";
import { KingdomHealthStrip } from "@/components/kingdom/KingdomHealthStrip";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import type {
  KingdomActivityStreamDto,
  KingdomHealthDto,
  NextActionItem,
  NextActionQueueDto,
  ProjectDto,
  SecretaryBriefDto,
  WorkOrderDto
} from "@/types/api";

const RISK_STYLES: Record<NextActionItem["riskLevel"], string> = {
  CRITICAL: "border-destructive/40 bg-destructive/10 text-destructive",
  HIGH: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  MEDIUM: "border-blue-500/40 bg-blue-500/10 text-blue-400",
  LOW: "border-border bg-muted/30 text-muted-foreground"
};

function formatAge(hours: number): string {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m old`;
  if (hours < 24) return `${Math.round(hours)}h old`;
  return `${Math.round(hours / 24)}d old`;
}

// ── Metric card (kept: reused by LivingLoopDashboardCard) ──────────────────────

function MetricReviewCard({ title, value, to, reviewLabel = "Open source", description, trend, icon: Icon, className }: { title: string; value: React.ReactNode; to: string; reviewLabel?: string; description?: string; trend?: { value: string; isPositive: boolean }; icon?: typeof Activity; className?: string }) {
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

// ── Top Actions (max 3) ────────────────────────────────────────────────────────

function TopActionCard({ item, canRunLoop, onActed }: { item: NextActionItem; canRunLoop: boolean; onActed: () => void }) {
  const navigate = useNavigate();
  const [running, setRunning] = useState(false);
  const isLoopAction = item.routeTo.startsWith("/living-loop") && canRunLoop;

  async function runLoop() {
    setRunning(true);
    try {
      await api.runLivingLoopOnce();
      onActed();
    } catch (e) {
      console.error(e);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card/60 p-4 backdrop-blur-sm transition-colors hover:border-primary/40">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider", RISK_STYLES[item.riskLevel])}>
          {item.riskLevel}
        </span>
        <span className="rounded-full border border-border bg-muted/30 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {item.abstractState.replace(/_/g, " ")}
        </span>
        <span className="ml-auto text-[11px] text-muted-foreground">{formatAge(item.ageHours)}</span>
      </div>
      <div className="mt-2.5 font-display text-base font-semibold text-foreground">{item.title}</div>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.why}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button className="h-8 gap-1.5 text-xs" onClick={() => navigate(item.routeTo)}>
          <Zap className="h-3.5 w-3.5" />
          {item.actionLabel}
        </Button>
        {isLoopAction && (
          <Button variant="outline" className="h-8 text-xs" onClick={runLoop} disabled={running}>
            {running ? "Running…" : "Run Once"}
          </Button>
        )}
      </div>

      <ProvenanceLinks className="mt-3" {...provenanceFromNextAction(item)} />
    </div>
  );
}

// ── Active Initiatives ──────────────────────────────────────────────────────────

const ACTIVE_WORK_ORDER_STATUSES: WorkOrderDto["status"][] = ["DRAFT", "READY", "IN_PROGRESS", "NEEDS_REVIEW"];

function workOrderBlocker(order: WorkOrderDto): string | null {
  if (order.status === "NEEDS_REVIEW") return "Awaiting your review";
  if (order.status === "FAILED") return "Last run failed";
  if (order.contextBindingStatus && order.contextBindingStatus !== "FRESH") return "Context needs refresh";
  return null;
}

function workOrderActionLabel(status: WorkOrderDto["status"]): string {
  if (status === "NEEDS_REVIEW") return "Review";
  if (status === "IN_PROGRESS") return "View progress";
  return "Open";
}

function InitiativeCard({ icon: Icon, title, status, sourceLabel, owner, blocker, actionLabel, to, updatedAt }: { icon: typeof FolderKanban; title: string; status: string; sourceLabel: string; owner?: string | null; blocker?: string | null; actionLabel: string; to: string; updatedAt?: string | null }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card/60 p-4 backdrop-blur-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="h-4 w-4 shrink-0 text-primary/70" />
          <span className="truncate font-semibold text-foreground">{title}</span>
        </div>
        <StatusBadge status={status} />
      </div>
      {blocker && (
        <div className="flex items-center gap-1.5 text-xs text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {blocker}
        </div>
      )}
      <Link to={to} className="mt-1 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-primary hover:underline">
        {actionLabel}
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
      <ProvenanceLinks
        source={{ label: sourceLabel, to }}
        generatedBy={owner ?? undefined}
        updatedAt={updatedAt ?? undefined}
      />
    </div>
  );
}

// ── Living Loop card (kept: imported by LivingLoopDashboardCard.test) ───────────

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

// ── Dashboard ────────────────────────────────────────────────────────────────

export function DashboardPage() {
  const user = useAuthStore((state) => state.user);
  const canCommand = user?.role === "KING" || user?.role === "CROWN_PRINCE" || user?.role === "MINISTER";
  const canRunLoop = user?.role === "KING";

  const [nextActions, setNextActions] = useState<NextActionQueueDto | null>(null);
  const [health, setHealth] = useState<KingdomHealthDto | null>(null);
  const [activity, setActivity] = useState<KingdomActivityStreamDto | null>(null);
  const [workOrders, setWorkOrders] = useState<WorkOrderDto[]>([]);
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [brief, setBrief] = useState<SecretaryBriefDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    Promise.all([
      api.getNextActions({ limit: 3 }).catch(() => null),
      api.getKingdomHealth().catch(() => null),
      api.getKingdomActivity(8).catch(() => null),
      api.workOrders().catch(() => ({ workOrders: [] as WorkOrderDto[], hiddenCount: 0 })),
      api.projects().catch(() => ({ projects: [] as ProjectDto[] })),
      api.secretaryBrief().catch(() => null)
    ])
      .then(([nextRes, healthRes, activityRes, ordersRes, projectsRes, briefRes]) => {
        if (cancelled) return;
        setNextActions(nextRes);
        setHealth(healthRes);
        setActivity(activityRes);
        setWorkOrders(ordersRes.workOrders);
        setProjects(projectsRes.projects);
        setBrief(briefRes);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, [reloadKey]);

  const topActions = (nextActions?.queue ?? []).slice(0, 3);

  const activeOrders = workOrders.filter((order) => ACTIVE_WORK_ORDER_STATUSES.includes(order.status));
  const activeProjects = projects.filter((project) => project.status === "ACTIVE");
  const hasInitiatives = activeOrders.length > 0 || activeProjects.length > 0;

  if (isLoading) {
    return <LoadingState message="Summoning royal briefings..." className="min-h-[60vh]" />;
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 slide-in-from-bottom-4">
      <PageHeader
        eyebrow="Command Center"
        title="The Kingdom at a Glance"
        description="What needs your attention, the health of the kingdom, what's in flight, and what just happened."
        action={canCommand ? (
          <Link to="/throne-room?view=command">
            <Button variant="outline" className="gap-2">
              <Scroll className="h-4 w-4" />
              Issue Royal Decree
            </Button>
          </Link>
        ) : undefined}
      />

      {/* 1. Top Actions (max 3) */}
      <SectionCard
        title="Top Actions"
        icon={Zap}
        action={<Link to="/inbox" className="text-xs font-semibold uppercase tracking-wider text-primary hover:underline">Kingdom Inbox</Link>}
      >
        {topActions.length > 0 ? (
          <div className="grid gap-4 lg:grid-cols-3">
            {topActions.map((item) => (
              <TopActionCard key={item.id} item={item} canRunLoop={canRunLoop} onActed={() => setReloadKey((k) => k + 1)} />
            ))}
          </div>
        ) : (
          <EmptyState icon={CheckCircle2} title="No urgent command pending" description="Nothing needs the King's attention right now." />
        )}
      </SectionCard>

      {/* 2. Kingdom Health */}
      {health && <KingdomHealthStrip health={health} />}

      {/* 3. Active Initiatives */}
      <SectionCard
        title="Active Initiatives"
        icon={FolderKanban}
        action={<Link to="/projects" className="text-xs font-semibold uppercase tracking-wider text-primary hover:underline">All Projects</Link>}
      >
        {hasInitiatives ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {activeProjects.slice(0, 3).map((project) => (
              <InitiativeCard
                key={`project-${project.id}`}
                icon={FolderKanban}
                title={project.name}
                status={project.status}
                sourceLabel="Project"
                blocker={null}
                actionLabel="Open project"
                to={`/projects/${project.id}`}
                updatedAt={project.updatedAt}
              />
            ))}
            {activeOrders.slice(0, 6).map((order) => (
              <InitiativeCard
                key={`wo-${order.id}`}
                icon={ClipboardList}
                title={order.title}
                status={order.status}
                sourceLabel="Work Order"
                owner={order.assignedAgent?.name ?? null}
                blocker={workOrderBlocker(order)}
                actionLabel={workOrderActionLabel(order.status)}
                to="/work-orders"
                updatedAt={order.updatedAt}
              />
            ))}
          </div>
        ) : (
          <EmptyState icon={FolderKanban} title="No active initiatives" description="No active projects or open work orders right now." />
        )}
      </SectionCard>

      {/* 3b. Agent Reports — what external agents delivered back into the Kingdom */}
      <SectionCard
        title="Agent Reports"
        icon={Bot}
        action={
          <Link to="/work-orders" className="text-xs font-semibold uppercase tracking-wider text-primary hover:underline">
            {brief && brief.kingdomStatus.workOrdersAwaitingReview > 0
              ? `${brief.kingdomStatus.workOrdersAwaitingReview} awaiting review`
              : "All Work Orders"}
          </Link>
        }
      >
        {brief && brief.recentAgentReports.length > 0 ? (
          <div className="space-y-3">
            {brief.recentAgentReports.map((report) => (
              <Link
                key={report.id}
                to="/work-orders"
                className="block rounded-xl border border-border bg-card/60 p-4 backdrop-blur-sm transition-colors hover:border-primary/45 hover:bg-card/80"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="font-semibold text-foreground">{report.title}</span>
                  <StatusBadge status={report.severity} />
                </div>
                <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{report.content}</p>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState icon={Bot} title="No agent reports yet" description="Dispatch a work order to an external agent — its report will appear here when it returns." />
        )}
      </SectionCard>

      {/* 4. Recent Activity */}
      <SectionCard
        title="Recent Activity"
        icon={Activity}
        action={<Link to="/kingdom/operations" className="text-xs font-semibold uppercase tracking-wider text-primary hover:underline">Operations Center</Link>}
      >
        <KingdomActivityFeed activities={activity?.activities ?? []} limit={8} />
      </SectionCard>
    </div>
  );
}
