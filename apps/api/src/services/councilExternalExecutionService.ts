import type { AutomationJob, ExternalAgent, ExternalAgentRun, WorkOrder } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { approveJob } from "./automationJobService.js";
import { auditLog } from "./auditService.js";
import {
  assertExternalAgentBridgeEnabled,
  createExternalAgentBridgeJob
} from "./externalAgentBridgeService.js";
import type { PlannerResult } from "./plannerAgentService.js";
import { planFromSession } from "./plannerAgentService.js";
import { buildNextActionUpdate } from "./kingdomNextActionEngine.js";

const ACTIVE_EXTERNAL_JOB_STATUSES = ["QUEUED", "APPROVED", "CLAIMED", "RUNNING", "NEEDS_REVIEW"] as const;

export type CouncilExternalExecutionResult = {
  workOrder: WorkOrder;
  job: AutomationJob;
  externalAgentRun: ExternalAgentRun | null;
  externalAgent: ExternalAgent | null;
  plannerResult: PlannerResult | null;
  alreadyScheduled: boolean;
};

export async function executeCouncilWithExternalAgent(input: {
  sessionId: string;
  userId: string;
  externalAgentId?: string | null;
}): Promise<CouncilExternalExecutionResult> {
  const traceId = `council-external-agent:${input.sessionId}:${Date.now()}`;
  traceCouncilExternalStep(traceId, "API Request", {
    route: "POST /api/council/:sessionId/execute-external-agent",
    sessionId: input.sessionId,
    userId: input.userId,
    externalAgentId: input.externalAgentId ?? null
  });

  await assertExternalAgentBridgeEnabled();

  const session = await prisma.councilSession.findUnique({
    where: { id: input.sessionId },
    include: { task: true }
  });
  if (!session) throw namedError("NotFoundError", "Council session not found");
  if (session.status !== "COMPLETED") {
    throw namedError("ConflictError", "Council session must be COMPLETED before external-agent execution");
  }

  const { workOrder, plannerResult } = await resolveCouncilWorkOrder(input.sessionId, input.userId);
  traceCouncilExternalStep(traceId, "WorkOrder Ready", {
    sessionId: input.sessionId,
    workOrderId: workOrder.id,
    status: workOrder.status,
    createdByThisCall: Boolean(plannerResult?.createdWorkOrder)
  });

  const existing = await findActiveExternalJob(workOrder.id);
  if (existing) {
    const approved = existing.status === "QUEUED" ? await approveJob(existing.id, input.userId) : existing;
    const run = existing.externalAgentRuns[0] ?? null;
    await prisma.workOrder.update({
      where: { id: workOrder.id },
      data: { status: workOrder.status === "NEEDS_REVIEW" ? workOrder.status : "IN_PROGRESS", blockedReason: null }
    }).catch(() => undefined);
    await markCouncilWaitingForReview(input.sessionId);
    traceCouncilExternalStep(traceId, "Existing Bridge Job", {
      sessionId: input.sessionId,
      workOrderId: workOrder.id,
      automationJobId: approved.id,
      status: approved.status,
      externalAgentRunId: run?.id ?? null
    });
    return {
      workOrder: { ...workOrder, status: workOrder.status === "NEEDS_REVIEW" ? workOrder.status : "IN_PROGRESS" },
      job: approved,
      externalAgentRun: run,
      externalAgent: workOrder.assignedExternalAgent ?? null,
      plannerResult,
      alreadyScheduled: true
    };
  }

  const bridge = await createExternalAgentBridgeJob({
    workOrderId: workOrder.id,
    externalAgentId: input.externalAgentId,
    createdByUserId: input.userId
  });
  const approvedJob = await approveJob(bridge.job.id, input.userId);
  await prisma.workOrder.update({
    where: { id: workOrder.id },
    data: { status: "IN_PROGRESS", blockedReason: null }
  }).catch(() => undefined);
  await markCouncilWaitingForReview(input.sessionId);

  await auditLog({
    userId: input.userId,
    action: "council_external_agent_execution_started",
    resourceType: "AutomationJob",
    resourceId: approvedJob.id,
    metadata: {
      councilSessionId: input.sessionId,
      taskId: session.taskId,
      workOrderId: workOrder.id,
      projectId: workOrder.projectId,
      externalAgentId: bridge.externalAgent.id,
      externalAgentRunId: bridge.externalAgentRun.id,
      approvedByKing: true,
      traceId
    }
  }).catch(() => undefined);

  traceCouncilExternalStep(traceId, "API Response", {
    sessionId: input.sessionId,
    workOrderId: workOrder.id,
    automationJobId: approvedJob.id,
    automationJobStatus: approvedJob.status,
    externalAgentRunId: bridge.externalAgentRun.id,
    externalAgentId: bridge.externalAgent.id
  });

  return {
    workOrder: { ...workOrder, status: "IN_PROGRESS", assignedExternalAgentId: bridge.externalAgent.id },
    job: approvedJob,
    externalAgentRun: bridge.externalAgentRun,
    externalAgent: bridge.externalAgent,
    plannerResult,
    alreadyScheduled: false
  };
}

async function resolveCouncilWorkOrder(sessionId: string, userId: string) {
  const session = await prisma.councilSession.findUnique({
    where: { id: sessionId },
    select: { createdWorkOrderId: true }
  });

  if (session?.createdWorkOrderId) {
    const existing = await prisma.workOrder.findUnique({
      where: { id: session.createdWorkOrderId },
      include: { assignedExternalAgent: true }
    });
    if (existing) return { workOrder: existing, plannerResult: null };
  }

  const sourceWorkOrder = await prisma.workOrder.findFirst({
    where: {
      sourceType: "COUNCIL_SESSION",
      sourceId: sessionId,
      status: { notIn: ["ARCHIVED", "CANCELLED", "FAILED"] }
    },
    include: { assignedExternalAgent: true },
    orderBy: { createdAt: "desc" }
  });
  if (sourceWorkOrder) {
    await prisma.councilSession.update({
      where: { id: sessionId },
      data: {
        createdWorkOrderId: sourceWorkOrder.id,
        createdWorkOrderAt: sourceWorkOrder.createdAt,
        createdWorkOrderBy: sourceWorkOrder.createdByUserId ?? userId
      }
    }).catch(() => undefined);
    return { workOrder: sourceWorkOrder, plannerResult: null };
  }

  const plannerResult = await planFromSession(
    sessionId,
    userId,
    "POST /api/council/:sessionId/execute-external-agent"
  );
  const createdId = plannerResult.createdWorkOrder?.id ?? plannerResult.draftedWorkOrderIds[0];
  if (!createdId) {
    throw namedError("ConflictError", plannerResult.skipReason ?? "Work Order creation failed: no Work Order was created");
  }
  const workOrder = await prisma.workOrder.findUnique({
    where: { id: createdId },
    include: { assignedExternalAgent: true }
  });
  if (!workOrder) throw namedError("ConflictError", "Work Order creation failed: created Work Order could not be loaded");
  return { workOrder, plannerResult };
}

async function findActiveExternalJob(workOrderId: string) {
  return prisma.automationJob.findFirst({
    where: {
      workOrderId,
      mode: "EXTERNAL_AGENT",
      status: { in: [...ACTIVE_EXTERNAL_JOB_STATUSES] }
    },
    include: {
      externalAgentRuns: { orderBy: { createdAt: "desc" }, take: 1 }
    },
    orderBy: { createdAt: "desc" }
  });
}

async function markCouncilWaitingForReview(sessionId: string) {
  await prisma.councilSession.update({
    where: { id: sessionId },
    data: buildNextActionUpdate({
      action: "REVIEW_PATCH",
      reason: "External agent execution is approved. Wait for the runner report, then review the returned patch and implementation report.",
      plannerMode: "READY"
    })
  }).catch(() => undefined);
}

function namedError(name: string, message: string) {
  const error = new Error(message);
  error.name = name;
  return error;
}

function traceCouncilExternalStep(traceId: string, step: string, details: Record<string, unknown>) {
  console.info(`[CouncilExternalAgentTrace] ${step}`, { traceId, ...details });
}
