import type { Agent, TaskMode } from "@prisma/client";
import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import type { AIProviderConfig, AICostMode, AICostPreference } from "./aiProviderRegistry.js";
import { getAIProvider, listAIProviders } from "./aiProviderRegistry.js";
import { LEGACY_MOCK_PROVIDER_ID, LOCAL_SANDBOX_PROVIDER_ID, OPENROUTER_FREE_PROVIDER_ID } from "./aiProviderRegistry.js";
import { checkBudgetStatus, filterProvidersForBudget, logBudgetEvents } from "./budgetGuardService.js";
import { getSettingValue } from "./settingsService.js";
import { findActiveChainForContext } from "./routeChainService.js";
import { getCachedProviderHealth } from "./providerIntelligenceService.js";
import type { AIProviderCall } from "../ai/generateWithFallback.js";

export type RequiredAICapabilities = {
  chat?: boolean;
  tools?: boolean;
  vision?: boolean;
  jsonMode?: boolean;
};

export type FallbackAttempt = { provider: AIProviderConfig; model: string };

export type AIProviderRouteSelection = {
  provider: AIProviderConfig;
  model: string;
  /** Explicit ordered list of (provider, model) pairs to try after primary. */
  fallbackAttempts: FallbackAttempt[];
  /** Derived from fallbackAttempts for backward compatibility. */
  fallbackProviders: AIProviderConfig[];
  attemptedProviderIds: string[];
  costMode: AICostMode;
  budgetBlocked?: boolean;
  blockedProviderIds?: string[];
  // Route chain context
  routeChainId?: string;
  skippedProviderIds?: string[];
  skippedReasons?: Record<string, string>;
};

const TASK_MODE_PROVIDER_ORDER: Record<TaskMode, string[]> = {
  ASK: [OPENROUTER_FREE_PROVIDER_ID, "deepseek", "openrouter", "openai", LOCAL_SANDBOX_PROVIDER_ID],
  PLAN: [OPENROUTER_FREE_PROVIDER_ID, "openrouter", "openai", "deepseek", LOCAL_SANDBOX_PROVIDER_ID],
  RESEARCH: [OPENROUTER_FREE_PROVIDER_ID, "openrouter", "gemini", "openai", LOCAL_SANDBOX_PROVIDER_ID],
  BUILD: [OPENROUTER_FREE_PROVIDER_ID, "deepseek", "openrouter", "openai", LOCAL_SANDBOX_PROVIDER_ID]
};

const DEFAULT_FALLBACK_CHAIN = [OPENROUTER_FREE_PROVIDER_ID, LOCAL_SANDBOX_PROVIDER_ID];
const PRODUCTION_FALLBACK_CHAIN = [OPENROUTER_FREE_PROVIDER_ID, "deepseek", "openrouter", "openai", LOCAL_SANDBOX_PROVIDER_ID];

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

  // Phase 4+5: Try route chain first
  const chain = await findActiveChainForContext(input.taskMode, input.agent.id);
  if (chain && chain.entries.length > 0) {
    // For non-agent-specific chains, inject the agent's fallbackModels before chain-level fallbacks
    const agentFallbackModels = chain.agentId ? [] : input.agent.fallbackModels;
    return buildSelectionFromChain(chain, capableProviders, providers, costMode, input.requiredCapabilities, agentFallbackModels);
  }

  // Legacy routing fallback below
  const agentProvider = input.agent.preferredProviderId ? await getAIProvider(input.agent.preferredProviderId) : null;
  if (agentProvider?.isActive && supportsRequiredCapabilities(agentProvider, input.requiredCapabilities)) {
    const fallbackIds = input.fallbackProviderIds?.length
      ? input.fallbackProviderIds
      : buildAgentFallbackIds(input.agent).length
        ? buildAgentFallbackIds(input.agent)
        : await getDefaultFallbackChain();
    const fallbackAttempts = await resolveFallbackAttempts(fallbackIds, agentProvider, capableProviders);
    return applyBudgetGuard({
      provider: agentProvider,
      model: input.agent.defaultModel ?? agentProvider.defaultModel,
      fallbackAttempts,
      fallbackProviders: fallbackAttempts.map((a) => a.provider),
      attemptedProviderIds: [agentProvider.id, ...fallbackAttempts.map((a) => a.provider.id)],
      costMode
    }, providers);
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
      const fallbackAttempts = await resolveFallbackAttempts(dbRoute.fallbackProviderIds, preferred, capableProviders);
      return applyBudgetGuard({
        provider: preferred,
        model: input.agent.defaultModel ?? dbRoute.preferredModel ?? preferred.defaultModel,
        fallbackAttempts,
        fallbackProviders: fallbackAttempts.map((a) => a.provider),
        attemptedProviderIds: [preferred.id, ...fallbackAttempts.map((a) => a.provider.id)],
        costMode
      }, providers);
    }
  }

  const modeOrdered = orderByPolicy(capableProviders, input.taskMode, costMode);
  const provider = modeOrdered[0] ?? providers.find((item) => item.id === LOCAL_SANDBOX_PROVIDER_ID);
  if (!provider) {
    throw new Error("No active AI provider is available");
  }

  const fallbackIds = input.fallbackProviderIds?.length
    ? input.fallbackProviderIds
    : buildAgentFallbackIds(input.agent).length
      ? buildAgentFallbackIds(input.agent)
      : await getDefaultFallbackChain();
  const fallbackAttempts = await resolveFallbackAttempts(fallbackIds, provider, capableProviders);

  if (!fallbackAttempts.some((a) => a.provider.id === LOCAL_SANDBOX_PROVIDER_ID)) {
    const sandbox = providers.find((candidate) => candidate.id === LOCAL_SANDBOX_PROVIDER_ID) ?? providers.find((candidate) => candidate.id === LEGACY_MOCK_PROVIDER_ID);
    if (sandbox && sandbox.id !== provider.id) fallbackAttempts.push({ provider: sandbox, model: sandbox.defaultModel });
  }

  return applyBudgetGuard({
    provider,
    model: input.agent.defaultModel ?? provider.defaultModel,
    fallbackAttempts,
    fallbackProviders: fallbackAttempts.map((a) => a.provider),
    attemptedProviderIds: [provider.id, ...fallbackAttempts.map((a) => a.provider.id)],
    costMode
  }, providers);
}

async function buildSelectionFromChain(
  chain: Awaited<ReturnType<typeof findActiveChainForContext>> & object,
  capableProviders: AIProviderConfig[],
  allProviders: AIProviderConfig[],
  costMode: AICostMode,
  requiredCapabilities?: RequiredAICapabilities,
  agentFallbackModels: string[] = []
): Promise<AIProviderRouteSelection> {
  const healthSnapshots = await getCachedProviderHealth().catch(() => []);
  const healthMap = new Map(healthSnapshots.map((h) => [h.providerType, h.healthStatus]));

  const skippedProviderIds: string[] = [];
  const skippedReasons: Record<string, string> = {};

  const disabledEntries = chain!.entries.filter((e) => !e.isEnabled);
  for (const e of disabledEntries) {
    skippedProviderIds.push(e.providerId);
    skippedReasons[e.providerId] = `CHAIN_SKIPPED: step ${e.sequence} is disabled`;
  }

  const enabledEntries = chain!.entries.filter((e) => e.isEnabled);

  let primary: AIProviderConfig | null = null;
  let primaryModel = "";
  const fallbackCalls: { provider: AIProviderConfig; model: string }[] = [];

  for (const entry of enabledEntries) {
    const config = capableProviders.find((p) => p.id === entry.providerId)
      ?? allProviders.find((p) => p.id === entry.providerId);

    if (!config) continue;
    if (!supportsRequiredCapabilities(config, requiredCapabilities)) continue;

    // Phase 5: Skip DOWN providers, de-prioritize DEGRADED
    const health = healthMap.get(config.type) ?? healthMap.get(config.id);
    if (health === "DOWN" && config.id !== LOCAL_SANDBOX_PROVIDER_ID) {
      skippedProviderIds.push(config.id);
      skippedReasons[config.id] = "HEALTH_BLOCKED: provider is DOWN";
      continue;
    }

    if (!primary) {
      // DEGRADED providers are used but noted
      primary = config;
      primaryModel = entry.model || config.defaultModel;
    } else {
      fallbackCalls.push({ provider: config, model: entry.model || config.defaultModel });
    }
  }

  // If all entries skipped, fall back to sandbox
  if (!primary) {
    const sandbox = allProviders.find((p) => p.id === LOCAL_SANDBOX_PROVIDER_ID)!;
    primary = sandbox;
    primaryModel = sandbox.defaultModel;
  }

  // For non-agent-specific chains: inject the agent's fallbackModels as model-level
  // sub-attempts on the primary provider, before the chain's provider-level fallbacks.
  // This ensures model fallbacks are exhausted before jumping to a different provider.
  const modelFallbackAttempts: FallbackAttempt[] = [];
  if (agentFallbackModels.length > 0 && primary.type === "openrouter" && primary.id !== LOCAL_SANDBOX_PROVIDER_ID) {
    for (const model of agentFallbackModels) {
      modelFallbackAttempts.push({ provider: { ...primary, defaultModel: model }, model });
    }
  }

  // Chain-defined provider fallbacks — sandbox goes last
  const sandboxChainFallbacks = fallbackCalls.filter((c) => c.provider.id === LOCAL_SANDBOX_PROVIDER_ID);
  const nonSandboxChainFallbacks = fallbackCalls.filter((c) => c.provider.id !== LOCAL_SANDBOX_PROVIDER_ID);
  const allFallbackAttempts: FallbackAttempt[] = [
    ...modelFallbackAttempts,
    ...nonSandboxChainFallbacks.map((c) => ({ provider: c.provider, model: c.model })),
    ...sandboxChainFallbacks.map((c) => ({ provider: c.provider, model: c.model }))
  ];

  const selection: AIProviderRouteSelection = {
    provider: primary,
    model: primaryModel,
    fallbackAttempts: allFallbackAttempts,
    fallbackProviders: allFallbackAttempts.map((a) => a.provider),
    attemptedProviderIds: [primary.id, ...allFallbackAttempts.map((a) => a.provider.id)],
    costMode,
    routeChainId: chain!.id,
    skippedProviderIds: skippedProviderIds.length > 0 ? skippedProviderIds : undefined,
    skippedReasons: Object.keys(skippedReasons).length > 0 ? skippedReasons : undefined
  };

  return applyBudgetGuard(selection, allProviders);
}

async function applyBudgetGuard(
  selection: AIProviderRouteSelection,
  allProviders: AIProviderConfig[]
): Promise<AIProviderRouteSelection> {
  const budgetStatus = await checkBudgetStatus();
  if (!budgetStatus.dailyExceeded && !budgetStatus.monthlyExceeded) {
    return selection;
  }

  const allCandidates = [selection.provider, ...selection.fallbackProviders];
  const { allowed, blocked } = filterProvidersForBudget(allCandidates, budgetStatus);

  logBudgetEvents(budgetStatus, blocked).catch(() => undefined);

  if (allowed.length === 0) {
    const sandbox = allProviders.find((p) => p.id === LOCAL_SANDBOX_PROVIDER_ID);
    if (sandbox) {
      return {
        ...selection,
        provider: sandbox,
        model: sandbox.defaultModel,
        fallbackAttempts: [],
        fallbackProviders: [],
        attemptedProviderIds: [sandbox.id],
        budgetBlocked: true,
        blockedProviderIds: blocked.map((p) => p.id)
      };
    }
    return selection;
  }

  const newPrimary = allowed[0]!;
  const newFallbacks = allowed.slice(1);
  const newFallbackAttempts = newFallbacks.map((p) => ({ provider: p, model: p.defaultModel }));
  return {
    ...selection,
    provider: newPrimary,
    model: newPrimary.id === selection.provider.id ? selection.model : newPrimary.defaultModel,
    fallbackAttempts: newFallbackAttempts,
    fallbackProviders: newFallbacks,
    attemptedProviderIds: [newPrimary.id, ...newFallbacks.map((p) => p.id)],
    budgetBlocked: blocked.length > 0,
    blockedProviderIds: blocked.length > 0 ? blocked.map((p) => p.id) : undefined
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

export async function isSandboxFallbackModeActive(): Promise<boolean> {
  if (env.NODE_ENV === "production") return false;
  const override = await getSettingValue("ALLOW_PRODUCTION_FALLBACK_IN_SANDBOX", "false");
  return override.toLowerCase() !== "true";
}

async function getDefaultFallbackChain(): Promise<string[]> {
  return await isSandboxFallbackModeActive() ? DEFAULT_FALLBACK_CHAIN : PRODUCTION_FALLBACK_CHAIN;
}

function isProductionFallbackBlocked(provider: AIProviderConfig, sandboxFallbackMode: boolean): boolean {
  return sandboxFallbackMode && provider.environmentMode === "PRODUCTION" && !provider.isFreeTier;
}

export async function describeFallbackProviderReadiness(provider: AIProviderConfig): Promise<{
  state: "READY" | "DISABLED" | "INSUFFICIENT_BALANCE" | "PRODUCTION_BLOCKED_IN_SANDBOX";
  label: string;
  active: boolean;
}> {
  if (!provider.isActive || provider.environmentMode === "DISABLED") {
    return { state: "DISABLED", label: "Disabled", active: false };
  }
  const sandboxFallbackMode = await isSandboxFallbackModeActive();
  if (isProductionFallbackBlocked(provider, sandboxFallbackMode)) {
    return { state: "PRODUCTION_BLOCKED_IN_SANDBOX", label: "Production blocked in sandbox", active: false };
  }
  if (provider.id === "deepseek") {
    const latest = await prisma.providerBalanceSnapshot.findFirst({
      where: { providerType: "deepseek" },
      orderBy: { fetchedAt: "desc" }
    });
    const balance = latest?.totalBalance;
    if (!provider.hasCredentials || (balance != null && balance <= 0)) {
      return { state: "INSUFFICIENT_BALANCE", label: "Insufficient balance", active: false };
    }
  }
  if (!provider.hasCredentials && provider.environmentMode !== "SANDBOX") {
    return { state: "DISABLED", label: "Disabled", active: false };
  }
  return { state: "READY", label: "Ready", active: true };
}

async function resolveFallbackAttempts(fallbackIds: string[], primaryProvider: AIProviderConfig, capableProviders: AIProviderConfig[]): Promise<FallbackAttempt[]> {
  const resolved: FallbackAttempt[] = [];
  const sandboxFallbackMode = await isSandboxFallbackModeActive();
  for (const id of fallbackIds) {
    const provider = capableProviders.find((candidate) => candidate.id === id || (id === LEGACY_MOCK_PROVIDER_ID && candidate.id === LOCAL_SANDBOX_PROVIDER_ID));
    if (provider) {
      if (isProductionFallbackBlocked(provider, sandboxFallbackMode)) continue;
      if (provider.id === "deepseek") {
        const readiness = await describeFallbackProviderReadiness(provider);
        if (!readiness.active) continue;
      }
      if (provider.id !== primaryProvider.id) resolved.push({ provider, model: provider.defaultModel });
      continue;
    }

    if (isModelFallback(id) && primaryProvider.type === "openrouter") {
      const clone = { ...primaryProvider, defaultModel: id };
      resolved.push({ provider: clone, model: id });
    }
  }
  return resolved;
}

function isModelFallback(value: string): boolean {
  return value.includes("/") || value.includes(":");
}

function buildAgentFallbackIds(agent: { fallbackModels: string[]; fallbackProviderIds: string[] }): string[] {
  return [...agent.fallbackModels, ...agent.fallbackProviderIds];
}
