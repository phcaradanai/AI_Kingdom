import type { Agent, TaskMode } from "@prisma/client";
import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import type { AIProviderConfig, AICostMode, AICostPreference } from "./aiProviderRegistry.js";
import { getAIProvider, listAIProviders } from "./aiProviderRegistry.js";
import { LEGACY_MOCK_PROVIDER_ID, LOCAL_SANDBOX_PROVIDER_ID, OPENROUTER_FREE_PROVIDER_ID } from "./aiProviderRegistry.js";
import { getSettingValue } from "./settingsService.js";

export type RequiredAICapabilities = {
  chat?: boolean;
  tools?: boolean;
  vision?: boolean;
  jsonMode?: boolean;
};

export type AIProviderRouteSelection = {
  provider: AIProviderConfig;
  model: string;
  fallbackProviders: AIProviderConfig[];
  attemptedProviderIds: string[];
  costMode: AICostMode;
};

const TASK_MODE_PROVIDER_ORDER: Record<TaskMode, string[]> = {
  ASK: [OPENROUTER_FREE_PROVIDER_ID, "deepseek", "openrouter", "openai", LOCAL_SANDBOX_PROVIDER_ID],
  PLAN: [OPENROUTER_FREE_PROVIDER_ID, "openrouter", "openai", "deepseek", LOCAL_SANDBOX_PROVIDER_ID],
  RESEARCH: [OPENROUTER_FREE_PROVIDER_ID, "openrouter", "gemini", "openai", LOCAL_SANDBOX_PROVIDER_ID],
  BUILD: [OPENROUTER_FREE_PROVIDER_ID, "deepseek", "openrouter", "openai", LOCAL_SANDBOX_PROVIDER_ID]
};

const DEFAULT_FALLBACK_CHAIN = [OPENROUTER_FREE_PROVIDER_ID, "deepseek", "openrouter", "openai", LOCAL_SANDBOX_PROVIDER_ID];

export async function selectAIProviderRoute(input: {
  agent: Agent;
  taskMode: TaskMode;
  requiredCapabilities?: RequiredAICapabilities;
  costPreference?: AICostPreference | null;
  fallbackProviderIds?: string[];
}): Promise<AIProviderRouteSelection> {
  const costMode = await resolveCostMode(input.costPreference ?? input.agent.costPreference);
  const providers = await listAIProviders({ activeOnly: true });
  const capableProviders = providers.filter((provider) => supportsRequiredCapabilities(provider, input.requiredCapabilities));

  const agentProvider = input.agent.preferredProviderId ? await getAIProvider(input.agent.preferredProviderId) : null;
  if (agentProvider?.isActive && supportsRequiredCapabilities(agentProvider, input.requiredCapabilities)) {
    const fallbackIds = input.fallbackProviderIds?.length
      ? input.fallbackProviderIds
      : input.agent.fallbackProviderIds.length
        ? input.agent.fallbackProviderIds
        : DEFAULT_FALLBACK_CHAIN;
    const fallbackProviders = resolveFallbackProviders(fallbackIds, agentProvider, capableProviders);
    return {
      provider: agentProvider,
      model: input.agent.defaultModel ?? agentProvider.defaultModel,
      fallbackProviders,
      attemptedProviderIds: [agentProvider.id, ...fallbackProviders.map((provider) => provider.id)],
      costMode
    };
  }

  const dbRoute = await prisma.aIProviderRoute.findFirst({
    where: {
      isActive: true,
      OR: [
        { agentId: input.agent.id },
        { taskMode: input.taskMode, agentId: null },
        { taskMode: null, agentId: null }
      ]
    },
    orderBy: [{ agentId: "desc" }, { taskMode: "desc" }, { createdAt: "asc" }]
  });

  if (dbRoute?.preferredProviderId) {
    const preferred = capableProviders.find((provider) => provider.id === dbRoute.preferredProviderId);
    if (preferred) {
      const fallbackProviders = resolveFallbackProviders(dbRoute.fallbackProviderIds, preferred, capableProviders);
      return {
        provider: preferred,
        model: input.agent.defaultModel ?? dbRoute.preferredModel ?? preferred.defaultModel,
        fallbackProviders,
        attemptedProviderIds: [preferred.id, ...fallbackProviders.map((provider) => provider.id)],
        costMode
      };
    }
  }

  const modeOrdered = orderByPolicy(capableProviders, input.taskMode, costMode);
  const provider = modeOrdered[0] ?? providers.find((item) => item.id === LOCAL_SANDBOX_PROVIDER_ID);
  if (!provider) {
    throw new Error("No active AI provider is available");
  }

  const fallbackIds = input.fallbackProviderIds?.length
    ? input.fallbackProviderIds
    : input.agent.fallbackProviderIds.length
      ? input.agent.fallbackProviderIds
      : DEFAULT_FALLBACK_CHAIN;
  const fallbackProviders = resolveFallbackProviders(fallbackIds, provider, capableProviders);

  if (!fallbackProviders.some((candidate) => candidate.id === LOCAL_SANDBOX_PROVIDER_ID)) {
    const sandbox = providers.find((candidate) => candidate.id === LOCAL_SANDBOX_PROVIDER_ID) ?? providers.find((candidate) => candidate.id === LEGACY_MOCK_PROVIDER_ID);
    if (sandbox && sandbox.id !== provider.id) fallbackProviders.push(sandbox);
  }

  return {
    provider,
    model: input.agent.defaultModel ?? provider.defaultModel,
    fallbackProviders,
    attemptedProviderIds: [provider.id, ...fallbackProviders.map((candidate) => candidate.id)],
    costMode
  };
}

export function orderByPolicy(providers: AIProviderConfig[], taskMode: TaskMode, costMode: AICostMode): AIProviderConfig[] {
  const taskOrder = TASK_MODE_PROVIDER_ORDER[taskMode];
  const ranked = [...providers].sort((a, b) => {
    const taskRank = rankInList(a.id, taskOrder) - rankInList(b.id, taskOrder);
    const costRank = costModeRank(a, costMode) - costModeRank(b, costMode);
    return costRank || taskRank || a.priority - b.priority || a.name.localeCompare(b.name);
  });

  return ranked;
}

export function supportsRequiredCapabilities(provider: AIProviderConfig, required: RequiredAICapabilities = {}): boolean {
  if (required.chat !== false && !provider.supportsChat) return false;
  if (required.tools && !provider.supportsTools) return false;
  if (required.vision && !provider.supportsVision) return false;
  if (required.jsonMode && !provider.supportsJsonMode) return false;
  return true;
}

async function resolveCostMode(agentPreference?: string | null): Promise<AICostMode> {
  if (agentPreference === "LOW") return "low";
  if (agentPreference === "QUALITY") return "quality";
  if (agentPreference === "BALANCED") return "balanced";
  const settingValue = await getSettingValue("AI_COST_MODE", env.AI_COST_MODE);
  if (["low", "balanced", "quality"].includes(settingValue)) return settingValue as AICostMode;
  return env.AI_COST_MODE;
}

function rankInList(id: string, values: string[]): number {
  const index = values.indexOf(id);
  return index === -1 ? 1000 : index;
}

function costModeRank(provider: AIProviderConfig, costMode: AICostMode): number {
  const costRank = { FREE: 0, LOW: 1, MEDIUM: 2, HIGH: 3, PREMIUM: 4 }[provider.costTier];
  if (costMode === "low") return costRank;
  if (costMode === "quality") return 4 - costRank;
  return Math.abs(costRank - 2);
}

function resolveFallbackProviders(fallbackIds: string[], primaryProvider: AIProviderConfig, capableProviders: AIProviderConfig[]): AIProviderConfig[] {
  const resolved: AIProviderConfig[] = [];
  for (const id of fallbackIds) {
    const provider = capableProviders.find((candidate) => candidate.id === id || (id === LEGACY_MOCK_PROVIDER_ID && candidate.id === LOCAL_SANDBOX_PROVIDER_ID));
    if (provider) {
      if (provider.id !== primaryProvider.id) resolved.push(provider);
      continue;
    }

    if (isModelFallback(id) && primaryProvider.type === "openrouter") {
      resolved.push({ ...primaryProvider, defaultModel: id });
    }
  }
  return resolved;
}

function isModelFallback(value: string): boolean {
  return value.includes("/") || value.includes(":");
}
