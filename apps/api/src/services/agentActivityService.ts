import type { AgentActivity, Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { sanitizeJsonForStorage, sanitizePreview } from "./usageAttributionService.js";

export type AgentActivityStatus =
  | "IDLE"
  | "QUEUED"
  | "THINKING"
  | "WAITING_PROVIDER"
  | "RESPONDING"
  | "SUMMARIZING"
  | "EXTRACTING_MEMORY"
  | "GENERATING_REPORT"
  | "COMPLETED"
  | "FAILED";

type AgentActivityInput = {
  agentId: string;
  projectId?: string | null;
  taskId?: string | null;
  councilSessionId?: string | null;
  status?: AgentActivityStatus;
  activityType: string;
  title: string;
  detail?: string | null;
  providerId?: string | null;
  providerName?: string | null;
  model?: string | null;
  operation?: string | null;
  tokensUsed?: number;
  estimatedCostUSD?: number;
  metadata?: unknown;
};

type AgentActivityUpdateInput = Partial<Omit<AgentActivityInput, "agentId">> & {
  status?: AgentActivityStatus;
  errorMessage?: string | null;
};

export type CurrentAgentActivityDto = {
  id: string;
  agent: {
    id: string;
    slug: string;
    name: string;
    title: string;
    role: string;
    specialty: string;
    isActive: boolean;
  };
  status: AgentActivityStatus | string;
  activityType: string;
  title: string;
  detail: string | null;
  providerId: string | null;
  providerName: string | null;
  model: string | null;
  operation: string | null;
  projectId: string | null;
  taskId: string | null;
  councilSessionId: string | null;
  tokensUsed: number;
  estimatedCostUSD: number;
  startedAt: Date | null;
  endedAt: Date | null;
  heartbeatAt: Date | null;
  errorMessage: string | null;
  isStale: boolean;
};

const ACTIVE_STATUSES = ["QUEUED", "THINKING", "WAITING_PROVIDER", "RESPONDING", "SUMMARIZING", "EXTRACTING_MEMORY", "GENERATING_REPORT"];
const STALE_AFTER_MS = 2 * 60 * 1000;

export async function startAgentActivity(input: AgentActivityInput): Promise<AgentActivity> {
  const now = new Date();
  return prisma.agentActivity.create({
    data: {
      agentId: input.agentId,
      projectId: input.projectId ?? null,
      taskId: input.taskId ?? null,
      councilSessionId: input.councilSessionId ?? null,
      status: input.status ?? "THINKING",
      activityType: sanitizePreview(input.activityType, 120) ?? "AGENT_ACTIVITY",
      title: sanitizePreview(input.title, 180) ?? "Agent activity",
      detail: sanitizePreview(input.detail, 500),
      providerId: sanitizePreview(input.providerId, 160),
      providerName: sanitizePreview(input.providerName, 120),
      model: sanitizePreview(input.model, 200),
      operation: sanitizePreview(input.operation, 120),
      tokensUsed: input.tokensUsed ?? 0,
      estimatedCostUSD: input.estimatedCostUSD ?? 0,
      startedAt: now,
      heartbeatAt: now,
      metadata: sanitizeMetadata(input.metadata)
    }
  });
}

export async function updateAgentActivity(id: string, input: AgentActivityUpdateInput): Promise<AgentActivity> {
  return prisma.agentActivity.update({
    where: { id },
    data: buildActivityUpdate(input)
  });
}

export async function completeAgentActivity(id: string, input: AgentActivityUpdateInput = {}): Promise<AgentActivity> {
  return prisma.agentActivity.update({
    where: { id },
    data: {
      ...buildActivityUpdate(input),
      status: "COMPLETED",
      endedAt: new Date(),
      heartbeatAt: new Date(),
      errorMessage: null
    }
  });
}

export async function failAgentActivity(id: string, error: unknown, input: AgentActivityUpdateInput = {}): Promise<AgentActivity> {
  return prisma.agentActivity.update({
    where: { id },
    data: {
      ...buildActivityUpdate(input),
      status: "FAILED",
      endedAt: new Date(),
      heartbeatAt: new Date(),
      errorMessage: sanitizePreview(error instanceof Error ? error.message : String(error), 240)
    }
  });
}

export async function getCurrentAgentActivities(): Promise<CurrentAgentActivityDto[]> {
  const agents = await prisma.agent.findMany({
    orderBy: [{ priority: "asc" }, { title: "asc" }],
    select: { id: true, slug: true, name: true, title: true, role: true, specialty: true, isActive: true }
  });

  const activities = await prisma.agentActivity.findMany({
    where: { agentId: { in: agents.map((agent) => agent.id) } },
    orderBy: [{ heartbeatAt: "desc" }, { startedAt: "desc" }]
  });
  const activeByAgent = new Map<string, AgentActivity>();
  const latestByAgent = new Map<string, AgentActivity>();

  for (const activity of activities) {
    if (!latestByAgent.has(activity.agentId)) latestByAgent.set(activity.agentId, activity);
    if (!activeByAgent.has(activity.agentId) && !activity.endedAt && ACTIVE_STATUSES.includes(activity.status)) {
      activeByAgent.set(activity.agentId, activity);
    }
  }

  return agents.map((agent) => {
    const activity = activeByAgent.get(agent.id) ?? latestByAgent.get(agent.id);
    if (!activity) return syntheticIdleActivity(agent);
    return toCurrentActivityDto(agent, activity);
  });
}

function buildActivityUpdate(input: AgentActivityUpdateInput): Prisma.AgentActivityUpdateInput {
  return {
    ...(input.status ? { status: input.status } : {}),
    ...(input.activityType !== undefined ? { activityType: sanitizePreview(input.activityType, 120) ?? "AGENT_ACTIVITY" } : {}),
    ...(input.title !== undefined ? { title: sanitizePreview(input.title, 180) ?? "Agent activity" } : {}),
    ...(input.detail !== undefined ? { detail: sanitizePreview(input.detail, 500) } : {}),
    ...(input.providerId !== undefined ? { providerId: sanitizePreview(input.providerId, 160) } : {}),
    ...(input.providerName !== undefined ? { providerName: sanitizePreview(input.providerName, 120) } : {}),
    ...(input.model !== undefined ? { model: sanitizePreview(input.model, 200) } : {}),
    ...(input.operation !== undefined ? { operation: sanitizePreview(input.operation, 120) } : {}),
    ...(input.tokensUsed !== undefined ? { tokensUsed: input.tokensUsed } : {}),
    ...(input.estimatedCostUSD !== undefined ? { estimatedCostUSD: input.estimatedCostUSD } : {}),
    ...(input.metadata !== undefined ? { metadata: sanitizeMetadata(input.metadata) } : {}),
    ...(input.errorMessage !== undefined ? { errorMessage: sanitizePreview(input.errorMessage, 240) } : {}),
    heartbeatAt: new Date()
  };
}

function sanitizeMetadata(value: unknown): Prisma.InputJsonValue | undefined {
  return sanitizeJsonForStorage(value);
}

function syntheticIdleActivity(agent: CurrentAgentActivityDto["agent"]): CurrentAgentActivityDto {
  return {
    id: `idle:${agent.id}`,
    agent,
    status: "IDLE",
    activityType: "IDLE",
    title: "Idle",
    detail: null,
    providerId: null,
    providerName: null,
    model: null,
    operation: null,
    projectId: null,
    taskId: null,
    councilSessionId: null,
    tokensUsed: 0,
    estimatedCostUSD: 0,
    startedAt: null,
    endedAt: null,
    heartbeatAt: null,
    errorMessage: null,
    isStale: false
  };
}

function toCurrentActivityDto(agent: CurrentAgentActivityDto["agent"], activity: AgentActivity): CurrentAgentActivityDto {
  return {
    id: activity.id,
    agent,
    status: activity.status,
    activityType: activity.activityType,
    title: activity.title,
    detail: activity.detail,
    providerId: activity.providerId,
    providerName: activity.providerName,
    model: activity.model,
    operation: activity.operation,
    projectId: activity.projectId,
    taskId: activity.taskId,
    councilSessionId: activity.councilSessionId,
    tokensUsed: activity.tokensUsed,
    estimatedCostUSD: activity.estimatedCostUSD,
    startedAt: activity.startedAt,
    endedAt: activity.endedAt,
    heartbeatAt: activity.heartbeatAt,
    errorMessage: activity.errorMessage,
    isStale: !activity.endedAt && Date.now() - activity.heartbeatAt.getTime() > STALE_AFTER_MS
  };
}
