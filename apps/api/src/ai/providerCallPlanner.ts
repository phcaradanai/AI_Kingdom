import type { Agent } from "@prisma/client";
import { createAIProviderFromConfig } from "./providerFactory.js";
import type { AIProviderCall } from "./generateWithFallback.js";
import type { AIProviderConfig } from "../services/aiProviderRegistry.js";
import { LEGACY_MOCK_PROVIDER_ID, LOCAL_SANDBOX_PROVIDER_ID } from "../services/aiProviderRegistry.js";
import type { AIProviderRouteSelection } from "../services/aiProviderRouter.js";

export type RouteAttemptSource = "PRIMARY_MODEL" | "FALLBACK_MODEL" | "FALLBACK_PROVIDER" | "EMERGENCY_SANDBOX";

export type PlannedProviderAttempt = {
  provider: AIProviderConfig;
  model: string;
  source: RouteAttemptSource;
};

type RouteLike = Pick<AIProviderRouteSelection, "provider" | "model" | "fallbackAttempts">;
type AgentLike = Pick<Agent, "preferredProviderId" | "fallbackModels">;

function isSandboxId(id: string): boolean {
  return id === LOCAL_SANDBOX_PROVIDER_ID || id === LEGACY_MOCK_PROVIDER_ID;
}

/**
 * Builds the ordered list of (provider, model) attempts for a resolved route.
 *
 * Order:
 *   1. preferred provider + primary model
 *   2. preferred provider + each agent.fallbackModels (OpenRouter-style models only)
 *   3. configured fallback providers + their default models (from the route)
 *   4. Local Sandbox Baseline — always last, never first
 *
 * Exact (providerId + model) pairs are de-duplicated while preserving order, and the
 * local sandbox baseline is always moved to the end so it can only ever be the final attempt.
 */
export function planProviderAttempts(route: RouteLike, agent?: AgentLike): PlannedProviderAttempt[] {
  const attempts: PlannedProviderAttempt[] = [];
  const primary = route.provider;

  // 1) Primary provider + primary model.
  attempts.push({ provider: primary, model: route.model, source: "PRIMARY_MODEL" });

  // 2) Preferred-provider model fallbacks. Only attach OpenRouter-style model IDs onto a
  //    provider that can serve per-model requests (openrouter type), and only when the
  //    primary IS the agent's pinned preferred provider. Never attach onto a sandbox primary.
  const pinsPrimary = Boolean(agent?.preferredProviderId) && agent?.preferredProviderId === primary.id;
  if (pinsPrimary && primary.type === "openrouter" && !isSandboxId(primary.id) && agent?.fallbackModels?.length) {
    for (const model of agent.fallbackModels) {
      attempts.push({ provider: { ...primary, defaultModel: model }, model, source: "FALLBACK_MODEL" });
    }
  }

  // 3) Route-resolved fallback attempts: model fallbacks the router already expanded, plus the
  //    configured fallback providers and the sandbox terminator. Budget/health exclusions are
  //    already baked into route.fallbackAttempts, so we never reintroduce a blocked provider here.
  for (const fa of route.fallbackAttempts) {
    const source: RouteAttemptSource = isSandboxId(fa.provider.id)
      ? "EMERGENCY_SANDBOX"
      : fa.provider.id === primary.id
        ? "FALLBACK_MODEL"
        : "FALLBACK_PROVIDER";
    attempts.push({ provider: fa.provider, model: fa.model, source });
  }

  // 4) Dedupe exact providerId+model pairs, preserving first occurrence.
  const seen = new Set<string>();
  const deduped = attempts.filter((attempt) => {
    const key = `${attempt.provider.id}::${attempt.model}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // 5) Local Sandbox Baseline is always the final attempt(s).
  const nonSandbox = deduped.filter((attempt) => !isSandboxId(attempt.provider.id));
  const sandbox = deduped.filter((attempt) => isSandboxId(attempt.provider.id));
  return [...nonSandbox, ...sandbox];
}

/** Instantiates the ordered provider attempts into callable AIProviderCall[] for generateWithFallback. */
export function buildAIProviderCallsFromRoute(route: RouteLike, agent?: AgentLike): AIProviderCall[] {
  const calls: AIProviderCall[] = [];
  for (const { provider, model } of planProviderAttempts(route, agent)) {
    try {
      calls.push({ provider: createAIProviderFromConfig(provider), model });
    } catch {
      // provider could not be instantiated (e.g. missing credentials) — skip it
    }
  }
  return calls;
}
