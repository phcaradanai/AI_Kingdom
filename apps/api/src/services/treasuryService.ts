import { prisma } from "../db/prisma.js";
import { getSettingValue } from "./settingsService.js";
import { getModelPricing } from "./modelPricingService.js";

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
  const [todayAgg, monthAgg, dailyLimitStr, monthlyLimitStr] = await Promise.all([
    prisma.usageRecord.aggregate({
      _sum: { estimatedCostUSD: true, totalTokens: true },
      _count: { id: true },
      where: { createdAt: { gte: startOfToday() } }
    }),
    prisma.usageRecord.aggregate({
      _sum: { estimatedCostUSD: true, totalTokens: true },
      _count: { id: true },
      where: { createdAt: { gte: startOfMonth() } }
    }),
    getSettingValue("DAILY_BUDGET_LIMIT_USD", ""),
    getSettingValue("MONTHLY_BUDGET_LIMIT_USD", "")
  ]);

  const [taskCount, sessionCount, allTimeAgg] = await Promise.all([
    prisma.usageRecord.findMany({
      where: { taskId: { not: null } },
      select: { taskId: true },
      distinct: ["taskId"]
    }),
    prisma.usageRecord.findMany({
      where: { councilSessionId: { not: null } },
      select: { councilSessionId: true },
      distinct: ["councilSessionId"]
    }),
    prisma.usageRecord.aggregate({
      _sum: { estimatedCostUSD: true, totalTokens: true },
      _count: { id: true }
    })
  ]);

  const costToday = todayAgg._sum.estimatedCostUSD ?? 0;
  const costThisMonth = monthAgg._sum.estimatedCostUSD ?? 0;
  const dailyLimit = dailyLimitStr !== "" ? parseFloat(dailyLimitStr) : null;
  const monthlyLimit = monthlyLimitStr !== "" ? parseFloat(monthlyLimitStr) : null;

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
  return prisma.usageRecord.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      agent: { select: { name: true, title: true, slug: true } },
      task: { select: { id: true, title: true, mode: true } }
    }
  });
}

export async function getPricingWarnings() {
  const groups = await prisma.usageRecord.groupBy({
    by: ["provider", "model"],
    _count: { id: true }
  });
  const warnings = await Promise.all(
    groups.map(async (g) => {
      const { pricingStatus } = await getModelPricing(g.provider, g.model);
      return pricingStatus === "UNKNOWN" ? { provider: g.provider, model: g.model, count: g._count.id } : null;
    })
  );
  const unknownModels = warnings.filter((w): w is NonNullable<typeof w> => w !== null);
  return { unknownPricingUsageCount: unknownModels.reduce((sum, w) => sum + w.count, 0), unknownModels };
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
