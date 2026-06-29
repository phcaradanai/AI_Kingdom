import type { AutomationJob, AutomationJobMode, AutomationJobStatus, Prisma } from "@prisma/client";
import { generateWithFallback } from "../ai/generateWithFallback.js";
import { createAIProviderFromConfig } from "../ai/providerFactory.js";
import { resolveEffectiveParameters } from "../ai/modelParameterResolver.js";
import { prisma } from "../db/prisma.js";
import { calculateCostUSDFromRegistry } from "./modelPricingService.js";
import { selectAIProviderRoute } from "./aiProviderRouter.js";
import { getNumberSetting } from "./settingsService.js";
import {
  buildTraceContext,
  completeAIUsageTrace,
  createAIUsageTrace,
  failAIUsageTrace
} from "./aiUsageTraceService.js";
import { auditLog } from "./auditService.js";
import { getLatestLocalDocumentSnapshot, listLocalDocumentRoots } from "./localDocumentAccessService.js";
import { buildContextValidationSummary, validateContextForAutomationJob } from "./projectContextBindingService.js";
import { createOrUpdateAgentReviewForJob, getAgentReviewForJob } from "./runnerResultReviewService.js";
import { buildExternalAgentPrompt } from "./externalAgentWorkOrderService.js";
import { createNotice } from "./royalSecretaryService.js";

/** Statuses that count as "active" for duplicate prevention */
export const ACTIVE_JOB_STATUSES: AutomationJobStatus[] = [
  "QUEUED",
  "APPROVED",
  "CLAIMED",
  "RUNNING",
  "NEEDS_REVIEW"
];

export interface CreateAutomationJobInput {
  workOrderId: string;
  projectId?: string | null;
  agentId?: string | null;
  mode?: AutomationJobMode;
  commandPolicy?: string | null;
  allowedCommands?: string[];
  createdByUserId: string;
  /** When true, build the assigned external agent's prompt and attach it so the runner can
   *  drive that agent's CLI headlessly (real edits) during a SANDBOX_PATCH job. */
  useAssignedAgentCli?: boolean;
}

export interface SubmitReportInput {
  summary: string;
  filesChanged: string[];
  commandsRun: string[];
  testsRun: string[];
  testResult: "NOT_RUN" | "PASSED" | "FAILED" | "PARTIAL";
  errors: string[];
  decisionsMade: string[];
  remainingWork: string[];
  nextRecommendedAction?: string | null;
  rawOutput?: string | null;
  patchSummary?: string | null;
  logsPreview?: string | null;
  contextUsed?: Record<string, unknown> | null;
}

/** Builds local-docs provenance for AutomationJob.provenance: snapshot id, root names/ids, scannedAt. */
export async function buildLocalDocsProvenance(projectId: string | null): Promise<Record<string, unknown> | null> {
  if (!projectId) return null;

  const [snapshot, roots] = await Promise.all([
    getLatestLocalDocumentSnapshot(projectId),
    listLocalDocumentRoots(projectId)
  ]);

  return {
    localDocumentSnapshotId: snapshot?.id ?? null,
    localDocumentRootIds: roots.map((r) => r.id),
    localDocumentRootNames: roots.map((r) => r.name),
    localDocumentSnapshotScannedAt: snapshot?.scannedAt ?? null,
    localDocumentSnapshotStale: snapshot?.isStale ?? true
  };
}

export async function createAutomationJob(input: CreateAutomationJobInput) {
  const workOrder = await prisma.workOrder.findUnique({
    where: { id: input.workOrderId },
    include: {
      project: true,
      assignedAgent: true,
      assignedExternalAgent: true
    }
  });

  if (!workOrder) {
    const err = new Error("WorkOrder not found");
    err.name = "NotFoundError";
    throw err;
  }

  // Prevent duplicate active jobs for the same WorkOrder
  const existing = await prisma.automationJob.findFirst({
    where: { workOrderId: input.workOrderId, status: { in: ACTIVE_JOB_STATUSES } }
  });
  if (existing) {
    const err = new Error("An active automation job already exists for this work order");
    err.name = "ConflictError";
    throw err;
  }

  // M17E-2: context binding is validated before any job is created.
  // SANDBOX_PATCH requires project linkage and FRESH local context;
  // VALIDATION_ONLY may proceed with degraded context but carries warnings.
  const mode = input.mode ?? "SANDBOX_PATCH";
  const contextOutcome = await validateContextForAutomationJob(input.workOrderId, mode);
  if (!contextOutcome.ok) {
    await auditLog({
      userId: input.createdByUserId,
      action: "automation_job_context_rejected",
      resourceType: "work_order",
      resourceId: input.workOrderId,
      metadata: { mode, contextStatus: contextOutcome.status, reason: contextOutcome.reason ?? "Context not fresh" }
    }).catch(() => undefined);
    const err = new Error(contextOutcome.reason ?? "Project context is not fresh enough for this job mode.");
    err.name = "ContextBindingError";
    throw err;
  }

  // Snapshot-ID drift gate: hard-block SANDBOX_PATCH and EXTERNAL_AGENT; warn-only for
  // VALIDATION_ONLY / OBSERVE / PLAN_ONLY so read-only jobs can still proceed.
  const snapshotDrift =
    workOrder.localDocumentSnapshotId != null &&
    contextOutcome.binding?.localDocumentSnapshotId != null &&
    workOrder.localDocumentSnapshotId !== contextOutcome.binding.localDocumentSnapshotId;

  if (snapshotDrift) {
    if (mode === "SANDBOX_PATCH" || mode === "EXTERNAL_AGENT") {
      await auditLog({
        userId: input.createdByUserId,
        action: "automation_job_context_rejected",
        resourceType: "work_order",
        resourceId: input.workOrderId,
        metadata: { mode, reason: "Snapshot drift: WorkOrder bound snapshot does not match latest project snapshot" }
      }).catch(() => undefined);
      const err = new Error(
        "The WorkOrder is bound to an outdated local-document snapshot. Re-bind context before creating a new job."
      );
      err.name = "ContextBindingError";
      throw err;
    }
    // For VALIDATION_ONLY / OBSERVE / PLAN_ONLY: job proceeds — drift warning is surfaced
    // in contextValidationSummary so the agent and King are aware but not blocked.
  }

  // Determine which agent to use for planning
  const planningAgentId = input.agentId ?? workOrder.assignedAgentId;

  let planJson: object | null = null;
  if (planningAgentId) {
    planJson = await generateExecutionPlan({
      workOrder,
      planningAgentId,
      userId: input.createdByUserId
    }).catch((err) => {
      console.warn("[AutomationJob] Plan generation failed (job still created):", err instanceof Error ? err.message : String(err));
      return null;
    });
  }

  const projectId = input.projectId ?? workOrder.projectId;
  const localDocsProvenance = await buildLocalDocsProvenance(projectId);
  const contextValidationSummary = buildContextValidationSummary(contextOutcome);
  // Attach drift warning for read-only modes that passed the gate above.
  if (snapshotDrift) {
    contextValidationSummary.snapshotDrift = {
      warning: true,
      workOrderSnapshotId: workOrder.localDocumentSnapshotId,
      latestSnapshotId: contextOutcome.binding?.localDocumentSnapshotId,
      message: "Work order bound to an older local-document snapshot. Consider re-binding context before patching."
    };
  }

  // Optional: attach the assigned external agent's prompt so the runner can drive that
  // agent's CLI headlessly during SANDBOX_PATCH. The runner still never pushes/merges/deploys.
  let agentCliProvenance: { type: string; prompt: string } | null = null;
  if (input.useAssignedAgentCli && mode === "SANDBOX_PATCH" && workOrder.assignedExternalAgent) {
    const prompt = await buildExternalAgentPrompt(input.workOrderId, workOrder.assignedExternalAgent.id).catch(() => null);
    if (prompt) {
      agentCliProvenance = { type: workOrder.assignedExternalAgent.type, prompt };
    }
  }

  const job = await prisma.automationJob.create({
    data: {
      workOrderId: input.workOrderId,
      projectId,
      agentId: planningAgentId,
      status: "QUEUED",
      mode,
      commandPolicy: input.commandPolicy,
      allowedCommands: input.allowedCommands ?? [],
      planJson: planJson ?? undefined,
      provenance: {
        ...(localDocsProvenance ?? {}),
        contextBinding: contextValidationSummary,
        ...(agentCliProvenance ? { agentCli: agentCliProvenance } : {})
      } as Prisma.InputJsonValue,
      localDocumentSnapshotId: contextOutcome.binding?.localDocumentSnapshotId ?? null,
      repositorySnapshotId: contextOutcome.binding?.repositorySnapshotId ?? null,
      contextRequired: contextOutcome.contextRequired,
      contextValidationStatus: contextOutcome.status,
      contextValidationSummary: contextValidationSummary as Prisma.InputJsonValue,
      createdByUserId: input.createdByUserId
    },
    include: jobInclude
  });

  await auditLog({
    userId: input.createdByUserId,
    action: "automation_job_created",
    resourceType: "AutomationJob",
    resourceId: job.id,
    metadata: { workOrderId: input.workOrderId, mode: job.mode, hasPlan: Boolean(planJson), contextStatus: contextOutcome.status }
  }).catch(() => undefined);

  return job;
}

export async function approveJob(jobId: string, userId: string) {
  const job = await prisma.automationJob.findUnique({ where: { id: jobId } });
  if (!job) {
    const err = new Error("AutomationJob not found");
    err.name = "NotFoundError";
    throw err;
  }
  if (job.status !== "QUEUED") {
    const err = new Error(`Cannot approve job in status ${job.status}`);
    err.name = "ConflictError";
    throw err;
  }

  const updated = await prisma.automationJob.update({
    where: { id: jobId },
    data: { status: "APPROVED", approvedByUserId: userId },
    include: jobInclude
  });

  await auditLog({
    userId,
    action: "automation_job_approved",
    resourceType: "AutomationJob",
    resourceId: jobId,
    metadata: { workOrderId: job.workOrderId }
  }).catch(() => undefined);

  return updated;
}

export async function cancelJob(jobId: string, userId: string) {
  const job = await prisma.automationJob.findUnique({ where: { id: jobId } });
  if (!job) {
    const err = new Error("AutomationJob not found");
    err.name = "NotFoundError";
    throw err;
  }
  if (job.status === "COMPLETED" || job.status === "CANCELLED") {
    const err = new Error(`Cannot cancel job in status ${job.status}`);
    err.name = "ConflictError";
    throw err;
  }

  const updated = await prisma.automationJob.update({
    where: { id: jobId },
    data: { status: "CANCELLED", completedAt: new Date() },
    include: jobInclude
  });

  await auditLog({
    userId,
    action: "automation_job_cancelled",
    resourceType: "AutomationJob",
    resourceId: jobId,
    metadata: { workOrderId: job.workOrderId }
  }).catch(() => undefined);

  return updated;
}

export async function claimJob(runnerId: string) {
  const job = await prisma.automationJob.findFirst({
    where: { status: "APPROVED", runnerId: null },
    orderBy: { createdAt: "asc" },
    include: jobInclude
  });

  if (!job) return null;

  const claimed = await prisma.automationJob.update({
    where: { id: job.id },
    data: { status: "CLAIMED", runnerId, startedAt: new Date() },
    include: jobInclude
  });

  await auditLog({
    action: "automation_job_claimed",
    resourceType: "AutomationJob",
    resourceId: job.id,
    metadata: { runnerId, workOrderId: job.workOrderId }
  }).catch(() => undefined);

  return claimed;
}

export async function updateJobStatus(
  jobId: string,
  runnerId: string,
  status: AutomationJobStatus,
  data?: { patchSummary?: string; logsPreview?: string; importedPatchStatus?: string }
) {
  const job = await prisma.automationJob.findFirst({
    where: { id: jobId, runnerId }
  });
  if (!job) {
    const err = new Error("AutomationJob not found or not owned by this runner");
    err.name = "NotFoundError";
    throw err;
  }

  const updated = await prisma.automationJob.update({
    where: { id: jobId },
    data: {
      status,
      ...(data?.patchSummary !== undefined ? { patchSummary: data.patchSummary } : {}),
      ...(data?.logsPreview !== undefined ? { logsPreview: data.logsPreview } : {}),
      ...(data?.importedPatchStatus !== undefined ? { importedPatchStatus: data.importedPatchStatus } : {}),
      ...(status === "COMPLETED" || status === "FAILED" ? { completedAt: new Date() } : {})
    },
    include: jobInclude
  });

  const action = status === "RUNNING" ? "automation_job_started" : status === "FAILED" ? "automation_job_failed" : undefined;
  if (action) {
    await auditLog({
      action,
      resourceType: "AutomationJob",
      resourceId: jobId,
      metadata: { runnerId, workOrderId: job.workOrderId, status }
    }).catch(() => undefined);
  }

  return updated;
}

export async function submitReport(jobId: string, runnerId: string, report: SubmitReportInput) {
  const job = await prisma.automationJob.findFirst({
    where: { id: jobId, runnerId },
    include: { externalAgentRuns: { orderBy: { createdAt: "desc" }, take: 1 } }
  });
  if (!job) {
    const err = new Error("AutomationJob not found or not owned by this runner");
    err.name = "NotFoundError";
    throw err;
  }
  if (job.status !== "RUNNING" && job.status !== "CLAIMED") {
    const err = new Error(`Cannot submit report for job in status ${job.status}`);
    err.name = "ConflictError";
    throw err;
  }

  // Bypass DataValueGate — runner-submitted reports are post-approval and ACTIONABLE
  const implReport = await prisma.implementationReport.create({
    data: {
      workOrderId: job.workOrderId,
      automationJobId: jobId,
      projectId: job.projectId,
      summary: report.summary,
      filesChanged: report.filesChanged,
      commandsRun: report.commandsRun,
      testsRun: report.testsRun,
      testResult: report.testResult,
      errors: report.errors,
      decisionsMade: report.decisionsMade,
      remainingWork: report.remainingWork,
      nextRecommendedAction: report.nextRecommendedAction,
      rawOutput: report.rawOutput,
      externalAgentId: job.externalAgentRuns[0]?.externalAgentId ?? null,
      // M17E-2: every report records exactly which snapshots the job ran against.
      localDocumentSnapshotId: job.localDocumentSnapshotId,
      repositorySnapshotId: job.repositorySnapshotId,
      contextUsed: (report.contextUsed ?? {
        localDocumentSnapshotId: job.localDocumentSnapshotId,
        repositorySnapshotId: job.repositorySnapshotId,
        contextValidationStatus: job.contextValidationStatus
      }) as Prisma.InputJsonValue
    }
  });

  await prisma.automationJob.update({
    where: { id: jobId },
    data: {
      status: "NEEDS_REVIEW",
      completedAt: new Date(),
      patchSummary: report.patchSummary ?? job.patchSummary,
      logsPreview: report.logsPreview ?? job.logsPreview
    }
  });

  await auditLog({
    action: "automation_report_submitted",
    resourceType: "AutomationJob",
    resourceId: jobId,
    metadata: { runnerId, workOrderId: job.workOrderId, reportId: implReport.id, testResult: report.testResult }
  }).catch(() => undefined);

  const review = await createOrUpdateAgentReviewForJob(jobId, { useAi: false }).catch((err) => {
    console.warn("[AutomationJob] Agent review generation failed; runner report remains submitted:", err instanceof Error ? err.message : String(err));
    return null;
  });

  // M24 Phase B: supervised auto-retry (opt-in, default OFF). Fire-and-forget so the
  // runner's response isn't blocked by retry plan generation; all gating is inside the
  // service (setting, mechanical verdict, LOW priority, cap, online runner). Lazy import
  // avoids an import cycle through supervisedRetryService.
  if (review?.verdict) {
    void import("./supervisedRetryService.js")
      .then(({ maybeAutoRetry }) =>
        maybeAutoRetry({ job: { id: job.id, mode: job.mode, createdByUserId: job.createdByUserId }, verdict: review.verdict })
      )
      .catch((err) => console.warn("[AutomationJob] Supervised auto-retry failed:", err instanceof Error ? err.message : String(err)));
  }

  if (job.mode === "EXTERNAL_AGENT") {
    await prisma.workOrder.update({
      where: { id: job.workOrderId },
      data: {
        status: "NEEDS_REVIEW",
        blockedReason: report.errors.length ? report.errors[0] : null
      }
    }).catch(() => undefined);
    await notifyKingExternalAgentReport({
      job,
      reportId: implReport.id,
      summary: report.summary,
      errors: report.errors,
      testResult: report.testResult
    }).catch((err) => {
      console.warn("[AutomationJob] Failed to create external agent completion notice:", err instanceof Error ? err.message : String(err));
    });
  }

  // Keep the product workflow synchronized with runner evidence without coupling
  // generic jobs to the workflow layer. No matching WorkflowRun is a normal no-op.
  await import("./decreeToDoneWorkflowService.js")
    .then(({ reconcileWorkflowForAutomationJob }) => reconcileWorkflowForAutomationJob(jobId))
    .catch((err) => {
      console.warn("[AutomationJob] Workflow reconciliation failed:", err instanceof Error ? err.message : String(err));
    });

  return implReport;
}

async function notifyKingExternalAgentReport(input: {
  job: Pick<AutomationJob, "id" | "workOrderId" | "projectId"> & {
    externalAgentRuns: Array<{ id: string; externalAgentId: string }>;
  };
  reportId: string;
  summary: string;
  errors: string[];
  testResult: SubmitReportInput["testResult"];
}) {
  const workOrder = await prisma.workOrder.findUnique({
    where: { id: input.job.workOrderId },
    select: {
      title: true,
      projectId: true,
      createdByUserId: true,
      assignedAgent: { select: { name: true, title: true } }
    }
  });
  const run = input.job.externalAgentRuns[0] ?? null;

  // The steward (assigned kingdom agent, e.g. royal-architect) supervises the work;
  // its verdict and King recommendation are produced by the agent review step that
  // runs immediately before this notification.
  const review = await getAgentReviewForJob(input.job.id).catch(() => null);
  const stewardName = workOrder?.assignedAgent?.name ?? review?.reviewerAgent?.name ?? "Royal council";
  const nextActions = Array.isArray(review?.nextActions) ? (review?.nextActions as string[]).slice(0, 3) : [];
  const verdictNeedsAttention = review
    ? review.verdict !== "PASS"
    : input.errors.length > 0;
  const severity = verdictNeedsAttention ? "WARNING" : "INFO";
  const statusLine = verdictNeedsAttention
    ? `${stewardName} reviewed the external agent's work and it needs King attention before it can be accepted.`
    : `${stewardName} reviewed the external agent's work and it is ready for King review.`;

  const notice = await createNotice({
    title: verdictNeedsAttention
      ? `External agent needs review: ${workOrder?.title ?? input.job.workOrderId}`
      : `External agent completed: ${workOrder?.title ?? input.job.workOrderId}`,
    content: [
      statusLine,
      "",
      `Work Order: ${workOrder?.title ?? input.job.workOrderId}`,
      `Steward: ${stewardName}${workOrder?.assignedAgent?.title ? ` (${workOrder.assignedAgent.title})` : ""}`,
      review ? `Verdict: ${review.verdict}` : null,
      review ? `Recommendation for King: ${review.kingRecommendation}` : null,
      `Automation Job ID: ${input.job.id}`,
      run ? `External Agent Run ID: ${run.id}` : null,
      `Implementation Report ID: ${input.reportId}`,
      `Test Result: ${input.testResult}`,
      "",
      review?.summary ?? input.summary,
      nextActions.length ? `Next actions: ${nextActions.join(" | ")}` : null,
      input.errors.length ? `Errors: ${input.errors.slice(0, 3).join(" | ")}` : null
    ].filter(Boolean).join("\n"),
    severity,
    sourceType: "AutomationJob",
    sourceId: input.job.id,
    projectId: input.job.projectId ?? undefined,
    traceId: run?.id
  });

  // Collect the outcome into Kingdom Memory so the result is retained, not just
  // surfaced once in a notice. Saved against the King who created the work order.
  if (workOrder?.createdByUserId && review) {
    const memoryContent = [
      `External agent execution for "${workOrder.title}".`,
      `${stewardName} verdict: ${review.verdict}. Recommendation for King: ${review.kingRecommendation}.`,
      review.summary,
      nextActions.length ? `Next actions: ${nextActions.join(" | ")}` : null
    ].filter(Boolean).join(" ").slice(0, 700);

    await prisma.memory.create({
      data: {
        type: "LESSON",
        title: `Outcome: ${workOrder.title}`.slice(0, 200),
        content: memoryContent,
        tags: ["external-agent", "outcome", review.verdict.toLowerCase()],
        importance: verdictNeedsAttention ? "HIGH" : "MEDIUM",
        source: "external-agent-review",
        projectId: workOrder.projectId ?? undefined,
        createdBy: workOrder.createdByUserId
      }
    }).catch((err) => {
      console.warn("[AutomationJob] Failed to save outcome memory:", err instanceof Error ? err.message : String(err));
    });
  }

  await auditLog({
    action: "external_agent_completion_notice_created",
    resourceType: "Notice",
    resourceId: notice?.id ?? null,
    metadata: {
      automationJobId: input.job.id,
      workOrderId: input.job.workOrderId,
      externalAgentRunId: run?.id ?? null,
      implementationReportId: input.reportId,
      severity
    }
  }).catch(() => undefined);
}

export async function heartbeat(runnerId: string, meta?: { version?: string; hostname?: string; agentCapabilities?: unknown }) {
  const hasCapabilities = Array.isArray(meta?.agentCapabilities);
  const runner = await prisma.agentRunner.update({
    where: { id: runnerId },
    data: {
      status: "ONLINE",
      lastHeartbeatAt: new Date(),
      ...(meta?.version ? { version: meta.version } : {}),
      ...(meta?.hostname ? { hostname: meta.hostname } : {}),
      ...(hasCapabilities
        ? { agentCapabilities: meta!.agentCapabilities as Prisma.InputJsonValue, capabilitiesUpdatedAt: new Date() }
        : {})
    }
  });

  await auditLog({
    action: "runner_heartbeat",
    resourceType: "AgentRunner",
    resourceId: runnerId,
    metadata: { hostname: runner.hostname, version: runner.version }
  }).catch(() => undefined);

  return runner;
}

export async function listJobs(filters?: {
  status?: AutomationJobStatus;
  workOrderId?: string;
  projectId?: string;
}) {
  return prisma.automationJob.findMany({
    where: {
      ...(filters?.status ? { status: filters.status } : {}),
      ...(filters?.workOrderId ? { workOrderId: filters.workOrderId } : {}),
      ...(filters?.projectId ? { projectId: filters.projectId } : {})
    },
    include: jobInclude,
    orderBy: { updatedAt: "desc" }
  });
}

export async function getJob(jobId: string) {
  return prisma.automationJob.findUnique({
    where: { id: jobId },
    include: {
      ...jobInclude,
      steps: { orderBy: { sequence: "asc" } },
      implementationReports: { orderBy: { createdAt: "desc" } }
    }
  });
}

export async function listRunners() {
  return prisma.agentRunner.findMany({ orderBy: { updatedAt: "desc" } });
}

const jobInclude = {
  workOrder: {
    select: {
      id: true,
      title: true,
      status: true,
      projectId: true,
      assignedExternalAgentId: true,
      assignedExternalAgent: {
        select: {
          id: true,
          name: true,
          type: true,
          command: true,
          workingDirectory: true,
          environmentProfile: true,
          bridgeEnabled: true,
          maxRuntimeSeconds: true,
          requiresApproval: true,
          capabilities: true,
          safetyLevel: true
        }
      }
    }
  },
  project: { select: { id: true, name: true } },
  agent: { select: { id: true, slug: true, name: true, title: true } },
  runner: { select: { id: true, name: true, status: true } },
  createdByUser: { select: { id: true, displayName: true } },
  approvedByUser: { select: { id: true, displayName: true } },
  externalAgentRuns: {
    orderBy: { createdAt: "desc" },
    take: 1,
    select: {
      id: true,
      externalAgentId: true,
      workOrderId: true,
      automationJobId: true,
      status: true,
      inputPrompt: true,
      attemptNumber: true,
      metadata: true,
      createdAt: true,
      updatedAt: true
    }
  }
} as const;

// --- AI plan generation ---

async function generateExecutionPlan(opts: {
  workOrder: { id: string; title: string; objective: string; context: string; instructions: string; constraints: string; acceptanceCriteria: string[]; validationCommands: string[]; projectId: string | null };
  planningAgentId: string;
  userId: string;
}): Promise<object> {
  const { workOrder, planningAgentId, userId } = opts;

  const agent = await prisma.agent.findUnique({ where: { id: planningAgentId } });
  if (!agent) throw new Error(`Planning agent not found: ${planningAgentId}`);

  const defaultMaxTokens = await getNumberSetting("AI_MAX_TOKENS", 700);

  const route = await selectAIProviderRoute({
    agent: agent as Parameters<typeof selectAIProviderRoute>[0]["agent"],
    taskMode: "PLAN",
    requiredCapabilities: { chat: true }
  });

  const effectiveParams = resolveEffectiveParameters(
    agent as Parameters<typeof resolveEffectiveParameters>[0],
    route.provider.type,
    defaultMaxTokens
  );

  const providerCalls = [{ provider: route.provider, model: route.model }, ...route.fallbackAttempts]
    .map(({ provider, model }) => {
      try {
        return { provider: createAIProviderFromConfig(provider), model };
      } catch {
        return null;
      }
    })
    .filter((c): c is NonNullable<typeof c> => Boolean(c));

  const planningPrompt = buildPlanningPrompt(workOrder);

  const trace = await createAIUsageTrace({
    actorUserId: userId,
    actorRole: "KING",
    triggerType: "SYSTEM_ACTION",
    triggerRoute: "POST /api/work-orders/:id/automation-job",
    triggerLabel: workOrder.title,
    projectId: workOrder.projectId,
    agentId: agent.id,
    sourceType: "AUTOMATION_JOB",
    sourceId: workOrder.id,
    operation: "automation_plan_generation",
    purpose: "Automation execution plan for sandbox runner",
    providerId: route.provider.id,
    providerType: route.provider.type,
    providerName: route.provider.name,
    model: route.model,
    prompt: planningPrompt,
    metadata: { agentSlug: agent.slug },
    attributionStatus: "TRUSTED"
  });

  const traceContext = buildTraceContext({
    traceId: trace.traceId,
    sourceType: "AUTOMATION_JOB",
    sourceId: workOrder.id,
    operation: "automation_plan_generation",
    purpose: "Automation execution plan for sandbox runner",
    triggerType: "SYSTEM_ACTION",
    attributionStatus: "TRUSTED"
  });

  let generated: Awaited<ReturnType<typeof generateWithFallback>>;
  try {
    generated = await generateWithFallback(
      providerCalls,
      {
        command: planningPrompt,
        mode: "PLAN",
        agentName: agent.name,
        agentRole: agent.title,
        agentSkills: agent.skills,
        systemPrompt: agent.systemPrompt ?? agent.prompt ?? "",
        responseStyle: agent.responseStyle ?? "",
        temperature: agent.temperature ?? undefined,
        maxTokens: agent.maxTokens ?? defaultMaxTokens,
        modelParameters: effectiveParams
      },
      traceContext
    );
  } catch (err) {
    await failAIUsageTrace(trace.traceId, err).catch(() => undefined);
    throw err;
  }

  const cost = await calculateCostUSDFromRegistry(generated.providerId ?? generated.providerName, generated.modelUsed, generated.usage);

  await prisma.usageRecord.create({
    data: {
      traceId: trace.traceId,
      attributionStatus: "TRUSTED",
      agentId: agent.id,
      provider: generated.providerName,
      providerId: generated.providerId ?? generated.providerName,
      model: generated.modelUsed,
      promptTokens: generated.usage.promptTokens,
      completionTokens: generated.usage.completionTokens,
      totalTokens: generated.usage.totalTokens,
      estimatedCostUSD: cost.costUSD,
      estimatedCostLocal: cost.costUSD,
      currency: "USD",
      costSource: cost.costSource,
      costConfidence: cost.costConfidence,
      pricingSource: cost.source,
      purpose: "automation_plan_generation",
      sourceType: "AUTOMATION_JOB",
      sourceId: workOrder.id
    }
  });

  await completeAIUsageTrace(trace.traceId, generated.response, {
    model: generated.modelUsed,
    providerId: generated.providerId ?? generated.providerName
  });

  return parseExecutionPlan(generated.response);
}

function buildPlanningPrompt(workOrder: {
  title: string;
  objective: string;
  context: string;
  instructions: string;
  constraints: string;
  acceptanceCriteria: string[];
  validationCommands: string[];
}): string {
  return `You are a sandbox execution planner. Given a work order, produce a JSON execution plan.

## Work Order: ${workOrder.title}

**Objective:** ${workOrder.objective}

${workOrder.context ? `**Context:** ${workOrder.context}\n` : ""}
${workOrder.instructions ? `**Instructions:** ${workOrder.instructions}\n` : ""}
${workOrder.constraints ? `**Constraints:** ${workOrder.constraints}\n` : ""}

**Acceptance Criteria:**
${workOrder.acceptanceCriteria.map((c) => `- ${c}`).join("\n")}

**Validation Commands:**
${workOrder.validationCommands.map((c) => `- ${c}`).join("\n")}

Produce a JSON execution plan with this exact structure:
{
  "summary": "One sentence summary of what will be done",
  "estimatedComplexity": "LOW" | "MEDIUM" | "HIGH",
  "steps": [
    {
      "type": "FILE_CHANGE",
      "description": "What change to make",
      "filePath": "relative/path/to/file",
      "action": "CREATE" | "MODIFY" | "DELETE"
    },
    {
      "type": "COMMAND",
      "description": "Why this command is run",
      "command": "npm",
      "args": ["run", "test", "--workspace", "@ai-kingdom/api"]
    }
  ]
}

Return only valid JSON. No markdown fences.`;
}

function parseExecutionPlan(response: string): object {
  const cleaned = response
    .replace(/^```(?:json)?/m, "")
    .replace(/```$/m, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (typeof parsed === "object" && parsed !== null) return parsed;
  } catch {
    // Fallback: wrap raw response
  }

  return {
    summary: "Plan generation succeeded but response could not be parsed as JSON.",
    estimatedComplexity: "UNKNOWN",
    rawResponse: response.slice(0, 2000),
    steps: []
  };
}
