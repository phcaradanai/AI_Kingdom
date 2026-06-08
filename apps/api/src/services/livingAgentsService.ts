import type { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";

function extractDisplayProfile(config: unknown): {
  displayName: string | null;
  displayTitle: string | null;
  avatarUrl: string | null;
  avatarVersion: number;
  canonicalName: string | null;
  canonicalTitle: string | null;
  coreSlug: string | null;
} {
  const raw = config && typeof config === "object" && !Array.isArray(config) ? config as Record<string, unknown> : {};
  const dp = raw.displayProfile && typeof raw.displayProfile === "object" && !Array.isArray(raw.displayProfile)
    ? raw.displayProfile as Record<string, unknown>
    : {};
  const s = (v: unknown) => (typeof v === "string" && v ? v : null);
  const n = (v: unknown, fallback: number) => (typeof v === "number" && isFinite(v) ? v : fallback);
  return {
    displayName: s(dp.displayName),
    displayTitle: s(dp.displayTitle),
    avatarUrl: s(dp.avatarUrl),
    avatarVersion: n(dp.avatarVersion, 1),
    canonicalName: s(dp.canonicalName),
    canonicalTitle: s(dp.canonicalTitle),
    coreSlug: s(dp.coreSlug)
  };
}

export type LivingAgentSummaryDto = {
  id: string;
  slug: string;
  name: string;
  title: string;
  role: string;
  specialty: string;
  description: string;
  isActive: boolean;
  priority: number;
  preferredProviderId: string | null;
  defaultModel: string | null;
  displayName: string | null;
  displayTitle: string | null;
  avatarUrl: string | null;
  avatarVersion: number;
  canonicalName: string | null;
  canonicalTitle: string | null;
  coreSlug: string | null;
  createdAt: string;
  updatedAt: string;
  currentStatus: string;
  lastActivityAt: string | null;
  lastActivityTitle: string | null;
  totalCalls: number;
  totalTokens: number;
  totalEstimatedCostUSD: number;
  tokensToday: number;
  costToday: number;
  trustedTraceCount: number;
  partialTraceCount: number;
  legacyUnattributedCount: number;
  linkedProjectCount: number;
  providerSummary: Array<{ provider: string; callCount: number; totalCostUSD: number }>;
  modelSummary: Array<{ model: string; callCount: number }>;
  topOperations: Array<{ operation: string; count: number }>;
};

export type LivingAgentProfileDto = {
  agent: LivingAgentSummaryDto;
  currentActivity: {
    status: string;
    activityType: string;
    title: string;
    detail: string | null;
    providerName: string | null;
    model: string | null;
    startedAt: string | null;
    isStale: boolean;
  } | null;
  usageSummary: {
    totalCalls: number;
    totalTokens: number;
    totalEstimatedCostUSD: number;
    tokensToday: number;
    costToday: number;
    callsToday: number;
    byProvider: Array<{ provider: string; model: string; callCount: number; totalTokens: number; totalCostUSD: number }>;
  };
  traceSummary: {
    trustedCount: number;
    partialCount: number;
    legacyUnattributedCount: number;
    totalCount: number;
  };
  relatedProjects: Array<{ id: string; name: string }>;
  relatedCouncilSessions: Array<{ id: string; taskId: string; status: string; createdAt: string }>;
  relatedReports: Array<{ id: string; title: string; category: string; createdAt: string }>;
  relatedMemories: Array<{ id: string; title: string; type: string; createdAt: string }>;
  providerModelSummary: Array<{ provider: string; model: string; callCount: number; totalCostUSD: number }>;
  auditSummary: Array<{ action: string; createdAt: string; metadata: unknown }>;
  recentTimeline: LivingAgentTimelineItemDto[];
};

export type LivingAgentTimelineItemDto = {
  id: string;
  type: "TRACE_STEP" | "TRACE" | "USAGE_RECORD" | "AGENT_ACTIVITY" | "COUNCIL_RESPONSE";
  title: string;
  detail: string | null;
  timestamp: string;
  status: string;
  attributionStatus: string;
  projectId: string | null;
  taskId: string | null;
  councilSessionId: string | null;
  reportId: string | null;
  usageRecordId: string | null;
  traceId: string | null;
  tokensUsed: number | null;
  estimatedCostUSD: number | null;
  provider: string | null;
  model: string | null;
  promptPreview: string | null;
  responsePreview: string | null;
  links: {
    trace: string | null;
    task: string | null;
    council: string | null;
    report: string | null;
    project: string | null;
    usageRecord: string | null;
  };
};

export type LivingAgentRelationsDto = {
  nodes: {
    agent: { id: string; slug: string; name: string; title: string; role: string };
    projects: Array<{ id: string; name: string; status: string }>;
    tasks: Array<{ id: string; title: string; mode: string; status: string }>;
    councilSessions: Array<{ id: string; taskId: string; status: string; createdAt: string }>;
    usageTraces: Array<{ id: string; traceId: string; operation: string; status: string; startedAt: string }>;
    reports: Array<{ id: string; title: string; category: string; createdAt: string }>;
    memories: Array<{ id: string; title: string; type: string; createdAt: string }>;
    providers: Array<{ provider: string; model: string; callCount: number }>;
  };
  edges: Array<{
    source: string;
    target: string;
    type: string;
    label: string;
  }>;
};

const STALE_AFTER_MS = 2 * 60 * 1000;

function startOfToday(): Date {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}

export async function getLivingAgents(): Promise<LivingAgentSummaryDto[]> {
  const agents = await prisma.agent.findMany({
    where: { isTestData: false },
    orderBy: [{ priority: "asc" }, { title: "asc" }]
  });

  if (agents.length === 0) return [];

  const agentIds = agents.map((a) => a.id);
  const today = startOfToday();

  // Aggregate usage records (all time) grouped by agentId
  const usageAll = await prisma.usageRecord.groupBy({
    by: ["agentId"],
    where: { agentId: { in: agentIds } },
    _sum: { totalTokens: true, estimatedCostUSD: true },
    _count: { id: true }
  });

  // Aggregate usage records (today) grouped by agentId
  const usageToday = await prisma.usageRecord.groupBy({
    by: ["agentId"],
    where: { agentId: { in: agentIds }, createdAt: { gte: today } },
    _sum: { totalTokens: true, estimatedCostUSD: true }
  });

  // Attribution counts from AgentActivity (AgentActivity has attributionStatus)
  const traceCounts = await prisma.agentActivity.groupBy({
    by: ["agentId", "attributionStatus"],
    where: { agentId: { in: agentIds } },
    _count: { id: true }
  });

  // Latest activity per agent
  const latestActivities = await prisma.agentActivity.findMany({
    where: { agentId: { in: agentIds } },
    orderBy: [{ heartbeatAt: "desc" }, { startedAt: "desc" }],
    select: {
      agentId: true,
      status: true,
      title: true,
      endedAt: true,
      heartbeatAt: true,
      startedAt: true
    }
  });

  // Distinct project counts per agent (from activities)
  const activityProjects = await prisma.agentActivity.findMany({
    where: { agentId: { in: agentIds }, projectId: { not: null } },
    select: { agentId: true, projectId: true },
    distinct: ["agentId", "projectId"]
  });

  // Provider summary per agent
  const providerByAgent = await prisma.usageRecord.groupBy({
    by: ["agentId", "provider"],
    where: { agentId: { in: agentIds } },
    _sum: { estimatedCostUSD: true },
    _count: { id: true }
  });

  const modelByAgent = await prisma.usageRecord.groupBy({
    by: ["agentId", "model"],
    where: { agentId: { in: agentIds } },
    _count: { id: true }
  });

  const operationByAgent = await prisma.agentActivity.groupBy({
    by: ["agentId", "operation"],
    where: { agentId: { in: agentIds }, operation: { not: null } },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } }
  });

  // Build lookup maps
  const usageAllMap = new Map(usageAll.map((u) => [u.agentId ?? "", u]));
  const usageTodayMap = new Map(usageToday.map((u) => [u.agentId ?? "", u]));
  const latestActivityMap = new Map<string, (typeof latestActivities)[0]>();
  for (const act of latestActivities) {
    if (!latestActivityMap.has(act.agentId)) latestActivityMap.set(act.agentId, act);
  }

  const traceCountMap = new Map<string, { trusted: number; partial: number; legacy: number }>();
  for (const row of traceCounts) {
    const aid = row.agentId ?? "";
    if (!traceCountMap.has(aid)) traceCountMap.set(aid, { trusted: 0, partial: 0, legacy: 0 });
    const entry = traceCountMap.get(aid)!;
    if (row.attributionStatus === "TRUSTED") entry.trusted += row._count.id;
    else if (row.attributionStatus === "PARTIAL") entry.partial += row._count.id;
    else entry.legacy += row._count.id;
  }

  const projectCountMap = new Map<string, number>();
  for (const ap of activityProjects) {
    projectCountMap.set(ap.agentId, (projectCountMap.get(ap.agentId) ?? 0) + 1);
  }

  const providerMap = new Map<string, Array<{ provider: string; callCount: number; totalCostUSD: number }>>();
  for (const row of providerByAgent) {
    const aid = row.agentId ?? "";
    if (!providerMap.has(aid)) providerMap.set(aid, []);
    providerMap.get(aid)!.push({
      provider: row.provider,
      callCount: row._count.id,
      totalCostUSD: row._sum.estimatedCostUSD ?? 0
    });
  }

  const modelMap = new Map<string, Array<{ model: string; callCount: number }>>();
  for (const row of modelByAgent) {
    const aid = row.agentId ?? "";
    if (!modelMap.has(aid)) modelMap.set(aid, []);
    modelMap.get(aid)!.push({ model: row.model, callCount: row._count.id });
  }

  const operationMap = new Map<string, Array<{ operation: string; count: number }>>();
  for (const row of operationByAgent) {
    const aid = row.agentId ?? "";
    if (!operationMap.has(aid)) operationMap.set(aid, []);
    const ops = operationMap.get(aid)!;
    if (ops.length < 5) ops.push({ operation: row.operation ?? "unknown", count: row._count.id });
  }

  return agents.map((agent): LivingAgentSummaryDto => {
    const usage = usageAllMap.get(agent.id);
    const todayUsage = usageTodayMap.get(agent.id);
    const latestAct = latestActivityMap.get(agent.id);
    const traces = traceCountMap.get(agent.id) ?? { trusted: 0, partial: 0, legacy: 0 };

    const isActiveNow =
      latestAct &&
      !latestAct.endedAt &&
      ["QUEUED", "THINKING", "WAITING_PROVIDER", "RESPONDING", "SUMMARIZING", "EXTRACTING_MEMORY", "GENERATING_REPORT"].includes(
        latestAct.status
      );

    let currentStatus = "IDLE";
    if (isActiveNow) {
      const isStale = latestAct && Date.now() - latestAct.heartbeatAt.getTime() > STALE_AFTER_MS;
      currentStatus = isStale ? "STALE" : latestAct.status;
    } else if (latestAct?.status === "COMPLETED") {
      currentStatus = "COMPLETED";
    } else if (latestAct?.status === "FAILED") {
      currentStatus = "FAILED";
    }

    return {
      id: agent.id,
      slug: agent.slug,
      name: agent.name,
      title: agent.title,
      role: agent.role,
      specialty: agent.specialty,
      description: agent.description,
      isActive: agent.isActive,
      priority: agent.priority,
      preferredProviderId: agent.preferredProviderId,
      defaultModel: agent.defaultModel,
      ...extractDisplayProfile(agent.config),
      createdAt: agent.createdAt.toISOString(),
      updatedAt: agent.updatedAt.toISOString(),
      currentStatus,
      lastActivityAt: latestAct ? (latestAct.endedAt ?? latestAct.heartbeatAt ?? latestAct.startedAt)?.toISOString() ?? null : null,
      lastActivityTitle: latestAct?.title ?? null,
      totalCalls: usage?._count.id ?? 0,
      totalTokens: usage?._sum.totalTokens ?? 0,
      totalEstimatedCostUSD: usage?._sum.estimatedCostUSD ?? 0,
      tokensToday: todayUsage?._sum.totalTokens ?? 0,
      costToday: todayUsage?._sum.estimatedCostUSD ?? 0,
      trustedTraceCount: traces.trusted,
      partialTraceCount: traces.partial,
      legacyUnattributedCount: traces.legacy,
      linkedProjectCount: projectCountMap.get(agent.id) ?? 0,
      providerSummary: providerMap.get(agent.id) ?? [],
      modelSummary: (modelMap.get(agent.id) ?? []).slice(0, 5),
      topOperations: operationMap.get(agent.id) ?? []
    };
  });
}

export async function getLivingAgentProfile(agentId: string): Promise<LivingAgentProfileDto | null> {
  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent) return null;

  const today = startOfToday();

  // Usage summary
  const usageAll = await prisma.usageRecord.aggregate({
    where: { agentId },
    _sum: { totalTokens: true, estimatedCostUSD: true },
    _count: { id: true }
  });
  const usageToday = await prisma.usageRecord.aggregate({
    where: { agentId, createdAt: { gte: today } },
    _sum: { totalTokens: true, estimatedCostUSD: true },
    _count: { id: true }
  });
  const usageByProviderModel = await prisma.usageRecord.groupBy({
    by: ["provider", "model"],
    where: { agentId },
    _count: { id: true },
    _sum: { totalTokens: true, estimatedCostUSD: true }
  });

  // Trace summary - use AgentActivity for attribution counts, AIUsageTrace for total
  const tracesByAttribution = await prisma.agentActivity.groupBy({
    by: ["attributionStatus"],
    where: { agentId },
    _count: { id: true }
  });
  const traceTotal = await prisma.aIUsageTrace.count({ where: { agentId } });

  // Current activity
  const currentActivity = await prisma.agentActivity.findFirst({
    where: { agentId },
    orderBy: [{ heartbeatAt: "desc" }, { startedAt: "desc" }]
  });

  // Related projects (deduplicated from activities + traces)
  const activityProjectIds = await prisma.agentActivity.findMany({
    where: { agentId, projectId: { not: null } },
    select: { projectId: true },
    distinct: ["projectId"]
  });
  const traceProjectIds = await prisma.aIUsageTrace.findMany({
    where: { agentId, projectId: { not: null } },
    select: { projectId: true },
    distinct: ["projectId"]
  });
  const allProjectIds = [
    ...new Set([...activityProjectIds.map((r) => r.projectId!), ...traceProjectIds.map((r) => r.projectId!)])
  ];
  const relatedProjects =
    allProjectIds.length > 0
      ? await prisma.project.findMany({
          where: { id: { in: allProjectIds } },
          select: { id: true, name: true },
          take: 20
        })
      : [];

  // Council sessions via AgentResponse
  const agentResponses = await prisma.agentResponse.findMany({
    where: { agentId },
    select: { sessionId: true },
    distinct: ["sessionId"],
    orderBy: { createdAt: "desc" },
    take: 20
  });
  const councilSessionIds = agentResponses.map((r) => r.sessionId);
  const relatedCouncilSessions =
    councilSessionIds.length > 0
      ? await prisma.councilSession.findMany({
          where: { id: { in: councilSessionIds } },
          select: { id: true, taskId: true, status: true, createdAt: true },
          orderBy: { createdAt: "desc" }
        })
      : [];

  // Reports via AIUsageTraceStep
  const stepReportIds = await prisma.aIUsageTraceStep.findMany({
    where: { agentId, reportId: { not: null } },
    select: { reportId: true },
    distinct: ["reportId"],
    take: 20
  });
  const reportIds = stepReportIds.map((r) => r.reportId!);
  const relatedReports =
    reportIds.length > 0
      ? await prisma.report.findMany({
          where: { id: { in: reportIds } },
          select: { id: true, title: true, category: true, createdAt: true },
          orderBy: { createdAt: "desc" }
        })
      : [];

  // Memories via council sessions the agent participated in
  const memories: Array<{ id: string; title: string; type: string; createdAt: string }> = [];
  if (councilSessionIds.length > 0) {
    const sessions = await prisma.councilSession.findMany({
      where: { id: { in: councilSessionIds } },
      select: { consultedMemoryIds: true, autoSavedMemoryIds: true }
    });
    const allMemoryIds = [
      ...new Set(sessions.flatMap((s) => [...s.consultedMemoryIds, ...s.autoSavedMemoryIds]))
    ];
    if (allMemoryIds.length > 0) {
      const memRows = await prisma.memory.findMany({
        where: { id: { in: allMemoryIds } },
        select: { id: true, title: true, type: true, createdAt: true },
        take: 20
      });
      memories.push(...memRows.map((m) => ({ ...m, type: m.type as string, createdAt: m.createdAt.toISOString() })));
    }
  }

  // Audit logs for this agent
  const auditRows = await prisma.auditLog.findMany({
    where: { resourceType: "agent", resourceId: agentId },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { action: true, createdAt: true, metadata: true }
  });

  // Recent timeline (top 20 items)
  const recentTimeline = await buildTimeline(agentId, { limit: 20 });

  const traceSummaryMap = new Map(tracesByAttribution.map((t) => [t.attributionStatus, t._count.id]));

  const ACTIVE_STATUSES = ["QUEUED", "THINKING", "WAITING_PROVIDER", "RESPONDING", "SUMMARIZING", "EXTRACTING_MEMORY", "GENERATING_REPORT"];

  // Additional data for summary (not fetched above yet)
  const providerSummaryByAgent = await prisma.usageRecord.groupBy({
    by: ["provider"],
    where: { agentId },
    _count: { id: true },
    _sum: { estimatedCostUSD: true }
  });
  const modelSummaryByAgent = await prisma.usageRecord.groupBy({
    by: ["model"],
    where: { agentId },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } }
  });
  const topOperationsByAgent = await prisma.agentActivity.groupBy({
    by: ["operation"],
    where: { agentId, operation: { not: null } },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    take: 5
  });

  // Derive current status from the already-fetched currentActivity
  const isActiveNow =
    currentActivity &&
    !currentActivity.endedAt &&
    ACTIVE_STATUSES.includes(currentActivity.status);

  let currentStatus = "IDLE";
  if (isActiveNow && currentActivity) {
    const isStale = Date.now() - currentActivity.heartbeatAt.getTime() > STALE_AFTER_MS;
    currentStatus = isStale ? "STALE" : currentActivity.status;
  } else if (currentActivity?.status === "COMPLETED") {
    currentStatus = "COMPLETED";
  } else if (currentActivity?.status === "FAILED") {
    currentStatus = "FAILED";
  }

  const lastActivityTime = currentActivity
    ? (currentActivity.endedAt ?? currentActivity.heartbeatAt ?? currentActivity.startedAt)
    : null;

  const agentSummary: LivingAgentSummaryDto = {
    id: agent.id,
    slug: agent.slug,
    name: agent.name,
    title: agent.title,
    role: agent.role,
    specialty: agent.specialty,
    description: agent.description,
    isActive: agent.isActive,
    priority: agent.priority,
    preferredProviderId: agent.preferredProviderId,
    defaultModel: agent.defaultModel,
    ...extractDisplayProfile(agent.config),
    createdAt: agent.createdAt.toISOString(),
    updatedAt: agent.updatedAt.toISOString(),
    currentStatus,
    lastActivityAt: lastActivityTime?.toISOString() ?? null,
    lastActivityTitle: currentActivity?.title ?? null,
    totalCalls: usageAll._count.id,
    totalTokens: usageAll._sum.totalTokens ?? 0,
    totalEstimatedCostUSD: usageAll._sum.estimatedCostUSD ?? 0,
    tokensToday: usageToday._sum.totalTokens ?? 0,
    costToday: usageToday._sum.estimatedCostUSD ?? 0,
    trustedTraceCount: traceSummaryMap.get("TRUSTED") ?? 0,
    partialTraceCount: traceSummaryMap.get("PARTIAL") ?? 0,
    legacyUnattributedCount: (traceSummaryMap.get("LEGACY_UNATTRIBUTED") ?? 0) + (traceSummaryMap.get("UNKNOWN_SOURCE") ?? 0),
    linkedProjectCount: allProjectIds.length,
    providerSummary: providerSummaryByAgent.map((r) => ({
      provider: r.provider,
      callCount: r._count.id,
      totalCostUSD: r._sum.estimatedCostUSD ?? 0
    })),
    modelSummary: modelSummaryByAgent.slice(0, 5).map((r) => ({ model: r.model, callCount: r._count.id })),
    topOperations: topOperationsByAgent.map((r) => ({ operation: r.operation ?? "unknown", count: r._count.id }))
  };

  return {
    agent: agentSummary,
    currentActivity: currentActivity
      ? {
          status: currentActivity.status,
          activityType: currentActivity.activityType,
          title: currentActivity.title,
          detail: currentActivity.detail,
          providerName: currentActivity.providerName,
          model: currentActivity.model,
          startedAt: currentActivity.startedAt?.toISOString() ?? null,
          isStale:
            !currentActivity.endedAt &&
            ACTIVE_STATUSES.includes(currentActivity.status) &&
            Date.now() - currentActivity.heartbeatAt.getTime() > STALE_AFTER_MS
        }
      : null,
    usageSummary: {
      totalCalls: usageAll._count.id,
      totalTokens: usageAll._sum.totalTokens ?? 0,
      totalEstimatedCostUSD: usageAll._sum.estimatedCostUSD ?? 0,
      tokensToday: usageToday._sum.totalTokens ?? 0,
      costToday: usageToday._sum.estimatedCostUSD ?? 0,
      callsToday: usageToday._count.id,
      byProvider: usageByProviderModel.map((r) => ({
        provider: r.provider,
        model: r.model,
        callCount: r._count.id,
        totalTokens: r._sum.totalTokens ?? 0,
        totalCostUSD: r._sum.estimatedCostUSD ?? 0
      }))
    },
    traceSummary: {
      trustedCount: traceSummaryMap.get("TRUSTED") ?? 0,
      partialCount: traceSummaryMap.get("PARTIAL") ?? 0,
      legacyUnattributedCount: (traceSummaryMap.get("LEGACY_UNATTRIBUTED") ?? 0) + (traceSummaryMap.get("UNKNOWN_SOURCE") ?? 0),
      totalCount: traceTotal
    },
    relatedProjects: relatedProjects.map((p) => ({ id: p.id, name: p.name })),
    relatedCouncilSessions: relatedCouncilSessions.map((s) => ({
      id: s.id,
      taskId: s.taskId,
      status: s.status,
      createdAt: s.createdAt.toISOString()
    })),
    relatedReports: relatedReports.map((r) => ({
      id: r.id,
      title: r.title,
      category: r.category,
      createdAt: r.createdAt.toISOString()
    })),
    relatedMemories: memories,
    providerModelSummary: usageByProviderModel.map((r) => ({
      provider: r.provider,
      model: r.model,
      callCount: r._count.id,
      totalCostUSD: r._sum.estimatedCostUSD ?? 0
    })),
    auditSummary: auditRows.map((r) => ({
      action: r.action,
      createdAt: r.createdAt.toISOString(),
      metadata: r.metadata
    })),
    recentTimeline
  };
}

export type TimelineFilters = {
  sourceType?: string;
  operation?: string;
  projectId?: string;
  attributionStatus?: string;
  from?: string;
  to?: string;
  limit?: number;
  cursor?: string;
};

export async function getLivingAgentTimeline(
  agentId: string,
  filters: TimelineFilters = {}
): Promise<{ items: LivingAgentTimelineItemDto[]; nextCursor: string | null; total: number }> {
  const agent = await prisma.agent.findUnique({ where: { id: agentId }, select: { id: true } });
  if (!agent) return { items: [], nextCursor: null, total: 0 };

  const items = await buildTimeline(agentId, filters);
  const limit = Math.min(filters.limit ?? 50, 200);
  const nextCursor = items.length === limit ? items[items.length - 1]?.timestamp ?? null : null;

  return { items, nextCursor, total: items.length };
}

async function buildTimeline(agentId: string, filters: TimelineFilters = {}): Promise<LivingAgentTimelineItemDto[]> {
  const limit = Math.min(filters.limit ?? 50, 200);
  const fromDate = filters.from ? new Date(filters.from) : undefined;
  const toDate = filters.to ? new Date(filters.to) : undefined;

  const items: LivingAgentTimelineItemDto[] = [];

  // --- Source 1: AIUsageTraceStep (highest fidelity) ---
  const stepWhere: Prisma.AIUsageTraceStepWhereInput = { agentId };
  if (filters.operation) stepWhere.operation = filters.operation;
  if (filters.projectId) stepWhere.projectId = filters.projectId;
  if (fromDate || toDate) stepWhere.startedAt = { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lte: toDate } : {}) };

  const steps = await prisma.aIUsageTraceStep.findMany({
    where: stepWhere,
    orderBy: { startedAt: "desc" },
    take: limit
  });

  const stepTraceIds = new Set(steps.map((s) => s.traceId));

  for (const step of steps) {
    items.push({
      id: step.id,
      type: "TRACE_STEP",
      title: step.title,
      detail: step.detail,
      timestamp: step.startedAt.toISOString(),
      status: step.status,
      attributionStatus: "TRUSTED",
      projectId: step.projectId,
      taskId: step.taskId,
      councilSessionId: step.councilSessionId,
      reportId: step.reportId,
      usageRecordId: step.usageRecordId,
      traceId: step.traceId,
      tokensUsed: step.tokensUsed,
      estimatedCostUSD: step.estimatedCostUSD,
      provider: step.providerName,
      model: step.model,
      promptPreview: step.promptPreview,
      responsePreview: step.responsePreview,
      links: {
        trace: step.traceId ? `/usage-traces/${step.traceId}` : null,
        task: step.taskId ? "/throne-room" : null,
        council: step.councilSessionId ? "/council" : null,
        report: step.reportId ? "/reports" : null,
        project: step.projectId ? `/projects/${step.projectId}` : null,
        usageRecord: null
      }
    });
  }

  // --- Source 2: AIUsageTrace where agentId matches and no steps were included ---
  // AIUsageTrace does not have attributionStatus; skip that filter here
  const traceWhere: Prisma.AIUsageTraceWhereInput = { agentId };
  if (filters.operation) traceWhere.operation = filters.operation;
  if (filters.projectId) traceWhere.projectId = filters.projectId;
  if (fromDate || toDate) traceWhere.startedAt = { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lte: toDate } : {}) };

  const traces = await prisma.aIUsageTrace.findMany({
    where: traceWhere,
    orderBy: { startedAt: "desc" },
    take: limit
  });

  for (const trace of traces) {
    // Skip if already represented by a step
    if (stepTraceIds.has(trace.traceId)) continue;
    items.push({
      id: trace.id,
      type: "TRACE",
      title: trace.operation,
      detail: trace.purpose,
      timestamp: trace.startedAt.toISOString(),
      status: trace.status,
      attributionStatus: "PARTIAL",
      projectId: trace.projectId,
      taskId: trace.taskId,
      councilSessionId: trace.councilSessionId,
      reportId: null,
      usageRecordId: null,
      traceId: trace.traceId,
      tokensUsed: null,
      estimatedCostUSD: null,
      provider: trace.providerName,
      model: trace.model,
      promptPreview: trace.promptPreview,
      responsePreview: trace.responsePreview,
      links: {
        trace: `/usage-traces/${trace.traceId}`,
        task: trace.taskId ? "/throne-room" : null,
        council: trace.councilSessionId ? "/council" : null,
        report: null,
        project: trace.projectId ? `/projects/${trace.projectId}` : null,
        usageRecord: null
      }
    });
  }

  // --- Source 3: UsageRecord where traceId IS NULL (legacy/unattributed) ---
  const usageWhere: Prisma.UsageRecordWhereInput = { agentId, traceId: null };
  if (filters.attributionStatus) usageWhere.attributionStatus = filters.attributionStatus;
  if (filters.sourceType) usageWhere.sourceType = filters.sourceType;
  if (filters.projectId) usageWhere.projectId = filters.projectId;
  if (fromDate || toDate) usageWhere.createdAt = { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lte: toDate } : {}) };

  const legacyUsage = await prisma.usageRecord.findMany({
    where: usageWhere,
    orderBy: { createdAt: "desc" },
    take: limit
  });

  for (const rec of legacyUsage) {
    items.push({
      id: rec.id,
      type: "USAGE_RECORD",
      title: rec.requestLabel ?? rec.operation ?? rec.purpose ?? "Usage record",
      detail: rec.sourceType ? `Source: ${rec.sourceType}` : null,
      timestamp: rec.createdAt.toISOString(),
      status: "COMPLETED",
      attributionStatus: rec.attributionStatus ?? "LEGACY_UNATTRIBUTED",
      projectId: rec.projectId,
      taskId: rec.taskId,
      councilSessionId: rec.councilSessionId,
      reportId: null,
      usageRecordId: rec.id,
      traceId: null,
      tokensUsed: rec.totalTokens,
      estimatedCostUSD: rec.estimatedCostUSD,
      provider: rec.provider,
      model: rec.model,
      promptPreview: rec.promptPreview,
      responsePreview: rec.responsePreview,
      links: {
        trace: null,
        task: rec.taskId ? "/throne-room" : null,
        council: rec.councilSessionId ? "/council" : null,
        report: null,
        project: rec.projectId ? `/projects/${rec.projectId}` : null,
        usageRecord: null
      }
    });
  }

  // --- Source 4: AgentActivity ---
  const actWhere: Prisma.AgentActivityWhereInput = { agentId };
  if (filters.operation) actWhere.operation = filters.operation;
  if (filters.projectId) actWhere.projectId = filters.projectId;
  if (filters.attributionStatus) actWhere.attributionStatus = filters.attributionStatus;
  if (filters.sourceType) actWhere.sourceType = filters.sourceType;
  if (fromDate || toDate) actWhere.startedAt = { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lte: toDate } : {}) };

  const activities = await prisma.agentActivity.findMany({
    where: actWhere,
    orderBy: { startedAt: "desc" },
    take: limit
  });

  // Track traceIds already captured so we don't duplicate activity entries that mirror trace steps
  const existingTraceIds = new Set(items.filter((i) => i.traceId).map((i) => i.traceId));

  for (const act of activities) {
    if (act.traceId && existingTraceIds.has(act.traceId)) continue;
    items.push({
      id: act.id,
      type: "AGENT_ACTIVITY",
      title: act.title,
      detail: act.detail,
      timestamp: (act.startedAt ?? act.createdAt).toISOString(),
      status: act.status,
      attributionStatus: act.attributionStatus ?? "LEGACY_UNATTRIBUTED",
      projectId: act.projectId,
      taskId: act.taskId,
      councilSessionId: act.councilSessionId,
      reportId: act.reportId,
      usageRecordId: act.usageRecordId,
      traceId: act.traceId,
      tokensUsed: act.tokensUsed,
      estimatedCostUSD: act.estimatedCostUSD,
      provider: act.providerName,
      model: act.model,
      promptPreview: null,
      responsePreview: null,
      links: {
        trace: act.traceId ? `/usage-traces/${act.traceId}` : null,
        task: act.taskId ? "/throne-room" : null,
        council: act.councilSessionId ? "/council" : null,
        report: act.reportId ? "/reports" : null,
        project: act.projectId ? `/projects/${act.projectId}` : null,
        usageRecord: null
      }
    });
  }

  // Sort by timestamp descending
  items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return items.slice(0, limit);
}

export async function getLivingAgentRelations(agentId: string): Promise<LivingAgentRelationsDto | null> {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { id: true, slug: true, name: true, title: true, role: true }
  });
  if (!agent) return null;

  // Projects
  const actProjectIds = await prisma.agentActivity.findMany({
    where: { agentId, projectId: { not: null } },
    select: { projectId: true },
    distinct: ["projectId"]
  });
  const traceProjectIds = await prisma.aIUsageTrace.findMany({
    where: { agentId, projectId: { not: null } },
    select: { projectId: true },
    distinct: ["projectId"]
  });
  const allProjectIds = [...new Set([...actProjectIds.map((r) => r.projectId!), ...traceProjectIds.map((r) => r.projectId!)])];
  const projects =
    allProjectIds.length > 0
      ? await prisma.project.findMany({
          where: { id: { in: allProjectIds } },
          select: { id: true, name: true, status: true },
          take: 20
        })
      : [];

  // Tasks
  const actTaskIds = await prisma.agentActivity.findMany({
    where: { agentId, taskId: { not: null } },
    select: { taskId: true },
    distinct: ["taskId"]
  });
  const traceTaskIds = await prisma.aIUsageTrace.findMany({
    where: { agentId, taskId: { not: null } },
    select: { taskId: true },
    distinct: ["taskId"]
  });
  const allTaskIds = [...new Set([...actTaskIds.map((r) => r.taskId!), ...traceTaskIds.map((r) => r.taskId!)])];
  const tasks =
    allTaskIds.length > 0
      ? await prisma.task.findMany({
          where: { id: { in: allTaskIds } },
          select: { id: true, title: true, mode: true, status: true },
          take: 20
        })
      : [];

  // Council sessions
  const agentResponses = await prisma.agentResponse.findMany({
    where: { agentId },
    select: { sessionId: true },
    distinct: ["sessionId"],
    orderBy: { createdAt: "desc" },
    take: 20
  });
  const councilSessionIds = agentResponses.map((r) => r.sessionId);
  const councilSessions =
    councilSessionIds.length > 0
      ? await prisma.councilSession.findMany({
          where: { id: { in: councilSessionIds } },
          select: { id: true, taskId: true, status: true, createdAt: true },
          orderBy: { createdAt: "desc" }
        })
      : [];

  // Traces
  const traces = await prisma.aIUsageTrace.findMany({
    where: { agentId },
    select: { id: true, traceId: true, operation: true, status: true, startedAt: true },
    orderBy: { startedAt: "desc" },
    take: 20
  });

  // Reports
  const stepReportIds = await prisma.aIUsageTraceStep.findMany({
    where: { agentId, reportId: { not: null } },
    select: { reportId: true },
    distinct: ["reportId"],
    take: 20
  });
  const reportIds = stepReportIds.map((r) => r.reportId!);
  const reports =
    reportIds.length > 0
      ? await prisma.report.findMany({
          where: { id: { in: reportIds } },
          select: { id: true, title: true, category: true, createdAt: true }
        })
      : [];

  // Memories
  const memories: Array<{ id: string; title: string; type: string; createdAt: string }> = [];
  if (councilSessionIds.length > 0) {
    const sessions = await prisma.councilSession.findMany({
      where: { id: { in: councilSessionIds } },
      select: { consultedMemoryIds: true, autoSavedMemoryIds: true }
    });
    const allMemoryIds = [...new Set(sessions.flatMap((s) => [...s.consultedMemoryIds, ...s.autoSavedMemoryIds]))];
    if (allMemoryIds.length > 0) {
      const memRows = await prisma.memory.findMany({
        where: { id: { in: allMemoryIds } },
        select: { id: true, title: true, type: true, createdAt: true },
        take: 20
      });
      memories.push(...memRows.map((m) => ({ ...m, type: m.type as string, createdAt: m.createdAt.toISOString() })));
    }
  }

  // Providers
  const providerUsage = await prisma.usageRecord.groupBy({
    by: ["provider", "model"],
    where: { agentId },
    _count: { id: true }
  });

  // Build edges
  const edges: LivingAgentRelationsDto["edges"] = [];
  for (const proj of projects) {
    edges.push({ source: agentId, target: proj.id, type: "WORKED_ON_PROJECT", label: "worked on" });
  }
  for (const cs of councilSessions) {
    edges.push({ source: agentId, target: cs.id, type: "PARTICIPATED_IN", label: "participated in" });
  }
  for (const trace of traces) {
    edges.push({ source: agentId, target: trace.id, type: "PRODUCED_USAGE", label: "produced usage" });
  }
  for (const rep of reports) {
    edges.push({ source: agentId, target: rep.id, type: "GENERATED_REPORT", label: "generated report" });
  }
  for (const mem of memories) {
    edges.push({ source: agentId, target: mem.id, type: "CONSULTED_MEMORY", label: "consulted memory" });
  }
  for (const pu of providerUsage) {
    const nodeId = `provider:${pu.provider}:${pu.model}`;
    edges.push({ source: agentId, target: nodeId, type: "USED_PROVIDER", label: "used provider" });
  }

  return {
    nodes: {
      agent,
      projects: projects.map((p) => ({ id: p.id, name: p.name, status: p.status })),
      tasks: tasks.map((t) => ({ id: t.id, title: t.title, mode: t.mode, status: t.status })),
      councilSessions: councilSessions.map((s) => ({
        id: s.id,
        taskId: s.taskId,
        status: s.status,
        createdAt: s.createdAt.toISOString()
      })),
      usageTraces: traces.map((t) => ({
        id: t.id,
        traceId: t.traceId,
        operation: t.operation,
        status: t.status,
        startedAt: t.startedAt.toISOString()
      })),
      reports: reports.map((r) => ({
        id: r.id,
        title: r.title,
        category: r.category,
        createdAt: r.createdAt.toISOString()
      })),
      memories,
      providers: providerUsage.map((p) => ({
        provider: p.provider,
        model: p.model,
        callCount: p._count.id
      }))
    },
    edges
  };
}
