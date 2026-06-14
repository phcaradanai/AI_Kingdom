import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, AlertTriangle, Bot, CheckCircle, Clock, GitBranch, Play, RefreshCw, Shield, X, XCircle, AlertCircle, Eye, Cpu, Zap } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { ValidationOutput } from "@/components/ValidationOutput";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import { cn, formatDate } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import type { AgentRunnerDto, AutomationJobDto, AutomationJobStatus, PatchArtifactDto } from "@/types/api";

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
  const [patchArtifacts, setPatchArtifacts] = useState<PatchArtifactDto[]>([]);
  const [patchActionId, setPatchActionId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [jobsData, runnersData] = await Promise.all([
        api.automationJobs(statusFilter ? { status: statusFilter } : undefined),
        api.runners()
      ]);
      setJobs(jobsData);
      setRunners(runnersData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [statusFilter]);

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
      const [job, patches] = await Promise.all([
        api.automationJob(jobId),
        api.patchArtifacts({ automationJobId: jobId })
      ]);
      setSelectedJob(job);
      setPatchArtifacts(patches);
    } finally {
      setDetailLoading(false);
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

  const onlineRunners = runners.filter((r) => r.status === "ONLINE");
  const activeJobs = jobs.filter((j) => ["QUEUED", "APPROVED", "CLAIMED", "RUNNING"].includes(j.status));
  const reviewJobs = jobs.filter((j) => j.status === "NEEDS_REVIEW");

  const selectCls = "h-9 rounded-md border border-border bg-input px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary";

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        eyebrow="Living Agents"
        title="Automation Jobs"
        description="Sandboxed autonomous execution jobs for the Living Agent Runner"
        action={
          <Button variant="outline" onClick={load}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Online Runners</p>
          <p className={cn("text-2xl font-bold mt-1", onlineRunners.length > 0 ? "text-green-600" : "text-gray-500")}>
            {onlineRunners.length}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Active Jobs</p>
          <p className="text-2xl font-bold mt-1 text-orange-600">{activeJobs.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Needs Review</p>
          <p className="text-2xl font-bold mt-1 text-purple-600">{reviewJobs.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Total Jobs</p>
          <p className="text-2xl font-bold mt-1">{jobs.length}</p>
        </Card>
      </div>

      {/* Runners section */}
      {runners.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
            <Cpu className="h-4 w-4" /> Registered Runners
          </h3>
          <div className="flex flex-wrap gap-2">
            {runners.map((r) => (
              <span
                key={r.id}
                className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border", runnerStatusColor(r.status))}
              >
                <span className={cn("h-1.5 w-1.5 rounded-full", r.status === "ONLINE" ? "bg-green-500" : "bg-gray-400")} />
                {r.name}
                {r.hostname && <span className="opacity-70">({r.hostname})</span>}
                {r.lastHeartbeatAt && (
                  <span className="opacity-60">· {formatDate(r.lastHeartbeatAt)}</span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {actionError && (
        <div className="rounded-md border border-destructive/20 bg-destructive/5 px-4 py-2 text-sm text-destructive">
          {actionError}
        </div>
      )}

      {/* Jobs list */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
            <Bot className="h-4 w-4" /> Jobs
          </h3>
          <select
            className={selectCls}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All statuses</option>
            {(["QUEUED", "APPROVED", "CLAIMED", "RUNNING", "NEEDS_REVIEW", "COMPLETED", "FAILED", "CANCELLED"] as AutomationJobStatus[]).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : jobs.length === 0 ? (
          <Card className="p-8 text-center">
            <Bot className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No automation jobs yet.</p>
            <p className="text-xs text-muted-foreground mt-1">Create one from a Work Order page.</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {jobs.map((job) => (
              <Card
                key={job.id}
                className={cn("p-4 cursor-pointer transition-colors hover:bg-accent/40", selectedJob?.id === job.id && "ring-1 ring-primary")}
                onClick={() => loadDetail(job.id)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border", statusColor(job.status))}>
                        {statusIcon(job.status)}
                        {job.status}
                      </span>
                      <ModeBadge mode={job.mode} />
                      <ContextBadge status={job.contextValidationStatus} />
                      {autoValidationProvenance(job) && <LivingLoopSourceBadge />}
                      {autoSandboxPatchProvenance(job) && <AutoSandboxPatchBadge />}
                      {job.runner && (
                        <span className="text-xs text-muted-foreground">Runner: {job.runner.name}</span>
                      )}
                    </div>
                    <p className="text-sm font-medium mt-1 truncate">{job.workOrder.title}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      {job.agent && <span>Agent: {job.agent.name}</span>}
                      {job.project && <span>Project: {job.project.name}</span>}
                      <span>{formatDate(job.createdAt)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {job.status === "QUEUED" && (
                      <Button
                        className="h-8 text-xs px-3"
                        variant="outline"
                        disabled={actionJobId === job.id}
                        onClick={(e) => { e.stopPropagation(); handleApprove(job.id); }}
                      >
                        <Play className="h-3 w-3 mr-1" />
                        Approve
                      </Button>
                    )}
                    {!["COMPLETED", "CANCELLED", "FAILED"].includes(job.status) && (
                      <Button
                        className="h-8 text-xs px-3 text-destructive hover:text-destructive"
                        variant="ghost"
                        disabled={actionJobId === job.id}
                        onClick={(e) => { e.stopPropagation(); handleCancel(job.id); }}
                      >
                        <X className="h-3 w-3 mr-1" />
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>

                {/* Patch summary / logs preview */}
                {job.patchSummary && (
                  <p className="mt-2 text-xs text-muted-foreground border-t pt-2 line-clamp-2">{job.patchSummary}</p>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Detail panel */}
      {selectedJob && (
        <Card className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Job Detail: {selectedJob.workOrder.title}</h3>
            <Button variant="ghost" className="h-8 text-xs px-3" onClick={() => setSelectedJob(null)}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {detailLoading ? (
            <p className="text-sm text-muted-foreground">Loading detail...</p>
          ) : (
            <>
              <dl className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div>
                  <dt className="text-muted-foreground">Status</dt>
                  <dd className={cn("inline-flex items-center gap-1 mt-0.5 px-2 py-0.5 rounded-full border", statusColor(selectedJob.status))}>
                    {statusIcon(selectedJob.status)} {selectedJob.status}
                  </dd>
                </div>
                <div><dt className="text-muted-foreground">Mode</dt><dd className="mt-0.5 font-medium">{modeLabel(selectedJob.mode)}</dd></div>
                {autoValidationProvenance(selectedJob) && (
                  <div>
                    <dt className="text-muted-foreground">Source</dt>
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
                    <dt className="text-muted-foreground">Source</dt>
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
                <div><dt className="text-muted-foreground">Created</dt><dd className="mt-0.5">{formatDate(selectedJob.createdAt)}</dd></div>
                {selectedJob.startedAt && <div><dt className="text-muted-foreground">Started</dt><dd className="mt-0.5">{formatDate(selectedJob.startedAt)}</dd></div>}
                {selectedJob.completedAt && <div><dt className="text-muted-foreground">Completed</dt><dd className="mt-0.5">{formatDate(selectedJob.completedAt)}</dd></div>}
                {selectedJob.agent && <div><dt className="text-muted-foreground">Planner Agent</dt><dd className="mt-0.5 font-medium">{selectedJob.agent.name}</dd></div>}
                {selectedJob.runner && <div><dt className="text-muted-foreground">Runner</dt><dd className="mt-0.5">{selectedJob.runner.name}</dd></div>}
                {selectedJob.approvedByUser && <div><dt className="text-muted-foreground">Approved By</dt><dd className="mt-0.5">{selectedJob.approvedByUser.displayName}</dd></div>}
              </dl>

              {/* M17E-2: Context binding */}
              {(selectedJob.contextValidationStatus && selectedJob.contextValidationStatus !== "NOT_REQUIRED") || selectedJob.localDocumentSnapshotId ? (
                <div className="rounded border border-border bg-muted/20 p-3 space-y-1.5">
                  <h4 className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                    <Shield className="h-3.5 w-3.5" /> Context Binding
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
                  {selectedJob.contextValidationSummary ? (
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
                  <h4 className="text-xs font-semibold text-muted-foreground mb-2">Step Timeline</h4>
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
              {selectedJob.planJson && (
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground mb-1">Execution Plan</h4>
                  <pre className="text-xs bg-muted/50 rounded p-3 overflow-auto max-h-48 whitespace-pre-wrap">
                    {JSON.stringify(selectedJob.planJson, null, 2)}
                  </pre>
                </div>
              )}

              {/* Logs preview */}
              {selectedJob.logsPreview && (
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground mb-1">Logs Preview</h4>
                  <pre className="text-xs bg-muted/50 rounded p-3 overflow-auto max-h-32 whitespace-pre-wrap font-mono">
                    {selectedJob.logsPreview}
                  </pre>
                </div>
              )}

              {/* Patch summary */}
              {selectedJob.patchSummary && (
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground mb-1">Patch Summary</h4>
                  <p className="text-xs text-foreground">{selectedJob.patchSummary}</p>
                </div>
              )}

              {/* Implementation reports */}
              {selectedJob.implementationReports && selectedJob.implementationReports.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground mb-2">Implementation Reports</h4>
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

              {/* Patch Review panel */}
              {patchArtifacts.length > 0 && (
                <div>
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
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Actions in detail view */}
              <div className="flex gap-2 pt-2 border-t">
                {selectedJob.status === "QUEUED" && (
                  <Button className="h-8 text-xs px-3" onClick={() => handleApprove(selectedJob.id)} disabled={actionJobId === selectedJob.id}>
                    <Play className="h-3.5 w-3.5 mr-1.5" />
                    Approve for Execution
                  </Button>
                )}
                {!["COMPLETED", "CANCELLED", "FAILED"].includes(selectedJob.status) && (
                  <Button className="h-8 text-xs px-3 text-destructive border-destructive/30" variant="outline" onClick={() => handleCancel(selectedJob.id)} disabled={actionJobId === selectedJob.id}>
                    <X className="h-3.5 w-3.5 mr-1.5" />
                    Cancel
                  </Button>
                )}
              </div>
            </>
          )}
        </Card>
      )}
    </div>
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

function PatchReviewCard({
  artifact,
  isActing,
  isKing,
  onApprove,
  onReject,
  onRevision,
  onCreatePr
}: {
  artifact: PatchArtifactDto;
  isActing: boolean;
  isKing: boolean;
  onApprove: () => void;
  onReject: () => void;
  onRevision: () => void;
  onCreatePr: () => void;
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
