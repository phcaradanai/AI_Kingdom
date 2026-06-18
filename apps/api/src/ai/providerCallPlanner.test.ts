import assert from "node:assert/strict";
import test from "node:test";
import { planProviderAttempts } from "./providerCallPlanner.js";
import { LOCAL_SANDBOX_PROVIDER_ID, OPENROUTER_FREE_PROVIDER_ID, type AIProviderConfig } from "../services/aiProviderRegistry.js";
import type { FallbackAttempt } from "../services/aiProviderRouter.js";

function provider(id: string, type: string, defaultModel: string): AIProviderConfig {
  return {
    id,
    name: id,
    type,
    defaultModel,
    isActive: true,
    priority: 10,
    supportsChat: true,
    costTier: id === LOCAL_SANDBOX_PROVIDER_ID ? "FREE" : "LOW",
    capabilities: { supportsChat: true },
    environmentMode: id === LOCAL_SANDBOX_PROVIDER_ID ? "SANDBOX" : "PRODUCTION",
    allowSensitiveContext: false,
    isFreeTier: id === LOCAL_SANDBOX_PROVIDER_ID,
    hasCredentials: true,
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

const openrouter = provider(OPENROUTER_FREE_PROVIDER_ID, "openrouter", "nvidia/nemotron-3-super-120b-a12b:free");
const sandbox = provider(LOCAL_SANDBOX_PROVIDER_ID, "sandbox", "local-sandbox");

function modelAttempt(model: string): FallbackAttempt {
  return { provider: { ...openrouter, defaultModel: model }, model };
}

test("planner: OpenRouter primary + 3 fallback models + sandbox => correct ordered attempts, sandbox last", () => {
  const route = {
    provider: openrouter,
    model: "nvidia/nemotron-3-super-120b-a12b:free",
    fallbackAttempts: [
      modelAttempt("openai/gpt-oss-120b:free"),
      modelAttempt("openrouter/owl-alpha"),
      modelAttempt("deepseek/deepseek-v4-flash"),
      { provider: sandbox, model: sandbox.defaultModel }
    ]
  };
  const agent = {
    preferredProviderId: OPENROUTER_FREE_PROVIDER_ID,
    fallbackModels: ["openai/gpt-oss-120b:free", "openrouter/owl-alpha", "deepseek/deepseek-v4-flash"]
  };

  const plan = planProviderAttempts(route, agent);

  assert.deepEqual(
    plan.map((a) => `${a.provider.id}:${a.model}`),
    [
      `${OPENROUTER_FREE_PROVIDER_ID}:nvidia/nemotron-3-super-120b-a12b:free`,
      `${OPENROUTER_FREE_PROVIDER_ID}:openai/gpt-oss-120b:free`,
      `${OPENROUTER_FREE_PROVIDER_ID}:openrouter/owl-alpha`,
      `${OPENROUTER_FREE_PROVIDER_ID}:deepseek/deepseek-v4-flash`,
      `${LOCAL_SANDBOX_PROVIDER_ID}:local-sandbox`
    ]
  );
  assert.equal(plan[0]?.source, "PRIMARY_MODEL");
  assert.equal(plan[plan.length - 1]?.source, "EMERGENCY_SANDBOX");
  // Sandbox is strictly last
  assert.equal(plan.findIndex((a) => a.provider.id === LOCAL_SANDBOX_PROVIDER_ID), plan.length - 1);
});

test("planner: deduplicates exact providerId+model pairs while preserving order", () => {
  const route = {
    provider: openrouter,
    model: "nvidia/nemotron-3-super-120b-a12b:free",
    // Router already expanded fallbackModels AND agent.fallbackModels repeats them.
    fallbackAttempts: [modelAttempt("openai/gpt-oss-120b:free"), { provider: sandbox, model: sandbox.defaultModel }]
  };
  const agent = {
    preferredProviderId: OPENROUTER_FREE_PROVIDER_ID,
    fallbackModels: ["openai/gpt-oss-120b:free"]
  };

  const plan = planProviderAttempts(route, agent);
  const keys = plan.map((a) => `${a.provider.id}:${a.model}`);
  assert.equal(new Set(keys).size, keys.length, "no duplicate provider+model pairs");
  assert.equal(keys.filter((k) => k.endsWith("openai/gpt-oss-120b:free")).length, 1);
});

test("planner: never attaches OpenRouter fallback models onto a sandbox primary", () => {
  const route = {
    provider: sandbox,
    model: sandbox.defaultModel,
    fallbackAttempts: [] as FallbackAttempt[]
  };
  // Even if the agent pins openrouter, the resolved primary is sandbox here.
  const agent = {
    preferredProviderId: OPENROUTER_FREE_PROVIDER_ID,
    fallbackModels: ["openai/gpt-oss-120b:free"]
  };

  const plan = planProviderAttempts(route, agent);
  assert.equal(plan.length, 1);
  assert.equal(plan[0]?.provider.id, LOCAL_SANDBOX_PROVIDER_ID);
  // fallback models must NOT have been attached to sandbox
  assert.equal(plan.some((a) => a.model === "openai/gpt-oss-120b:free"), false);
});

test("planner: sandbox is moved last even if it appears earlier in fallbackAttempts", () => {
  const route = {
    provider: openrouter,
    model: "primary-model",
    fallbackAttempts: [
      { provider: sandbox, model: sandbox.defaultModel },
      modelAttempt("openai/gpt-oss-120b:free")
    ]
  };
  const plan = planProviderAttempts(route, { preferredProviderId: OPENROUTER_FREE_PROVIDER_ID, fallbackModels: [] });
  assert.equal(plan[plan.length - 1]?.provider.id, LOCAL_SANDBOX_PROVIDER_ID);
  assert.equal(plan.findIndex((a) => a.provider.id === LOCAL_SANDBOX_PROVIDER_ID), plan.length - 1);
});
