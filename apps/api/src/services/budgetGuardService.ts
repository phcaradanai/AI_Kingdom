import { prisma } from "../db/prisma.js";
import { auditLog } from "./auditService.js";
import { getSettingValue } from "./settingsService.js";
import { LOCAL_SANDBOX_PROVIDER_ID, LEGACY_MOCK_PROVIDER_ID } from "./aiProviderRegistry.js";
import type { AIProviderConfig } from "./aiProviderRegistry.js";

export type BudgetStatus = {
  dailyExceeded: boolean;
  monthlyExceeded: boolean;
  dailySpent: number;
  monthlySpent: number;
  dailyLimit: number | null;
  monthlyLimit: number | null;
  dailyRemaining: number | null;
  monthlyRemaining: number | null;
};

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

export async function checkBudgetStatus(): Promise<BudgetStatus> {
  const [dailyLimitStr, monthlyLimitStr] = await Promise.all([
    getSettingValue("DAILY_BUDGET_LIMIT_USD", ""),
    getSettingValue("MONTHLY_BUDGET_LIMIT_USD", "")
  ]);

  const dailyLimit = dailyLimitStr !== "" ? parseFloat(dailyLimitStr) : null;
  const monthlyLimit = monthlyLimitStr !== "" ? parseFloat(monthlyLimitStr) : null;

  const [dailyAgg, monthlyAgg] = await Promise.all([
    prisma.usageRecord.aggregate({
      _sum: { estimatedCostUSD: true },
      where: { createdAt: { gte: startOfToday() } }
    }),
    prisma.usageRecord.aggregate({
      _sum: { estimatedCostUSD: true },
      where: { createdAt: { gte: startOfMonth() } }
    })
  ]);

  const dailySpent = dailyAgg._sum.estimatedCostUSD ?? 0;
  const monthlySpent = monthlyAgg._sum.estimatedCostUSD ?? 0;

  const dailyExceeded = dailyLimit !== null && dailySpent >= dailyLimit;
  const monthlyExceeded = monthlyLimit !== null && monthlySpent >= monthlyLimit;

  return {
    dailyExceeded,
    monthlyExceeded,
    dailySpent,
    monthlySpent,
    dailyLimit,
    monthlyLimit,
    dailyRemaining: dailyLimit !== null ? Math.max(0, dailyLimit - dailySpent) : null,
    monthlyRemaining: monthlyLimit !== null ? Math.max(0, monthlyLimit - monthlySpent) : null
  };
}

function isAlwaysAllowedProvider(provider: AIProviderConfig): boolean {
  return (
    provider.id === LOCAL_SANDBOX_PROVIDER_ID ||
    provider.id === LEGACY_MOCK_PROVIDER_ID ||
    provider.environmentMode === "SANDBOX" ||
    provider.isFreeTier ||
    provider.costTier === "FREE"
  );
}

export type BudgetFilterResult = {
  allowed: AIProviderConfig[];
  blocked: AIProviderConfig[];
  blockedByDaily: boolean;
  blockedByMonthly: boolean;
};

export function filterProvidersForBudget(
  providers: AIProviderConfig[],
  budgetStatus: BudgetStatus
): BudgetFilterResult {
  if (!budgetStatus.dailyExceeded && !budgetStatus.monthlyExceeded) {
    return { allowed: providers, blocked: [], blockedByDaily: false, blockedByMonthly: false };
  }

  const allowed: AIProviderConfig[] = [];
  const blocked: AIProviderConfig[] = [];

  for (const provider of providers) {
    if (isAlwaysAllowedProvider(provider)) {
      allowed.push(provider);
    } else {
      blocked.push(provider);
    }
  }

  return {
    allowed,
    blocked,
    blockedByDaily: budgetStatus.dailyExceeded,
    blockedByMonthly: budgetStatus.monthlyExceeded
  };
}

export async function logBudgetEvents(
  budgetStatus: BudgetStatus,
  blockedProviders: AIProviderConfig[]
): Promise<void> {
  const promises: Promise<void>[] = [];

  if (budgetStatus.dailyExceeded) {
    promises.push(
      auditLog({
        action: "daily_budget_exceeded",
        resourceType: "budget",
        metadata: {
          dailySpent: budgetStatus.dailySpent,
          dailyLimit: budgetStatus.dailyLimit,
          blockedProviderCount: blockedProviders.length
        }
      }).catch(() => undefined)
    );
  }

  if (budgetStatus.monthlyExceeded) {
    promises.push(
      auditLog({
        action: "monthly_budget_exceeded",
        resourceType: "budget",
        metadata: {
          monthlySpent: budgetStatus.monthlySpent,
          monthlyLimit: budgetStatus.monthlyLimit,
          blockedProviderCount: blockedProviders.length
        }
      }).catch(() => undefined)
    );
  }

  for (const provider of blockedProviders) {
    promises.push(
      auditLog({
        action: "provider_blocked_by_budget",
        resourceType: "ai_provider",
        resourceId: provider.id,
        metadata: {
          providerName: provider.name,
          costTier: provider.costTier,
          dailyExceeded: budgetStatus.dailyExceeded,
          monthlyExceeded: budgetStatus.monthlyExceeded
        }
      }).catch(() => undefined)
    );
  }

  await Promise.all(promises);
}
