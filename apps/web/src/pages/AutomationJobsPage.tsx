import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, AlertTriangle, ArrowRight, Bot, CheckCircle, ChevronDown, Clipboard, Clock, FileCode, Filter, GitBranch, ListChecks, Play, RefreshCw, Server, Shield, Upload, X, XCircle, AlertCircle, Eye, Zap } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { ValidationOutput } from "@/components/ValidationOutput";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import { useTk } from "@/lib/i18n";
import { cn, formatDate } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import type { AgentReviewSummaryDto, AgentRunnerDto, AutomationJobDto, AutomationJobStatus, PatchArtifactDto } from "@/types/api";

function statusColor(status: AutomationJobStatus): string {
  switch (status) {
    case "QUEUED": return "text-yellow-600 bg-yellow-50 border-yellow-200";
    case "APPROVED": return "text-blue-600 bg-blue-50 border-blue-200";
    case "CLAIMED": return "text-indigo-600 bg-indigo-50 border-indigo-200";
    case "RUNNING": return "text-orange-600 bg-orange-50 border-orange-200";
    case "NEEDS_REVIEW": return "text-purple-600 bg-purple-50 border-purple-200";
    case "COMPLETED": return "text-green-600 bg-green-50 border-green-200";
    case "FAILED": return "text-red-600 bg-red-50 border-red-200";
    case "CANCELLED": return "text-gray-500 bg-gray-50 border-gray-200";
    default: return "text-muted-foreground bg-muted border-border";
  }
}

function statusIcon(status: AutomationJobStatus) {
  switch (status) {
    case "QUEUED": return <Clock className="h-3.5 w-3.5" />;
    case "APPROVED": return <CheckCircle className="h-3.5 w-3.5" />;
    case "CLAIMED":
    case "RUNNING": return <Activity className="h-3.5 w-3.5 animate-pulse" />;
    case "NEEDS_REVIEW": return <Eye className="h-3.5 w-3.5" />;
    case "COMPLETED": return <CheckCircle className="h-3.5 w-3.5" />;
    case "FAILED": return <XCircle className="h-3.5 w-3.5" />;
    case "CANCELLED": return <X className="h-3.5 w-3.5" />;
    default: return <AlertCircle className="h-3.5 w-3.5" />;
  }
}

function runnerStatusColor(status: string): string {
  switch (status) {
    case "ONLINE": return "text-green-600 bg-green-50 border-green-200";
    case "OFFLINE": return "text-gray-500 bg-gray-50 border-gray-200";
    case "ERROR": return "text-red-600 bg-red-50 border-red-200";
    default: return "text-muted-foreground bg-muted border-border";
  }
}

function modeLabel(mode: string): string {
  switch (mode) {
    case "OBSERVE": return "Observe";
    case "PLAN_ONLY": return "Plan Only";
    case "SANDBOX_PATCH": return "Sandbox Patch";
    case "VALIDATION_ONLY": return "Validation Only";
    default: return mode;
  }
}

type AutoValidationProvenance = { source?: string; loopRunId?: string; candidateId?: string };
type QueueView = "REVIEW" | "ACTIVE" | "FAILED" | "HISTORY" | "ALL";

const ACTIVE_JOB_STATUSES: AutomationJobStatus[] = ["QUEUED", "APPROVED", "CLAIMED", "RUNNING"];

function matchesQueueView(job: AutomationJobDto, view: QueueView): boolean {
  if (view === "REVIEW") return job.status === "NEEDS_REVIEW";
  if (view === "ACTIVE") return ACTIVE_JOB_STATUSES.includes(job.status);
  if (view === "FAILED") return job.status === "FAILED";
  if (view === "HISTORY") return ["COMPLETED", "CANCELLED"].includes(job.status);
  return true;
}

function queuePriority(job: AutomationJobDto): number {
  if (job.status === "NEEDS_REVIEW") return 0;
  if (ACTIVE_JOB_STATUSES.includes(job.status)) return 1;
  if (job.status === "FAILED") return 2;
  return 3;
}

function autoValidationProvenance(job: AutomationJobDto): AutoValidationProvenance | null {
  const p = job.provenance as AutoValidationProvenance | null | undefined;
  return p && p.source === "LIVING_LOOP_AUTO_VALIDATION" ? p : null;
}

function autoSandboxPatchProvenance(job: AutomationJobDto): AutoValidationProvenance | null {
  const p = job.provenance as AutoValidationProvenance | null | undefined;
  return p && p.source === "LIVING_LOOP_AUTO_SANDBOX_PATCH" ? p : null;
}

function ModeBadge({ mode }: { mode: string }) {
  if (mode === "VALIDATION_ONLY") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border text-purple-700 bg-purple-50 border-purple-200">
        <Shield className="h-3 w-3" />
        {modeLabel(mode)}
      </span>
    );
  }
  return <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{modeLabel(mode)}</span>;
}

function contextStatusColor(status: string): string {
  switch (status) {
    case "FRESH": return "text-green-700 bg-green-50 border-green-200";
    case "PARTIAL": return "text-yellow-700 bg-yellow-50 border-yellow-200";
    case "STALE": return "text-orange-700 bg-orange-50 border-orange-200";
    case "MISSING": return "text-red-700 bg-red-50 border-red-200";
    default: return "text-muted-foreground bg-muted border-border";
  }
}

function ContextBadge({ status }: { status: string | null | undefined }) {
  if (!status || status === "NOT_REQUIRED") return null;
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border", contextStatusColor(status))}>
      <Shield className="h-3 w-3" />
      Context: {status}
    </span>
  );
}

function LivingLoopSourceBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border text-indigo-700 bg-indigo-50 border-indigo-200">
      <Zap className="h-3 w-3" />
      Living Loop Auto Validation
    </span>
  );
}

function AutoSandboxPatchBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border text-lime-700 bg-lime-50 border-lime-200">
      <Zap className="h-3 w-3" />
      Living Loop Auto Sandbox Patch
    </span>
  );
}

export function AutomationJobsPage() {
  const tk = useTk();
  const { user } = useAuthStore();
  const [jobs, setJobs] = useState<AutomationJobDto[]>([]);
  const [runners, setRunners] = useState<AgentRunnerDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionJobId, setActionJobId] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<AutomationJobDto | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [queueView, setQueueView] = useState<QueueView>("ALL");
  const [patchArtifacts, setPatchArtifacts] = useState<PatchArtifactDto[]>([]);
  const [patchActionId, setPatchActionId] = useState<string | null>(null);
  const [importPatchJobId, setImportPatchJobId] = useState<string | null>(null);
  const [importPatchText, setImportPatchText] = useState("");
  const [importPatchError, setImportPatchError] = useState<string | null>(null);
  const [importPatchLoading, setImportPatchLoading] = useState(false);
  const [agentReview, setAgentReview] = useState<AgentReviewSummaryDto | null>(null);
  const [agentReviewLoading, setAgentReviewLoading] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [jobsData, runnersData] = await Promise.all([api.automationJobs(), api.runners()]);
      setJobs(jobsData);
      setRunners(runnersData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleApprove(jobId: string) {
    setActionJobId(jobId);
    setActionError(null);
    try {
      await api.approveAutomationJob(jobId);
      await load();
      if (selectedJob?.id === jobId) await loadDetail(jobId);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Approve failed");
    } finally {
      setActionJobId(null);
    }
  }

  async function handleCancel(jobId: string) {
    setActionJobId(jobId);
    setActionError(null);
    try {
      await api.cancelAutomationJob(jobId);
      await load();
      if (selectedJob?.id === jobId) setSelectedJob(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Cancel failed");
    } finally {
      setActionJobId(null);
    }
  }

  async function loadDetail(jobId: string) {
    setDetailLoading(true);
    try {
      const [job, patches, reviewResponse] = await Promise.all([
        api.automationJob(jobId),
        api.patchArtifacts({ automationJobId: jobId }),
        api.automationJobAgentReview(jobId)
      ]);
      setSelectedJob(job);
      setPatchArtifacts(patches);
      setAgentReview(reviewResponse.agentReview);
      if (window.matchMedia?.("(max-width: 1023px)").matches) {
        window.requestAnimationFrame(() => {
          document.getElementById("automation-job-detail-pane")?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
    } finally {
      setDetailLoading(false);
    }
  }

  async function regenerateAgentReview() {
    if (!selectedJob) return;
    setAgentReviewLoading(true);
    setActionError(null);
    try {
      const response = await api.regenerateAutomationJobAgentReview(selectedJob.id);
      setAgentReview(response.agentReview);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to generate agent review");
    } finally {
      setAgentReviewLoading(false);
    }
  }

  async function approvePatch(artifactId: string) {
    setPatchActionId(artifactId);
    try {
      await api.approvePatchArtifact(artifactId);
      if (selectedJob) setPatchArtifacts(await api.patchArtifacts({ automationJobId: selectedJob.id }));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to approve patch");
    } finally {
      setPatchActionId(null);
    }
  }

  async function rejectPatch(artifactId: string) {
    setPatchActionId(artifactId);
    try {
      await api.rejectPatchArtifact(artifactId);
      if (selectedJob) setPatchArtifacts(await api.patchArtifacts({ automationJobId: selectedJob.id }));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to reject patch");
    } finally {
      setPatchActionId(null);
    }
  }

  async function requestRevision(artifactId: string) {
    const note = window.prompt("Revision notes:");
    if (note === null) return;
    setPatchActionId(artifactId);
    try {
      await api.requestPatchRevision(artifactId, note || "Revision requested");
      if (selectedJob) setPatchArtifacts(await api.patchArtifacts({ automationJobId: selectedJob.id }));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to request revision");
    } finally {
      setPatchActionId(null);
    }
  }

  async function createPr(artifactId: string) {
    setPatchActionId(artifactId);
    try {
      await api.createPatchPr(artifactId);
      if (selectedJob) setPatchArtifacts(await api.patchArtifacts({ automationJobId: selectedJob.id }));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to create PR");
    } finally {
      setPatchActionId(null);
    }
  }

  async function pushBranch(artifactId: string) {
    setPatchActionId(artifactId);
    setActionError(null);
    try {
      await api.pushPatchBranch(artifactId);
      setJobs(await api.automationJobs());
      if (selectedJob) {
        setPatchArtifacts(await api.patchArtifacts({ automationJobId: selectedJob.id }));
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to queue branch push");
    } finally {
      setPatchActionId(null);
    }
  }

  async function handleImportPatch() {
    if (!importPatchJobId || !importPatchText.trim()) return;
    setImportPatchLoading(true);
    setImportPatchError(null);
    try {
      await api.importPatch(importPatchJobId, importPatchText.trim());
      setImportPatchJobId(null);
      setImportPatchText("");
      await load();
      if (selectedJob?.id === importPatchJobId) await loadDetail(importPatchJobId);
    } catch (err) {
      setImportPatchError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImportPatchLoading(false);
    }
  }

  const onlineRunners = runners.filter((r) => r.status === "ONLINE");
  const activeJobs = jobs.filter((j) => ACTIVE_JOB_STATUSES.includes(j.status));
  const reviewJobs = jobs.filter((j) => j.status === "NEEDS_REVIEW");
  const failedJobs = jobs.filter((j) => j.status === "FAILED");
  const historyJobs = jobs.filter((j) => ["COMPLETED", "CANCELLED"].includes(j.status));
  const visibleJobs = jobs
    .filter((job) => matchesQueueView(job, queueView))
    .filter((job) => !statusFilter || job.status === statusFilter)
    .sort((a, b) => queuePriority(a) - queuePriority(b) || Date.parse(b.createdAt) - Date.parse(a.createdAt));

  const selectCls = "h-11 w-full rounded-md border border-border bg-input px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary";

  return (
    <>
      <PageHeader
        eyebrow={tk("automationJobs.eyebrow")}
        title={tk("automationJobs.title")}
        description={tk("automationJobs.description")}
        action={
          <Button variant="outline" className="h-11" onClick={load}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            {tk("automationJobs.refresh")}
          </Button>
        }
      />

      <section className="mb-6 grid grid-cols-2 border-y border-border bg-muted/10 md:grid-cols-4" aria-label={tk("automationJobs.metricsAria")}>
        {[
          { label: tk("automationJobs.metric.review"), value: reviewJobs.length, tone: "text-purple-500" },
          { label: tk("automationJobs.metric.active"), value: activeJobs.length, tone: "text-orange-500" },
          { label: tk("automationJobs.metric.runners"), value: onlineRunners.length, tone: onlineRunners.length > 0 ? "text-green-500" : "text-muted-foreground" },
          { label: tk("automationJobs.metric.total"), value: jobs.length, tone: "text-foreground" }
        ].map((metric) => (
          <div key={metric.label} className="min-w-0 border-b border-r border-border px-4 py-3 last:border-r-0 md:border-b-0">
            <p className="text-xs font-medium text-muted-foreground">{metric.label}</p>
            <p className={cn("mt-1 font-mono text-2xl font-semibold tabular-nums", metric.tone)}>{metric.value}</p>
          </div>
        ))}
      </section>

      {actionError && (
        <div className="mb-5 rounded-md border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {actionError}
        </div>
      )}

      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)]" data-testid="automation-jobs-workspace">
        <aside className="min-w-0 self-start overflow-hidden rounded-lg border border-border bg-card lg:sticky lg:top-4" aria-label={tk("automationJobs.queueAria")}>
          <div className="flex min-h-14 items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-primary" />
              <div>
                <h2 className="text-sm font-semibold text-foreground">{tk("automationJobs.queueTitle")}</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">{tk("automationJobs.queueDescription")}</p>
              </div>
            </div>
            <span className="rounded-md border border-border bg-muted/20 px-2 py-1 font-mono text-xs tabular-nums text-muted-foreground">{visibleJobs.length}</span>
          </div>

          <div className="border-b border-border p-4">
            <div className="grid grid-cols-2 gap-2">
              {([
                ["REVIEW", tk("automationJobs.quick.review"), reviewJobs.length],
                ["ACTIVE", tk("automationJobs.quick.active"), activeJobs.length],
                ["FAILED", tk("automationJobs.quick.failed"), failedJobs.length],
                ["HISTORY", tk("automationJobs.quick.history"), historyJobs.length],
                ["ALL", tk("automationJobs.quick.all"), jobs.length]
              ] as Array<[QueueView, string, number]>).map(([value, label, count]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={queueView === value}
                  onClick={() => { setQueueView(value); setStatusFilter(""); }}
                  className={cn("min-h-12 rounded-md border px-3 py-2 text-left text-xs transition-colors", queueView === value ? "border-primary/60 bg-primary/10 text-foreground" : "border-border bg-muted/20 text-muted-foreground hover:text-foreground")}
                >
                  <span className="block font-semibold">{label}</span>
                  <span className="font-mono tabular-nums">{count}</span>
                </button>
              ))}
            </div>

            <details className="group mt-3 rounded-lg border border-border bg-background/25">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary [&::-webkit-details-marker]:hidden">
                <span className="flex items-center gap-2"><Filter className="h-4 w-4 text-primary" />{tk("automationJobs.advancedFilter")}</span>
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
              </summary>
              <div className="border-t border-border p-3">
                <label htmlFor="automation-status-filter" className="mb-1.5 block text-xs font-medium text-muted-foreground">{tk("automationJobs.statusFilter")}</label>
                <select id="automation-status-filter" className={selectCls} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="">{tk("automationJobs.allStatuses")}</option>
                  {(["QUEUED", "APPROVED", "CLAIMED", "RUNNING", "NEEDS_REVIEW", "COMPLETED", "FAILED", "CANCELLED"] as AutomationJobStatus[]).map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </div>
            </details>

            {runners.length > 0 && (
              <details className="group mt-3 rounded-lg border border-border bg-background/25">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary [&::-webkit-details-marker]:hidden">
                  <span className="flex items-center gap-2"><Server className="h-4 w-4 text-primary" />{tk("automationJobs.runnersTitle")}</span>
                  <span className="flex items-center gap-2"><span className="font-mono text-xs text-muted-foreground">{onlineRunners.length}/{runners.length}</span><ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-open:rotate-180" /></span>
                </summary>
                <div className="space-y-2 border-t border-border p-3">
                  {runners.map((runner) => (
                    <div key={runner.id} className="rounded-md border border-border bg-muted/15 p-2.5 text-xs">
                      <div className="flex items-center gap-2">
                        <span className={cn("h-2 w-2 rounded-full", runner.status === "ONLINE" ? "bg-green-500" : "bg-gray-400")} />
                        <span className="min-w-0 flex-1 truncate font-semibold">{runner.name}</span>
                        <span className={cn("rounded-md border px-1.5 py-0.5 font-mono text-[10px]", runnerStatusColor(runner.status))}>{runner.status}</span>
                      </div>
                      {runner.hostname && <p className="mt-1 truncate text-muted-foreground">{runner.hostname}</p>}
                      {runner.lastHeartbeatAt && <p className="mt-0.5 text-muted-foreground">{tk("automationJobs.lastHeartbeat", { date: formatDate(runner.lastHeartbeatAt) })}</p>}
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>

          {loading && jobs.length === 0 ? <div className="p-4 text-sm text-muted-foreground">{tk("automationJobs.loading")}</div> : null}
          {error ? <div className="border-b border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">{error}</div> : null}
          {!loading && !error && visibleJobs.length === 0 ? (
            <div className="p-6 text-center">
              <Bot className="mx-auto h-7 w-7 text-muted-foreground" />
              <p className="mt-2 text-sm font-semibold">{tk("automationJobs.emptyTitle")}</p>
              <p className="mt-1 text-xs text-muted-foreground">{tk("automationJobs.emptyDescription")}</p>
            </div>
          ) : null}

          <div className="max-h-[680px] overflow-y-auto overscroll-contain lg:max-h-[calc(100vh-18rem)]">
            {visibleJobs.map((job) => (
              <button
                key={job.id}
                type="button"
                aria-pressed={selectedJob?.id === job.id}
                onClick={() => void loadDetail(job.id)}
                className={cn("group relative min-h-[126px] w-full border-t border-border p-4 text-left transition-colors hover:bg-muted/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary", selectedJob?.id === job.id && "bg-primary/10")}
              >
                <span className={cn("absolute inset-y-0 left-0 w-0.5 bg-primary transition-opacity", selectedJob?.id === job.id ? "opacity-100" : "opacity-0")} />
                <div className="flex items-start justify-between gap-3">
                  <h3 className="min-w-0 break-words text-sm font-semibold leading-5 text-foreground group-hover:text-primary">{job.workOrder.title}</h3>
                  <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium", statusColor(job.status))} title={job.status}>{statusIcon(job.status)}{job.status}</span>
                  <ModeBadge mode={job.mode} />
                  <ContextBadge status={job.contextValidationStatus} />
                  {autoValidationProvenance(job) && <LivingLoopSourceBadge />}
                  {autoSandboxPatchProvenance(job) && <AutoSandboxPatchBadge />}
                </div>
                <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-border/60 pt-2 text-xs text-muted-foreground">
                  {job.project && <span>{job.project.name}</span>}
                  {job.runner && <span>{job.runner.name}</span>}
                  <span>{formatDate(job.createdAt)}</span>
                </div>
                {job.patchSummary && <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{job.patchSummary}</p>}
              </button>
            ))}
          </div>
        </aside>

        <main id="automation-job-detail-pane" className="min-w-0 scroll-mt-20 space-y-5" data-testid="automation-job-detail-pane">
          {!selectedJob ? (
            <Card className="flex min-h-[420px] items-center justify-center border-dashed bg-muted/5 text-center">
              <div className="max-w-sm px-5">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-muted/20 text-primary"><Clipboard className="h-6 w-6" /></div>
                <h2 className="mt-4 text-lg font-semibold text-foreground">{tk("automationJobs.selectTitle")}</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{tk("automationJobs.selectDescription")}</p>
              </div>
            </Card>
          ) : (
            <>
              <section className="rounded-lg border border-border bg-card p-4" data-testid="automation-job-decision-summary">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase text-primary">{tk("automationJobs.nextSafeAction")}</p>
                    <h2 className="mt-1 break-words text-lg font-semibold text-foreground">{tk("automationJobs.decisionTitle", { title: selectedJob.workOrder.title })}</h2>
                  </div>
                  <span className={cn("inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-semibold", statusColor(selectedJob.status))} title={selectedJob.status}>{statusIcon(selectedJob.status)}{selectedJob.status}</span>
                </div>
                <p className="mt-3 text-sm leading-6 text-foreground/90">
                  {tk(`automationJobs.next.${selectedJob.status}`)}
                </p>
                <div className="mt-3 flex items-start gap-2 rounded-md border border-primary/25 bg-primary/5 p-3 text-xs text-muted-foreground">
                  <Shield className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>{tk("automationJobs.approvalBoundary")}</span>
                </div>
              </section>

              <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3" aria-label={tk("automationJobs.sourcesAria")}>
                <Link to={`/work-orders?focus=${selectedJob.workOrderId}`} className="rounded-md border border-border bg-muted/15 p-3 transition-colors hover:border-primary/50 hover:bg-primary/5">
                  <p className="text-xs font-medium text-muted-foreground">{tk("automationJobs.sourceWorkOrder")}</p>
                  <p className="mt-1 break-words text-sm font-semibold text-foreground">{tk("automationJobs.sourceTitle", { title: selectedJob.workOrder.title })}</p>
                </Link>
                {selectedJob.project ? (
                  <Link to={`/projects/${selectedJob.project.id}`} className="rounded-md border border-border bg-muted/15 p-3 transition-colors hover:border-primary/50 hover:bg-primary/5">
                    <p className="text-xs font-medium text-muted-foreground">{tk("automationJobs.sourceProject")}</p>
                    <p className="mt-1 break-words text-sm font-semibold text-foreground">{selectedJob.project.name}</p>
                  </Link>
                ) : null}
                {(autoValidationProvenance(selectedJob) || autoSandboxPatchProvenance(selectedJob)) ? (
                  <Link to="/living-loop" className="rounded-md border border-border bg-muted/15 p-3 transition-colors hover:border-primary/50 hover:bg-primary/5">
                    <p className="text-xs font-medium text-muted-foreground">{tk("automationJobs.sourceLivingLoop")}</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">{tk("automationJobs.openSource")}</p>
                  </Link>
                ) : null}
                <Link to={`/decree-lineage/${selectedJob.workOrderId}`} className="rounded-md border border-border bg-muted/15 p-3 transition-colors hover:border-primary/50 hover:bg-primary/5">
                  <p className="text-xs font-medium text-muted-foreground">{tk("automationJobs.sourceLineage")}</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">{tk("automationJobs.openLineage")}</p>
                </Link>
              </section>

              <nav className="flex gap-2 overflow-x-auto rounded-lg border border-border bg-card p-2" aria-label={tk("automationJobs.indexAria")}>
                {[
                  ["#automation-overview", tk("automationJobs.index.overview")],
                  ["#automation-execution", tk("automationJobs.index.execution")],
                  ["#automation-agent-review", tk("automationJobs.index.agentReview")],
                  ...(patchArtifacts.length > 0 ? [["#automation-patch-review", tk("automationJobs.index.patchReview")]] : []),
                  ["#automation-history", tk("automationJobs.index.history")]
                ].map(([href, label]) => (
                  <a key={href} href={href} className="inline-flex min-h-10 shrink-0 items-center rounded-md px-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{label}</a>
                ))}
              </nav>

              <Card id="automation-overview" className="p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground">{tk("automationJobs.detailEyebrow")}</p>
              <h3 className="mt-0.5 break-words text-base font-semibold">{tk("automationJobs.detailTitle", { title: selectedJob.workOrder.title })}</h3>
            </div>
            <Button variant="ghost" className="h-11 w-11 shrink-0 p-0" aria-label={tk("automationJobs.closeDetail")} onClick={() => setSelectedJob(null)}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {detailLoading ? (
            <p className="text-sm text-muted-foreground">{tk("automationJobs.loadingDetail")}</p>
          ) : (
            <>
              <dl className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div>
                  <dt className="text-muted-foreground">{tk("automationJobs.field.status")}</dt>
                  <dd className={cn("inline-flex items-center gap-1 mt-0.5 px-2 py-0.5 rounded-full border", statusColor(selectedJob.status))}>
                    {statusIcon(selectedJob.status)} {selectedJob.status}
                  </dd>
                </div>
                <div><dt className="text-muted-foreground">{tk("automationJobs.field.mode")}</dt><dd className="mt-0.5 font-medium">{modeLabel(selectedJob.mode)}</dd></div>
                {autoValidationProvenance(selectedJob) && (
                  <div>
                    <dt className="text-muted-foreground">{tk("automationJobs.field.source")}</dt>
                    <dd className="mt-0.5 space-y-1">
                      <LivingLoopSourceBadge />
                      <Link to="/living-loop" className="block text-primary hover:underline">
                        Candidate {autoValidationProvenance(selectedJob)?.candidateId?.slice(0, 8)} · Run {autoValidationProvenance(selectedJob)?.loopRunId?.slice(0, 8)} →
                      </Link>
                    </dd>
                  </div>
                )}
                {autoSandboxPatchProvenance(selectedJob) && (
                  <div>
                    <dt className="text-muted-foreground">{tk("automationJobs.field.source")}</dt>
                    <dd className="mt-0.5 space-y-1">
                      <AutoSandboxPatchBadge />
                      <Link to="/living-loop" className="block text-primary hover:underline">
                        Candidate {autoSandboxPatchProvenance(selectedJob)?.candidateId?.slice(0, 8)} · Run {autoSandboxPatchProvenance(selectedJob)?.loopRunId?.slice(0, 8)} →
                      </Link>
                      <div className="text-[11px] text-lime-600 bg-lime-50 border border-lime-200 rounded px-2 py-1 mt-1 font-medium">
                        <AlertTriangle className="h-3 w-3 inline mr-1" />
                        No branch push / no PR auto-create
                      </div>
                    </dd>
                  </div>
                )}
                <div><dt className="text-muted-foreground">{tk("automationJobs.field.created")}</dt><dd className="mt-0.5">{formatDate(selectedJob.createdAt)}</dd></div>
                {selectedJob.startedAt && <div><dt className="text-muted-foreground">{tk("automationJobs.field.started")}</dt><dd className="mt-0.5">{formatDate(selectedJob.startedAt)}</dd></div>}
                {selectedJob.completedAt && <div><dt className="text-muted-foreground">{tk("automationJobs.field.completed")}</dt><dd className="mt-0.5">{formatDate(selectedJob.completedAt)}</dd></div>}
                {selectedJob.agent && <div><dt className="text-muted-foreground">{tk("automationJobs.field.planner")}</dt><dd className="mt-0.5 font-medium">{selectedJob.agent.name}</dd></div>}
                {selectedJob.runner && <div><dt className="text-muted-foreground">{tk("automationJobs.field.runner")}</dt><dd className="mt-0.5">{selectedJob.runner.name}</dd></div>}
                {selectedJob.approvedByUser && <div><dt className="text-muted-foreground">{tk("automationJobs.field.approvedBy")}</dt><dd className="mt-0.5">{selectedJob.approvedByUser.displayName}</dd></div>}
              </dl>

              <section id="automation-execution" className="scroll-mt-4 space-y-4 border-t border-border pt-4">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" />
                  <h4 className="text-sm font-semibold text-foreground">{tk("automationJobs.executionEvidence")}</h4>
                </div>

              {/* M17E-2: Context binding */}
              {(selectedJob.contextValidationStatus && selectedJob.contextValidationStatus !== "NOT_REQUIRED") || selectedJob.localDocumentSnapshotId ? (
                <div className="rounded border border-border bg-muted/20 p-3 space-y-1.5">
                  <h4 className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                    <Shield className="h-3.5 w-3.5" /> {tk("automationJobs.contextBinding")}
                  </h4>
                  <div className="flex flex-wrap items-center gap-2">
                    <ContextBadge status={selectedJob.contextValidationStatus} />
                    {selectedJob.contextRequired ? <span className="text-xs text-muted-foreground">required for this mode</span> : null}
                  </div>
                  {selectedJob.mode === "VALIDATION_ONLY" && selectedJob.contextValidationStatus && ["PARTIAL", "STALE", "MISSING"].includes(selectedJob.contextValidationStatus) ? (
                    <div className="flex items-center gap-1.5 text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded px-2 py-1">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Validation-only job ran with {selectedJob.contextValidationStatus} project context — results may not reflect the full project state.
                    </div>
                  ) : null}
                  <div className="grid gap-0.5 text-xs text-muted-foreground font-mono">
                    <div>Local docs snapshot: {selectedJob.localDocumentSnapshotId ?? "—"}</div>
                    <div>Repository snapshot: {selectedJob.repositorySnapshotId ?? "—"}</div>
                  </div>
                  {Boolean(selectedJob.contextValidationSummary) ? (
                    <details className="text-xs text-muted-foreground">
                      <summary className="cursor-pointer hover:underline">Context provenance</summary>
                      <pre className="mt-1 bg-muted rounded p-2 overflow-auto max-h-32 font-mono whitespace-pre-wrap">
                        {JSON.stringify(selectedJob.contextValidationSummary, null, 2)}
                      </pre>
                    </details>
                  ) : null}
                </div>
              ) : null}

              {/* Step timeline */}
              {selectedJob.steps && selectedJob.steps.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground mb-2">{tk("automationJobs.stepTimeline")}</h4>
                  <div className="space-y-1.5">
                    {selectedJob.steps.map((step) => (
                      <div key={step.id} className="space-y-1">
                        <div className="flex items-start gap-2 text-xs">
                          <span className="text-muted-foreground shrink-0">#{step.sequence}</span>
                          <span className={cn("shrink-0 px-1.5 py-0.5 rounded text-xs font-medium",
                            step.status === "COMPLETED" ? "bg-green-50 text-green-700" :
                            step.status === "FAILED" ? "bg-red-50 text-red-700" :
                            step.status === "BLOCKED" ? "bg-yellow-50 text-yellow-700" :
                            "bg-gray-50 text-gray-600"
                          )}>{step.stepType}</span>
                          <span className="flex-1">{step.title}</span>
                          {Boolean((step.metadata as { timedOut?: boolean } | null)?.timedOut) ? (
                            <span className="shrink-0 text-red-600">timed out</span>
                          ) : step.exitCode !== null && (
                            <span className={cn("shrink-0", step.exitCode === 0 ? "text-green-600" : "text-red-600")}>
                              exit {step.exitCode}
                            </span>
                          )}
                          {step.durationMs !== null && <span className="shrink-0 text-muted-foreground">{step.durationMs}ms</span>}
                          {Boolean((step.metadata as { outputTruncated?: boolean } | null)?.outputTruncated) && (
                            <span className="shrink-0 text-yellow-700">output truncated</span>
                          )}
                        </div>
                        {(step.metadata as { cwd?: string } | null)?.cwd && (
                          <div className="ml-6 text-[11px] text-muted-foreground">cwd: {(step.metadata as { cwd?: string }).cwd}</div>
                        )}
                        {(step.metadata as { message?: string } | null)?.message && (
                          <div className="ml-6 text-[11px] text-red-600">{(step.metadata as { message?: string }).message}</div>
                        )}
                        {step.status === "FAILED" && (step.metadata as { failureSummary?: string } | null)?.failureSummary && (
                          <div className="ml-6">
                            <div className="text-[11px] font-medium text-red-700">Failure summary</div>
                            <ValidationOutput text={(step.metadata as { failureSummary?: string }).failureSummary!} />
                          </div>
                        )}
                        {step.status === "FAILED" && step.output && (
                          <ValidationOutput text={step.output} className="ml-6" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Execution plan */}
              {Boolean(selectedJob.planJson) && (
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground mb-1">{tk("automationJobs.executionPlan")}</h4>
                  <pre className="text-xs bg-muted/50 rounded p-3 overflow-auto max-h-48 whitespace-pre-wrap">
                    {JSON.stringify(selectedJob.planJson, null, 2)}
                  </pre>
                </div>
              )}

              {/* Logs preview */}
              {selectedJob.logsPreview && (
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground mb-1">{tk("automationJobs.logsPreview")}</h4>
                  <pre className="text-xs bg-muted/50 rounded p-3 overflow-auto max-h-32 whitespace-pre-wrap font-mono">
                    {selectedJob.logsPreview}
                  </pre>
                </div>
              )}

              {/* Imported patch status */}
              {selectedJob.importedPatchStatus && (
                <div className="rounded border border-border bg-muted/20 p-3 space-y-1">
                  <h4 className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                    <FileCode className="h-3.5 w-3.5" /> {tk("automationJobs.importedPatch")}
                  </h4>
                  <ImportedPatchStatusBadge status={selectedJob.importedPatchStatus} />
                </div>
              )}

              {/* Patch summary */}
              {selectedJob.patchSummary && (
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground mb-1">{tk("automationJobs.patchSummary")}</h4>
                  <p className="text-xs text-foreground">{selectedJob.patchSummary}</p>
                </div>
              )}

              {/* Implementation reports */}
              {selectedJob.implementationReports && selectedJob.implementationReports.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground mb-2">{tk("automationJobs.implementationReports")}</h4>
                  {selectedJob.implementationReports.map((report) => (
                    <div key={report.id} className="text-xs border rounded p-3 space-y-1">
                      <p className="font-medium">{report.summary}</p>
                      <p>Test result: <span className={cn("font-medium", report.testResult === "PASSED" ? "text-green-600" : report.testResult === "FAILED" ? "text-red-600" : "text-muted-foreground")}>{report.testResult}</span></p>
                      {report.filesChanged.length > 0 && <p>Files: {report.filesChanged.join(", ")}</p>}
                      {report.errors.length > 0 && <p className="text-destructive">Errors: {report.errors.join("; ")}</p>}
                    </div>
                  ))}
                </div>
              )}
              </section>

              <section id="automation-agent-review" className="scroll-mt-4">
                <AgentReviewCard
                  review={agentReview}
                  isKing={user?.role === "KING"}
                  canRegenerate={selectedJob.status === "NEEDS_REVIEW"}
                  isLoading={agentReviewLoading}
                  onRegenerate={() => void regenerateAgentReview()}
                />
              </section>

              {/* Patch Review panel */}
              {patchArtifacts.length > 0 && (
                <div id="automation-patch-review" className="scroll-mt-4">
                  <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                    <Eye className="h-3.5 w-3.5" /> Patch Review ({patchArtifacts.length})
                  </h4>
                  <div className="space-y-2">
                    {patchArtifacts.map((artifact) => (
                      <PatchReviewCard
                        key={artifact.id}
                        artifact={artifact}
                        isActing={patchActionId === artifact.id}
                        isKing={user?.role === "KING"}
                        onApprove={() => void approvePatch(artifact.id)}
                        onReject={() => void rejectPatch(artifact.id)}
                        onRevision={() => void requestRevision(artifact.id)}
                        onCreatePr={() => void createPr(artifact.id)}
                        onPushBranch={() => void pushBranch(artifact.id)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Actions in detail view */}
              <div id="automation-history" className="flex scroll-mt-4 flex-wrap gap-2 border-t pt-4">
                {selectedJob.status === "QUEUED" && (
                  <Button className="h-11 text-xs px-3" onClick={() => handleApprove(selectedJob.id)} disabled={actionJobId === selectedJob.id}>
                    <Play className="h-3.5 w-3.5 mr-1.5" />
                    {tk("automationJobs.approveExecution")}
                  </Button>
                )}
                {selectedJob.status === "QUEUED" && (
                  <Button
                    variant="outline"
                    className="h-11 text-xs px-3"
                    onClick={() => { setImportPatchJobId(selectedJob.id); setImportPatchText(""); setImportPatchError(null); }}
                  >
                    <Upload className="h-3.5 w-3.5 mr-1.5" />
                    {tk("automationJobs.importPatch")}
                  </Button>
                )}
                {!["COMPLETED", "CANCELLED", "FAILED"].includes(selectedJob.status) && (
                  <Button className="h-11 text-xs px-3 text-destructive border-destructive/30" variant="outline" onClick={() => handleCancel(selectedJob.id)} disabled={actionJobId === selectedJob.id}>
                    <X className="h-3.5 w-3.5 mr-1.5" />
                    {tk("automationJobs.cancel")}
                  </Button>
                )}
              </div>
            </>
          )}
              </Card>
            </>
          )}
        </main>
      </div>

      {/* Import Patch dialog */}
      {importPatchJobId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Import Patch">
          <div className="bg-background rounded-lg border border-border shadow-xl w-full max-w-2xl space-y-4 p-6">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold flex items-center gap-2">
                <FileCode className="h-4 w-4" /> Import Unified Diff
              </h3>
              <Button variant="ghost" className="h-7 w-7 p-0" onClick={() => setImportPatchJobId(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Paste a unified diff (output of <code className="font-mono bg-muted px-1 rounded">git diff</code> or similar). The patch will be validated server-side — blocked paths and secrets are rejected. The runner will apply it in the sandbox workspace and create a PatchArtifact for King review.
            </p>
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
              Import patch before approving the job so the runner receives the correct patch payload.
            </p>
            <textarea
              className="w-full font-mono text-xs rounded border border-border bg-muted/40 p-3 min-h-[240px] resize-y focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder={"diff --git a/src/foo.ts b/src/foo.ts\n--- a/src/foo.ts\n+++ b/src/foo.ts\n@@ -1,3 +1,4 @@\n ..."}
              value={importPatchText}
              onChange={(e) => setImportPatchText(e.target.value)}
              aria-label="Patch text"
            />
            {importPatchError && (
              <div className="flex items-start gap-2 rounded border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                {importPatchError}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" className="h-8 text-xs" onClick={() => setImportPatchJobId(null)}>
                Cancel
              </Button>
              <Button
                className="h-8 text-xs px-4"
                disabled={!importPatchText.trim() || importPatchLoading}
                onClick={() => void handleImportPatch()}
              >
                <Upload className="h-3.5 w-3.5 mr-1.5" />
                {importPatchLoading ? "Importing…" : "Import Patch"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const PATCH_STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "Pending — not yet applied", cls: "text-yellow-700 bg-yellow-50 border-yellow-200" },
  CHECK_FAILED: { label: "Check Failed — patch did not apply cleanly", cls: "text-red-700 bg-red-50 border-red-200" },
  APPLIED_IN_SANDBOX: { label: "Applied in Sandbox — awaiting validation", cls: "text-blue-700 bg-blue-50 border-blue-200" },
  VALIDATED: { label: "Validated — patch applied and all validation passed", cls: "text-green-700 bg-green-50 border-green-200" },
  VALIDATION_FAILED: { label: "Validation Failed — patch applied but validation commands failed", cls: "text-orange-700 bg-orange-50 border-orange-200" },
  NO_CHANGES: { label: "No Changes — patch applied but produced no file diff", cls: "text-gray-600 bg-gray-50 border-gray-200" }
};

function ImportedPatchStatusBadge({ status }: { status: string }) {
  const c = PATCH_STATUS_CONFIG[status] ?? { label: status, cls: "text-muted-foreground bg-muted border-border" };
  const isError = status === "CHECK_FAILED" || status === "VALIDATION_FAILED";
  const isSuccess = status === "VALIDATED";
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border", c.cls)}>
      {isError ? <AlertTriangle className="h-3 w-3" /> : isSuccess ? <CheckCircle className="h-3 w-3" /> : <FileCode className="h-3 w-3" />}
      {c.label}
    </span>
  );
}

function riskColor(risk: string) {
  switch (risk) {
    case "LOW": return "text-green-700 bg-green-50 border-green-200";
    case "MEDIUM": return "text-yellow-700 bg-yellow-50 border-yellow-200";
    case "HIGH": return "text-orange-700 bg-orange-50 border-orange-200";
    case "CRITICAL": return "text-red-700 bg-red-50 border-red-200";
    default: return "text-muted-foreground bg-muted border-border";
  }
}

function validationStatusBadge(status: string) {
  switch (status) {
    case "APPROVED": return "text-green-700 bg-green-50 border-green-200";
    case "REJECTED": return "text-red-700 bg-red-50 border-red-200";
    case "REVISION_REQUESTED": return "text-orange-700 bg-orange-50 border-orange-200";
    default: return "text-purple-700 bg-purple-50 border-purple-200";
  }
}

function reviewBadgeColor(value: string) {
  switch (value) {
    case "PASS":
    case "APPROVE":
    case "HIGH":
      return "text-green-700 bg-green-50 border-green-200";
    case "REQUEST_REVISION":
    case "VALIDATION_FAILED":
    case "NEEDS_FIX":
    case "MEDIUM":
      return "text-orange-700 bg-orange-50 border-orange-200";
    case "PATCH_FAILED":
    case "REJECT":
    case "RETRY_WITH_FIXED_PATCH":
      return "text-red-700 bg-red-50 border-red-200";
    case "RISK_REVIEW":
    case "REVIEW_MANUALLY":
    case "LOW":
      return "text-purple-700 bg-purple-50 border-purple-200";
    default:
      return "text-muted-foreground bg-muted border-border";
  }
}

function AgentReviewCard({
  review,
  isKing,
  canRegenerate,
  isLoading,
  onRegenerate
}: {
  review: AgentReviewSummaryDto | null;
  isKing: boolean;
  canRegenerate: boolean;
  isLoading: boolean;
  onRegenerate: () => void;
}) {
  return (
    <div className="rounded border border-border bg-muted/20 p-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 mr-auto">
          <Bot className="h-3.5 w-3.5" /> Agent Review
        </h4>
        {review && (
          <>
            <ReviewBadge label={review.verdict} />
            <ReviewBadge label={review.confidence} />
            <ReviewBadge label={review.kingRecommendation} />
          </>
        )}
        {isKing && canRegenerate && (
          <Button className="h-7 text-xs px-2.5" variant="outline" onClick={onRegenerate} disabled={isLoading}>
            <RefreshCw className={cn("h-3 w-3 mr-1", isLoading && "animate-spin")} />
            {review ? "Regenerate Agent Review" : "Generate Agent Review"}
          </Button>
        )}
      </div>

      {!review ? (
        <p className="text-xs text-muted-foreground">No agent review yet</p>
      ) : (
        <>
          <p className="text-sm text-foreground">{review.summary}</p>
          <div className="grid gap-3 md:grid-cols-2">
            <ReviewList title="What passed" items={review.whatPassed} empty="None recorded" />
            <ReviewList title="What failed" items={review.whatFailed} empty="None recorded" tone="danger" />
            <ReviewList title="Risk notes" items={review.riskNotes} empty="None recorded" />
            <ReviewList title="Next actions" items={review.nextActions} empty="None recorded" />
          </div>
          {review.failedCommands.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Failed commands</p>
              <div className="space-y-1">
                {review.failedCommands.map((cmd, index) => (
                  <div key={`${cmd.command}-${index}`} className="rounded border border-border bg-background/60 p-2 text-xs">
                    <div className="flex flex-wrap gap-2">
                      <span className="font-mono">{cmd.command}</span>
                      <span className="text-muted-foreground">exit {cmd.exitCode ?? "unknown"}</span>
                      {cmd.durationMs !== null && <span className="text-muted-foreground">{cmd.durationMs}ms</span>}
                    </div>
                    {cmd.cwd && <p className="mt-1 text-[11px] text-muted-foreground">cwd: {cmd.cwd}</p>}
                    {cmd.failureSummary && <p className="mt-1 text-[11px] text-red-700">{cmd.failureSummary}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {review.externalAgentPrompt && (
            <Button
              className="h-8 text-xs px-3"
              variant="outline"
              onClick={() => void navigator.clipboard?.writeText(review.externalAgentPrompt ?? "")}
            >
              <Clipboard className="h-3.5 w-3.5 mr-1.5" />
              Copy External Agent Prompt
            </Button>
          )}
        </>
      )}
    </div>
  );
}

function ReviewBadge({ label }: { label: string }) {
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border", reviewBadgeColor(label))}>
      {label}
    </span>
  );
}

function ReviewList({ title, items, empty, tone }: { title: string; items: string[]; empty: string; tone?: "danger" }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground mb-1">{title}</p>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-1 text-xs">
          {items.map((item, index) => (
            <li key={`${title}-${index}`} className={cn("rounded border border-border bg-background/60 px-2 py-1", tone === "danger" && "text-red-700 border-red-100 bg-red-50")}>
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PatchReviewCard({
  artifact,
  isActing,
  isKing,
  onApprove,
  onReject,
  onRevision,
  onCreatePr,
  onPushBranch
}: {
  artifact: PatchArtifactDto;
  isActing: boolean;
  isKing: boolean;
  onApprove: () => void;
  onReject: () => void;
  onRevision: () => void;
  onCreatePr: () => void;
  onPushBranch: () => void;
}) {
  const [showDiff, setShowDiff] = useState(false);
  const isHighRisk = artifact.riskLevel === "HIGH" || artifact.riskLevel === "CRITICAL";

  return (
    <div className="rounded border p-3 space-y-2 text-xs bg-muted/20">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={cn("px-2 py-0.5 rounded-full font-medium border", riskColor(artifact.riskLevel))}>
          {isHighRisk && <AlertTriangle className="h-3 w-3 inline mr-0.5" />}
          {artifact.riskLevel}
        </span>
        <span className={cn("px-2 py-0.5 rounded-full font-medium border", validationStatusBadge(artifact.validationStatus))}>
          {artifact.validationStatus}
        </span>
        {artifact.branchPushed && (
          <span className="px-2 py-0.5 rounded-full font-medium border text-blue-700 bg-blue-50 border-blue-200 flex items-center gap-1">
            <GitBranch className="h-3 w-3" /> {artifact.branchName}
          </span>
        )}
        <span className="ml-auto text-muted-foreground">{formatDate(artifact.createdAt)}</span>
      </div>

      <p className="font-medium text-sm">{artifact.title}</p>
      <p className="text-muted-foreground">{artifact.summary}</p>

      {artifact.filesChanged.length > 0 && (
        <p className="text-muted-foreground">
          Files: {artifact.filesChanged.slice(0, 4).join(", ")}
          {artifact.filesChanged.length > 4 && ` +${artifact.filesChanged.length - 4} more`}
        </p>
      )}

      {artifact.diffStat && (
        <pre className="bg-muted rounded p-2 overflow-auto max-h-20 font-mono">{artifact.diffStat}</pre>
      )}

      {isHighRisk && artifact.validationStatus === "PENDING" && (
        <div className="flex items-center gap-1.5 text-orange-700 bg-orange-50 border border-orange-200 rounded px-2 py-1">
          <Shield className="h-3.5 w-3.5 flex-shrink-0" />
          HIGH/CRITICAL risk — King approval required before branch push
        </div>
      )}

      {/* M17E-2: Base Context Used */}
      <div className="rounded border border-border bg-muted/30 p-2 space-y-1">
        <p className="font-medium text-muted-foreground">Base Context Used</p>
        <span className={cn("inline-flex px-2 py-0.5 rounded-full font-medium border", contextStatusColor(artifact.baseContextStatus ?? "MISSING"))}>
          {artifact.baseContextStatus ?? "MISSING"}
        </span>
        {(artifact.baseContextStatus === "STALE" || artifact.baseContextStatus === "MISSING" || !artifact.baseContextStatus) && (
          <div className="flex items-center gap-1.5 text-orange-700 bg-orange-50 border border-orange-200 rounded px-2 py-1">
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
            Patch created from {artifact.baseContextStatus ?? "MISSING"} project context — verify against current repository state before approving.
          </div>
        )}
        <div className="grid gap-0.5 text-muted-foreground font-mono">
          <div>Local docs snapshot: {artifact.localDocumentSnapshotId ?? "—"}</div>
          <div>Repository snapshot: {artifact.repositorySnapshotId ?? "—"}</div>
        </div>
      </div>

      {artifact.diffPreview && (
        <div>
          <button className="text-primary hover:underline" onClick={() => setShowDiff(!showDiff)}>
            {showDiff ? "Hide diff" : "Show diff preview"}
          </button>
          {showDiff && (
            <pre className="mt-1 bg-muted rounded p-2 overflow-auto max-h-40 font-mono whitespace-pre-wrap">
              {artifact.diffPreview}
              {artifact.fullPatchTruncated && "\n...[truncated]"}
            </pre>
          )}
        </div>
      )}

      {artifact.validationResults && artifact.validationResults.length > 0 && (
        <div className="space-y-0.5">
          {artifact.validationResults.map((vr, i) => (
            <div key={i} className="space-y-1">
              <div className="flex items-center gap-2">
                {vr.success ? <CheckCircle className="h-3.5 w-3.5 text-green-600 flex-shrink-0" /> : <XCircle className="h-3.5 w-3.5 text-red-600 flex-shrink-0" />}
                <span className="font-mono">{vr.command}</span>
                <span className="text-muted-foreground">
                  {vr.timedOut ? "timed out" : `exit ${vr.exitCode ?? "?"}`} · {vr.durationMs}ms
                </span>
                {vr.outputTruncated && <span className="text-yellow-700">output truncated</span>}
              </div>
              {vr.cwd && <div className="text-[11px] text-muted-foreground">cwd: {vr.cwd}</div>}
              {vr.timedOut && vr.message && <div className="text-[11px] text-red-600">{vr.message}</div>}
              {!vr.success && vr.failureSummary && (
                <div>
                  <div className="text-[11px] font-medium text-red-700">Failure summary</div>
                  <ValidationOutput text={vr.failureSummary} />
                </div>
              )}
              {!vr.success && (
                <ValidationOutput
                  text={`CWD: ${vr.cwd ?? "unknown"}\n${vr.timedOut ? `TIMED OUT: ${vr.message ?? ""}\n` : ""}STDOUT:\n${vr.stdout?.trim() || "(no stdout)"}\nSTDERR:\n${vr.stderr?.trim() || "(no stderr)"}`}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {isKing && artifact.validationStatus === "PENDING" && (
        <div className="flex gap-1.5 pt-1.5 border-t">
          <Button className="h-7 text-xs px-2.5" onClick={onApprove} disabled={isActing}>
            <CheckCircle className="h-3 w-3 mr-1" />Approve
          </Button>
          <Button className="h-7 text-xs px-2.5 text-destructive border-destructive/30" variant="outline" onClick={onReject} disabled={isActing}>
            <XCircle className="h-3 w-3 mr-1" />Reject
          </Button>
          <Button className="h-7 text-xs px-2.5" variant="outline" onClick={onRevision} disabled={isActing}>
            Request Revision
          </Button>
        </div>
      )}
      {isKing && artifact.validationStatus === "APPROVED" && !artifact.branchPushed && (
        <div className="flex flex-col gap-1 pt-1.5 border-t">
          <Button className="h-7 text-xs px-2.5" onClick={onPushBranch} disabled={isActing}>
            <GitBranch className="h-3 w-3 mr-1" />Push to branch
          </Button>
          <span className="text-[10px] text-muted-foreground">Queues a runner job to re-apply this approved patch and push a safe kingdom/job-* branch (only if branch push is enabled). No merge or deploy.</span>
        </div>
      )}
      {isKing && artifact.validationStatus === "APPROVED" && artifact.branchPushed && !artifact.prUrl && (
        <div className="flex gap-1.5 pt-1.5 border-t">
          <Button className="h-7 text-xs px-2.5" variant="outline" onClick={onCreatePr} disabled={isActing}>
            <GitBranch className="h-3 w-3 mr-1" />Create PR
          </Button>
        </div>
      )}
      {artifact.prUrl && (
        <a href={artifact.prUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
          <GitBranch className="h-3 w-3" />View PR
        </a>
      )}

      {artifact.reviewedByUser && (
        <p className="text-muted-foreground">
          {artifact.validationStatus} by {artifact.reviewedByUser.displayName}
          {artifact.reviewNote && ` — "${artifact.reviewNote}"`}
        </p>
      )}
    </div>
  );
}
