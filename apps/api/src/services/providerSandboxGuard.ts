import { prisma } from "../db/prisma.js";
import type { AIProviderConfig } from "./aiProviderRegistry.js";
import { redactSecrets } from "./usageAttributionService.js";

export type SandboxGuardResult =
  | { allowed: true; redacted: boolean }
  | { allowed: false; reason: string };

export async function checkSandboxQuota(providerId: string): Promise<SandboxGuardResult> {
  const provider = await prisma.aIProvider.findUnique({ where: { id: providerId } });
  if (!provider) return { allowed: false, reason: "Provider not found" };

  if (provider.environmentMode === "DISABLED") {
    return { allowed: false, reason: "Provider is disabled" };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (provider.maxRequestsPerDay != null || provider.maxTokensPerDay != null || provider.maxEstimatedCostPerDay != null) {
    const [countAgg, tokenAgg, costAgg] = await Promise.all([
      prisma.usageRecord.count({ where: { providerId, createdAt: { gte: today } } }),
      prisma.usageRecord.aggregate({
        where: { providerId, createdAt: { gte: today } },
        _sum: { totalTokens: true }
      }),
      prisma.usageRecord.aggregate({
        where: { providerId, createdAt: { gte: today } },
        _sum: { estimatedCostUSD: true }
      })
    ]);

    if (provider.maxRequestsPerDay != null && countAgg >= provider.maxRequestsPerDay) {
      return { allowed: false, reason: `Daily request quota exceeded (${provider.maxRequestsPerDay}/day)` };
    }

    const totalTokens = tokenAgg._sum.totalTokens ?? 0;
    if (provider.maxTokensPerDay != null && totalTokens >= provider.maxTokensPerDay) {
      return { allowed: false, reason: `Daily token quota exceeded (${provider.maxTokensPerDay}/day)` };
    }

    const totalCost = costAgg._sum.estimatedCostUSD ?? 0;
    if (provider.maxEstimatedCostPerDay != null && totalCost >= provider.maxEstimatedCostPerDay) {
      return { allowed: false, reason: `Daily cost quota exceeded ($${provider.maxEstimatedCostPerDay}/day)` };
    }
  }

  return { allowed: true, redacted: !provider.allowSensitiveContext };
}

export function redactPromptIfNeeded(prompt: string, allowSensitiveContext: boolean): string {
  if (allowSensitiveContext) return prompt;
  return redactSecrets(prompt);
}

export function providerAllowsSensitiveContext(provider: AIProviderConfig & { allowSensitiveContext?: boolean }): boolean {
  return provider.allowSensitiveContext ?? true;
}

export function isSandboxProvider(provider: { isFreeTier?: boolean; environmentMode?: string }): boolean {
  return Boolean(provider.isFreeTier) || provider.environmentMode === "SANDBOX";
}

// For knowledge extraction operations, prefer free/sandbox providers
export async function selectKnowledgeExtractionProvider(): Promise<string> {
  const freeProvider = await prisma.aIProvider.findFirst({
    where: {
      isActive: true,
      isFreeTier: true,
      environmentMode: { not: "DISABLED" }
    },
    orderBy: { priority: "asc" }
  });
  return freeProvider?.id ?? "mock";
}
