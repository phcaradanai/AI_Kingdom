import { Activity, AlertTriangle, ArrowRight, Bot, CheckCircle2, ClipboardList, Gauge, Scroll, Zap } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { ProvenanceLinks } from "@/components/ProvenanceLinks";
import { KingdomActivityFeed } from "@/components/kingdom/KingdomActivityFeed";
import { KingdomHealthStrip } from "@/components/kingdom/KingdomHealthStrip";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { PageSection } from "@/components/ui/PageSection";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { api } from "@/lib/api";
import { useTk } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import type {
  KingdomActivityStreamDto,
  KingdomHealthDto,
  MissionControlDto,
  MissionControlAgentActivityDto,
  MissionControlJobDto,
  MissionControlReviewItemDto,
  MissionControlSeverity,
  MissionControlSourceReferenceDto
} from "@/types/api";

const MISSION_SEVERITY_STYLES: Record<MissionControlSeverity, string> = {
  CRITICAL: "border-destructive/40 bg-destructive/10 text-destructive",
  WARNING: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  INFO: "border-blue-500/40 bg-blue-500/10 text-blue-400"
};

function shortSourceId(id: string | null | undefined): string {
  if (!id) return "";
  return id.length > 10 ? `${id.slice(0, 8)}...` : id;
}

function sourceLabel(ref: MissionControlSourceReferenceDto): string {
  const id = shortSourceId(ref.sourceId);
  return id ? `${ref.sourceType} #${id}` : ref.sourceType;
}

function sourceTitle(ref: MissionControlSourceReferenceDto): string {
  return ref.sourceTitle ? `${sourceLabel(ref)}: ${ref.sourceTitle}` : sourceLabel(ref);
}

function missionProvenance(ref: MissionControlSourceReferenceDto) {
  return {
    source: { label: sourceTitle(ref), to: ref.sourceRoute ?? ref.routeTo },
    updatedAt: ref.updatedAt ?? undefined
  };
}

function humanizeStatus(value: string | null | undefined): string | null {
  if (!value) return null;
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function MissionControlPanel({ missionControl }: { missionControl: MissionControlDto | null }) {
  const tk = useTk();
  if (!missionControl) {
    return (
      <PageSection title={tk("dashboard.missionControl")} icon={Gauge}>
        <EmptyState icon={Gauge} title={tk("dashboard.mcUnavailableTitle")} description={tk("dashboard.mcUnavailableDesc")} />
      </PageSection>
    );
  }

  const action = missionControl.topAction;
  const actionQueue = missionControl.actionQueue.length > 0 ? missionControl.actionQueue : [];
  const activeWork = missionControl.activeWork.slice(0, 6);
  const runningJobs = missionControl.runningJobs.slice(0, 4);
  const needsReview = missionControl.needsReviewItems.slice(0, 4);
  const blockedItems = missionControl.blockedItems.slice(0, 4);
  const warnings = [...missionControl.contextWarnings, ...missionControl.providerWarnings].slice(0, 6);
  const recentActivity = missionControl.recentActivity.slice(0, 6);

  return (
    <PageSection
      title={tk("dashboard.missionControl")}
      icon={Gauge}
      action={<Link to="/inbox" className="text-xs font-semibold text-primary hover:underline">{tk("dashboard.actionInbox")}</Link>}
    >
      <div className="space-y-6">
        <div className="rounded-lg border border-border border-l-2 border-l-primary bg-card p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground">{tk("dashboard.whatNext")}</span>
            <span title={action.severity} className={cn("rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider", MISSION_SEVERITY_STYLES[action.severity])}>
              {tk(`severity.${action.severity}`)}
            </span>
          </div>
          <h3 className="mt-3 text-lg font-semibold text-foreground">{action.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{action.detail}</p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Link to={action.routeTo}>
              <Button className="h-auto min-h-8 gap-1.5 whitespace-normal text-xs leading-snug">
                <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                {tk("dashboard.openAction")}
              </Button>
            </Link>
            <Link to={action.sourceReference.sourceRoute ?? action.sourceReference.routeTo} className="text-xs font-semibold text-primary hover:underline">
              {tk("dashboard.openSource")}
            </Link>
          </div>
          <ProvenanceLinks className="mt-4" {...missionProvenance(action.sourceReference)} />
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MissionMetric label={tk("dashboard.metric.actionQueue")} value={missionControl.actionQueue.length} to="/inbox" source="NextActionQueue" />
          <MissionMetric label={tk("dashboard.metric.activeWork")} value={missionControl.activeWork.length + missionControl.runningJobs.length} to="/work-orders" source="WorkOrder" />
          <MissionMetric label={tk("dashboard.metric.needsReview")} value={missionControl.needsReviewItems.length} to="/automation-jobs" source="AgentReviewSummary" />
          <MissionMetric label={tk("dashboard.metric.blockedWarnings")} value={missionControl.blockedItems.length + missionControl.contextWarnings.length + missionControl.providerWarnings.length} to="/work-orders" source="WorkOrder" />
        </div>

        <MissionSection title={tk("dashboard.section.actionQueue")} icon={Zap} sourceTo="/inbox" sourceLabel="NextActionQueue">
          {actionQueue.length > 0 ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {actionQueue.slice(0, 4).map((item) => (
                <MissionActionQueueCard key={item.id} item={item} />
              ))}
            </div>
          ) : (
            <EmptyState icon={CheckCircle2} title={tk("dashboard.noQueuedTitle")} description={tk("dashboard.noQueuedDesc")} />
          )}
        </MissionSection>

        <MissionSection title={tk("dashboard.section.activeWork")} icon={ClipboardList} sourceTo="/work-orders" sourceLabel="WorkOrder">
          {activeWork.length > 0 || runningJobs.length > 0 ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {activeWork.map((item) => (
                <MissionWorkCard key={`work-${item.id}`} item={item} />
              ))}
              {runningJobs.map((item) => (
                <MissionJobCard key={`job-${item.id}`} item={item} />
              ))}
            </div>
          ) : (
            <EmptyState icon={ClipboardList} title={tk("dashboard.noActiveTitle")} description={tk("dashboard.noActiveDesc")} />
          )}
        </MissionSection>

        <MissionSection title={tk("dashboard.section.needsReview")} icon={Bot} sourceTo="/automation-jobs" sourceLabel="AgentReviewSummary">
          {needsReview.length > 0 ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {needsReview.map((item) => (
                <MissionReviewCard key={item.id} item={item} />
              ))}
            </div>
          ) : (
            <EmptyState icon={CheckCircle2} title={tk("dashboard.noReviewTitle")} description={tk("dashboard.noReviewDesc")} />
          )}
        </MissionSection>

        <MissionSection title={tk("dashboard.section.blockedWarnings")} icon={AlertTriangle} sourceTo="/work-orders" sourceLabel="WorkOrder">
          {blockedItems.length > 0 || warnings.length > 0 ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {blockedItems.map((item) => (
                <MissionWorkCard key={`blocked-${item.id}`} item={item} />
              ))}
              {warnings.map((item) => (
                <MissionWarningCard key={item.id} item={item} />
              ))}
            </div>
          ) : (
            <EmptyState icon={CheckCircle2} title={tk("dashboard.noBlockedTitle")} description={tk("dashboard.noBlockedDesc")} />
          )}
        </MissionSection>

        <MissionSection title={tk("dashboard.section.recentActivity")} icon={Activity} sourceTo="/kingdom/operations" sourceLabel="AgentActivity">
          {recentActivity.length > 0 ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {recentActivity.map((item) => (
                <MissionActivityCard key={item.id} item={item} />
              ))}
            </div>
          ) : (
            <EmptyState icon={Activity} title={tk("dashboard.noRecentTitle")} description={tk("dashboard.noRecentDesc")} />
          )}
        </MissionSection>
      </div>
    </PageSection>
  );
}

function MissionMetric({ label, value, to, source }: { label: string; value: number; to: string; source: string }) {
  const tk = useTk();
  return (
    <Link to={to} className="min-h-24 rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/45">
      <div className="text-2xl font-semibold tabular-nums text-foreground">{value}</div>
      <div className="mt-1 text-sm font-semibold text-foreground">{label}</div>
      <div className="mt-2 text-xs text-muted-foreground">{tk("dashboard.sourcePrefix")} {source}</div>
    </Link>
  );
}

function MissionSection({ title, icon: Icon, sourceTo, sourceLabel, children }: { title: string; icon: typeof Activity; sourceTo: string; sourceLabel: string; children: React.ReactNode }) {
  const tk = useTk();
  return (
    <section className="space-y-3 border-t border-border pt-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        </div>
        <Link to={sourceTo} className="text-xs font-semibold text-primary hover:underline">
          {tk("dashboard.sourcePrefix")} {sourceLabel}
        </Link>
      </div>
      {children}
    </section>
  );
}

function MissionCardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      {children}
    </div>
  );
}

function MissionActionQueueCard({ item }: { item: MissionControlDto["actionQueue"][number] }) {
  const tk = useTk();
  return (
    <MissionCardShell>
      <div className="flex flex-wrap items-center gap-2">
        <span title={item.severity} className={cn("rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider", MISSION_SEVERITY_STYLES[item.severity])}>
          {tk(`severity.${item.severity}`)}
        </span>
        <span className="text-xs text-muted-foreground">{humanizeStatus(item.priorityKey)}</span>
      </div>
      <div className="mt-2 font-semibold text-foreground">{item.title}</div>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.detail}</p>
      <div className="mt-3 text-xs font-semibold text-primary">{item.nextAction}</div>
      <ProvenanceLinks className="mt-3" {...missionProvenance(item.sourceReference)} />
    </MissionCardShell>
  );
}

function MissionWorkCard({ item }: { item: MissionControlDto["activeWork"][number] }) {
  const tk = useTk();
  return (
    <MissionCardShell>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={item.displayState} title={item.status} />
        {item.contextBindingStatus && <span className="text-xs text-muted-foreground">{tk("dashboard.contextPrefix")} {humanizeStatus(item.contextBindingStatus)}</span>}
      </div>
      <div className="mt-2 font-semibold text-foreground">{item.title}</div>
      {item.blockedReason && <p className="mt-1 text-sm text-amber-400">{item.blockedReason}</p>}
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.nextAction}</p>
      <ProvenanceLinks
        className="mt-3"
        {...missionProvenance(item.sourceReference)}
        generatedBy={item.assignedAgent?.name ?? item.assignedExternalAgent?.name ?? undefined}
      />
    </MissionCardShell>
  );
}

function MissionJobCard({ item }: { item: MissionControlJobDto }) {
  return (
    <MissionCardShell>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={item.displayState} title={item.status} />
        <span className="text-xs text-muted-foreground">{humanizeStatus(item.status)}</span>
      </div>
      <div className="mt-2 font-semibold text-foreground">{item.title}</div>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.nextAction}</p>
      <ProvenanceLinks
        className="mt-3"
        {...missionProvenance(item.sourceReference)}
        generatedBy={item.agent?.name ?? item.runner?.name ?? undefined}
      />
    </MissionCardShell>
  );
}

function MissionReviewCard({ item }: { item: MissionControlReviewItemDto }) {
  const tk = useTk();
  return (
    <MissionCardShell>
      <div className="flex flex-wrap items-center gap-2">
        <span title={item.severity} className={cn("rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider", MISSION_SEVERITY_STYLES[item.severity])}>
          {tk(`severity.${item.severity}`)}
        </span>
        <span className="text-xs text-muted-foreground">{humanizeStatus(item.kingRecommendation)}</span>
      </div>
      <div className="mt-2 font-semibold text-foreground">{item.title}</div>
      <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-muted-foreground">{item.summary}</p>
      <div className="mt-3 text-xs font-semibold text-primary">{item.nextAction}</div>
      <ProvenanceLinks className="mt-3" {...missionProvenance(item.sourceReference)} />
    </MissionCardShell>
  );
}

function MissionWarningCard({ item }: { item: MissionControlDto["providerWarnings"][number] }) {
  const tk = useTk();
  return (
    <MissionCardShell>
      <div className="flex flex-wrap items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-400" />
        <span title={item.severity} className={cn("rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider", MISSION_SEVERITY_STYLES[item.severity])}>
          {tk(`severity.${item.severity}`)}
        </span>
      </div>
      <div className="mt-2 font-semibold text-foreground">{item.title}</div>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.detail}</p>
      <div className="mt-3 text-xs font-semibold text-primary">{item.nextAction}</div>
      <ProvenanceLinks className="mt-3" {...missionProvenance(item.sourceReference)} />
    </MissionCardShell>
  );
}

function MissionActivityCard({ item }: { item: MissionControlAgentActivityDto }) {
  return (
    <MissionCardShell>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={item.currentState} />
        <span className="text-xs text-muted-foreground">{item.agentName}</span>
      </div>
      <div className="mt-2 font-semibold text-foreground">{item.title}</div>
      {item.detail && <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.detail}</p>}
      <div className="mt-3 text-xs font-semibold text-primary">{item.nextAction}</div>
      <ProvenanceLinks className="mt-3" {...missionProvenance(item.sourceReference)} generatedBy={item.role ?? undefined} />
    </MissionCardShell>
  );
}

// ── Metric card (kept: reused by LivingLoopDashboardCard) ──────────────────────

function MetricReviewCard({ title, value, to, reviewLabel = "Open source", description, trend, icon: Icon, className }: { title: string; value: React.ReactNode; to: string; reviewLabel?: string; description?: string; trend?: { value: string; isPositive: boolean }; icon?: typeof Activity; className?: string }) {
  return (
    <Link
      to={to}
      className={cn(
        "group block rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/45 hover:bg-muted/20",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="text-xs font-medium text-muted-foreground">{title}</div>
        {Icon && <Icon className="h-4 w-4 text-primary/70" />}
      </div>
      <div className="mt-3 flex flex-wrap items-baseline gap-2">
        <div data-metric-value className="text-3xl font-semibold tabular-nums text-foreground">{value}</div>
        {trend && <div className={cn("text-xs font-semibold", trend.isPositive ? "text-emerald-500" : "text-red-500")}>{trend.value}</div>}
      </div>
      {description && <div className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</div>}
      <div className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-primary group-hover:underline">
        {reviewLabel}
        <ArrowRight className="h-3.5 w-3.5" />
      </div>
    </Link>
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
  const [status, setStatus] = useState<{ pending: number; highCritical: number; runnerIssues: number; providerIssues: number; lastRun: string | null; contextRepairEnabled: boolean; contextRepairsToday: number; contextRepairsLastRun: number; autoValidationToday: number; validationFailures: number; autoSandboxPatchToday: number; patchesPendingReview: number } | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.livingLoopStatus()
      .then(res => setStatus({
        pending: res.status.pendingCandidates,
        highCritical: res.status.highCriticalCandidates,
        runnerIssues: res.status.runnerIssues,
        providerIssues: res.status.providerIssues,
        lastRun: res.status.lastResult,
        contextRepairEnabled: res.status.autoContextRepair?.enabled ?? false,
        contextRepairsToday: res.status.autoContextRepair?.dailyCount ?? 0,
        contextRepairsLastRun: res.status.autoContextRepair?.repairedLastRun ?? 0,
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
        <MetricReviewCard title="Context Repairs Today" value={status.contextRepairsToday} to="/living-loop" trend={{ value: status.contextRepairEnabled ? "Enabled" : "Disabled", isPositive: status.contextRepairEnabled }} />
        <MetricReviewCard title="Repaired Last Run" value={status.contextRepairsLastRun} to="/living-loop" />
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
  const tk = useTk();
  const user = useAuthStore((state) => state.user);
  const canCommand = user?.role === "KING" || user?.role === "CROWN_PRINCE" || user?.role === "MINISTER";

  const [missionControl, setMissionControl] = useState<MissionControlDto | null>(null);
  const [health, setHealth] = useState<KingdomHealthDto | null>(null);
  const [activity, setActivity] = useState<KingdomActivityStreamDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    Promise.all([
      api.getMissionControl().catch(() => null),
      api.getKingdomHealth().catch(() => null),
      api.getKingdomActivity(8).catch(() => null)
    ])
      .then(([missionRes, healthRes, activityRes]) => {
        if (cancelled) return;
        setMissionControl(missionRes);
        setHealth(healthRes);
        setActivity(activityRes);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  if (isLoading) {
    return <LoadingState message={tk("dashboard.loading")} className="min-h-[60vh]" />;
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={tk("dashboard.eyebrow")}
        title={tk("dashboard.title")}
        description={tk("dashboard.description")}
        action={canCommand ? (
          <Link to="/throne-room?view=command">
            <Button className="gap-2">
              <Scroll className="h-4 w-4" />
              {tk("dashboard.issueDecree")}
            </Button>
          </Link>
        ) : undefined}
      />

      <MissionControlPanel missionControl={missionControl} />

      {health && <KingdomHealthStrip health={health} />}

      <SectionCard
        title={tk("dashboard.activityStream")}
        icon={Activity}
        action={<Link to="/kingdom/operations" className="text-xs font-semibold text-primary hover:underline">{tk("dashboard.operationsCenter")}</Link>}
      >
        <KingdomActivityFeed activities={activity?.activities ?? []} limit={8} />
      </SectionCard>
    </div>
  );
}
