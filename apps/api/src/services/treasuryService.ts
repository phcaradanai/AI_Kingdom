import { prisma } from "../db/prisma.js";
import { getSettingValue } from "./settingsService.js";
import { getModelPricing } from "./modelPricingService.js";
import {
  getDeepSeekBalanceDelta,
  getLatestDeepSeekBalanceErrorSnapshot,
  getLatestDeepSeekBalanceSnapshot,
  listLatestProviderBalanceSnapshots
} from "./providerBalanceService.js";

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
    select: { id: true, name: true, title: true, slug: true }
  });
  const agentMap = new Map(agents.map((a) => [a.id, a]));

  return groups.map((g) => ({
    agentId: g.agentId,
    agent: g.agentId ? (agentMap.get(g.agentId) ?? null) : null,
    totalCostUSD: g._sum.estimatedCostUSD ?? 0,
    totalTokens: g._sum.totalTokens ?? 0,
    promptTokens: g._sum.promptTokens ?? 0,
    completionTokens: g._sum.completionTokens ?? 0,
    callCount: g._count.id
  }));
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
      agent: { select: { name: true, title: true, slug: true } },
      task: { select: { id: true, title: true, mode: true } },
      trace: {
        include: {
          actorUser: { select: { id: true, displayName: true, role: true } }
        }
      }
    }
  });

  return records.map((record) => ({
    ...record,
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
  }));
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
