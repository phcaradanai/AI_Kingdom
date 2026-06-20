import { Activity, AlertTriangle, Archive, CheckCircle2, Clock, Cpu, Eye, RefreshCw, Settings as SettingsIcon, Shield, XCircle, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatCard } from "@/components/ui/StatCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { PageSection } from "@/components/ui/PageSection";
import { api } from "@/lib/api";
import { cn, formatDate } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import type { AutomationCandidateDto, AutomationCandidateKind, AutoValidationStatusDto, AutoSandboxPatchStatusDto, LivingLoopRunDto, LivingLoopStatusDto, SettingDto } from "@/types/api";

const LIVING_LOOP_SETTING_KEYS = [
  "LIVING_LOOP_ENABLED",
  "LIVING_LOOP_INTERVAL_MINUTES",
  "LIVING_LOOP_MIN_CONFIDENCE",
  "LIVING_LOOP_MAX_CANDIDATES_PER_RUN",
  "LIVING_LOOP_MAX_DAILY_CANDIDATES",
  "LIVING_LOOP_AUTO_CREATE_VALIDATION_JOBS",
  "LIVING_LOOP_MAX_DAILY_VALIDATION_JOBS",
  "LIVING_LOOP_VALIDATION_JOB_COOLDOWN_MINUTES",
  "LIVING_LOOP_AUTO_SANDBOX_PATCH",
  "LIVING_LOOP_MAX_DAILY_SANDBOX_PATCH_JOBS",
  "LIVING_LOOP_SANDBOX_PATCH_COOLDOWN_MINUTES",
  "LIVING_LOOP_AUTO_PATCH_MIN_CONFIDENCE",
  "LIVING_LOOP_ALLOW_BRANCH_PUSH",
  "LIVING_LOOP_ALLOW_PR_CREATE",
  "LIVING_LOOP_ALLOW_PAID_PROVIDERS"
];

const KIND_LABELS: Record<AutomationCandidateKind, { label: string; icon: typeof Shield; color: string }> = {
  WORK_ORDER_REVIEW: { label: "Work Order Review", icon: Eye, color: "text-blue-400 bg-blue-500/10 border-blue-500/30" },
  VALIDATION_JOB: { label: "Validation Job", icon: Activity, color: "text-purple-400 bg-purple-500/10 border-purple-500/30" },
  PATCH_REVIEW: { label: "Patch Review", icon: Zap, color: "text-amber-400 bg-amber-500/10 border-amber-500/30" },
  MEMORY_REVIEW: { label: "Memory Review", icon: Archive, color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" },
  CLEANUP_REVIEW: { label: "Cleanup Review", icon: Archive, color: "text-slate-400 bg-slate-500/10 border-slate-500/30" },
  PROVIDER_REVIEW: { label: "Provider Review", icon: Cpu, color: "text-red-400 bg-red-500/10 border-red-500/30" },
  PROJECT_REVIEW: { label: "Project Review", icon: Activity, color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30" },
  RUNNER_REVIEW: { label: "Runner Review", icon: Activity, color: "text-orange-400 bg-orange-500/10 border-orange-500/30" },
  SANDBOX_PATCH: { label: "Sandbox Patch", icon: Zap, color: "text-lime-400 bg-lime-500/10 border-lime-500/30" }
};

const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: "border-destructive/50 bg-destructive/10 text-destructive",
  HIGH: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  MEDIUM: "border-primary/30 bg-primary/10 text-primary",
  LOW: "border-border bg-muted/20 text-muted-foreground"
};

const RISK_COLORS: Record<string, string> = {
  CRITICAL: "text-destructive", HIGH: "text-amber-400", MEDIUM: "text-primary", LOW: "text-muted-foreground"
};

function KindBadge({ kind }: { kind: AutomationCandidateKind }) {
  const m = KIND_LABELS[kind]; const Icon = m.icon;
  return <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider", m.color)}><Icon className="h-3 w-3" />{m.label}</span>;
}

function autoValidationSkipNote(c: AutomationCandidateDto, autoValidation: AutoValidationStatusDto | null, lastRunSkippedReasons: string[] | null): string | null {
  if (c.kind !== "VALIDATION_JOB" || c.status !== "PENDING") return null;
  const matched = (lastRunSkippedReasons ?? []).find((r) => r.startsWith("AutoValidation:") && c.workOrderId && r.includes(c.workOrderId));
  if (matched) return matched.replace("AutoValidation:", "Not auto-created:");
  if (!autoValidation) return null;
  if (!autoValidation.enabled) return "Not auto-created: auto validation is disabled";
  if (autoValidation.dailyCount >= autoValidation.dailyLimit) return "Not auto-created: daily validation job limit reached";
  return null;
}

function autoSandboxPatchSkipNote(c: AutomationCandidateDto, autoPatch: AutoSandboxPatchStatusDto | null, lastRunSkippedReasons: string[] | null): string | null {
  if (c.kind !== "SANDBOX_PATCH" || c.status !== "PENDING") return null;
  const matched = (lastRunSkippedReasons ?? []).find((r) => r.startsWith("AutoSandboxPatch:") && c.workOrderId && r.includes(c.workOrderId));
  if (matched) return matched.replace("AutoSandboxPatch:", "Not auto-created:");
  if (!autoPatch) return null;
  if (!autoPatch.enabled) return "Not auto-created: auto sandbox patch is disabled";
  if (autoPatch.dailyCount >= autoPatch.dailyLimit) return "Not auto-created: daily sandbox patch job limit reached";
  return null;
}
function needsContextRefresh(c: AutomationCandidateDto): boolean {
  const action = c.proposedAction && typeof c.proposedAction === "object" ? (c.proposedAction as { action?: string }).action : undefined;
  return action === "bind_work_order_context" || action === "review_local_docs" || action === "review_local_docs_blocker";
}

function CandidateCard({ c, isKing, onAction, autoValidation, autoSandboxPatch, lastRunSkippedReasons }: { c: AutomationCandidateDto; isKing: boolean; onAction: (id: string, action: string) => void; autoValidation?: AutoValidationStatusDto | null; autoSandboxPatch?: AutoSandboxPatchStatusDto | null, lastRunSkippedReasons?: string[] | null }) {
  const canAct = isKing && c.status === "PENDING";
  const canApply = isKing && c.status === "APPROVED";
  const skipNote = autoValidationSkipNote(c, autoValidation ?? null, lastRunSkippedReasons ?? null) || autoSandboxPatchSkipNote(c, autoSandboxPatch ?? null, lastRunSkippedReasons ?? null);
  return (
    <div className="rounded-lg border border-border bg-card/70 p-4 transition-colors hover:border-primary/30">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <KindBadge kind={c.kind} />
            <span className={cn("inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider", PRIORITY_COLORS[c.priority])}>{c.priority}</span>
            <span className={cn("text-[10px] font-bold uppercase tracking-wider", RISK_COLORS[c.riskLevel])}>Risk: {c.riskLevel}</span>
            <span className="inline-flex items-center rounded-md border border-border/60 bg-muted/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{c.confidence}%</span>
          </div>
          <div className="font-semibold text-foreground">{c.title}</div>
          {needsContextRefresh(c) && (
            <div className="inline-flex items-center gap-1.5 rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-[11px] text-cyan-400">
              <Shield className="h-3 w-3" />Context refresh required before patching
            </div>
          )}
          <div className="text-sm text-muted-foreground line-clamp-2">{c.summary}</div>
          <div className="text-xs text-muted-foreground/75 italic">Reason: {c.reason}</div>
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer font-semibold text-primary/70 hover:text-primary">Provenance</summary>
            <pre className="mt-1 overflow-x-auto rounded-lg bg-muted/30 p-2 text-[10px]">{JSON.stringify(c.provenance, null, 2)}</pre>
          </details>
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer font-semibold text-primary/70 hover:text-primary">Proposed Action</summary>
            <pre className="mt-1 overflow-x-auto rounded-lg bg-muted/30 p-2 text-[10px]">{JSON.stringify(c.proposedAction, null, 2)}</pre>
          </details>
          {c.kind === "VALIDATION_JOB" && c.status === "APPLIED" && c.automationJobId && (
            <Link to="/automation-jobs" className="inline-flex items-center gap-1.5 rounded-md border border-purple-500/30 bg-purple-500/10 px-2 py-1 text-[11px] font-semibold text-purple-400 hover:border-purple-500/60">
              <Zap className="h-3 w-3" />Auto-created job: {c.automationJobId.slice(0, 8)}
            </Link>
          )}
          {skipNote && (
            <div className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-400">
              <AlertTriangle className="h-3 w-3" />{skipNote}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
            <span>Source: {c.sourceType}/{c.sourceId.slice(0, 8)}</span>
            <span>Status: {c.status}</span>
            <span>{formatDate(c.createdAt)}</span>
          </div>
        </div>
        {isKing && (
          <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col">
            {canAct && <><Button variant="outline" className="h-7 text-[11px] border-emerald-500/30 text-emerald-400" onClick={() => onAction(c.id, "approve")}><CheckCircle2 className="mr-1 h-3 w-3" />Approve</Button><Button variant="outline" className="h-7 text-[11px] border-destructive/30 text-destructive" onClick={() => onAction(c.id, "reject")}><XCircle className="mr-1 h-3 w-3" />Reject</Button><Button variant="outline" className="h-7 text-[11px]" onClick={() => onAction(c.id, "archive")}><Archive className="mr-1 h-3 w-3" />Archive</Button></>}
            {canApply && <Button variant="outline" className="h-7 text-[11px] border-amber-500/30 text-amber-400" onClick={() => onAction(c.id, "apply")}><Zap className="mr-1 h-3 w-3" />Apply</Button>}
          </div>
        )}
      </div>
    </div>
  );
}

function LivingLoopSettingsPanel({ isKing }: { isKing: boolean }) {
  const [settings, setSettings] = useState<SettingDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  async function load() {
    try {
      const res = await api.settings();
      setSettings(res.settings.filter((s) => LIVING_LOOP_SETTING_KEYS.includes(s.key)));
    } catch {
      setSettings([]);
    }
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  async function save(key: string, value: string) {
    setSavingKey(key);
    try {
      await api.updateSetting(key, value);
      await load();
    } catch (e) {
      console.error(e);
    }
    setSavingKey(null);
  }

  if (loading) return <div className="text-xs text-muted-foreground">Loading settings...</div>;
  if (!isKing) return <div className="text-xs text-muted-foreground">Only the King may edit Living Loop settings.</div>;

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-400">
        Auto patch, branch push, and PR creation remain disabled in M17D-1 regardless of these settings.
      </div>
      {settings.map((s) => {
        const isBoolean = s.value === "true" || s.value === "false";
        return (
          <div key={s.key} className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/10 px-3 py-2">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-foreground">{s.key}</div>
              {s.description && <div className="text-[11px] text-muted-foreground">{s.description}</div>}
            </div>
            {isBoolean ? (
              <Button
                variant="outline"
                className="h-7 shrink-0 text-[11px]"
                disabled={savingKey === s.key}
                onClick={() => save(s.key, s.value === "true" ? "false" : "true")}
              >
                {s.value === "true" ? "Enabled" : "Disabled"}
              </Button>
            ) : (
              <Input
                className="h-7 w-24 shrink-0 text-right text-xs"
                defaultValue={s.value}
                disabled={savingKey === s.key}
                onBlur={(e) => { if (e.target.value !== s.value) void save(s.key, e.target.value); }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function LivingLoopPage() {
  const user = useAuthStore((s) => s.user);
  const isKing = user?.role === "KING";
  const [status, setStatus] = useState<LivingLoopStatusDto | null>(null);
  const [runs, setRuns] = useState<LivingLoopRunDto[]>([]);
  const [candidates, setCandidates] = useState<AutomationCandidateDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  async function load() {
    const [s, r, c] = await Promise.all([
      api.livingLoopStatus().catch(() => ({ status: { enabled: false, lastRun: null, lastResult: null, todayCandidates: 0, pendingCandidates: 0, highCriticalCandidates: 0, runnerIssues: 0, providerIssues: 0, patchesPendingReview: 0, autoContextRepair: { enabled: false, dailyCount: 0, dailyLimit: 0, cooldownMinutes: 0, repairedLastRun: 0 }, autoValidation: { enabled: false, dailyCount: 0, dailyLimit: 0, cooldownMinutes: 0, jobsCreatedLastRun: 0, validationFailuresNeedingReview: 0 }, autoSandboxPatch: { enabled: false, dailyCount: 0, dailyLimit: 0, cooldownMinutes: 0, minConfidence: 85, jobsCreatedLastRun: 0 } } })),
      api.livingLoopRuns(10).catch(() => ({ runs: [] })),
      api.automationCandidates({ limit: 50 }).catch(() => ({ candidates: [], total: 0 }))
    ]);
    setStatus(s.status); setRuns(r.runs); setCandidates(c.candidates); setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  async function runOnce() { setRunning(true); try { await api.runLivingLoopOnce(); await load(); } catch (e) { console.error(e); } setRunning(false); }
  async function act(id: string, action: string) {
    if (action === "approve") await api.approveAutomationCandidate(id);
    else if (action === "reject") await api.rejectAutomationCandidate(id);
    else if (action === "archive") await api.archiveAutomationCandidate(id);
    else if (action === "apply") await api.applyAutomationCandidate(id);
    await load();
  }

  if (loading) return <LoadingState message="Awakening the living loop..." className="min-h-[60vh]" />;

  return (
    <div className="space-y-8 animate-in fade-in duration-500 slide-in-from-bottom-4">
      <PageHeader
        eyebrow="M21"
        title="Living Loop"
        description="Observe, repair context, propose work, and run gated automation with visible limits and review boundaries."
        action={(
          <Button variant="outline" onClick={runOnce} disabled={running}>
            <Zap className={cn("h-4 w-4", running && "animate-spin")} />
            {running ? "Running..." : "Run Once"}
          </Button>
        )}
      />

      <div className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]" data-testid="living-loop-overview">
        <SectionCard title="Loop Status" icon={Activity} className="h-full">
          {status && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatCard className="min-h-20 bg-muted/10" title="Enabled" value={status.enabled ? "Yes" : "No"} />
                <StatCard className="min-h-20 bg-muted/10" title="Pending" value={status.pendingCandidates} />
                <StatCard className="min-h-20 bg-muted/10" title="High/Critical" value={status.highCriticalCandidates} />
                <StatCard className="min-h-20 bg-muted/10" title="Today" value={status.todayCandidates} />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <StatCard className="min-h-20 bg-muted/10" title="Runner Issues" value={status.runnerIssues} />
                <StatCard className="min-h-20 bg-muted/10" title="Provider Issues" value={status.providerIssues} />
                <StatCard className="min-h-20 bg-muted/10" title="Last Result" value={status.lastResult ?? "N/A"} />
              </div>
              {status.lastRun?.skippedReasons && status.lastRun.skippedReasons.length > 0 && (
                <div className="text-[11px] leading-5 text-amber-400/80">Last run skipped: {status.lastRun.skippedReasons.join("; ")}</div>
              )}
              {status.lastRun?.error && <div className="text-[11px] text-destructive">Last run error: {status.lastRun.error}</div>}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Constraints" icon={AlertTriangle} className="h-full" contentClassName="p-4">
          <div className="text-xs font-semibold text-amber-400">Autonomy Safety Boundary</div>
          <ul className="mt-2 divide-y divide-border/60 text-xs leading-5 text-muted-foreground">
            <li className="py-2">Auto context repair only scans approved local-document roots and refreshes WorkOrder context</li>
            <li className="py-2">Auto validation cannot edit files; auto sandbox patches still land in NEEDS_REVIEW</li>
            <li className="py-2">No automatic branch push, PR, merge, deploy, or trusted memory</li>
            <li className="py-2">Every candidate retains provenance and passes the data quality gate</li>
            <li className="py-2">KING remains the final decision owner</li>
          </ul>
          <details className="mt-4 border-t border-border pt-3">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-semibold text-foreground [&::-webkit-details-marker]:hidden">
              <SettingsIcon className="h-3.5 w-3.5 text-primary" />
              Living Loop Settings
            </summary>
            <div className="mt-4"><LivingLoopSettingsPanel isKing={isKing} /></div>
          </details>
        </SectionCard>
      </div>

      <div data-testid="automation-stages">
        <PageSection title="Automation Stages" description="Each stage keeps its own limits, cooldown, and review boundary." icon={Shield}>
          <div className="grid items-stretch gap-4 xl:grid-cols-3">
            <SectionCard title="Auto Context Repair" icon={RefreshCw} className="h-full" contentClassName="p-4">
              {status?.autoContextRepair ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <StatCard className="min-h-20 bg-muted/10" title="Status" value={status.autoContextRepair.enabled ? "Enabled" : "Disabled"} />
                    <StatCard className="min-h-20 bg-muted/10" title="Repairs Today" value={`${status.autoContextRepair.dailyCount} / ${status.autoContextRepair.dailyLimit}`} />
                    <StatCard className="min-h-20 bg-muted/10" title="Cooldown" value={`${status.autoContextRepair.cooldownMinutes}m`} />
                    <StatCard className="min-h-20 bg-muted/10" title="Repaired Last Run" value={status.autoContextRepair.repairedLastRun} />
                  </div>
                  <p className="text-xs leading-5 text-muted-foreground">Opt-in context repair can move MISSING or STALE WorkOrders back to FRESH. This satisfies the context gate but does not approve, push, merge, or deploy a patch.</p>
                </div>
              ) : <div className="text-xs text-muted-foreground">Auto context repair status unavailable.</div>}
            </SectionCard>

            <SectionCard title="Auto Validation" icon={Shield} className="h-full" contentClassName="p-4">
              {status?.autoValidation ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <StatCard className="min-h-20 bg-muted/10" title="Status" value={status.autoValidation.enabled ? "Enabled" : "Disabled"} />
                    <StatCard className="min-h-20 bg-muted/10" title="Jobs Today" value={`${status.autoValidation.dailyCount} / ${status.autoValidation.dailyLimit}`} />
                    <StatCard className="min-h-20 bg-muted/10" title="Cooldown" value={`${status.autoValidation.cooldownMinutes}m`} />
                    <StatCard className="min-h-20 bg-muted/10" title="Created Last Run" value={status.autoValidation.jobsCreatedLastRun} />
                    <StatCard className="col-span-2 min-h-20 bg-muted/10" title="Failures To Review" value={status.autoValidation.validationFailuresNeedingReview} />
                  </div>
                  {(status.lastRun?.skippedReasons ?? []).filter((r) => r.startsWith("AutoValidation:")).length > 0 && (
                    <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-[11px] text-amber-400">
                      <div className="mb-1 font-semibold">Auto validation skipped reasons (last run)</div>
                      <ul className="space-y-0.5">{(status.lastRun?.skippedReasons ?? []).filter((r) => r.startsWith("AutoValidation:")).map((r, i) => <li key={i}>{r.replace("AutoValidation: ", "")}</li>)}</ul>
                    </div>
                  )}
                </div>
              ) : <div className="text-xs text-muted-foreground">Auto validation status unavailable.</div>}
            </SectionCard>

            <SectionCard title="Auto Sandbox Patch" icon={Zap} className="h-full" contentClassName="p-4">
              {status?.autoSandboxPatch ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <StatCard className="min-h-20 bg-muted/10" title="Status" value={status.autoSandboxPatch.enabled ? "Enabled" : "Disabled"} />
                    <StatCard className="min-h-20 bg-muted/10" title="Jobs Today" value={`${status.autoSandboxPatch.dailyCount} / ${status.autoSandboxPatch.dailyLimit}`} />
                    <StatCard className="min-h-20 bg-muted/10" title="Cooldown" value={`${status.autoSandboxPatch.cooldownMinutes}m`} />
                    <StatCard className="min-h-20 bg-muted/10" title="Min Confidence" value={`${status.autoSandboxPatch.minConfidence}%`} />
                    <StatCard className="col-span-2 min-h-20 bg-muted/10" title="Created Last Run" value={status.autoSandboxPatch.jobsCreatedLastRun} />
                  </div>
                  {(status.lastRun?.skippedReasons ?? []).filter((r) => r.startsWith("AutoSandboxPatch:")).length > 0 && (
                    <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-[11px] text-amber-400">
                      <div className="mb-1 font-semibold">Auto sandbox patch skipped reasons (last run)</div>
                      <ul className="space-y-0.5">{(status.lastRun?.skippedReasons ?? []).filter((r) => r.startsWith("AutoSandboxPatch:")).map((r, i) => <li key={i}>{r.replace("AutoSandboxPatch: ", "")}</li>)}</ul>
                    </div>
                  )}
                  {(status.lastRun?.skippedReasons ?? []).filter((r) => r.includes("ContextBinding:")).length > 0 && (
                    <div className="rounded-md border border-cyan-500/30 bg-cyan-500/10 p-3 text-[11px] text-cyan-400">
                      <div className="mb-1 font-semibold">Context binding skips (last run)</div>
                      <ul className="space-y-0.5">{(status.lastRun?.skippedReasons ?? []).filter((r) => r.includes("ContextBinding:")).map((r, i) => <li key={i}>{r}</li>)}</ul>
                      <div className="mt-1 text-cyan-400/70">Jobs were skipped because project context was missing, stale, or partial. Scan local docs and rebind work order context.</div>
                    </div>
                  )}
                </div>
              ) : <div className="text-xs text-muted-foreground">Auto sandbox patch status unavailable.</div>}
            </SectionCard>
          </div>
        </PageSection>
      </div>

      <div data-testid="candidate-queue">
        <SectionCard title={`Candidate Queue (${candidates.length})`} icon={Eye}>
          {candidates.length > 0 ? (
            <div className="space-y-5">
              {(["PENDING", "APPROVED", "APPLIED", "REJECTED", "ARCHIVED"] as const).map((statusGroup) => {
                const group = candidates.filter((candidate) => candidate.status === statusGroup);
                if (!group.length) return null;
                return (
                  <section key={statusGroup} className="space-y-2">
                    <h4 className="text-xs font-semibold text-muted-foreground">{statusGroup} ({group.length})</h4>
                    <div className="space-y-2">{group.map((candidate) => <CandidateCard key={candidate.id} c={candidate} isKing={isKing} onAction={act} autoValidation={status?.autoValidation} autoSandboxPatch={status?.autoSandboxPatch} lastRunSkippedReasons={status?.lastRun?.skippedReasons} />)}</div>
                  </section>
                );
              })}
            </div>
          ) : (
            <EmptyState title="No Candidates" description="Run the living loop to generate candidates." action={<Button variant="outline" onClick={runOnce} disabled={running}><Zap className="h-3.5 w-3.5" />Run Once</Button>} />
          )}
        </SectionCard>
      </div>

      <div data-testid="run-history">
        <SectionCard title="Run History" icon={Clock} contentClassName="p-3">
          {runs.length > 0 ? (
            <div className="space-y-2">
              {runs.map((run) => {
                const statusColor = run.status === "COMPLETED" ? "text-emerald-400" : run.status === "FAILED" ? "text-destructive" : "text-primary";
                return (
                  <details key={run.id} className="rounded-lg border border-border bg-muted/10">
                    <summary className="flex cursor-pointer list-none flex-col gap-2 px-4 py-3 [&::-webkit-details-marker]:hidden sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className={cn("text-xs font-semibold", statusColor)}>{run.status}</span>
                        <span className="text-sm font-medium">{run.triggerType}</span>
                        {run.summary && <span className="line-clamp-1 min-w-0 text-xs text-muted-foreground">{run.summary}</span>}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>{run.proposedCandidates} proposed</span>
                        <span>{run.skippedCandidates} skipped</span>
                        <span>{formatDate(run.createdAt)}</span>
                      </div>
                    </summary>
                    <div className="border-t border-border px-4 py-3">
                      {run.observedCounts && (
                        <div className="flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                          {Object.entries(run.observedCounts).map(([key, value]) => <span key={key} className="rounded-md border border-border/60 px-2 py-0.5">{key}: {value}</span>)}
                        </div>
                      )}
                      {run.skippedReasons && run.skippedReasons.length > 0 && <div className="mt-2 text-[11px] text-amber-400/80">Skipped: {run.skippedReasons.join("; ")}</div>}
                      {run.error && <div className="mt-2 text-[11px] text-destructive">Error: {run.error}</div>}
                    </div>
                  </details>
                );
              })}
            </div>
          ) : <EmptyState title="No Runs" />}
        </SectionCard>
      </div>
    </div>
  );
}
