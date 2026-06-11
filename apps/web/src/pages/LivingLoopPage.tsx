import { Activity, AlertTriangle, Archive, CheckCircle2, Clock, Cpu, Eye, Settings as SettingsIcon, Shield, XCircle, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatCard } from "@/components/ui/StatCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { api } from "@/lib/api";
import { cn, formatDate } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import type { AutomationCandidateDto, AutomationCandidateKind, AutoValidationStatusDto, LivingLoopRunDto, LivingLoopStatusDto, SettingDto } from "@/types/api";

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
  RUNNER_REVIEW: { label: "Runner Review", icon: Activity, color: "text-orange-400 bg-orange-500/10 border-orange-500/30" }
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

function CandidateCard({ c, isKing, onAction, autoValidation, lastRunSkippedReasons }: { c: AutomationCandidateDto; isKing: boolean; onAction: (id: string, action: string) => void; autoValidation?: AutoValidationStatusDto | null; lastRunSkippedReasons?: string[] | null }) {
  const canAct = isKing && c.status === "PENDING";
  const canApply = isKing && c.status === "APPROVED";
  const skipNote = autoValidationSkipNote(c, autoValidation ?? null, lastRunSkippedReasons ?? null);
  return (
    <div className="rounded-xl border border-border bg-card/70 p-4 transition-all hover:border-primary/30">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <KindBadge kind={c.kind} />
            <span className={cn("inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider", PRIORITY_COLORS[c.priority])}>{c.priority}</span>
            <span className={cn("text-[10px] font-bold uppercase tracking-wider", RISK_COLORS[c.riskLevel])}>Risk: {c.riskLevel}</span>
            <span className="inline-flex items-center rounded-md border border-border/60 bg-muted/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{c.confidence}%</span>
          </div>
          <div className="font-semibold text-foreground">{c.title}</div>
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
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span>Source: {c.sourceType}/{c.sourceId.slice(0, 8)}</span>
            <span>Status: {c.status}</span>
            <span>{formatDate(c.createdAt)}</span>
          </div>
        </div>
        {isKing && (
          <div className="flex shrink-0 flex-col gap-2">
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
      api.livingLoopStatus().catch(() => ({ status: { enabled: false, lastRun: null, lastResult: null, todayCandidates: 0, pendingCandidates: 0, highCriticalCandidates: 0, runnerIssues: 0, providerIssues: 0, autoValidation: { enabled: false, dailyCount: 0, dailyLimit: 0, cooldownMinutes: 0, jobsCreatedLastRun: 0, validationFailuresNeedingReview: 0 } } })),
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
      <PageHeader eyebrow="M17D-2" title="Living Loop" description="Observe + Propose + Auto Validate: Kingdom state monitoring, automation candidate queue, and safe validation-only jobs." />
      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard title="Loop Status" icon={Activity} action={<Button variant="outline" className="h-8 text-xs" onClick={runOnce} disabled={running}><Zap className={cn("mr-1.5 h-3.5 w-3.5", running && "animate-spin")} />{running ? "Running..." : "Run Once"}</Button>}>
          {status && <div className="space-y-4"><div className="grid grid-cols-2 gap-4 sm:grid-cols-4"><StatCard className="bg-transparent border-none p-0" title="Enabled" value={status.enabled ? "Yes" : "No"} /><StatCard className="bg-transparent border-none p-0" title="Pending" value={status.pendingCandidates} /><StatCard className="bg-transparent border-none p-0" title="High/Critical" value={status.highCriticalCandidates} /><StatCard className="bg-transparent border-none p-0" title="Today" value={status.todayCandidates} /></div><div className="grid grid-cols-3 gap-4"><StatCard className="bg-transparent border-none p-0" title="Runner Issues" value={status.runnerIssues} /><StatCard className="bg-transparent border-none p-0" title="Provider Issues" value={status.providerIssues} /><StatCard className="bg-transparent border-none p-0" title="Last Result" value={status.lastResult ?? "N/A"} /></div>{status.lastRun?.skippedReasons && status.lastRun.skippedReasons.length > 0 && <div className="text-[11px] text-amber-400/80">Last run skipped: {status.lastRun.skippedReasons.join("; ")}</div>}{status.lastRun?.error && <div className="text-[11px] text-destructive">Last run error: {status.lastRun.error}</div>}</div>}
        </SectionCard>
        <SectionCard title="Constraints" icon={AlertTriangle}><div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3"><div className="text-xs font-semibold uppercase tracking-wider text-amber-400 mb-2">M17D-2: Auto Validation Only</div><ul className="space-y-1 text-xs text-muted-foreground"><li>✓ Only VALIDATION_ONLY jobs may auto-run (no file edits, no patches)</li><li>✓ No auto-patch, branch push, PR, merge, deploy, or trusted memory</li><li>✓ Every candidate has provenance + data quality gate</li><li>✓ GET routes never create candidates or jobs</li><li>✓ KING remains decision owner</li></ul></div></SectionCard>
      </div>
      <SectionCard title="Auto Validation" icon={Shield}>
        {status?.autoValidation ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
              <StatCard className="bg-transparent border-none p-0" title="Status" value={status.autoValidation.enabled ? "Enabled" : "Disabled"} />
              <StatCard className="bg-transparent border-none p-0" title="Jobs Today" value={`${status.autoValidation.dailyCount} / ${status.autoValidation.dailyLimit}`} />
              <StatCard className="bg-transparent border-none p-0" title="Cooldown" value={`${status.autoValidation.cooldownMinutes}m`} />
              <StatCard className="bg-transparent border-none p-0" title="Created Last Run" value={status.autoValidation.jobsCreatedLastRun} />
              <StatCard className="bg-transparent border-none p-0" title="Failures To Review" value={status.autoValidation.validationFailuresNeedingReview} />
            </div>
            {(status.lastRun?.skippedReasons ?? []).filter((r) => r.startsWith("AutoValidation:")).length > 0 && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-[11px] text-amber-400">
                <div className="mb-1 font-semibold uppercase tracking-wider">Auto validation skipped reasons (last run)</div>
                <ul className="space-y-0.5">
                  {(status.lastRun?.skippedReasons ?? []).filter((r) => r.startsWith("AutoValidation:")).map((r, i) => <li key={i}>{r.replace("AutoValidation: ", "")}</li>)}
                </ul>
              </div>
            )}
          </div>
        ) : <div className="text-xs text-muted-foreground">Auto validation status unavailable.</div>}
      </SectionCard>
      <SectionCard title="Living Loop Settings" icon={SettingsIcon}>
        <LivingLoopSettingsPanel isKing={isKing} />
      </SectionCard>
      <SectionCard title={`Candidate Queue (${candidates.length})`} icon={Eye}>
        {candidates.length > 0 ? (<div className="space-y-4">{(["PENDING", "APPROVED", "APPLIED", "REJECTED", "ARCHIVED"] as const).map(sg => { const g = candidates.filter(x => x.status === sg); if (!g.length) return null; return <div key={sg} className="space-y-2"><h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{sg} ({g.length})</h4><div className="space-y-2">{g.map(x => <CandidateCard key={x.id} c={x} isKing={isKing} onAction={act} autoValidation={status?.autoValidation} lastRunSkippedReasons={status?.lastRun?.skippedReasons} />)}</div></div>; })}</div>) : <EmptyState title="No Candidates" description="Run the living loop to generate candidates." action={<Button variant="outline" onClick={runOnce} disabled={running}><Zap className="mr-1.5 h-3.5 w-3.5" />Run Once</Button>} />}
      </SectionCard>
      <SectionCard title="Run History" icon={Clock}>
        {runs.length > 0 ? <div className="space-y-2">{runs.map(r => {
          const sc = r.status === "COMPLETED" ? "text-emerald-400" : r.status === "FAILED" ? "text-destructive" : "text-primary";
          return (
            <div key={r.id} className="rounded-lg border border-border bg-muted/20 px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={cn("text-xs font-bold uppercase tracking-wider", sc)}>{r.status}</span>
                  <span className="text-sm font-medium">{r.triggerType}</span>
                  {r.summary && <span className="text-xs text-muted-foreground line-clamp-1">{r.summary}</span>}
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span>{r.proposedCandidates} proposed</span>
                  <span>{r.skippedCandidates} skipped</span>
                  <span>{formatDate(r.createdAt)}</span>
                </div>
              </div>
              {r.observedCounts && (
                <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                  {Object.entries(r.observedCounts).map(([k, v]) => (
                    <span key={k} className="rounded-md border border-border/60 bg-muted/20 px-2 py-0.5">{k}: {v}</span>
                  ))}
                </div>
              )}
              {r.skippedReasons && r.skippedReasons.length > 0 && (
                <div className="mt-2 text-[11px] text-amber-400/80">
                  Skipped: {r.skippedReasons.join("; ")}
                </div>
              )}
              {r.error && <div className="mt-2 text-[11px] text-destructive">Error: {r.error}</div>}
            </div>
          );
        })}</div> : <EmptyState title="No Runs" />}
      </SectionCard>
    </div>
  );
}
