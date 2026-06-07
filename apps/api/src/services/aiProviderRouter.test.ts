import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { getEnvProviderConfigs, listAIProviders, type AIProviderConfig } from "./aiProviderRegistry.js";
import { LOCAL_SANDBOX_PROVIDER_ID, LOCAL_SANDBOX_PROVIDER_NAME, OPENROUTER_FREE_PROVIDER_ID, OPENROUTER_FREE_PROVIDER_NAME } from "./aiProviderRegistry.js";
import { orderByPolicy, selectAIProviderRoute } from "./aiProviderRouter.js";

const prisma = new PrismaClient();

function provider(id: string, costTier: AIProviderConfig["costTier"], priority: number): AIProviderConfig {
  return {
    id,
    name: id,
    type: id,
    defaultModel: `${id}-model`,
    isActive: true,
    priority,
    supportsChat: true,
    costTier,
    capabilities: { supportsChat: true },
    environmentMode: costTier === "FREE" ? "SANDBOX" : "PRODUCTION",
    allowSensitiveContext: costTier !== "FREE",
    isFreeTier: costTier === "FREE",
    hasCredentials: true,
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

test("provider registry defines active local sandbox baseline without API keys", () => {
  const providers = getEnvProviderConfigs();
  const sandbox = providers.find((item) => item.id === LOCAL_SANDBOX_PROVIDER_ID);
  assert.ok(sandbox);
  assert.equal(sandbox.name, LOCAL_SANDBOX_PROVIDER_NAME);
  assert.equal(sandbox.isActive, true);
  assert.equal(sandbox.hasCredentials, true);
  assert.equal(sandbox.environmentMode, "SANDBOX");
  assert.equal(sandbox.isFreeTier, true);
});

test("provider registry defines OpenRouter Free Sandbox preset", () => {
  const providers = getEnvProviderConfigs();
  const openrouterFree = providers.find((item) => item.id === OPENROUTER_FREE_PROVIDER_ID);
  assert.ok(openrouterFree);
  assert.equal(openrouterFree.name, OPENROUTER_FREE_PROVIDER_NAME);
  assert.equal(openrouterFree.type, "openrouter");
  assert.equal(openrouterFree.baseUrl, "https://openrouter.ai/api/v1");
  assert.equal(openrouterFree.costTier, "FREE");
  assert.equal(openrouterFree.environmentMode, "SANDBOX");
  assert.equal(openrouterFree.isFreeTier, true);
  assert.equal(openrouterFree.allowSensitiveContext, false);
  assert.equal(openrouterFree.maxTokensPerRequest, 2500);
  assert.equal(openrouterFree.maxRequestsPerDay, 100);
  assert.equal(openrouterFree.maxTokensPerDay, 120000);
  assert.equal(openrouterFree.maxEstimatedCostPerDay, 0);
});

test("provider registry loads public provider metadata", async () => {
  const providers = await listAIProviders();
  assert.ok(providers.some((item) => item.id === LOCAL_SANDBOX_PROVIDER_ID));
  assert.equal(providers.some((item) => "apiKey" in item), false);
});

test("routing selects active agent provider override", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const agent = await prisma.agent.create({
    data: {
      slug: `provider-override-${suffix}`,
      name: "Override Agent",
      title: "Override Agent",
      role: "Tester",
      specialty: "Routing",
      prompt: "test",
      systemPrompt: "test",
      skills: [],
      responseStyle: "concise",
      preferredProviderId: "mock",
      defaultModel: "agent-model"
    }
  });

  try {
    const route = await selectAIProviderRoute({ agent, taskMode: "ASK" });
    assert.equal(route.provider.id, LOCAL_SANDBOX_PROVIDER_ID);
    assert.equal(route.model, "agent-model");
  } finally {
    await prisma.agent.delete({ where: { id: agent.id } });
  }
});

test("routing policy ranks task mode providers", () => {
  const ordered = orderByPolicy(
    [provider("openai", "HIGH", 30), provider("openrouter", "MEDIUM", 20), provider("deepseek", "LOW", 10), provider(LOCAL_SANDBOX_PROVIDER_ID, "FREE", 1000)],
    "PLAN",
    "balanced"
  );
  assert.equal(ordered[0]?.id, "openrouter");
});

test("low cost mode prefers low cost providers", () => {
  const ordered = orderByPolicy(
    [provider("openai", "HIGH", 30), provider("deepseek", "LOW", 10), provider(LOCAL_SANDBOX_PROVIDER_ID, "FREE", 1000)],
    "BUILD",
    "low"
  );
  assert.equal(ordered[0]?.id, LOCAL_SANDBOX_PROVIDER_ID);
});

test("quality cost mode prefers higher tier providers", () => {
  const ordered = orderByPolicy(
    [provider("openai", "HIGH", 30), provider("deepseek", "LOW", 10), provider(LOCAL_SANDBOX_PROVIDER_ID, "FREE", 1000)],
    "ASK",
    "quality"
  );
  assert.equal(ordered[0]?.id, "openai");
});
