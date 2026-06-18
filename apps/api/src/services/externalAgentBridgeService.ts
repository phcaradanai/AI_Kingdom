import type { AutomationJob, ExternalAgent, ExternalAgentRun, Prisma, WorkOrder } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { auditLog } from "./auditService.js";
import { createAutomationJob } from "./automationJobService.js";
import { buildExternalAgentPrompt } from "./externalAgentWorkOrderService.js";
import { getBooleanSetting, getNumberSetting, getSettingValue } from "./settingsService.js";

type WorkOrderForBridge = WorkOrder & { assignedExternalAgent?: ExternalAgent | null };

export type ExternalAgentBridgeJobResult = {
  job: AutomationJob;
  externalAgentRun: ExternalAgentRun;
  externalAgent: ExternalAgent;
};

export async function createExternalAgentBridgeJob(input: {
  workOrderId: string;
  externalAgentId?: string | null;
  createdByUserId: string;
}): Promise<ExternalAgentBridgeJobResult> {
  await assertBridgeEnabled();

  const workOrder = await prisma.workOrder.findUnique({
    where: { id: input.workOrderId },
    include: { assignedExternalAgent: true }
  });
  if (!workOrder) throw namedError("NotFoundError", "WorkOrder not found");

  const externalAgent = await resolveExternalAgent(workOrder, input.externalAgentId);
  validateExternalAgentForBridge(externalAgent);

  const maxAutoRetries = await getNumberSetting("MAX_EXTERNAL_AGENT_AUTO_RETRIES", 2);

  await prisma.workOrder.update({
    where: { id: workOrder.id },
    data: {
      assignedExternalAgentId: externalAgent.id,
      executionTarget: "EXTERNAL_AGENT",
      maxAutoRetries,
      blockedReason: null
    }
  });

  const prompt = await buildExternalAgentPrompt(workOrder.id, externalAgent.id);
  const job = await createAutomationJob({
    workOrderId: workOrder.id,
    projectId: workOrder.projectId,
    mode: "EXTERNAL_AGENT",
    commandPolicy: "EXTERNAL_AGENT_NO_PUSH",
    allowedCommands: [],
    createdByUserId: input.createdByUserId
  });

  const attemptNumber = await prisma.externalAgentRun.count({ where: { workOrderId: workOrder.id } }).then((count) => count + 1);
  const externalAgentRun = await prisma.externalAgentRun.create({
    data: {
      externalAgentId: externalAgent.id,
      workOrderId: workOrder.id,
      automationJobId: job.id,
      status: "QUEUED",
      inputPrompt: prompt,
      attemptNumber,
      metadata: {
        commandTemplate: externalAgent.command,
        externalAgentType: externalAgent.type,
        environmentProfile: externalAgent.environmentProfile,
        requiresApproval: externalAgent.requiresApproval,
        sourceLinks: {
          workOrderId: workOrder.id,
          automationJobId: job.id,
          sourceType: workOrder.sourceType,
          sourceId: workOrder.sourceId
        }
      } as Prisma.InputJsonValue
    }
  });

  await prisma.workOrder.update({
    where: { id: workOrder.id },
    data: { lastExternalAgentRunId: externalAgentRun.id }
  });

  await auditLog({
    userId: input.createdByUserId,
    action: "external_agent_bridge_job_created",
    resourceType: "ExternalAgentRun",
    resourceId: externalAgentRun.id,
    metadata: {
      workOrderId: workOrder.id,
      automationJobId: job.id,
      externalAgentId: externalAgent.id,
      externalAgentType: externalAgent.type
    }
  }).catch(() => undefined);

  return { job, externalAgentRun, externalAgent };
}

export async function markExternalAgentRunRunning(input: {
  automationJobId: string;
  runnerId: string;
  workspacePath: string;
  commandTemplate: string;
}) {
  return updateExternalAgentRunForRunner(input.automationJobId, input.runnerId, {
    status: "RUNNING",
    startedAt: new Date(),
    metadata: {
      workspacePath: input.workspacePath,
      commandTemplate: input.commandTemplate
    }
  });
}

export async function completeExternalAgentRunForRunner(input: {
  automationJobId: string;
  runnerId: string;
  status: "SUCCEEDED" | "FAILED" | "TIMED_OUT" | "NEEDS_REVIEW";
  outputText?: string | null;
  artifactPaths?: string[];
  logPath?: string | null;
  exitCode?: number | null;
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const run = await updateExternalAgentRunForRunner(input.automationJobId, input.runnerId, {
    status: input.status,
    outputText: input.outputText ?? null,
    artifactPaths: (input.artifactPaths ?? []) as Prisma.InputJsonValue,
    logPath: input.logPath ?? null,
    exitCode: input.exitCode ?? null,
    completedAt: new Date(),
    errorMessage: input.errorMessage ?? null,
    metadata: input.metadata as Prisma.InputJsonValue | undefined
  });

  await prisma.workOrder.update({
    where: { id: run.workOrderId },
    data: {
      lastExternalAgentRunId: run.id,
      status: input.status === "SUCCEEDED" ? "NEEDS_REVIEW" : "FAILED",
      blockedReason: input.status === "SUCCEEDED" ? null : input.errorMessage ?? "External agent bridge run failed"
    }
  }).catch(() => undefined);

  return run;
}

async function updateExternalAgentRunForRunner(
  automationJobId: string,
  runnerId: string,
  data: Prisma.ExternalAgentRunUpdateInput
) {
  const job = await prisma.automationJob.findFirst({
    where: { id: automationJobId, runnerId },
    include: { externalAgentRuns: { orderBy: { createdAt: "desc" }, take: 1 } }
  });
  if (!job) throw namedError("NotFoundError", "AutomationJob not found or not owned by this runner");
  const run = job.externalAgentRuns[0];
  if (!run) throw namedError("NotFoundError", "ExternalAgentRun not found for automation job");

  return prisma.externalAgentRun.update({
    where: { id: run.id },
    data: {
      ...data,
      metadata: data.metadata
        ? ({
          ...(isRecord(run.metadata) ? run.metadata : {}),
          ...(data.metadata as Record<string, unknown>)
        } as Prisma.InputJsonValue)
        : undefined
    }
  });
}

async function assertBridgeEnabled() {
  const enabled = await getBooleanSetting("EXTERNAL_AGENT_BRIDGE_ENABLED", false);
  if (!enabled) throw namedError("BridgeDisabledError", "External Agent Bridge is disabled. Set EXTERNAL_AGENT_BRIDGE_ENABLED=true before creating bridge jobs.");
}

async function resolveExternalAgent(workOrder: WorkOrderForBridge, requestedId?: string | null): Promise<ExternalAgent> {
  const defaultId = await getSettingValue("DEFAULT_EXTERNAL_AGENT_ID", "");
  const autoSelect = await getBooleanSetting("AUTO_SELECT_EXTERNAL_AGENT", true);
  const id = requestedId ?? workOrder.assignedExternalAgentId ?? (defaultId.trim() ? defaultId.trim() : null);
  if (id) {
    const agent = await prisma.externalAgent.findUnique({ where: { id } });
    if (!agent) throw namedError("NotFoundError", "External agent not found");
    return agent;
  }

  if (!autoSelect) throw namedError("ConflictError", "No external agent is assigned and AUTO_SELECT_EXTERNAL_AGENT is disabled.");
  const agent = await prisma.externalAgent.findFirst({
    where: { isActive: true, bridgeEnabled: true, command: { not: null } },
    orderBy: [{ safetyLevel: "asc" }, { name: "asc" }]
  });
  if (!agent) throw namedError("ConflictError", "No active bridge-enabled external agent is available.");
  return agent;
}

function validateExternalAgentForBridge(agent: ExternalAgent) {
  if (!agent.isActive) throw namedError("ConflictError", "External agent is inactive.");
  if (!agent.bridgeEnabled) throw namedError("ConflictError", "External agent bridge execution is not enabled for this agent.");
  if (agent.type === "MANUAL_ONLY") throw namedError("ConflictError", "Manual-only external agents cannot be executed by the runner bridge.");
  if (!agent.command?.trim()) throw namedError("ConflictError", "External agent requires a command template before bridge execution.");
}

function namedError(name: string, message: string) {
  const error = new Error(message);
  error.name = name;
  return error;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
