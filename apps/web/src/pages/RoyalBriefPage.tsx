import { Activity, AlertTriangle, Archive, CheckCircle2, Clock, Cpu, Crown, FileWarning, Scroll, Shield, Sparkles, Vault, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { AgentPortrait } from "@/components/AgentPortrait";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatCard } from "@/components/ui/StatCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { api } from "@/lib/api";
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
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider", RISK_COLORS[riskLevel] ?? RISK_COLORS.LOW)}>
      {riskLevel}
    </span>
  );
}

function DecisionCard({ decision }: { decision: RoyalBriefDecision }) {
  return (
    <div className="rounded-xl border border-border bg-card/40 p-4 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h4 className="font-display text-sm text-foreground">{decision.title}</h4>
        <RiskBadge riskLevel={decision.riskLevel} />
      </div>
      <p className="text-sm text-muted-foreground">{decision.why}</p>
      <p className="text-xs text-muted-foreground"><span className="font-semibold text-foreground">Recommended:</span> {decision.recommendedAction}</p>
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {decision.availableActions.map((action) => (
          <span key={action} className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">{action}</span>
        ))}
        <a href={decision.sourceLink} className="ml-auto text-xs font-semibold uppercase tracking-wider text-primary hover:underline">View</a>
      </div>
    </div>
  );
}

function HighlightRow({ highlight }: { highlight: RoyalBriefHighlight }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-card/30 px-4 py-3">
      <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary/70" />
      <div>
        <div className="text-sm font-semibold text-foreground">{highlight.title}</div>
        <div className="text-sm text-muted-foreground">{highlight.detail}</div>
      </div>
    </div>
  );
}

function AgentDigestCard({ entry }: { entry: LivingAgentDigestEntryDto }) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-border bg-card/40 p-4">
      <AgentPortrait agent={{ slug: entry.slug, name: entry.displayName, title: entry.displayTitle, avatarUrl: entry.avatarUrl }} size="sm" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h4 className="font-display text-sm text-foreground truncate">{entry.displayName}</h4>
          <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider", DIGEST_STATUS_COLORS[entry.status])}>{entry.status}</span>
        </div>
        <div className="text-xs text-muted-foreground truncate">{entry.displayTitle} · {entry.role}</div>
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-4">
          <span>Proposed: <span className="text-foreground font-semibold">{entry.actionsProposed}</span></span>
          <span>Jobs: <span className="text-foreground font-semibold">{entry.jobsExecuted}</span></span>
          <span>Reports: <span className="text-foreground font-semibold">{entry.reportsProduced}</span></span>
          <span>Failures: <span className="text-foreground font-semibold">{entry.failures}</span></span>
        </div>
      </div>
    </div>
  );
}

export function RoyalBriefPage() {
  const [brief, setBrief] = useState<RoyalBriefDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [showProvenance, setShowProvenance] = useState(false);
  const user = useAuthStore((state) => state.user);

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
    return <LoadingState message="Gathering the Daily Royal Brief..." className="min-h-[60vh]" />;
  }

  if (!brief) {
    return (
      <div className="space-y-8">
        <PageHeader eyebrow="Royal Brief" title="Daily Royal Brief" description="A daily summary of what the Kingdom observed, did, blocked, and needs your decision on." />
        <EmptyState
          icon={Scroll}
          title="No Royal Brief Yet"
          description="Generate the first Daily Royal Brief to see a summary of Kingdom activity."
          action={user?.role === "KING" ? (
            <Button onClick={generateNow} disabled={generating}>{generating ? "Generating..." : "Generate Now"}</Button>
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
  const decisions = brief.decisionsNeeded.items;
  const highlights = brief.highlights.items;
  const digest = brief.livingAgentDigest.items;

  return (
    <div className="space-y-8 animate-in fade-in duration-500 slide-in-from-bottom-4">
      <PageHeader
        eyebrow="Royal Brief"
        title="Daily Royal Brief"
        description="A daily summary of what the Kingdom observed, did, blocked, and needs your decision on."
        action={user?.role === "KING" ? (
          <Button onClick={generateNow} disabled={generating}>{generating ? "Generating..." : "Generate Now"}</Button>
        ) : undefined}
      />

      {/* 1. Today's Summary */}
      <SectionCard title="Today's Summary" icon={Crown} action={<span className="text-xs text-muted-foreground">{formatDate(brief.briefDate)}</span>}>
        <p className="text-sm text-foreground">{brief.summary}</p>
      </SectionCard>

      {/* 2. What the Kingdom did */}
      <SectionCard title="What the Kingdom Did" icon={CheckCircle2}>
        {highlights.length > 0 ? (
          <div className="space-y-3">
            {highlights.map((h, i) => <HighlightRow key={i} highlight={h} />)}
          </div>
        ) : (
          <EmptyState title="No Activity" description="No notable activity in the last 24 hours." />
        )}
      </SectionCard>

      {/* 3. What the Kingdom blocked/skipped and why */}
      <SectionCard title="Blocked or Skipped" icon={FileWarning}>
        {livingLoop.lastRun ? (
          <div className="space-y-2 text-sm">
            <div className="text-muted-foreground">Last Living Loop run: <span className="text-foreground font-semibold">{livingLoop.lastRun.status}</span> ({livingLoop.lastRun.triggerType})</div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard className="bg-transparent border-none p-0" title="Pending" value={livingLoop.candidatesPending} />
              <StatCard className="bg-transparent border-none p-0" title="Applied" value={livingLoop.candidatesApplied} />
              <StatCard className="bg-transparent border-none p-0" title="Rejected" value={livingLoop.candidatesRejected} />
              <StatCard className="bg-transparent border-none p-0" title="Archived" value={livingLoop.candidatesArchived} />
            </div>
          </div>
        ) : (
          <EmptyState title="No Living Loop Runs" description="The Living Loop has not run in the observation window." />
        )}
      </SectionCard>

      {/* 4. Decisions needed from the King */}
      <SectionCard title="Decisions Needed" icon={AlertTriangle} action={<span className="text-xs uppercase tracking-widest text-muted-foreground font-bold">{decisions.length} pending</span>}>
        {decisions.length > 0 ? (
          <div className="grid gap-3 xl:grid-cols-2">
            {decisions.map((d) => <DecisionCard key={d.id} decision={d} />)}
          </div>
        ) : (
          <EmptyState icon={CheckCircle2} title="Nothing Needs Your Attention" description="No outstanding decisions right now." />
        )}
      </SectionCard>

      {/* 5. Runner and automation status */}
      <SectionCard title="Runner & Automation Status" icon={Cpu}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-4">
          <StatCard className="bg-transparent border-none p-0" title="Online" value={runner.onlineCount} />
          <StatCard className="bg-transparent border-none p-0" title="Offline" value={runner.offlineCount} trend={runner.offlineCount > 0 ? { value: "Check", isPositive: false } : undefined} />
          <StatCard className="bg-transparent border-none p-0" title="Error" value={runner.errorCount} trend={runner.errorCount > 0 ? { value: "Check", isPositive: false } : undefined} />
          <StatCard className="bg-transparent border-none p-0" title="Stale" value={runner.staleCount} />
        </div>
        {runner.runners.length > 0 ? (
          <div className="space-y-2">
            {runner.runners.map((r: any) => (
              <div key={r.id} className="flex items-center justify-between rounded-lg border border-border/60 bg-card/30 px-4 py-2 text-sm">
                <span className="font-semibold text-foreground">{r.name}</span>
                <span className="text-xs text-muted-foreground">{r.status}{r.isStale ? " · stale" : ""} · last heartbeat {r.lastHeartbeatAt ? formatDate(r.lastHeartbeatAt) : "never"}</span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="No Runners Registered" description="No agent runners have been registered yet." />
        )}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard className="bg-transparent border-none p-0" title="Validation Jobs Created" value={validation.jobsCreated} />
          <StatCard className="bg-transparent border-none p-0" title="Validation Failed" value={validation.jobsFailed} trend={validation.jobsFailed > 0 ? { value: "Review", isPositive: false } : undefined} />
          <StatCard className="bg-transparent border-none p-0" title="Auto Validation Today" value={validation.autoValidation?.dailyCount ?? 0} description={`limit ${validation.autoValidation?.dailyLimit ?? 0}`} />
          <StatCard className="bg-transparent border-none p-0" title="Auto Patch Today" value={patch.autoSandboxPatch?.dailyCount ?? 0} description={`limit ${patch.autoSandboxPatch?.dailyLimit ?? 0}`} />
        </div>
      </SectionCard>

      {/* 6. Patch review queue */}
      <SectionCard title="Patch Review Queue" icon={Zap}>
        {patch.patchesNeedingReview.length > 0 ? (
          <div className="space-y-2">
            {patch.patchesNeedingReview.map((p: any) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg border border-border/60 bg-card/30 px-4 py-2 text-sm">
                <span className="font-semibold text-foreground">{p.title}</span>
                <div className="flex items-center gap-2">
                  <RiskBadge riskLevel={p.riskLevel} />
                  <span className="text-xs text-muted-foreground">{p.validationStatus}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={CheckCircle2} title="Patch Queue Clear" description="No patches are awaiting review." />
        )}
      </SectionCard>

      {/* 7. Provider and treasury status */}
      <SectionCard title="Provider & Treasury Status" icon={Vault}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 mb-4">
          <StatCard className="bg-transparent border-none p-0" title="Spend (24h)" value={`$${(treasury.totalCostUSD ?? 0).toFixed(4)}`} trend={treasury.overDailyBudget ? { value: "Over Budget", isPositive: false } : undefined} />
          <StatCard className="bg-transparent border-none p-0" title="Daily Budget" value={treasury.dailyBudgetLimitUSD !== null ? `$${treasury.dailyBudgetLimitUSD}` : "Unlimited"} />
          <StatCard className="bg-transparent border-none p-0" title="Monthly Budget" value={treasury.monthlyBudgetLimitUSD !== null ? `$${treasury.monthlyBudgetLimitUSD}` : "Unlimited"} />
        </div>
        {provider.summary?.length > 0 ? (
          <div className="space-y-2">
            {provider.summary.map((p: any, i: number) => (
              <div key={i} className="flex items-center justify-between rounded-lg border border-border/60 bg-card/30 px-4 py-2 text-sm">
                <span className="font-semibold text-foreground">{p.providerType}{p.providerId ? ` (${p.providerId})` : ""}</span>
                <span className="text-xs text-muted-foreground">{p.healthStatus} · failure {(p.failureRate ?? 0) * 100}% · timeout {(p.timeoutRate ?? 0) * 100}% · sample {p.sampleSize}</span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="No Provider Health Data" description="No provider health snapshots recorded yet." />
        )}
      </SectionCard>

      {/* 8. Living Agent Activity Digest */}
      <SectionCard title="Living Agent Activity Digest" icon={Shield}>
        {digest.length > 0 ? (
          <div className="grid gap-3 xl:grid-cols-2">
            {digest.map((entry) => <AgentDigestCard key={entry.agentId} entry={entry} />)}
          </div>
        ) : (
          <EmptyState title="No Active Agents" description="No active agents found." />
        )}
      </SectionCard>

      {/* 9. Provenance details */}
      <SectionCard
        title="Provenance"
        icon={Clock}
        action={<Button variant="outline" className="h-8 text-xs" onClick={() => setShowProvenance((v) => !v)}>{showProvenance ? "Hide" : "Show"} Details</Button>}
      >
        {showProvenance ? (
          <pre className="max-h-96 overflow-auto rounded-lg border border-border/60 bg-card/30 p-4 text-xs text-muted-foreground">{JSON.stringify(brief.provenance, null, 2)}</pre>
        ) : (
          <p className="text-sm text-muted-foreground">This brief is generated from {(brief.provenance as any).sources?.length ?? 0} data sources covering the {(brief.provenance as any).windowHours ?? 24}-hour window ending {formatDate(brief.createdAt)}. Click "Show Details" to view raw provenance metadata.</p>
        )}
      </SectionCard>
    </div>
  );
}
