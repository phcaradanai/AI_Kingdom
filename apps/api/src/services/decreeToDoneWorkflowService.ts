import type {
  WorkflowRun,
  WorkflowRunStatus,
  WorkflowStepKey,
  WorkflowStepStatus
} from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { auditLog } from "./auditService.js";
import { approveJob } from "./automationJobService.js";
import { approveKnowledgeCandidate } from "./agentKnowledgeService.js";
import { createExternalAgentBridgeJob } from "./externalAgentBridgeService.js";
import {
  getExternalAgentReadiness,
  requestKingExternalAgentChoice,
  resolveExternalAgentChoiceMatter
} from "./externalAgentReadinessService.js";
import { processTaskWithGrandVizier } from "./grandVizierOrchestrator.js";
import { scanLocalDocumentRoot, listLocalDocumentRoots } from "./localDocumentAccessService.js";
import { planExecutionWorkOrderFromSession } from "./plannerAgentService.js";
import { approvePatchArtifact } from "./patchArtifactService.js";
import { bindFreshContextToWorkOrder, getProjectContextBinding } from "./projectContextBindingService.js";
import { getBooleanSetting } from "./settingsService.js";
import { dispatchRetry, MECHANICAL_RETRY_VERDICTS } from "./supervisedRetryService.js";

const TERMINAL_WORK_ORDER_STATUSES = ["ARCHIVED", "CANCELLED", "FAILED"] as const;
const IN_FLIGHT_JOB_STATUSES = new Set(["QUEUED", "APPROVED", "CLAIMED", "RUNNING"]);
const SEMANTIC_ESCALATION_VERDICTS = new Set(["NEEDS_FIX", "RISK_REVIEW", "UNKNOWN"]);

const inProcessRuns = new Map<string, Promise<WorkflowView>>();

export type WorkflowPrimaryAction =
  | "Start Workflow"
  | "Continue Workflow"
  | "Fix Context"
  | "Choose Agent"
  | "Dispatch"
  | "Review Result"
  | "Retry"
  | "Accept & Learn";

export type WorkflowView = Awaited<ReturnType<typeof loadWorkflowView>>;

export function serializeWorkflowView(view: WorkflowView) {
  return {
    ...view,
    createdAt: view.createdAt.toISOString(),
    updatedAt: view.updatedAt.toISOString(),
    steps: view.steps.map((step) => ({
      ...step,
      startedAt: step.startedAt?.toISOString() ?? null,
      completedAt: step.completedAt?.toISOString() ?? null,
      createdAt: step.createdAt.toISOString(),
      updatedAt: step.updatedAt.toISOString()
    }))
  };
}

export async function startOrContinueDecreeToDoneWorkflow(taskId: string, userId: string): Promise<WorkflowView> {
  const existing = inProcessRuns.get(taskId);
  if (existing) return existing;
  const running = continueWorkflow(taskId, userId).finally(() => inProcessRuns.delete(taskId));
  inProcessRuns.set(taskId, running);
  return running;
}

async function continueWorkflow(taskId: string, userId: string): Promise<WorkflowView> {
  const task = await prisma.task.findFirst({ where: { id: taskId, createdBy: userId } });
  if (!task) throw namedError("NotFoundError", "Task not found");
  if (task.mode !== "BUILD") throw namedError("ConflictError", "DECREE_TO_DONE workflows require a BUILD decree.");

  let run = await prisma.workflowRun.upsert({
    where: { sourceTaskId: task.id },
    create: {
      sourceTaskId: task.id,
      projectId: task.projectId,
      status: "RUNNING",
      currentStep: "INTAKE_DECREE",
      nextAction: "Continue Workflow"
    },
    update: { projectId: task.projectId }
  });

  if (run.status === "COMPLETED") return loadWorkflowView(run.id);

  await completeStep(run.id, "INTAKE_DECREE", "Task", task.id, `BUILD decree accepted: ${task.title}`);

  // Once a job exists, downstream runner evidence is the source of truth. Do not
  // re-enter context/council/planner gates or mutate the bound execution snapshot.
  if (run.automationJobId && run.workOrderId) {
    const existingJob = await prisma.automationJob.findUnique({ where: { id: run.automationJobId } });
    if (existingJob && IN_FLIGHT_JOB_STATUSES.has(existingJob.status)) return loadWorkflowView(run.id);
    if (existingJob) return reconcileResult(run.id, run.workOrderId, existingJob.id);
  }

  // Context is repaired before the council creates executable work. Only registered,
  // approved roots are scanned; the workflow never accepts an arbitrary path.
  run = await setRun(run.id, "RUNNING", "CHECK_CONTEXT", "Fix Context");
  await startStep(run.id, "CHECK_CONTEXT", "Project", task.projectId);
  if (!task.projectId) {
    return block(run.id, "CHECK_CONTEXT", "The BUILD decree has no project. Assign it to a project before execution.", "Fix Context");
  }
  let binding = await getProjectContextBinding(task.projectId);
  if (binding.status !== "FRESH") {
    const roots = (await listLocalDocumentRoots(task.projectId)).filter((root) => root.isActive);
    if (roots.length === 0) {
      return block(run.id, "CHECK_CONTEXT", "No approved local-document root is configured for this project.", "Fix Context");
    }
    const failures: string[] = [];
    for (const root of roots) {
      try {
        const snapshot = await scanLocalDocumentRoot(root.id);
        if (snapshot.scanStatus === "FAILED") failures.push(`${root.name}: scan failed`);
      } catch (error) {
        failures.push(`${root.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    binding = await getProjectContextBinding(task.projectId);
    if (binding.status !== "FRESH") {
      const reason = [
        `Project context is ${binding.status} after scanning approved local docs.`,
        ...failures,
        ...binding.warnings
      ].filter(Boolean).join(" ");
      return block(run.id, "CHECK_CONTEXT", reason, "Fix Context");
    }
  }
  await completeStep(run.id, "CHECK_CONTEXT", "LocalDocumentSnapshot", binding.localDocumentSnapshotId, "Project context is FRESH.");

  // Reuse the completed council session. The orchestrator's legacy async planner is
  // disabled here so exactly one synchronous planner owns WorkOrder creation.
  run = await setRun(run.id, "RUNNING", "RUN_COUNCIL", "Continue Workflow");
  await startStep(run.id, "RUN_COUNCIL", "Task", task.id);
  let council = await prisma.councilSession.findFirst({
    where: { taskId: task.id, status: "COMPLETED" },
    orderBy: { createdAt: "desc" }
  });
  if (!council) {
    const inFlight = await prisma.councilSession.findFirst({ where: { taskId: task.id, status: "RUNNING" } });
    if (inFlight) {
      await startStep(run.id, "RUN_COUNCIL", "CouncilSession", inFlight.id, "Council is still running.");
      return loadWorkflowView(run.id);
    }
    council = await processTaskWithGrandVizier(task.id, userId, { skipAutoPlanner: true });
  }
  await completeStep(run.id, "RUN_COUNCIL", "CouncilSession", council.id, "Council execution decision completed.");

  run = await setRun(run.id, "RUNNING", "CREATE_WORK_ORDER", "Continue Workflow");
  await startStep(run.id, "CREATE_WORK_ORDER", "CouncilSession", council.id);
  let workOrder = council.createdWorkOrderId
    ? await prisma.workOrder.findUnique({ where: { id: council.createdWorkOrderId } })
    : null;
  workOrder ??= await prisma.workOrder.findFirst({
    where: {
      sourceType: "COUNCIL_SESSION",
      sourceId: council.id,
      status: { notIn: [...TERMINAL_WORK_ORDER_STATUSES] }
    },
    orderBy: { createdAt: "asc" }
  });
  if (!workOrder) {
    const planner = await planExecutionWorkOrderFromSession(council.id, userId);
    workOrder = planner.createdWorkOrder;
    if (!workOrder) {
      return fail(run.id, "CREATE_WORK_ORDER", planner.skipReason ?? "Planner did not create an execution-ready Work Order.");
    }
  }
  if (workOrder.status === "DRAFT") {
    workOrder = await prisma.workOrder.update({ where: { id: workOrder.id }, data: { status: "READY" } });
  }
  if (workOrder.status !== "READY" && workOrder.status !== "IN_PROGRESS" && workOrder.status !== "NEEDS_REVIEW") {
    return block(run.id, "CREATE_WORK_ORDER", `Work Order is ${workOrder.status}; it must be READY before dispatch.`, "Continue Workflow");
  }
  const rebound = await bindFreshContextToWorkOrder(workOrder.id, { userId });
  workOrder = rebound.workOrder;
  if (workOrder.contextBindingStatus !== "FRESH") {
    return block(run.id, "CHECK_CONTEXT", `Work Order context is ${workOrder.contextBindingStatus} after binding.`, "Fix Context", workOrder.id);
  }
  await prisma.workflowRun.update({ where: { id: run.id }, data: { workOrderId: workOrder.id } });
  await completeStep(run.id, "CREATE_WORK_ORDER", "WorkOrder", workOrder.id, "One execution-ready Work Order is linked to the council.");

  // A prior job is always reused. A pending review is a hard stop: never dispatch again.
  let job = await prisma.automationJob.findFirst({
    where: { workOrderId: workOrder.id },
    orderBy: { createdAt: "desc" }
  });
  if (!job) {
    run = await setRun(run.id, "RUNNING", "RESOLVE_AGENT", "Choose Agent");
    await startStep(run.id, "RESOLVE_AGENT", "WorkOrder", workOrder.id);
    const readiness = await getExternalAgentReadiness();
    const readyAgents = readiness.agents.filter((agent) => agent.ready);
    const assignedReady = readyAgents.find((agent) => agent.agentId === workOrder!.assignedExternalAgentId);
    const requireKingChoice = await getBooleanSetting("REQUIRE_KING_EXTERNAL_AGENT_CHOICE", true);

    if (!assignedReady) {
      if (readyAgents.length === 1) {
        workOrder = await assignExternalAgent(workOrder.id, readyAgents[0]!.agentId);
      } else if (readyAgents.length > 1 && requireKingChoice) {
        await prisma.workOrder.update({ where: { id: workOrder.id }, data: { assignedExternalAgentId: null } });
        const choice = await requestKingExternalAgentChoice({ workOrderId: workOrder.id, workOrderTitle: workOrder.title, projectId: workOrder.projectId });
        await blockStep(run.id, "RESOLVE_AGENT", `King choice required; decision item ${choice.matterId} lists ${readyAgents.length} ready agents.`);
        await setRun(run.id, "BLOCKED", "RESOLVE_AGENT", "Choose Agent", null, workOrder.id);
        return loadWorkflowView(run.id);
      } else if (readyAgents.length > 1) {
        workOrder = await assignExternalAgent(workOrder.id, readyAgents[0]!.agentId);
      } else {
        const reasons = readiness.agents.length
          ? readiness.agents.map((agent) => `${agent.name}: ${agent.reason}`).join("; ")
          : "No active external agents are configured.";
        return block(run.id, "RESOLVE_AGENT", reasons, "Choose Agent", workOrder.id);
      }
    }
    await completeStep(run.id, "RESOLVE_AGENT", "ExternalAgent", workOrder.assignedExternalAgentId, "A bridge-ready external agent is selected.");

    run = await setRun(run.id, "RUNNING", "DISPATCH_RUNNER", "Dispatch", null, workOrder.id);
    await startStep(run.id, "DISPATCH_RUNNER", "WorkOrder", workOrder.id);
    if (!(await getBooleanSetting("EXTERNAL_AGENT_BRIDGE_ENABLED", false))) {
      return block(run.id, "DISPATCH_RUNNER", "External Agent Bridge is disabled.", "Dispatch", workOrder.id);
    }
    const currentReadiness = await getExternalAgentReadiness();
    if (!currentReadiness.runnerOnline) {
      return block(run.id, "DISPATCH_RUNNER", "No online runner is available.", "Dispatch", workOrder.id);
    }
    const bridge = await createExternalAgentBridgeJob({
      workOrderId: workOrder.id,
      externalAgentId: workOrder.assignedExternalAgentId,
      createdByUserId: userId
    });
    job = await approveJob(bridge.job.id, userId);
  } else if (job.status === "QUEUED") {
    job = await approveJob(job.id, userId);
  }

  await prisma.workflowRun.update({ where: { id: run.id }, data: { automationJobId: job.id } });
  await completeStep(run.id, "DISPATCH_RUNNER", "AutomationJob", job.id, `Runner job is ${job.status}.`);

  if (IN_FLIGHT_JOB_STATUSES.has(job.status)) {
    await startStep(run.id, "VALIDATE_RESULT", "AutomationJob", job.id, "Waiting for runner result and validation evidence.");
    await setRun(run.id, "RUNNING", "VALIDATE_RESULT", "Continue Workflow", null, workOrder.id, job.id);
    return loadWorkflowView(run.id);
  }

  return reconcileResult(run.id, workOrder.id, job.id);
}

async function reconcileResult(runId: string, workOrderId: string, jobId: string): Promise<WorkflowView> {
  const [job, report, review, patches] = await Promise.all([
    prisma.automationJob.findUniqueOrThrow({ where: { id: jobId } }),
    prisma.implementationReport.findFirst({ where: { automationJobId: jobId }, orderBy: { createdAt: "desc" } }),
    prisma.agentReviewSummary.findUnique({ where: { automationJobId: jobId } }),
    prisma.patchArtifact.findMany({ where: { automationJobId: jobId }, orderBy: { createdAt: "desc" } })
  ]);

  if (job.status === "FAILED") {
    return block(runId, "RETRY_OR_ESCALATE", "Runner job failed without a reviewable result. Inspect the job and decide the next action.", "Review Result", workOrderId, jobId);
  }
  if (!report) {
    return block(runId, "VALIDATE_RESULT", "Runner completed without an Implementation Report.", "Review Result", workOrderId, jobId);
  }
  const noChanges = report.filesChanged.length === 0 && /\bNO_CHANGES\b/i.test(`${report.summary}\n${report.rawOutput ?? ""}`);
  if (patches.length === 0 && !noChanges) {
    return block(runId, "VALIDATE_RESULT", "Runner result is missing a PatchArtifact and did not explicitly report NO_CHANGES.", "Review Result", workOrderId, jobId);
  }
  await completeStep(runId, "VALIDATE_RESULT", "ImplementationReport", report.id, `Validation result: ${report.testResult}.`);
  if (!review) {
    return block(runId, "REVIEW_RESULT", "Implementation Report exists but AgentReviewSummary is missing.", "Review Result", workOrderId, jobId);
  }
  await completeStep(runId, "REVIEW_RESULT", "AgentReviewSummary", review.id, `${review.verdict}: ${review.summary}`);

  if (MECHANICAL_RETRY_VERDICTS.has(review.verdict)) {
    await reviewStep(runId, "RETRY_OR_ESCALATE", "AgentReviewSummary", review.id, "Mechanical failure can be retried under the supervised retry policy.");
    await setRun(runId, "NEEDS_REVIEW", "RETRY_OR_ESCALATE", "Retry", review.summary, workOrderId, jobId);
  } else if (review.verdict === "PASS") {
    await reviewStep(runId, "ARCHIVE_LEARNING", "AgentReviewSummary", review.id, "Passing work is ready for explicit King acceptance.");
    await setRun(runId, "NEEDS_REVIEW", "ARCHIVE_LEARNING", "Accept & Learn", null, workOrderId, jobId);
  } else if (SEMANTIC_ESCALATION_VERDICTS.has(review.verdict) || review.verdict !== "PASS") {
    await reviewStep(runId, "RETRY_OR_ESCALATE", "AgentReviewSummary", review.id, "Semantic or risky result requires a King decision.");
    await setRun(runId, "NEEDS_REVIEW", "RETRY_OR_ESCALATE", "Review Result", review.summary, workOrderId, jobId);
  }
  return loadWorkflowView(runId);
}

export async function chooseWorkflowExternalAgent(workflowRunId: string, externalAgentId: string, userId: string): Promise<WorkflowView> {
  const run = await ownedWorkflow(workflowRunId, userId);
  if (!run.workOrderId) throw namedError("ConflictError", "Workflow has no Work Order yet.");
  const readiness = await getExternalAgentReadiness();
  const selected = readiness.agents.find((agent) => agent.agentId === externalAgentId);
  if (!selected?.ready) throw namedError("ConflictError", selected?.reason ?? "External agent is not bridge-ready.");
  await assignExternalAgent(run.workOrderId, externalAgentId);
  await completeStep(run.id, "RESOLVE_AGENT", "ExternalAgent", externalAgentId, `${selected.name} selected by the King.`);
  return startOrContinueDecreeToDoneWorkflow(run.sourceTaskId, userId);
}

export async function retryDecreeToDoneWorkflow(workflowRunId: string, userId: string): Promise<WorkflowView> {
  const run = await ownedWorkflow(workflowRunId, userId);
  if (!run.automationJobId) throw namedError("ConflictError", "Workflow has no retryable Automation Job.");
  const retry = await dispatchRetry({ jobId: run.automationJobId, triggeredBy: "KING", userId });
  if (!retry.retried) throw namedError("ConflictError", `Retry not available: ${retry.reason}`);
  await startStep(run.id, "RETRY_OR_ESCALATE", "AutomationJob", retry.newJobId, `Supervised retry attempt ${retry.attempt} dispatched.`);
  await setRun(run.id, "RUNNING", "VALIDATE_RESULT", "Continue Workflow", null, run.workOrderId, retry.newJobId);
  return loadWorkflowView(run.id);
}

export async function acceptAndLearnDecreeToDoneWorkflow(workflowRunId: string, userId: string): Promise<WorkflowView> {
  const run = await ownedWorkflow(workflowRunId, userId);
  if (!run.workOrderId || !run.automationJobId) throw namedError("ConflictError", "Workflow evidence is incomplete.");
  const [job, report, review, patches] = await Promise.all([
    prisma.automationJob.findUniqueOrThrow({ where: { id: run.automationJobId } }),
    prisma.implementationReport.findFirst({ where: { automationJobId: run.automationJobId }, orderBy: { createdAt: "desc" } }),
    prisma.agentReviewSummary.findUnique({ where: { automationJobId: run.automationJobId } }),
    prisma.patchArtifact.findMany({ where: { automationJobId: run.automationJobId } })
  ]);
  if (job.status !== "NEEDS_REVIEW" || !report || !review) {
    throw namedError("ConflictError", "Runner report and agent review must be in NEEDS_REVIEW before acceptance.");
  }
  if (review.verdict !== "PASS") {
    throw namedError("ConflictError", `Only a PASS review can be accepted; current verdict is ${review.verdict}.`);
  }
  const noChanges = report.filesChanged.length === 0 && /\bNO_CHANGES\b/i.test(`${report.summary}\n${report.rawOutput ?? ""}`);
  if (patches.length === 0 && !noChanges) throw namedError("ConflictError", "A PatchArtifact is required unless the report explicitly says NO_CHANGES.");

  for (const patch of patches.filter((item) => item.validationStatus === "PENDING")) {
    await approvePatchArtifact(patch.id, userId, "Accepted through DECREE_TO_DONE workflow.");
  }

  const candidates = await prisma.agentKnowledgeCandidate.findMany({
    where: { sourceType: "AGENT_REVIEW", sourceId: run.automationJobId, status: "PENDING" },
    select: { id: true }
  });
  let learned = 0;
  for (const candidate of candidates) {
    if (await approveKnowledgeCandidate(candidate.id, userId)) learned++;
  }

  await prisma.$transaction([
    prisma.automationJob.update({ where: { id: job.id }, data: { status: "COMPLETED" } }),
    prisma.workOrder.update({ where: { id: run.workOrderId }, data: { status: "COMPLETED", blockedReason: null, workQuality: "ACTIONABLE" } })
  ]);
  await completeStep(run.id, "ARCHIVE_LEARNING", learned ? "AgentKnowledgeMemory" : "AgentReviewSummary", learned ? null : review.id, learned ? `${learned} approved lesson(s) archived.` : "No pending lesson was available; review evidence remains archived.");
  await completeStep(run.id, "DONE", "WorkflowRun", run.id, "King accepted the work; workflow closed with evidence preserved.");
  await setRun(run.id, "COMPLETED", "DONE", null, null, run.workOrderId, job.id);
  await auditLog({
    userId,
    action: "decree_to_done_accepted",
    resourceType: "WorkflowRun",
    resourceId: run.id,
    metadata: { taskId: run.sourceTaskId, workOrderId: run.workOrderId, automationJobId: job.id, approvedLessons: learned }
  }).catch(() => undefined);
  return loadWorkflowView(run.id);
}

export async function getWorkflowRun(workflowRunId: string, userId: string): Promise<WorkflowView> {
  const run = await ownedWorkflow(workflowRunId, userId);
  return loadWorkflowView(run.id);
}

/** Runner callback hook. Best-effort and idempotent; submitReport remains successful
 * even when no DECREE_TO_DONE workflow owns the job. */
export async function reconcileWorkflowForAutomationJob(automationJobId: string): Promise<WorkflowView | null> {
  const job = await prisma.automationJob.findUnique({ where: { id: automationJobId }, select: { workOrderId: true } });
  if (!job) return null;
  const run = await prisma.workflowRun.findFirst({ where: { workOrderId: job.workOrderId }, orderBy: { updatedAt: "desc" } });
  if (!run) return null;
  await prisma.workflowRun.update({ where: { id: run.id }, data: { automationJobId } });
  return reconcileResult(run.id, job.workOrderId, automationJobId);
}

export async function getWorkflowForTask(taskId: string, userId: string): Promise<WorkflowView | null> {
  const run = await prisma.workflowRun.findFirst({ where: { sourceTaskId: taskId, sourceTask: { createdBy: userId } } });
  return run ? loadWorkflowView(run.id) : null;
}

export async function listMissionControlWorkflows(userId?: string): Promise<WorkflowView[]> {
  const runs = await prisma.workflowRun.findMany({
    where: {
      status: { in: ["RUNNING", "BLOCKED", "NEEDS_REVIEW", "COMPLETED"] },
      ...(userId ? { sourceTask: { createdBy: userId } } : {})
    },
    orderBy: { updatedAt: "desc" },
    take: 10,
    select: { id: true }
  });
  return Promise.all(runs.map((run) => loadWorkflowView(run.id)));
}

async function loadWorkflowView(id: string) {
  const run = await prisma.workflowRun.findUniqueOrThrow({
    where: { id },
    include: {
      sourceTask: { select: { id: true, title: true, mode: true, status: true } },
      project: { select: { id: true, name: true } },
      workOrder: { select: { id: true, title: true, status: true, contextBindingStatus: true, assignedExternalAgentId: true } },
      automationJob: {
        select: {
          id: true,
          status: true,
          mode: true,
          implementationReports: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, summary: true, testResult: true, filesChanged: true } },
          reviewSummary: { select: { id: true, verdict: true, kingRecommendation: true, summary: true, whatPassed: true, whatFailed: true, riskNotes: true, nextActions: true } },
          patchArtifacts: { orderBy: { createdAt: "desc" }, select: { id: true, riskLevel: true, validationStatus: true, filesChanged: true } }
        }
      },
      steps: { orderBy: { createdAt: "asc" } }
    }
  });
  const readiness = run.currentStep === "RESOLVE_AGENT" ? await getExternalAgentReadiness() : null;
  return {
    ...run,
    primaryAction: (run.nextAction ?? actionFor(run.status, run.currentStep)) as WorkflowPrimaryAction | null,
    availableAgents: readiness?.agents.filter((agent) => agent.ready) ?? []
  };
}

function actionFor(status: WorkflowRunStatus, step: WorkflowStepKey): WorkflowPrimaryAction | null {
  if (status === "COMPLETED" || status === "FAILED") return null;
  if (step === "CHECK_CONTEXT") return "Fix Context";
  if (step === "RESOLVE_AGENT") return "Choose Agent";
  if (step === "DISPATCH_RUNNER") return "Dispatch";
  if (step === "RETRY_OR_ESCALATE") return "Review Result";
  if (step === "ARCHIVE_LEARNING") return "Accept & Learn";
  return "Continue Workflow";
}

async function assignExternalAgent(workOrderId: string, externalAgentId: string) {
  const workOrder = await prisma.workOrder.update({ where: { id: workOrderId }, data: { assignedExternalAgentId: externalAgentId, blockedReason: null } });
  await resolveExternalAgentChoiceMatter(workOrderId).catch(() => undefined);
  return workOrder;
}

async function ownedWorkflow(id: string, userId: string): Promise<WorkflowRun> {
  const run = await prisma.workflowRun.findFirst({ where: { id, sourceTask: { createdBy: userId } } });
  if (!run) throw namedError("NotFoundError", "WorkflowRun not found");
  return run;
}

async function setRun(
  id: string,
  status: WorkflowRunStatus,
  currentStep: WorkflowStepKey,
  nextAction: WorkflowPrimaryAction | null,
  lastError: string | null = null,
  workOrderId?: string | null,
  automationJobId?: string | null
) {
  return prisma.workflowRun.update({
    where: { id },
    data: {
      status,
      currentStep,
      nextAction,
      lastError,
      ...(workOrderId !== undefined ? { workOrderId } : {}),
      ...(automationJobId !== undefined ? { automationJobId } : {})
    }
  });
}

async function upsertStep(id: string, stepKey: WorkflowStepKey, status: WorkflowStepStatus, data: {
  sourceType?: string | null;
  sourceId?: string | null;
  summary?: string | null;
  error?: string | null;
}) {
  const now = new Date();
  return prisma.workflowStepRun.upsert({
    where: { workflowRunId_stepKey: { workflowRunId: id, stepKey } },
    create: {
      workflowRunId: id,
      stepKey,
      status,
      startedAt: now,
      completedAt: status === "COMPLETED" ? now : null,
      ...data
    },
    update: {
      status,
      completedAt: status === "COMPLETED" ? now : undefined,
      ...data
    }
  });
}

async function startStep(id: string, key: WorkflowStepKey, sourceType?: string | null, sourceId?: string | null, summary?: string | null) {
  return upsertStep(id, key, "RUNNING", { sourceType, sourceId, summary, error: null });
}

async function completeStep(id: string, key: WorkflowStepKey, sourceType?: string | null, sourceId?: string | null, summary?: string | null) {
  return upsertStep(id, key, "COMPLETED", { sourceType, sourceId, summary, error: null });
}

async function blockStep(id: string, key: WorkflowStepKey, error: string) {
  return upsertStep(id, key, "BLOCKED", { error, summary: null });
}

async function reviewStep(id: string, key: WorkflowStepKey, sourceType?: string | null, sourceId?: string | null, summary?: string | null) {
  return upsertStep(id, key, "NEEDS_REVIEW", { sourceType, sourceId, summary, error: null });
}

async function block(
  id: string,
  key: WorkflowStepKey,
  error: string,
  action: WorkflowPrimaryAction,
  workOrderId?: string | null,
  automationJobId?: string | null
) {
  await blockStep(id, key, error);
  await setRun(id, "BLOCKED", key, action, error, workOrderId, automationJobId);
  return loadWorkflowView(id);
}

async function fail(id: string, key: WorkflowStepKey, error: string) {
  await upsertStep(id, key, "FAILED", { error });
  await setRun(id, "FAILED", key, null, error);
  return loadWorkflowView(id);
}

function namedError(name: string, message: string) {
  const error = new Error(message);
  error.name = name;
  return error;
}
