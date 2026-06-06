import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { getEnvProviderConfigs, listAIProviders, type AIProviderConfig } from "./aiProviderRegistry.js";
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
    hasCredentials: true,
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

test("provider registry defines active mock provider without API keys", () => {
  const providers = getEnvProviderConfigs();
  const mock = providers.find((item) => item.id === "mock");
  assert.ok(mock);
  assert.equal(mock.isActive, true);
  assert.equal(mock.hasCredentials, true);
});

test("provider registry loads public provider metadata", async () => {
  const providers = await listAIProviders();
  assert.ok(providers.some((item) => item.id === "mock"));
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
    assert.equal(route.provider.id, "mock");
    assert.equal(route.model, "agent-model");
  } finally {
    await prisma.agent.delete({ where: { id: agent.id } });
  }
});

test("routing policy ranks task mode providers", () => {
  const ordered = orderByPolicy(
    [provider("openai", "HIGH", 30), provider("openrouter", "MEDIUM", 20), provider("deepseek", "LOW", 10), provider("mock", "FREE", 1000)],
    "PLAN",
    "balanced"
  );
  assert.equal(ordered[0]?.id, "openrouter");
});

test("low cost mode prefers low cost providers", () => {
  const ordered = orderByPolicy(
    [provider("openai", "HIGH", 30), provider("deepseek", "LOW", 10), provider("mock", "FREE", 1000)],
    "BUILD",
    "low"
  );
  assert.equal(ordered[0]?.id, "mock");
});

test("quality cost mode prefers higher tier providers", () => {
  const ordered = orderByPolicy(
    [provider("openai", "HIGH", 30), provider("deepseek", "LOW", 10), provider("mock", "FREE", 1000)],
    "ASK",
    "quality"
  );
  assert.equal(ordered[0]?.id, "openai");
});
