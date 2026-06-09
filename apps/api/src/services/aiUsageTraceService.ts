import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import {
  redactSecrets,
  sanitizeJsonForStorage,
  sanitizePreview as sanitizeUsagePreview
} from "./usageAttributionService.js";

export type AttributionStatus = "TRUSTED" | "PARTIAL" | "LEGACY_UNATTRIBUTED" | "UNKNOWN_SOURCE";
export type TraceStatus = "STARTED" | "PROVIDER_CALLING" | "COMPLETED" | "FAILED" | "FALLBACK_USED" | "LEGACY_UNATTRIBUTED";

export type AIUsageTraceInput = {
  traceId?: string;
  actorUserId?: string | null;
  actorRole?: string | null;
  triggerType: string;
  triggerRoute?: string | null;
  triggerLabel?: string | null;
  projectId?: string | null;
  taskId?: string | null;
  councilSessionId?: string | null;
  agentId?: string | null;
  sourceType: string;
  sourceId?: string | null;
  operation: string;
  purpose: string;
  providerId?: string | null;
  providerType?: string | null;
  providerName?: string | null;
  model?: string | null;
  prompt?: unknown;
  promptPreview?: unknown;
  metadata?: unknown;
  attributionStatus?: AttributionStatus;
};

export type TraceContext = {
  traceId: string;
  attributionStatus: AttributionStatus;
  sourceType: string;
  sourceId?: string | null;
  operation: string;
  purpose: string;
};

export function sanitizePreview(text: unknown, maxLength = 500): string | null {
  return sanitizeUsagePreview(text, maxLength);
}

export { redactSecrets };

export function buildTraceContext(input: AIUsageTraceInput): TraceContext {
  return {
    traceId: input.traceId ?? `aitrace_${randomUUID()}`,
    attributionStatus: input.attributionStatus ?? inferAttributionStatus(input),
    sourceType: sanitizeShortField(input.sourceType, 80) ?? "UNKNOWN_SOURCE",
    sourceId: sanitizeShortField(input.sourceId, 160),
    operation: sanitizeShortField(input.operation, 120) ?? "unknown_operation",
    purpose: sanitizeShortField(input.purpose, 180) ?? "AI provider call"
  };
}

export async function createAIUsageTrace(input: AIUsageTraceInput) {
  const context = buildTraceContext(input);
  const metadata = sanitizeJsonForStorage({
    ...(isPlainObject(input.metadata) ? input.metadata : {}),
    attributionStatus: context.attributionStatus
  });

  return prisma.aIUsageTrace.create({
    data: {
      traceId: context.traceId,
      actorUserId: input.actorUserId ?? null,
      actorRole: sanitizeShortField(input.actorRole, 80),
      triggerType: sanitizeShortField(input.triggerType, 80) ?? "SYSTEM_PROCESS",
      triggerRoute: sanitizeShortField(input.triggerRoute, 160),
      triggerLabel: sanitizeShortField(input.triggerLabel, 180),
      projectId: input.projectId ?? null,
      taskId: input.taskId ?? null,
      councilSessionId: input.councilSessionId ?? null,
      agentId: input.agentId ?? null,
      sourceType: context.sourceType,
      sourceId: context.sourceId ?? null,
      operation: context.operation,
      purpose: context.purpose,
      providerId: sanitizeShortField(input.providerId, 160),
      providerType: sanitizeShortField(input.providerType, 80),
      providerName: sanitizeShortField(input.providerName, 120),
      model: sanitizeShortField(input.model, 200),
      status: "STARTED",
      promptPreview: sanitizePreview(input.promptPreview ?? input.prompt),
      ...(metadata === undefined ? {} : { metadata })
    }
  });
}

export async function markTraceProviderCalling(
  traceId: string,
  provider: { providerId?: string | null; providerType?: string | null; providerName?: string | null; model?: string | null }
) {
  return prisma.aIUsageTrace.update({
    where: { traceId },
    data: {
      status: "PROVIDER_CALLING",
      providerId: sanitizeShortField(provider.providerId, 160),
      providerType: sanitizeShortField(provider.providerType, 80),
      providerName: sanitizeShortField(provider.providerName, 120),
      model: sanitizeShortField(provider.model, 200)
    }
  });
}

export async function markTraceFallbackUsed(traceId: string, metadata?: unknown) {
  return prisma.aIUsageTrace.update({
    where: { traceId },
    data: {
      status: "FALLBACK_USED",
      ...(metadata === undefined ? {} : { metadata: sanitizeJsonForStorage(metadata) })
    }
  });
}

export async function updateTraceSource(traceId: string, source: { sourceType?: string | null; sourceId?: string | null }) {
  return prisma.aIUsageTrace.update({
    where: { traceId },
    data: {
      ...(source.sourceType !== undefined ? { sourceType: sanitizeShortField(source.sourceType, 80) ?? "UNKNOWN_SOURCE" } : {}),
      ...(source.sourceId !== undefined ? { sourceId: sanitizeShortField(source.sourceId, 160) } : {})
    }
  });
}

export async function completeAIUsageTrace(traceId: string, responsePreview?: unknown, metadata?: unknown) {
  return prisma.aIUsageTrace.update({
    where: { traceId },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
      responsePreview: sanitizePreview(responsePreview),
      ...(metadata === undefined ? {} : { metadata: sanitizeJsonForStorage(metadata) })
    }
  });
}

export async function failAIUsageTrace(traceId: string, error: unknown) {
  return prisma.aIUsageTrace.update({
    where: { traceId },
    data: {
      status: "FAILED",
      failedAt: new Date(),
      errorMessage: sanitizePreview(error instanceof Error ? error.message : String(error), 240)
    }
  });
}

export async function attachUsageRecordToTrace(traceId: string, usageRecordId: string) {
  return prisma.usageRecord.update({
    where: { id: usageRecordId },
    data: {
      traceId,
      attributionStatus: "TRUSTED"
    }
  });
}

// ─── Trace Step Management ───────────────────────────────────────────────────

export type TraceStepInput = {
  traceId: string;
  parentStepId?: string | null;
  stepType: string;
  operation: string;
  title: string;
  detail?: string | null;
  status?: string;
  agentId?: string | null;
  providerId?: string | null;
  providerType?: string | null;
  providerName?: string | null;
  model?: string | null;
  usageRecordId?: string | null;
  taskId?: string | null;
  projectId?: string | null;
  councilSessionId?: string | null;
  reportId?: string | null;
  tokensUsed?: number | null;
  estimatedCostUSD?: number | null;
  durationMs?: number | null;
  promptPreview?: unknown;
  responsePreview?: unknown;
  errorMessage?: string | null;
  metadata?: unknown;
};

async function getNextSequence(traceId: string): Promise<number> {
  const last = await prisma.aIUsageTraceStep.findFirst({
    where: { traceId },
    orderBy: { sequence: "desc" },
    select: { sequence: true }
  });
  return (last?.sequence ?? 0) + 1;
}

export async function addTraceStep(input: TraceStepInput) {
  const sequence = await getNextSequence(input.traceId);
  const metadata = input.metadata !== undefined ? sanitizeJsonForStorage(input.metadata) : undefined;
  return prisma.aIUsageTraceStep.create({
    data: {
      traceId: input.traceId,
      parentStepId: input.parentStepId ?? null,
      stepType: input.stepType,
      operation: sanitizeShortField(input.operation, 120) ?? "unknown",
      title: sanitizeShortField(input.title, 200) ?? "Unknown step",
      detail: sanitizeShortField(input.detail, 500),
      status: input.status ?? "COMPLETED",
      sequence,
      agentId: input.agentId ?? null,
      providerId: sanitizeShortField(input.providerId, 160),
      providerType: sanitizeShortField(input.providerType, 80),
      providerName: sanitizeShortField(input.providerName, 120),
      model: sanitizeShortField(input.model, 200),
      usageRecordId: input.usageRecordId ?? null,
      taskId: input.taskId ?? null,
      projectId: input.projectId ?? null,
      councilSessionId: input.councilSessionId ?? null,
      reportId: input.reportId ?? null,
      tokensUsed: input.tokensUsed ?? null,
      estimatedCostUSD: input.estimatedCostUSD ?? null,
      durationMs: input.durationMs ?? null,
      promptPreview: sanitizePreview(input.promptPreview),
      responsePreview: sanitizePreview(input.responsePreview),
      errorMessage: sanitizeShortField(input.errorMessage, 240),
      endedAt: new Date(),
      ...(metadata === undefined ? {} : { metadata })
    }
  });
}

export async function startTraceStep(input: TraceStepInput) {
  const sequence = await getNextSequence(input.traceId);
  const metadata = input.metadata !== undefined ? sanitizeJsonForStorage(input.metadata) : undefined;
  return prisma.aIUsageTraceStep.create({
    data: {
      traceId: input.traceId,
      parentStepId: input.parentStepId ?? null,
      stepType: input.stepType,
      operation: sanitizeShortField(input.operation, 120) ?? "unknown",
      title: sanitizeShortField(input.title, 200) ?? "Unknown step",
      detail: sanitizeShortField(input.detail, 500),
      status: "STARTED",
      sequence,
      agentId: input.agentId ?? null,
      providerId: sanitizeShortField(input.providerId, 160),
      providerType: sanitizeShortField(input.providerType, 80),
      providerName: sanitizeShortField(input.providerName, 120),
      model: sanitizeShortField(input.model, 200),
      usageRecordId: input.usageRecordId ?? null,
      taskId: input.taskId ?? null,
      projectId: input.projectId ?? null,
      councilSessionId: input.councilSessionId ?? null,
      reportId: input.reportId ?? null,
      tokensUsed: input.tokensUsed ?? null,
      estimatedCostUSD: input.estimatedCostUSD ?? null,
      promptPreview: sanitizePreview(input.promptPreview),
      responsePreview: null,
      errorMessage: null,
      ...(metadata === undefined ? {} : { metadata })
    }
  });
}

export async function completeTraceStep(
  stepId: string,
  output?: { responsePreview?: unknown; tokensUsed?: number | null; estimatedCostUSD?: number | null; durationMs?: number | null; metadata?: unknown }
) {
  const metadata = output?.metadata !== undefined ? sanitizeJsonForStorage(output.metadata) : undefined;
  return prisma.aIUsageTraceStep.update({
    where: { id: stepId },
    data: {
      status: "COMPLETED",
      endedAt: new Date(),
      responsePreview: sanitizePreview(output?.responsePreview),
      tokensUsed: output?.tokensUsed ?? undefined,
      estimatedCostUSD: output?.estimatedCostUSD ?? undefined,
      durationMs: output?.durationMs ?? undefined,
      ...(metadata === undefined ? {} : { metadata })
    }
  });
}

export async function failTraceStep(stepId: string, error: unknown) {
  return prisma.aIUsageTraceStep.update({
    where: { id: stepId },
    data: {
      status: "FAILED",
      endedAt: new Date(),
      errorMessage: sanitizePreview(error instanceof Error ? error.message : String(error), 240)
    }
  });
}

export async function attachUsageRecordStep(
  traceId: string,
  usageRecord: {
    id: string;
    provider: string;
    providerId?: string | null;
    model: string;
    totalTokens: number;
    estimatedCostUSD: number;
    pricingStatus?: string | null;
    taskId?: string | null;
    projectId?: string | null;
    councilSessionId?: string | null;
    agentId?: string | null;
  }
) {
  return addTraceStep({
    traceId,
    stepType: "USAGE_RECORDED",
    operation: "usage_recorded",
    title: "Usage recorded",
    detail: `${usageRecord.provider} · ${usageRecord.model} · ${usageRecord.totalTokens} tokens`,
    status: "COMPLETED",
    usageRecordId: usageRecord.id,
    providerId: usageRecord.providerId,
    providerName: usageRecord.provider,
    model: usageRecord.model,
    tokensUsed: usageRecord.totalTokens,
    estimatedCostUSD: usageRecord.estimatedCostUSD,
    taskId: usageRecord.taskId,
    projectId: usageRecord.projectId,
    councilSessionId: usageRecord.councilSessionId,
    agentId: usageRecord.agentId,
    metadata: { pricingStatus: usageRecord.pricingStatus ?? null }
  });
}

// ─── Trace Detail (enhanced with steps + totals) ─────────────────────────────

export async function getAIUsageTraceDetails(traceId: string) {
  const trace = await prisma.aIUsageTrace.findUnique({
    where: { traceId },
    include: {
      actorUser: { select: { id: true, displayName: true, role: true } },
      project: { select: { id: true, name: true } },
      task: { select: { id: true, title: true, mode: true, status: true } },
      councilSession: { select: { id: true, status: true, taskId: true, projectId: true } },
      agent: { select: { id: true, slug: true, name: true, title: true, role: true } },
      usageRecords: {
        select: {
          id: true,
          provider: true,
          providerId: true,
          model: true,
          promptTokens: true,
          completionTokens: true,
          totalTokens: true,
          estimatedCostUSD: true,
          attributionStatus: true,
          pricingStatus: true,
          createdAt: true
        },
        orderBy: { createdAt: "desc" }
      },
      agentActivities: {
        select: {
          id: true,
          status: true,
          activityType: true,
          title: true,
          detail: true,
          attributionStatus: true,
          usageRecordId: true,
          reportId: true,
          startedAt: true,
          endedAt: true,
          heartbeatAt: true
        },
        orderBy: { heartbeatAt: "desc" }
      },
      steps: {
        select: {
          id: true,
          traceId: true,
          parentStepId: true,
          stepType: true,
          operation: true,
          title: true,
          detail: true,
          status: true,
          sequence: true,
          agentId: true,
          providerId: true,
          providerType: true,
          providerName: true,
          model: true,
          usageRecordId: true,
          taskId: true,
          projectId: true,
          councilSessionId: true,
          reportId: true,
          tokensUsed: true,
          estimatedCostUSD: true,
          durationMs: true,
          promptPreview: true,
          responsePreview: true,
          errorMessage: true,
          metadata: true,
          startedAt: true,
          endedAt: true,
          agent: { select: { id: true, slug: true, name: true, title: true } }
        },
        orderBy: [{ sequence: "asc" }, { startedAt: "asc" }]
      }
    }
  });

  if (!trace) return null;

  const hasTimelineSteps = trace.steps.length > 0;
  const totalTokens = trace.usageRecords.reduce((sum, r) => sum + r.totalTokens, 0);
  const totalEstimatedCostUSD = trace.usageRecords.reduce((sum, r) => sum + r.estimatedCostUSD, 0);
  const providerCallCount = trace.steps.filter((s) => s.stepType === "PROVIDER_CALL").length;
  const fallbackCount = trace.steps.filter((s) => s.stepType === "PROVIDER_FALLBACK").length;
  const agentIds = new Set(trace.steps.filter((s) => s.agentId).map((s) => s.agentId));

  return {
    trace: {
      id: trace.id,
      traceId: trace.traceId,
      actorUserId: trace.actorUserId,
      actorRole: trace.actorRole,
      actorDisplayName: trace.actorUser?.displayName ?? null,
      triggerType: trace.triggerType,
      triggerRoute: trace.triggerRoute,
      triggerLabel: trace.triggerLabel,
      projectId: trace.projectId,
      taskId: trace.taskId,
      councilSessionId: trace.councilSessionId,
      agentId: trace.agentId,
      sourceType: trace.sourceType,
      sourceId: trace.sourceId,
      operation: trace.operation,
      purpose: trace.purpose,
      providerId: trace.providerId,
      providerType: trace.providerType,
      providerName: trace.providerName,
      model: trace.model,
      status: trace.status,
      startedAt: trace.startedAt,
      completedAt: trace.completedAt,
      failedAt: trace.failedAt,
      promptPreview: trace.promptPreview,
      responsePreview: trace.responsePreview,
      errorMessage: trace.errorMessage,
      metadata: trace.metadata,
      createdAt: trace.createdAt,
      updatedAt: trace.updatedAt
    },
    usageRecords: trace.usageRecords,
    agentActivities: trace.agentActivities,
    steps: trace.steps,
    hasTimelineSteps,
    totals: {
      totalTokens,
      totalEstimatedCostUSD,
      providerCallCount,
      fallbackCount,
      agentCount: agentIds.size,
      usageRecordCount: trace.usageRecords.length
    },
    links: {
      project: trace.project,
      task: trace.task,
      councilSession: trace.councilSession,
      agent: trace.agent,
      reports: trace.agentActivities
        .filter((activity) => activity.reportId)
        .map((activity) => ({ id: activity.reportId }))
    }
  };
}

function inferAttributionStatus(input: AIUsageTraceInput): AttributionStatus {
  if (input.attributionStatus) return input.attributionStatus;
  if (input.triggerType === "PROVIDER_TEST" && input.actorUserId && input.sourceType === "PROVIDER_TEST") return "TRUSTED";
  if (input.triggerType === "USER_ACTION" && input.taskId && input.operation && input.purpose && input.sourceType && input.sourceId !== undefined) return "TRUSTED";
  if (input.sourceType === "LEGACY" || input.triggerType === "LEGACY") return "LEGACY_UNATTRIBUTED";
  return "PARTIAL";
}

function sanitizeShortField(value: unknown, maxLength: number): string | null {
  return sanitizePreview(typeof value === "string" ? value : null, maxLength);
}

function isPlainObject(value: unknown): value is Record<string, Prisma.InputJsonValue> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date);
}
