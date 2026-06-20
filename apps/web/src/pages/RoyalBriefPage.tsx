import { Activity, AlertTriangle, Archive, CheckCircle2, Clock, Cpu, Crown, ExternalLink, FileWarning, Scroll, Shield, Sparkles, Vault, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AgentPortrait } from "@/components/AgentPortrait";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatCard } from "@/components/ui/StatCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { api } from "@/lib/api";
import { useTk } from "@/lib/i18n";
import { cn, formatDate } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import type { LivingAgentDigestEntryDto, RoyalBriefDecision, RoyalBriefDto, RoyalBriefHighlight } from "@/types/api";

const RISK_COLORS: Record<string, string> = {
  CRITICAL: "border-destructive/50 bg-destructive/10 text-destructive",
  HIGH: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  MEDIUM: "border-primary/30 bg-primary/10 text-primary",
  LOW: "border-border bg-muted/20 text-muted-foreground"
};

const DIGEST_STATUS_COLORS: Record<LivingAgentDigestEntryDto["status"], string> = {
  IDLE: "border-border bg-muted/20 text-muted-foreground",
  THINKING: "border-blue-500/40 bg-blue-500/10 text-blue-400",
  EXECUTING: "border-primary/30 bg-primary/10 text-primary",
  WAITING_REVIEW: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  BLOCKED: "border-destructive/50 bg-destructive/10 text-destructive"
};

function RiskBadge({ riskLevel }: { riskLevel: string }) {
  const tk = useTk();
  return (
    <span title={riskLevel} className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider", RISK_COLORS[riskLevel] ?? RISK_COLORS.LOW)}>
      {tk(`riskTag.${riskLevel}`)}
    </span>
  );
}

function DecisionCard({ decision }: { decision: RoyalBriefDecision }) {
  const tk = useTk();
  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/10 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h4 className="min-w-0 flex-1 text-sm font-semibold leading-5 text-foreground">{decision.title}</h4>
        <RiskBadge riskLevel={decision.riskLevel} />
      </div>
      <p className="text-sm leading-6 text-muted-foreground">{decision.why}</p>
      <p className="text-xs leading-5 text-muted-foreground"><span className="font-semibold text-foreground">{tk("royalBrief.recommended")}</span> {decision.recommendedAction}</p>
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {decision.availableActions.map((action) => (
          <span key={action} title={action} className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">{action}</span>
        ))}
        <a href={decision.sourceLink} className="ml-auto text-xs font-semibold text-primary hover:underline">{tk("royalBrief.view")}</a>
      </div>
    </div>
  );
}

function HighlightRow({ highlight }: { highlight: RoyalBriefHighlight }) {
  return (
    <div className="flex items-start gap-3 px-1 py-3">
      <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary/70" />
      <div>
        <div className="text-sm font-semibold text-foreground">{highlight.title}</div>
        <div className="text-sm text-muted-foreground">{highlight.detail}</div>
      </div>
    </div>
  );
}

function AgentDigestCard({ entry }: { entry: LivingAgentDigestEntryDto }) {
  const tk = useTk();
  return (
    <div className="flex items-center gap-4 rounded-lg border border-border bg-muted/10 p-4">
      <AgentPortrait agent={{ slug: entry.slug, name: entry.displayName, title: entry.displayTitle, avatarUrl: entry.avatarUrl }} size="sm" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h4 className="truncate text-sm font-semibold text-foreground">{entry.displayName}</h4>
          <span title={entry.status} className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider", DIGEST_STATUS_COLORS[entry.status])}>{tk(`royalBrief.digestStatus.${entry.status}`)}</span>
        </div>
        <div className="text-xs text-muted-foreground truncate">{entry.displayTitle} · {entry.role}</div>
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-4">
          <span>{tk("royalBrief.digest.proposed")} <span className="text-foreground font-semibold">{entry.actionsProposed}</span></span>
          <span>{tk("royalBrief.digest.jobs")} <span className="text-foreground font-semibold">{entry.jobsExecuted}</span></span>
          <span>{tk("royalBrief.digest.reports")} <span className="text-foreground font-semibold">{entry.reportsProduced}</span></span>
          <span>{tk("royalBrief.digest.failures")} <span className="text-foreground font-semibold">{entry.failures}</span></span>
        </div>
      </div>
    </div>
  );
}

function SectionSourceLink({ to }: { to: string }) {
  const tk = useTk();
  return (
    <Link to={to} className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline">
      <ExternalLink className="h-3.5 w-3.5" />
      {tk("provenance.source")}
    </Link>
  );
}

export function RoyalBriefPage() {
  const [brief, setBrief] = useState<RoyalBriefDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [showProvenance, setShowProvenance] = useState(false);
  const [repairingContextId, setRepairingContextId] = useState<string | null>(null);
  const [repairMessage, setRepairMessage] = useState<string | null>(null);
  const [reconciling, setReconciling] = useState(false);
  const [reconcileMessage, setReconcileMessage] = useState<string | null>(null);
  const user = useAuthStore((state) => state.user);
  const tk = useTk();
  const canRepair = user?.role === "KING" || user?.role === "CROWN_PRINCE";

  async function repairWorkOrderContext(workOrderId: string) {
    if (!canRepair) return;
    setRepairingContextId(workOrderId);
    setRepairMessage(null);
    try {
      const res = await api.rebindWorkOrderContext(workOrderId);
      const r = res.result;
      if (r.status === "SKIPPED") {
        setRepairMessage(`Skipped — work order has no linked project.`);
      } else {
        setRepairMessage(`Context rebound: ${r.previousStatus} → ${r.newStatus ?? "—"}`);
      }
    } catch {
      setRepairMessage("Repair failed. Try again or scan local docs first.");
    } finally {
      setRepairingContextId(null);
    }
  }

  async function reconcileOldWorkOrders() {
    if (!canRepair) return;
    setReconciling(true);
    setReconcileMessage(null);
    try {
      const res = await api.reconcileContextWarnings();
      const r = res.result;
      const parts: string[] = [];
      if (r.archived > 0) parts.push(`${r.archived} archived`);
      if (r.contextRepaired > 0) parts.push(`${r.contextRepaired} context repaired`);
      if (r.skipped > 0) parts.push(`${r.skipped} skipped`);
      setReconcileMessage(
        r.totalInspected === 0
          ? "No stale work orders found — context health is clean."
          : `Reconciled ${r.totalInspected} work order(s): ${parts.join(", ") || "no changes"}.`
      );
    } catch {
      setReconcileMessage("Reconcile failed. Try again.");
    } finally {
      setReconciling(false);
    }
  }

  useEffect(() => {
    api.latestRoyalBrief()
      .then((res) => setBrief(res.brief))
      .catch(() => { /* ignore */ })
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

  if (loading) {
    return <LoadingState message={tk("royalBrief.loading")} className="min-h-[60vh]" />;
  }

  if (!brief) {
    return (
      <div className="space-y-8">
        <PageHeader eyebrow={tk("royalBrief.eyebrow")} title={tk("royalBrief.title")} description={tk("royalBrief.description")} />
        <EmptyState
          icon={Scroll}
          title={tk("royalBrief.emptyTitle")}
          description={tk("royalBrief.emptyDescription")}
          action={user?.role === "KING" ? (
            <Button onClick={generateNow} disabled={generating}>{generating ? tk("royalBrief.generating") : tk("royalBrief.generateNow")}</Button>
          ) : undefined}
        />
      </div>
    );
  }

  const livingLoop = brief.livingLoopSummary as Record<string, any>;
  const validation = brief.validationSummary as Record<string, any>;
  const patch = brief.patchSummary as Record<string, any>;
  const provider = brief.providerSummary as Record<string, any>;
  const treasury = brief.treasurySummary as Record<string, any>;
  const memory = brief.memorySummary as Record<string, any>;
  const runner = brief.runnerStatus as Record<string, any>;
  const contextHealth = (brief.contextHealthSummary ?? {}) as Record<string, any>;
  const decisions = brief.decisionsNeeded.items;
  const highlights = brief.highlights.items;
  const digest = brief.livingAgentDigest.items;

  return (
    <div className="space-y-6 animate-in fade-in duration-500 slide-in-from-bottom-4">
      <PageHeader
        eyebrow={tk("royalBrief.eyebrow")}
        title={tk("royalBrief.title")}
        description={tk("royalBrief.description")}
        action={user?.role === "KING" ? (
          <Button onClick={generateNow} disabled={generating}>{generating ? tk("royalBrief.generating") : tk("royalBrief.generateNow")}</Button>
        ) : undefined}
      />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]" data-testid="royal-brief-layout">
        <main className="min-w-0 space-y-6" data-testid="royal-brief-document">
          {/* 1. Today's Summary */}
          <SectionCard
            title={tk("royalBrief.section.summary")}
            icon={Crown}
            className="bg-card/70"
            contentClassName="p-6 sm:p-8"
            action={(
              <div className="text-right text-xs text-muted-foreground">
                <time dateTime={brief.briefDate}>{formatDate(brief.briefDate)}</time>
                <div className="mt-1 text-[10px]">{formatDate(brief.createdAt)}</div>
              </div>
            )}
          >
            <p className="text-sm leading-7 text-foreground sm:text-base">{brief.summary}</p>
          </SectionCard>

      {/* 2. What the Kingdom did */}
      <SectionCard title={tk("royalBrief.section.didTitle")} icon={CheckCircle2}>
        {highlights.length > 0 ? (
          <div className="divide-y divide-border/60">
            {highlights.map((h, i) => <HighlightRow key={i} highlight={h} />)}
          </div>
        ) : (
          <EmptyState title={tk("royalBrief.empty.activityTitle")} description={tk("royalBrief.empty.activityDesc")} />
        )}
      </SectionCard>

      {/* 3. What the Kingdom blocked/skipped and why */}
      <SectionCard title={tk("royalBrief.section.blocked")} icon={FileWarning}>
        {livingLoop.lastRun ? (
          <div className="space-y-2 text-sm">
            <div className="text-muted-foreground">
              {tk("royalBrief.lastLoopRun")}{" "}
              <span title={livingLoop.lastRun.status} className="font-semibold text-foreground">{tk(`runStatus.${livingLoop.lastRun.status}`)}</span>{" "}
              (<span title={livingLoop.lastRun.triggerType}>{tk(`livingLoop.trigger.${livingLoop.lastRun.triggerType}`)}</span>)
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard className="bg-transparent border-none p-0" title={tk("royalBrief.stat.pending")} value={livingLoop.candidatesPending} />
              <StatCard className="bg-transparent border-none p-0" title={tk("royalBrief.stat.applied")} value={livingLoop.candidatesApplied} />
              <StatCard className="bg-transparent border-none p-0" title={tk("royalBrief.stat.rejected")} value={livingLoop.candidatesRejected} />
              <StatCard className="bg-transparent border-none p-0" title={tk("royalBrief.stat.archived")} value={livingLoop.candidatesArchived} />
            </div>
          </div>
        ) : (
          <EmptyState title={tk("royalBrief.empty.loopTitle")} description={tk("royalBrief.empty.loopDesc")} />
        )}
      </SectionCard>

      {/* 5. Runner and automation status */}
      <SectionCard title={tk("royalBrief.section.runner")} icon={Cpu} action={<SectionSourceLink to="/automation-jobs" />}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-4">
          <StatCard className="bg-transparent border-none p-0" title={tk("royalBrief.stat.online")} value={runner.onlineCount} />
          <StatCard className="bg-transparent border-none p-0" title={tk("royalBrief.stat.offline")} value={runner.offlineCount} trend={runner.offlineCount > 0 ? { value: tk("royalBrief.trend.check"), isPositive: false } : undefined} />
          <StatCard className="bg-transparent border-none p-0" title={tk("royalBrief.stat.error")} value={runner.errorCount} trend={runner.errorCount > 0 ? { value: tk("royalBrief.trend.check"), isPositive: false } : undefined} />
          <StatCard className="bg-transparent border-none p-0" title={tk("royalBrief.stat.stale")} value={runner.staleCount} />
        </div>
        {runner.runners.length > 0 ? (
          <div className="space-y-2">
            {runner.runners.map((r: any) => (
              <div key={r.id} className="flex items-center justify-between rounded-lg border border-border/60 bg-card/30 px-4 py-2 text-sm">
                <span className="font-semibold text-foreground">{r.name}</span>
                <span className="text-xs text-muted-foreground"><span title={r.status}>{tk(`runnerStatus.${r.status}`)}</span>{r.isStale ? tk("royalBrief.staleSuffix") : ""} · {tk("royalBrief.lastHeartbeat")} {r.lastHeartbeatAt ? formatDate(r.lastHeartbeatAt) : tk("royalBrief.never")}</span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title={tk("royalBrief.empty.runnersTitle")} description={tk("royalBrief.empty.runnersDesc")} />
        )}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard className="bg-transparent border-none p-0" title={tk("royalBrief.stat.validationCreated")} value={validation.jobsCreated} />
          <StatCard className="bg-transparent border-none p-0" title={tk("royalBrief.stat.validationFailed")} value={validation.jobsFailed} trend={validation.jobsFailed > 0 ? { value: tk("royalBrief.trend.review"), isPositive: false } : undefined} />
          <StatCard className="bg-transparent border-none p-0" title={tk("royalBrief.stat.autoValidationToday")} value={validation.autoValidation?.dailyCount ?? 0} description={tk("royalBrief.limit", { n: validation.autoValidation?.dailyLimit ?? 0 })} />
          <StatCard className="bg-transparent border-none p-0" title={tk("royalBrief.stat.autoPatchToday")} value={patch.autoSandboxPatch?.dailyCount ?? 0} description={tk("royalBrief.limit", { n: patch.autoSandboxPatch?.dailyLimit ?? 0 })} />
        </div>
      </SectionCard>

      {/* 5b. Context binding health (M17E-2) */}
      <SectionCard title={tk("royalBrief.section.context")} icon={Shield} action={<SectionSourceLink to="/work-orders" />}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-4">
          <StatCard className="bg-transparent border-none p-0" title={tk("royalBrief.stat.wosBlocked")} value={contextHealth.workOrdersBlockedByContext?.length ?? 0} trend={(contextHealth.workOrdersBlockedByContext?.length ?? 0) > 0 ? { value: tk("royalBrief.trend.refresh"), isPositive: false } : undefined} />
          <StatCard className="bg-transparent border-none p-0" title={tk("royalBrief.stat.autoJobsSkipped")} value={contextHealth.autoJobsSkippedForContext ?? 0} />
          <StatCard className="bg-transparent border-none p-0" title={tk("royalBrief.stat.stalePatches")} value={contextHealth.patchesWithStaleBaseContext?.length ?? 0} />
          <StatCard className="bg-transparent border-none p-0" title={tk("royalBrief.stat.projectsRefresh")} value={contextHealth.projectsNeedingContextRefresh?.length ?? 0} />
        </div>
        {reconcileMessage && (
          <div className="mb-3 rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2 text-xs text-green-400">{reconcileMessage}</div>
        )}
        {repairMessage && (
          <div className="mb-3 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-primary">{repairMessage}</div>
        )}
        {(contextHealth.workOrdersBlockedByContext?.length ?? 0) > 0 ? (
          <div className="space-y-2">
            {canRepair && (
              <div className="flex justify-end mb-1">
                <button
                  type="button"
                  disabled={reconciling}
                  onClick={() => void reconcileOldWorkOrders()}
                  className="text-xs font-semibold text-muted-foreground underline hover:text-foreground disabled:opacity-50"
                >
                  {reconciling ? tk("royalBrief.reconciling") : tk("royalBrief.reconcile")}
                </button>
              </div>
            )}
            {contextHealth.workOrdersBlockedByContext.map((w: any) => (
              <div key={w.id} className="flex items-center justify-between rounded-lg border border-border/60 bg-card/30 px-4 py-2 text-sm">
                <span className="font-semibold text-foreground">{w.title}</span>
                <div className="flex items-center gap-3">
                  <span title={w.contextBindingStatus} className="text-xs text-amber-400">{tk(`contextBinding.${w.contextBindingStatus}`)} {tk("royalBrief.contextWord")} · {w.projectName}</span>
                  {canRepair && (
                    <button
                      type="button"
                      disabled={repairingContextId === w.id}
                      onClick={() => void repairWorkOrderContext(w.id)}
                      className="text-xs font-semibold text-primary underline hover:text-primary/80 disabled:opacity-50"
                    >
                      {repairingContextId === w.id ? tk("royalBrief.repairing") : tk("royalBrief.repairContext")}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={CheckCircle2} title={tk("royalBrief.empty.contextTitle")} description={tk("royalBrief.empty.contextDesc")} />
        )}
        {(contextHealth.contextSkippedReasons?.length ?? 0) > 0 && (
          <div className="mt-3 rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-3 text-[11px] text-cyan-400">
            <div className="mb-1 font-semibold uppercase tracking-wider">{tk("royalBrief.contextSkipsTitle")}</div>
            <ul className="space-y-0.5">
              {contextHealth.contextSkippedReasons.map((r: string, i: number) => <li key={i}>{r}</li>)}
            </ul>
          </div>
        )}
      </SectionCard>

      {/* 6. Patch review queue */}
      <SectionCard title={tk("royalBrief.section.patch")} icon={Zap} action={<SectionSourceLink to="/automation-jobs" />}>
        {patch.patchesNeedingReview.length > 0 ? (
          <div className="space-y-2">
            {patch.patchesNeedingReview.map((p: any) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg border border-border/60 bg-card/30 px-4 py-2 text-sm">
                <span className="font-semibold text-foreground">{p.title}</span>
                <div className="flex items-center gap-2">
                  <RiskBadge riskLevel={p.riskLevel} />
                  <span title={p.validationStatus} className="text-xs text-muted-foreground">{tk(`patchValidation.${p.validationStatus}`)}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={CheckCircle2} title={tk("royalBrief.empty.patchTitle")} description={tk("royalBrief.empty.patchDesc")} />
        )}
      </SectionCard>

      {/* 7. Provider and treasury status */}
      <SectionCard title={tk("royalBrief.section.provider")} icon={Vault} action={<SectionSourceLink to="/providers" />}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 mb-4">
          <StatCard className="bg-transparent border-none p-0" title={tk("royalBrief.stat.spend24h")} value={`$${(treasury.totalCostUSD ?? 0).toFixed(4)}`} trend={treasury.overDailyBudget ? { value: tk("royalBrief.trend.overBudget"), isPositive: false } : undefined} />
          <StatCard className="bg-transparent border-none p-0" title={tk("royalBrief.stat.dailyBudget")} value={treasury.dailyBudgetLimitUSD !== null ? `$${treasury.dailyBudgetLimitUSD}` : tk("royalBrief.unlimited")} />
          <StatCard className="bg-transparent border-none p-0" title={tk("royalBrief.stat.monthlyBudget")} value={treasury.monthlyBudgetLimitUSD !== null ? `$${treasury.monthlyBudgetLimitUSD}` : tk("royalBrief.unlimited")} />
        </div>
        {provider.summary?.length > 0 ? (
          <div className="space-y-2">
            {provider.summary.map((p: any, i: number) => (
              <div key={i} className="flex items-center justify-between rounded-lg border border-border/60 bg-card/30 px-4 py-2 text-sm">
                <span className="font-semibold text-foreground">{p.providerType}{p.providerId ? ` (${p.providerId})` : ""}</span>
                <span className="text-xs text-muted-foreground"><span title={p.healthStatus}>{tk(`providerHealth.${p.healthStatus}`)}</span> · {tk("royalBrief.metric.failure")} {(p.failureRate ?? 0) * 100}% · {tk("royalBrief.metric.timeout")} {(p.timeoutRate ?? 0) * 100}% · {tk("royalBrief.metric.sample")} {p.sampleSize}</span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title={tk("royalBrief.empty.providerTitle")} description={tk("royalBrief.empty.providerDesc")} />
        )}
      </SectionCard>

      {/* 8. Living Agent Activity Digest */}
      <SectionCard title={tk("royalBrief.section.digest")} icon={Shield} action={<SectionSourceLink to="/living-agents" />}>
        {digest.length > 0 ? (
          <div className="grid gap-3 xl:grid-cols-2">
            {digest.map((entry) => <AgentDigestCard key={entry.agentId} entry={entry} />)}
          </div>
        ) : (
          <EmptyState title={tk("royalBrief.empty.digestTitle")} description={tk("royalBrief.empty.digestDesc")} />
        )}
      </SectionCard>

      {/* 9. Provenance details */}
      <SectionCard
        title={tk("royalBrief.section.provenance")}
        icon={Clock}
        action={<Button variant="outline" className="h-8 text-xs" onClick={() => setShowProvenance((v) => !v)}>{showProvenance ? tk("royalBrief.hide") : tk("royalBrief.show")} {tk("royalBrief.details")}</Button>}
      >
        {showProvenance ? (
          <pre className="max-h-96 overflow-auto rounded-lg border border-border/60 bg-card/30 p-4 text-xs text-muted-foreground">{JSON.stringify(brief.provenance, null, 2)}</pre>
        ) : (
          <p className="text-sm text-muted-foreground">{tk("royalBrief.provenanceDesc", { count: (brief.provenance as any).sources?.length ?? 0, hours: (brief.provenance as any).windowHours ?? 24, date: formatDate(brief.createdAt) })}</p>
        )}
      </SectionCard>
        </main>

        <aside className="order-first space-y-4 xl:order-none xl:sticky xl:top-6" data-testid="royal-brief-decision-rail">
          <SectionCard
            title={tk("royalBrief.section.decisions")}
            icon={AlertTriangle}
            contentClassName="p-3"
            action={<span className="text-xs font-semibold tabular-nums text-muted-foreground">{tk("royalBrief.decisionsPending", { count: decisions.length })}</span>}
          >
            {decisions.length > 0 ? (
              <div className="space-y-3">
                {decisions.map((decision) => <DecisionCard key={decision.id} decision={decision} />)}
              </div>
            ) : (
              <EmptyState icon={CheckCircle2} title={tk("royalBrief.empty.decisionsTitle")} description={tk("royalBrief.empty.decisionsDesc")} />
            )}
          </SectionCard>
        </aside>
      </div>
    </div>
  );
}
