import { prisma } from "../db/prisma.js";
import { extractAgentDisplayProfile } from "./agentDisplayProfileService.js";
import { getSettingValue } from "./settingsService.js";
import { listAIProviders } from "./aiProviderRegistry.js";
import { getModelPricing } from "./modelPricingService.js";
import {
  getDeepSeekBalanceDelta,
  getLatestDeepSeekBalanceErrorSnapshot,
  getLatestDeepSeekBalanceSnapshot,
  listLatestProviderBalanceSnapshots
} from "./providerBalanceService.js";
import { listLatestProviderAccountSnapshots } from "./providerAccountSyncService.js";
import { getLatestProviderHealthSnapshots } from "./providerHealthSnapshotService.js";
import { getLastModelSyncTime } from "./providerModelSyncService.js";

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfMonth(): Date {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function getTreasuryOverview() {
  const todayAgg = await prisma.usageRecord.aggregate({
    _sum: { estimatedCostUSD: true, totalTokens: true },
    _count: { id: true },
    where: { createdAt: { gte: startOfToday() } }
  });
  const monthAgg = await prisma.usageRecord.aggregate({
    _sum: { estimatedCostUSD: true, totalTokens: true },
    _count: { id: true },
    where: { createdAt: { gte: startOfMonth() } }
  });
  const deepseekTodayAgg = await prisma.usageRecord.aggregate({
    _sum: { estimatedCostUSD: true },
    where: { provider: "deepseek", createdAt: { gte: startOfToday() } }
  });
  const deepseekMonthAgg = await prisma.usageRecord.aggregate({
    _sum: { estimatedCostUSD: true },
    where: { provider: "deepseek", createdAt: { gte: startOfMonth() } }
  });
  const dailyLimitStr = await getSettingValue("DAILY_BUDGET_LIMIT_USD", "");
  const monthlyLimitStr = await getSettingValue("MONTHLY_BUDGET_LIMIT_USD", "");

  const taskCount = await prisma.usageRecord.findMany({
    where: { taskId: { not: null } },
    select: { taskId: true },
    distinct: ["taskId"]
  });
  const sessionCount = await prisma.usageRecord.findMany({
    where: { councilSessionId: { not: null } },
    select: { councilSessionId: true },
    distinct: ["councilSessionId"]
  });
  const allTimeAgg = await prisma.usageRecord.aggregate({
    _sum: { estimatedCostUSD: true, totalTokens: true },
    _count: { id: true }
  });
  const latestProviderBalances = await listLatestProviderBalanceSnapshots();
  const latestDeepSeekBalance = await getLatestDeepSeekBalanceSnapshot();
  const latestDeepSeekBalanceError = await getLatestDeepSeekBalanceErrorSnapshot();
  const latestProviderAccounts = await listLatestProviderAccountSnapshots();
  const latestProviderHealth = await getLatestProviderHealthSnapshots();
  const lastModelSyncedAt = await getLastModelSyncTime();

  const costToday = todayAgg._sum.estimatedCostUSD ?? 0;
  const costThisMonth = monthAgg._sum.estimatedCostUSD ?? 0;
  const dailyLimit = dailyLimitStr !== "" ? parseFloat(dailyLimitStr) : null;
  const monthlyLimit = monthlyLimitStr !== "" ? parseFloat(monthlyLimitStr) : null;
  const balanceDelta = await getDeepSeekBalanceDelta(latestDeepSeekBalance);
  const latestErrorIsCurrent = latestDeepSeekBalanceError && (!latestDeepSeekBalance || latestDeepSeekBalanceError.fetchedAt > latestDeepSeekBalance.fetchedAt);
  const reconciliationStatus = latestErrorIsCurrent
    ? "PROVIDER_API_ERROR"
    : latestDeepSeekBalance
      ? latestDeepSeekBalance.isAvailable ? "OK" : "ESTIMATE_ONLY"
      : "NO_BALANCE_SNAPSHOT";

  return {
    costToday,
    costThisMonth,
    costAllTime: allTimeAgg._sum.estimatedCostUSD ?? 0,
    totalTokensToday: todayAgg._sum.totalTokens ?? 0,
    totalTokensThisMonth: monthAgg._sum.totalTokens ?? 0,
    totalTokensAllTime: allTimeAgg._sum.totalTokens ?? 0,
    totalCallsAllTime: allTimeAgg._count.id,
    totalTasksTracked: taskCount.length,
    totalSessionsTracked: sessionCount.length,
    latestProviderBalances,
    deepseekEstimatedSpendToday: deepseekTodayAgg._sum.estimatedCostUSD ?? 0,
    deepseekEstimatedSpendThisMonth: deepseekMonthAgg._sum.estimatedCostUSD ?? 0,
    latestDeepSeekBalance,
    balanceLastFetchedAt: latestDeepSeekBalance?.fetchedAt ?? latestDeepSeekBalanceError?.fetchedAt ?? null,
    reconciliationStatus,
    balanceDelta,
    budgetStatus: {
      dailyLimit,
      monthlyLimit,
      dailyWarning: dailyLimit !== null && costToday >= dailyLimit,
      monthlyWarning: monthlyLimit !== null && costThisMonth >= monthlyLimit
    },
    providerTelemetry: {
      accountSnapshots: latestProviderAccounts,
      healthSnapshots: latestProviderHealth,
      lastModelSyncedAt
    }
  };
}

export async function getTreasuryByAgent() {
  const groups = await prisma.usageRecord.groupBy({
    by: ["agentId"],
    _sum: { estimatedCostUSD: true, totalTokens: true, promptTokens: true, completionTokens: true },
    _count: { id: true },
    orderBy: { _sum: { estimatedCostUSD: "desc" } }
  });

  const agentIds = groups.map((g) => g.agentId).filter((id): id is string => id !== null);
  const agents = await prisma.agent.findMany({
    where: { id: { in: agentIds } },
    select: { id: true, name: true, title: true, slug: true, config: true }
  });
  const agentMap = new Map(agents.map((a) => [a.id, a]));

  return groups.map((g) => {
    const raw = g.agentId ? (agentMap.get(g.agentId) ?? null) : null;
    const agent = raw ? { id: raw.id, name: raw.name, title: raw.title, slug: raw.slug, ...extractAgentDisplayProfile(raw.config) } : null;
    return {
      agentId: g.agentId,
      agent,
      totalCostUSD: g._sum.estimatedCostUSD ?? 0,
      totalTokens: g._sum.totalTokens ?? 0,
      promptTokens: g._sum.promptTokens ?? 0,
      completionTokens: g._sum.completionTokens ?? 0,
      callCount: g._count.id
    };
  });
}

export async function getTreasuryByProvider() {
  const groups = await prisma.usageRecord.groupBy({
    by: ["provider", "providerId", "model"],
    _sum: { estimatedCostUSD: true, totalTokens: true, promptTokens: true, completionTokens: true },
    _count: { id: true },
    orderBy: { _sum: { estimatedCostUSD: "desc" } }
  });

  return groups.map((g) => ({
    provider: g.provider,
    providerId: g.providerId,
    model: g.model,
    totalCostUSD: g._sum.estimatedCostUSD ?? 0,
    totalTokens: g._sum.totalTokens ?? 0,
    promptTokens: g._sum.promptTokens ?? 0,
    completionTokens: g._sum.completionTokens ?? 0,
    callCount: g._count.id
  }));
}

export async function getTreasuryUsage(limit = 100) {
  const records = await prisma.usageRecord.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      agent: { select: { name: true, title: true, slug: true, config: true } },
      task: { select: { id: true, title: true, mode: true } },
      trace: {
        include: {
          actorUser: { select: { id: true, displayName: true, role: true } }
        }
      }
    }
  });

  return records.map((record) => {
    const rawAgent = record.agent;
    const agent = rawAgent
      ? { name: rawAgent.name, title: rawAgent.title, slug: rawAgent.slug, ...extractAgentDisplayProfile(rawAgent.config) }
      : null;
    return {
      ...record,
      agent,
      triggerType: record.trace?.triggerType ?? (record.attributionStatus === "LEGACY_UNATTRIBUTED" ? "LEGACY" : null),
      triggerLabel: record.trace?.triggerLabel ?? null,
      actorUserId: record.trace?.actorUserId ?? null,
      actorDisplayName: record.trace?.actorUser?.displayName ?? null,
      links: {
        trace: record.traceId ? `/usage-traces/${record.traceId}` : null,
        project: record.projectId ? `/projects/${record.projectId}` : null,
        task: record.taskId ? `/throne-room` : null,
        council: record.councilSessionId ? `/council` : null
      }
    };
  });
}

export async function getTreasuryAttentionTraces(limit = 12) {
  const boundedLimit = Math.max(1, Math.min(limit, 50));
  const traces = await prisma.aIUsageTrace.findMany({
    where: {
      OR: [
        { status: { in: ["FAILED", "ERROR", "TIMEOUT"] } },
        { steps: { some: { status: "FAILED" } } },
        { usageRecords: { some: { estimatedCostUSD: { gt: 0 } } } }
      ]
    },
    orderBy: { startedAt: "desc" },
    take: Math.min(boundedLimit * 10, 200),
    select: {
      traceId: true,
      status: true,
      operation: true,
      purpose: true,
      providerId: true,
      providerType: true,
      providerName: true,
      model: true,
      startedAt: true,
      failedAt: true,
      usageRecords: {
        select: { estimatedCostUSD: true, totalTokens: true }
      },
      steps: {
        where: { status: "FAILED" },
        select: { id: true }
      }
    }
  });

  const attention = traces.map((trace) => {
      const totalCostUSD = trace.usageRecords.reduce((sum, record) => sum + record.estimatedCostUSD, 0);
      const totalTokens = trace.usageRecords.reduce((sum, record) => sum + record.totalTokens, 0);
      const traceFailed = ["FAILED", "ERROR", "TIMEOUT"].includes(trace.status);
      return {
        traceId: trace.traceId,
        status: trace.status,
        operation: trace.operation,
        purpose: trace.purpose,
        providerId: trace.providerId,
        providerType: trace.providerType,
        providerName: trace.providerName,
        model: trace.model,
        startedAt: trace.startedAt,
        failedAt: trace.failedAt,
        totalCostUSD,
        totalTokens,
        usageRecordCount: trace.usageRecords.length,
        failureCount: trace.steps.length + (traceFailed && trace.steps.length === 0 ? 1 : 0),
        attentionKind: traceFailed || trace.steps.length > 0 ? "FAILED" as const : "EXPENSIVE" as const
      };
    });
  const failed = attention
    .filter((trace) => trace.attentionKind === "FAILED")
    .sort((left, right) => right.startedAt.getTime() - left.startedAt.getTime());
  const expensive = attention
    .filter((trace) => trace.attentionKind === "EXPENSIVE")
    .sort((left, right) => right.totalCostUSD - left.totalCostUSD);
  const failedQuota = expensive.length > 0 ? Math.ceil(boundedLimit / 2) : boundedLimit;
  const expensiveQuota = failed.length > 0 ? Math.floor(boundedLimit / 2) : boundedLimit;
  const selected = [...failed.slice(0, failedQuota), ...expensive.slice(0, expensiveQuota)];

  if (selected.length < boundedLimit) {
    const selectedIds = new Set(selected.map((trace) => trace.traceId));
    const remaining = [...failed, ...expensive].filter((trace) => !selectedIds.has(trace.traceId));
    selected.push(...remaining.slice(0, boundedLimit - selected.length));
  }
  return selected;
}

export async function getPricingWarnings() {
  // UNKNOWN: no pricing found at all
  const allGroups = await prisma.usageRecord.groupBy({
    by: ["provider", "model"],
    _count: { id: true }
  });
  const warnings = await Promise.all(
    allGroups.map(async (g) => {
      const { pricingStatus } = await getModelPricing(g.provider, g.model);
      return pricingStatus === "UNKNOWN" ? { provider: g.provider, model: g.model, count: g._count.id } : null;
    })
  );
  const unknownModels = warnings.filter((w): w is NonNullable<typeof w> => w !== null);

  // ESTIMATED: records where the provider did not return cache details
  const estimatedGroups = await prisma.usageRecord.groupBy({
    by: ["provider", "model"],
    where: { pricingStatus: "ESTIMATED" },
    _count: { id: true }
  });
  const estimatedModels = estimatedGroups.map((g) => ({
    provider: g.provider,
    model: g.model,
    count: g._count.id,
    note: "Cache details unavailable; input cost estimated as cache miss."
  }));

  return {
    unknownPricingUsageCount: unknownModels.reduce((sum, w) => sum + w.count, 0),
    unknownModels,
    estimatedPricingUsageCount: estimatedModels.reduce((sum, m) => sum + m.count, 0),
    estimatedModels
  };
}

export async function getTreasuryDailyReport(days = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  since.setHours(0, 0, 0, 0);

  const records = await prisma.usageRecord.findMany({
    where: { createdAt: { gte: since } },
    select: { estimatedCostUSD: true, totalTokens: true, createdAt: true },
    orderBy: { createdAt: "asc" }
  });

  const buckets = new Map<
    string,
    { date: string; totalCostUSD: number; totalTokens: number; callCount: number }
  >();

  for (const r of records) {
    const date = r.createdAt.toISOString().slice(0, 10);
    const existing = buckets.get(date) ?? { date, totalCostUSD: 0, totalTokens: 0, callCount: 0 };
    existing.totalCostUSD += r.estimatedCostUSD;
    existing.totalTokens += r.totalTokens;
    existing.callCount += 1;
    buckets.set(date, existing);
  }

  return Array.from(buckets.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export async function getTreasuryByMonth(months = 12) {
  const since = new Date();
  since.setMonth(since.getMonth() - months + 1);
  since.setDate(1);
  since.setHours(0, 0, 0, 0);

  const records = await prisma.usageRecord.findMany({
    where: { createdAt: { gte: since } },
    select: { estimatedCostUSD: true, totalTokens: true, createdAt: true },
    orderBy: { createdAt: "asc" }
  });

  const buckets = new Map<
    string,
    { month: string; totalCostUSD: number; totalTokens: number; callCount: number }
  >();

  for (const r of records) {
    const month = r.createdAt.toISOString().slice(0, 7);
    const existing = buckets.get(month) ?? { month, totalCostUSD: 0, totalTokens: 0, callCount: 0 };
    existing.totalCostUSD += r.estimatedCostUSD;
    existing.totalTokens += r.totalTokens;
    existing.callCount += 1;
    buckets.set(month, existing);
  }

  return Array.from(buckets.values()).sort((a, b) => a.month.localeCompare(b.month));
}

export async function getTreasuryByModel() {
  const groups = await prisma.usageRecord.groupBy({
    by: ["model", "provider", "providerId"],
    _sum: { estimatedCostUSD: true, totalTokens: true, promptTokens: true, completionTokens: true },
    _count: { id: true },
    orderBy: { _sum: { estimatedCostUSD: "desc" } }
  });

  return groups.map((g) => ({
    model: g.model,
    provider: g.provider,
    providerId: g.providerId,
    totalCostUSD: g._sum.estimatedCostUSD ?? 0,
    totalTokens: g._sum.totalTokens ?? 0,
    promptTokens: g._sum.promptTokens ?? 0,
    completionTokens: g._sum.completionTokens ?? 0,
    callCount: g._count.id
  }));
}

export async function getTreasuryProviderRegistry() {
  const allProviders = await listAIProviders({ activeOnly: false });
  const activeProviders = allProviders.filter((p) => p.isActive);

  // Latest balance snapshots per provider type
  const latestBalanceRows = await prisma.providerBalanceSnapshot.findMany({
    orderBy: { fetchedAt: "desc" }
  });
  const latestBalanceByType = new Map<string, (typeof latestBalanceRows)[number]>();
  for (const row of latestBalanceRows) {
    if (!latestBalanceByType.has(row.providerType)) latestBalanceByType.set(row.providerType, row);
  }

  // Latest account snapshots per provider type
  const latestAccountRows = await prisma.providerAccountSnapshot.findMany({
    orderBy: { syncedAt: "desc" }
  });
  const latestAccountByType = new Map<string, (typeof latestAccountRows)[number]>();
  for (const row of latestAccountRows) {
    if (!latestAccountByType.has(row.providerType)) latestAccountByType.set(row.providerType, row);
  }

  // Latest health snapshots (LAST_50 preferred)
  const healthRows = await prisma.providerHealthSnapshot.findMany({
    where: { windowKind: "LAST_50" },
    orderBy: { computedAt: "desc" }
  });
  // Fall back to any snapshot if no LAST_50
  const healthRowsFallback = await prisma.providerHealthSnapshot.findMany({
    orderBy: { computedAt: "desc" }
  });
  const healthByProvider = new Map<string, (typeof healthRows)[number]>();
  for (const row of [...healthRows, ...healthRowsFallback]) {
    const key = row.providerId ?? row.providerType;
    if (!healthByProvider.has(key)) healthByProvider.set(key, row);
  }

  // Spend per provider (all time)
  const spendGroups = await prisma.usageRecord.groupBy({
    by: ["provider", "providerId"],
    _sum: { estimatedCostUSD: true }
  });
  const spendByProvider = new Map<string, number>();
  for (const g of spendGroups) {
    const key = g.providerId ?? g.provider;
    spendByProvider.set(key, (spendByProvider.get(key) ?? 0) + (g._sum.estimatedCostUSD ?? 0));
  }

  // Model count per provider type from ProviderModelSnapshot
  const modelCountRows = await prisma.providerModelSnapshot.groupBy({
    by: ["providerType"],
    _count: { modelId: true }
  });
  const modelCountByType = new Map<string, number>(modelCountRows.map((r) => [r.providerType, r._count.modelId]));

  // Last sync time = most recent of balance or account snapshot
  function getLastSync(providerType: string): Date | null {
    const balance = latestBalanceByType.get(providerType);
    const account = latestAccountByType.get(providerType);
    const times = [balance?.fetchedAt, account?.syncedAt].filter(Boolean) as Date[];
    if (times.length === 0) return null;
    return times.reduce((a, b) => (a > b ? a : b));
  }

  return activeProviders.map((p) => {
    const healthRow = healthByProvider.get(p.id) ?? healthByProvider.get(p.type);
    const balanceRow = latestBalanceByType.get(p.type) ?? latestBalanceByType.get(p.id);
    const accountRow = latestAccountByType.get(p.type) ?? latestAccountByType.get(p.id);
    const spend = spendByProvider.get(p.id) ?? spendByProvider.get(p.type) ?? 0;
    const modelCount = modelCountByType.get(p.type) ?? 0;

    // Derive balance from whichever snapshot exists
    let balance: number | null = null;
    if (balanceRow?.isAvailable) balance = balanceRow.totalBalance;
    else if (accountRow?.creditsRemaining != null) balance = accountRow.creditsRemaining;

    return {
      id: p.id,
      name: p.name,
      type: p.type,
      isActive: p.isActive,
      isFreeTier: p.isFreeTier,
      environmentMode: p.environmentMode,
      costTier: p.costTier,
      hasCredentials: p.hasCredentials,
      status: deriveProviderStatus(p, accountRow ?? null),
      healthStatus: (healthRow?.healthStatus ?? "UNKNOWN") as "HEALTHY" | "DEGRADED" | "DOWN" | "UNKNOWN",
      balance,
      spend,
      lastSyncAt: getLastSync(p.type) ?? getLastSync(p.id),
      modelCount,
      defaultModel: p.defaultModel
    };
  });
}

function deriveProviderStatus(
  provider: { isActive: boolean; hasCredentials: boolean; environmentMode: string; isFreeTier: boolean },
  accountSnapshot: { status: string } | null
): "ACTIVE" | "NO_CREDENTIALS" | "DISABLED" | "SANDBOX" {
  if (provider.environmentMode === "SANDBOX") return "SANDBOX";
  if (!provider.isActive) return "DISABLED";
  if (!provider.hasCredentials && !provider.isFreeTier) return "NO_CREDENTIALS";
  if (accountSnapshot) return accountSnapshot.status as "ACTIVE";
  return "ACTIVE";
}

export async function getTreasuryFallbackAnalytics() {
  const steps = await prisma.aIUsageTraceStep.findMany({
    where: {
      stepType: { in: ["PROVIDER_CALL_SUCCESS", "PROVIDER_CALL_FAILED"] },
      providerId: { not: null }
    },
    select: {
      stepType: true,
      providerId: true,
      providerName: true,
      model: true,
      durationMs: true,
      errorMessage: true,
      metadata: true
    }
  });

  type ProviderStats = {
    providerId: string;
    providerName: string | null;
    model: string | null;
    successCount: number;
    failureCount: number;
    timeoutCount: number;
    totalDurationMs: number;
    durationSampleCount: number;
  };

  const statsMap = new Map<string, ProviderStats>();

  for (const step of steps) {
    const key = `${step.providerId ?? ""}:${step.model ?? ""}`;
    const existing = statsMap.get(key) ?? {
      providerId: step.providerId ?? "",
      providerName: step.providerName,
      model: step.model,
      successCount: 0,
      failureCount: 0,
      timeoutCount: 0,
      totalDurationMs: 0,
      durationSampleCount: 0
    };

    if (step.stepType === "PROVIDER_CALL_SUCCESS") {
      existing.successCount += 1;
    } else {
      existing.failureCount += 1;
      const msg = step.errorMessage?.toLowerCase() ?? "";
      const meta = step.metadata && typeof step.metadata === "object" ? step.metadata as Record<string, unknown> : {};
      if (msg.includes("timeout") || msg.includes("timed out") || String(meta.statusCode) === "408" || String(meta.statusCode) === "504") {
        existing.timeoutCount += 1;
      }
    }

    if (step.durationMs != null) {
      existing.totalDurationMs += step.durationMs;
      existing.durationSampleCount += 1;
    }

    statsMap.set(key, existing);
  }

  return Array.from(statsMap.values())
    .sort((a, b) => (b.successCount + b.failureCount) - (a.successCount + a.failureCount))
    .map((s) => ({
      providerId: s.providerId,
      providerName: s.providerName,
      model: s.model,
      successCount: s.successCount,
      failureCount: s.failureCount,
      timeoutCount: s.timeoutCount,
      avgDurationMs: s.durationSampleCount > 0 ? Math.round(s.totalDurationMs / s.durationSampleCount) : null,
      totalCalls: s.successCount + s.failureCount
    }));
}
