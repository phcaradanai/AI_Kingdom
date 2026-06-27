/**
 * Work Continuity Service
 *
 * Aggregates the full execution history of a WorkOrder so external agents,
 * the context-pack builder, and API consumers can understand:
 *   - what has already been tried
 *   - what failed and why
 *   - what decisions were made
 *   - whether context is fresh enough to proceed
 *   - what the next recommended action is
 *
 * All gate decisions are deterministic — no LLM involvement.
 */

import type { AgentReviewSummary, AutomationJob, AutomationJobMode, ExternalAgentRun, HandoffBrief, ImplementationReport, WorkOrder } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { getProjectContextBinding, validateContextForAutomationJob } from "./projectContextBindingService.js";

// Defined locally to avoid circular dependency with automationJobService.ts
const ACTIVE_JOB_STATUSES_SET = new Set(["QUEUED", "APPROVED", "CLAIMED", "RUNNING", "NEEDS_REVIEW"]);
const ACTIVE_RUN_STATUSES_SET = new Set(["QUEUED", "RUNNING", "WAITING", "NEEDS_REVIEW"]);
const FAILURE_VERDICTS_SET = new Set(["NEEDS_FIX", "PATCH_FAILED", "VALIDATION_FAILED"]);

export type TaskMode = "NEW_TASK" | "CONTINUATION" | "REVISION" | "RETRY_AFTER_FAILURE" | "VALIDATION_ONLY";

export type ContextFreshnessView = {
  workOrderStatus: string;
  latestProjectStatus: string | null;
  snapshotMatch: boolean;
  requiredAction: "NONE" | "REFRESH_CONTEXT";
  warnings: string[];
};

export type FailedAttempt = {
  runId: string;
  attemptNumber: number;
  errorMessage: string | null;
  outputSummary: string | null;
  completedAt: Date | null;
  verdict: string | null;
  failedCommands: string[];
  whatFailed: string[];
};

export type SourceReference = {
  type: string;
  id: string;
  summary: string;
};

export type WorkContinuityView = {
  workOrder: WorkOrder & { project: { id: string; name: string } | null };
  project: { id: string; name: string } | null;
  taskMode: TaskMode;
  contextFreshness: ContextFreshnessView;
  localDocumentSnapshotId: string | null;
  repositorySnapshotId: string | null;
  handoffBriefs: HandoffBrief[];
  externalAgentRuns: ExternalAgentRun[];
  implementationReports: ImplementationReport[];
  reviewSummaries: AgentReviewSummary[];
  automationJobs: AutomationJob[];
  activeJob: AutomationJob | null;
  activeExternalAgentRun: ExternalAgentRun | null;
  failedAttempts: FailedAttempt[];
  filesChanged: string[];
  decisionsMade: string[];
  failedCommands: string[];
  remainingWork: string[];
  doNotRepeat: string[];
  nextRecommendedAction: string;
  sourceReferences: SourceReference[];
};

export type ExecutionReadinessResult = {
  ok: boolean;
  requiredAction: "NONE" | "REFRESH_CONTEXT" | "WAIT_FOR_ACTIVE_JOB" | "WAIT_FOR_ACTIVE_RUN";
  existingJob: AutomationJob | null;
  existingRun: ExternalAgentRun | null;
  reason?: string;
};

function asStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item)).filter((item) => item.trim().length > 0)
    : [];
}

function trimText(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 3)}...` : normalized;
}

function resolveTaskMode(
  workOrder: WorkOrder,
  reports: ImplementationReport[],
  latestReview: AgentReviewSummary | null,
  requestedJobMode?: string | null
): TaskMode {
  if (requestedJobMode === "VALIDATION_ONLY") return "VALIDATION_ONLY";

  if (workOrder.autoRetryCount > 0) {
    if (latestReview && FAILURE_VERDICTS_SET.has(latestReview.verdict)) {
      return "RETRY_AFTER_FAILURE";
    }
    return "REVISION";
  }

  if (reports.length > 0) return "CONTINUATION";
  return "NEW_TASK";
}

function resolveNextAction(
  workOrder: WorkOrder,
  latestReport: ImplementationReport | null,
  latestReview: AgentReviewSummary | null,
  activeJob: AutomationJob | null
): string {
  if (activeJob) {
    return `Monitor active automation job ${activeJob.id} (status: ${activeJob.status}).`;
  }
  if (latestReport?.nextRecommendedAction) {
    return latestReport.nextRecommendedAction;
  }
  const nextActions = asStringList(latestReview?.nextActions);
  if (nextActions.length > 0) return nextActions[0]!;

  switch (workOrder.status) {
    case "NEEDS_REVIEW":
      return "Review the implementation report and approve, reject, or request revision.";
    case "IN_PROGRESS":
      return "Await the agent's implementation report.";
    case "FAILED":
      return "Analyze the failure, update the work order, and retry.";
    case "COMPLETED":
      return "Work order is complete.";
    default:
      return "Dispatch the work order to an external agent or create an automation job.";
  }
}

export async function getWorkContinuity(workOrderId: string): Promise<WorkContinuityView> {
  const [workOrder, reports, handoffBriefs, runs, jobs, reviewSummaries] = await Promise.all([
    prisma.workOrder.findUnique({
      where: { id: workOrderId },
      include: { project: { select: { id: true, name: true } } }
    }),
    prisma.implementationReport.findMany({
      where: { workOrderId },
      orderBy: { createdAt: "desc" }
    }),
    prisma.handoffBrief.findMany({
      where: { workOrderId },
      orderBy: { createdAt: "desc" }
    }),
    prisma.externalAgentRun.findMany({
      where: { workOrderId },
      orderBy: { createdAt: "desc" }
    }),
    prisma.automationJob.findMany({
      where: { workOrderId },
      orderBy: { createdAt: "desc" }
    }),
    prisma.agentReviewSummary.findMany({
      where: { workOrderId },
      orderBy: { createdAt: "desc" }
    })
  ]);

  if (!workOrder) {
    const err = new Error("WorkOrder not found");
    err.name = "NotFoundError";
    throw err;
  }

  const latestReview = reviewSummaries[0] ?? null;
  const latestReport = reports[0] ?? null;

  // Get latest project snapshot for freshness comparison
  let latestProjectSnapshotId: string | null = null;
  let latestProjectStatus: string | null = null;
  if (workOrder.projectId) {
    const binding = await getProjectContextBinding(workOrder.projectId).catch(() => null);
    latestProjectSnapshotId = binding?.localDocumentSnapshotId ?? null;
    latestProjectStatus = binding?.status ?? null;
  }

  // Context freshness: check WO status AND snapshot-id match
  const snapshotMatch =
    !workOrder.localDocumentSnapshotId ||
    !latestProjectSnapshotId ||
    workOrder.localDocumentSnapshotId === latestProjectSnapshotId;

  const freshnessWarnings: string[] = [];
  if (!snapshotMatch) {
    freshnessWarnings.push(
      `Work order is bound to local docs snapshot ${workOrder.localDocumentSnapshotId} but the latest project snapshot is ${latestProjectSnapshotId}. Rebind context before executing.`
    );
  }
  if (workOrder.contextBindingStatus === "STALE") {
    freshnessWarnings.push("Work order context binding is STALE.");
  } else if (workOrder.contextBindingStatus === "MISSING") {
    freshnessWarnings.push("Work order has no context binding.");
  } else if (workOrder.contextBindingStatus === "PARTIAL") {
    freshnessWarnings.push("Work order context binding is PARTIAL.");
  }

  const contextFreshness: ContextFreshnessView = {
    workOrderStatus: workOrder.contextBindingStatus,
    latestProjectStatus,
    snapshotMatch,
    requiredAction:
      workOrder.contextBindingStatus !== "FRESH" || !snapshotMatch ? "REFRESH_CONTEXT" : "NONE",
    warnings: freshnessWarnings
  };

  const taskMode = resolveTaskMode(workOrder, reports, latestReview);

  // Aggregate from all reports
  const allFilesChanged = [...new Set(reports.flatMap((r) => r.filesChanged))];
  const allDecisionsMade = [...new Set(reports.flatMap((r) => r.decisionsMade))];
  const allRemainingWork = latestReport?.remainingWork ?? [];

  // All failed commands from reviews
  const allFailedCommands = [
    ...new Set(reviewSummaries.flatMap((r) => asStringList(r.failedCommands)))
  ];

  // Failed run details
  const failedRuns = runs.filter((r) => r.status === "FAILED" || r.status === "TIMED_OUT");
  const failedAttempts: FailedAttempt[] = failedRuns.map((run) => {
    const review = reviewSummaries.find((rs) => rs.automationJobId === run.automationJobId) ?? null;
    return {
      runId: run.id,
      attemptNumber: run.attemptNumber,
      errorMessage: run.errorMessage,
      outputSummary: run.outputText ? trimText(run.outputText, 500) : null,
      completedAt: run.completedAt,
      verdict: review?.verdict ?? null,
      failedCommands: review ? asStringList(review.failedCommands) : [],
      whatFailed: review ? asStringList(review.whatFailed) : []
    };
  });

  // doNotRepeat = union of failed commands and notable report errors
  const allErrors = reports.flatMap((r) => r.errors);
  const doNotRepeat = [...new Set([...allFailedCommands, ...allErrors])].filter(Boolean);

  const activeJob = jobs.find((j) => ACTIVE_JOB_STATUSES_SET.has(j.status)) ?? null;
  const activeExternalAgentRun = runs.find((r) => ACTIVE_RUN_STATUSES_SET.has(r.status)) ?? null;

  const nextRecommendedAction = resolveNextAction(workOrder, latestReport, latestReview, activeJob);

  // Source references for provenance
  const sourceReferences: SourceReference[] = [];
  if (workOrder.sourceType && workOrder.sourceId) {
    sourceReferences.push({
      type: workOrder.sourceType,
      id: workOrder.sourceId,
      summary: `Source: ${workOrder.sourceType} ${workOrder.sourceId}`
    });
  }
  if (workOrder.localDocumentSnapshotId) {
    sourceReferences.push({
      type: "LocalDocumentSnapshot",
      id: workOrder.localDocumentSnapshotId,
      summary: "Local docs snapshot bound when work order context was last set"
    });
  }
  if (workOrder.repositorySnapshotId) {
    sourceReferences.push({
      type: "RepositorySnapshot",
      id: workOrder.repositorySnapshotId,
      summary: "Repository snapshot at context binding"
    });
  }
  for (const brief of handoffBriefs.slice(0, 3)) {
    sourceReferences.push({ type: "HandoffBrief", id: brief.id, summary: brief.title });
  }

  return {
    workOrder,
    project: workOrder.project,
    taskMode,
    contextFreshness,
    localDocumentSnapshotId: workOrder.localDocumentSnapshotId,
    repositorySnapshotId: workOrder.repositorySnapshotId,
    handoffBriefs,
    externalAgentRuns: runs,
    implementationReports: reports,
    reviewSummaries,
    automationJobs: jobs,
    activeJob,
    activeExternalAgentRun,
    failedAttempts,
    filesChanged: allFilesChanged,
    decisionsMade: allDecisionsMade,
    failedCommands: allFailedCommands,
    remainingWork: allRemainingWork,
    doNotRepeat,
    nextRecommendedAction,
    sourceReferences
  };
}

/**
 * Resolves whether a new job/run can be created for a work order.
 *
 * Checks in order:
 * 1. Duplicate active AutomationJob
 * 2. Duplicate active ExternalAgentRun
 * 3. Context freshness (delegates to validateContextForAutomationJob)
 * 4. Snapshot-id match: WO bound to latest project snapshot
 *
 * All gates are deterministic — no LLM.
 */
export async function resolveExecutionReadiness(
  workOrderId: string,
  mode: AutomationJobMode
): Promise<ExecutionReadinessResult> {
  const workOrder = await prisma.workOrder.findUnique({
    where: { id: workOrderId },
    select: { id: true, projectId: true, contextBindingStatus: true, localDocumentSnapshotId: true }
  });
  if (!workOrder) {
    const err = new Error("WorkOrder not found");
    err.name = "NotFoundError";
    throw err;
  }

  // 1. Active AutomationJob guard
  const existingJob = await prisma.automationJob.findFirst({
    where: { workOrderId, status: { in: [...ACTIVE_JOB_STATUSES_SET] as never[] } }
  });
  if (existingJob) {
    return {
      ok: false,
      requiredAction: "WAIT_FOR_ACTIVE_JOB",
      existingJob,
      existingRun: null,
      reason: `An active automation job already exists for this work order (${existingJob.id}, status: ${existingJob.status}). Wait for it to complete or cancel it first.`
    };
  }

  // 2. Active ExternalAgentRun guard
  const existingRun = await prisma.externalAgentRun.findFirst({
    where: { workOrderId, status: { in: [...ACTIVE_RUN_STATUSES_SET] as never[] } }
  });
  if (existingRun) {
    return {
      ok: false,
      requiredAction: "WAIT_FOR_ACTIVE_RUN",
      existingJob: null,
      existingRun,
      reason: `An active external agent run already exists for this work order (${existingRun.id}, status: ${existingRun.status}). Wait for it to complete before dispatching again.`
    };
  }

  // 3. Context freshness (existing gate)
  const contextOutcome = await validateContextForAutomationJob(workOrderId, mode);
  if (!contextOutcome.ok) {
    return {
      ok: false,
      requiredAction: "REFRESH_CONTEXT",
      existingJob: null,
      existingRun: null,
      reason: contextOutcome.reason
    };
  }

  // 4. Snapshot-id match: verify WO is bound to latest project snapshot
  // validateContextForAutomationJob returns ok=true (binding.status===FRESH) but the WO
  // may still point at an older snapshot if a re-scan ran after the WO was bound.
  if (workOrder.localDocumentSnapshotId && contextOutcome.binding?.localDocumentSnapshotId) {
    if (workOrder.localDocumentSnapshotId !== contextOutcome.binding.localDocumentSnapshotId) {
      return {
        ok: false,
        requiredAction: "REFRESH_CONTEXT",
        existingJob: null,
        existingRun: null,
        reason: `Work order is bound to local docs snapshot ${workOrder.localDocumentSnapshotId} but the latest project snapshot is ${contextOutcome.binding.localDocumentSnapshotId}. Rebind context (POST /api/work-orders/${workOrderId}/bind-context) before executing.`
      };
    }
  }

  return { ok: true, requiredAction: "NONE", existingJob: null, existingRun: null };
}
