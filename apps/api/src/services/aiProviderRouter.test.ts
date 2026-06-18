import assert from "node:assert/strict";
import test from "node:test";
import { prisma } from "../db/prisma.js";
import { getEnvProviderConfigs, listAIProviders, type AIProviderConfig } from "./aiProviderRegistry.js";
import { LOCAL_SANDBOX_MODEL, LOCAL_SANDBOX_PROVIDER_ID, LOCAL_SANDBOX_PROVIDER_NAME, OPENROUTER_FREE_PROVIDER_ID, OPENROUTER_FREE_PROVIDER_NAME } from "./aiProviderRegistry.js";
import { orderByPolicy, selectAIProviderRoute } from "./aiProviderRouter.js";


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

test("routing includes fallbackModels as model fallbacks before provider fallbacks", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const agent = await prisma.agent.create({
    data: {
      slug: `fallback-models-${suffix}`,
      name: "Fallback Models Test Agent",
      title: "Test Agent",
      role: "Tester",
      specialty: "Routing",
      prompt: "test",
      systemPrompt: "test",
      skills: [],
      responseStyle: "concise",
      preferredProviderId: OPENROUTER_FREE_PROVIDER_ID,
      defaultModel: "nvidia/nemotron-3-super-120b-a12b:free",
      fallbackModels: ["openai/gpt-oss-120b:free", "openrouter/owl-alpha"],
      fallbackProviderIds: []
    }
  });

  try {
    const route = await selectAIProviderRoute({ agent, taskMode: "ASK" });
    assert.equal(route.provider.id, OPENROUTER_FREE_PROVIDER_ID);
    assert.equal(route.model, "nvidia/nemotron-3-super-120b-a12b:free");

    const fallbackModels = route.fallbackProviders.map((p) => p.defaultModel);
    assert.ok(
      fallbackModels.includes("openai/gpt-oss-120b:free"),
      `Expected openai/gpt-oss-120b:free in fallback providers, got: ${JSON.stringify(fallbackModels)}`
    );
    assert.ok(
      fallbackModels.includes("openrouter/owl-alpha"),
      `Expected openrouter/owl-alpha in fallback providers, got: ${JSON.stringify(fallbackModels)}`
    );

    // Model fallbacks must appear before local-sandbox
    const firstModelFallbackIndex = route.fallbackProviders.findIndex(
      (p) => p.defaultModel === "openai/gpt-oss-120b:free"
    );
    const sandboxIndex = route.fallbackProviders.findIndex((p) => p.id === LOCAL_SANDBOX_PROVIDER_ID);
    assert.ok(
      sandboxIndex === -1 || firstModelFallbackIndex < sandboxIndex,
      "Model fallbacks must be ordered before the local sandbox fallback"
    );
  } finally {
    await prisma.agent.delete({ where: { id: agent.id } });
  }
});

test("routing with fallbackModels and fallbackProviderIds: models before sandbox", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const agent = await prisma.agent.create({
    data: {
      slug: `fallback-combined-${suffix}`,
      name: "Combined Fallback Test Agent",
      title: "Test Agent",
      role: "Tester",
      specialty: "Routing",
      prompt: "test",
      systemPrompt: "test",
      skills: [],
      responseStyle: "concise",
      preferredProviderId: OPENROUTER_FREE_PROVIDER_ID,
      defaultModel: "nvidia/nemotron-3-super-120b-a12b:free",
      fallbackModels: ["openai/gpt-oss-120b:free", "openrouter/owl-alpha", "deepseek/deepseek-v4-flash"],
      fallbackProviderIds: [LOCAL_SANDBOX_PROVIDER_ID]
    }
  });

  try {
    const route = await selectAIProviderRoute({ agent, taskMode: "ASK" });
    assert.equal(route.provider.id, OPENROUTER_FREE_PROVIDER_ID);
    assert.equal(route.model, "nvidia/nemotron-3-super-120b-a12b:free");

    // Build full ordered attempt list: primary model, then fallback models, then sandbox
    const attemptModels = [
      route.model,
      ...route.fallbackProviders.map((p) =>
        p.id === LOCAL_SANDBOX_PROVIDER_ID ? LOCAL_SANDBOX_PROVIDER_ID : p.defaultModel
      )
    ];

    assert.deepEqual(
      attemptModels,
      [
        "nvidia/nemotron-3-super-120b-a12b:free",
        "openai/gpt-oss-120b:free",
        "openrouter/owl-alpha",
        "deepseek/deepseek-v4-flash",
        LOCAL_SANDBOX_PROVIDER_ID
      ],
      `Expected ordered attempt list, got: ${JSON.stringify(attemptModels)}`
    );

    // Sandbox must be strictly last
    const sandboxIndex = route.fallbackProviders.findIndex((p) => p.id === LOCAL_SANDBOX_PROVIDER_ID);
    const modelFallbackCount = route.fallbackProviders.filter((p) => p.id !== LOCAL_SANDBOX_PROVIDER_ID).length;
    assert.equal(modelFallbackCount, 3, "Expected 3 model fallbacks");
    assert.equal(sandboxIndex, 3, "Sandbox must be last (index 3 of fallbackProviders)");
  } finally {
    await prisma.agent.delete({ where: { id: agent.id } });
  }
});

test("agent preferred provider takes precedence over an active global route chain (must not start at sandbox)", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const agent = await prisma.agent.create({
    data: {
      slug: `chain-precedence-${suffix}`,
      name: "Chain Precedence Agent",
      title: "Test Agent",
      role: "Tester",
      specialty: "Routing",
      prompt: "test",
      systemPrompt: "test",
      skills: [],
      responseStyle: "concise",
      preferredProviderId: OPENROUTER_FREE_PROVIDER_ID,
      defaultModel: "nvidia/nemotron-3-super-120b-a12b:free",
      fallbackModels: ["openai/gpt-oss-120b:free", "openrouter/owl-alpha"],
      fallbackProviderIds: [LOCAL_SANDBOX_PROVIDER_ID]
    }
  });
  // An active GLOBAL chain whose primary entry is the sandbox baseline — this is what
  // previously hijacked routing and made the Grand Vizier start at Local Sandbox.
  const chain = await prisma.aIRouteChain.create({
    data: {
      name: `sandbox-first-${suffix}`,
      scope: "GLOBAL",
      isActive: true,
      entries: { create: [{ sequence: 1, providerId: LOCAL_SANDBOX_PROVIDER_ID, model: LOCAL_SANDBOX_MODEL, isEnabled: true }] }
    }
  });

  try {
    const route = await selectAIProviderRoute({ agent, taskMode: "ASK" });
    assert.equal(route.provider.id, OPENROUTER_FREE_PROVIDER_ID, "Preferred provider must win over the global chain");
    assert.equal(route.model, "nvidia/nemotron-3-super-120b-a12b:free", "Primary model must be attempted first");

    const attemptIds = [route.provider.id, ...route.fallbackProviders.map((p) => p.id)];
    assert.notEqual(attemptIds[0], LOCAL_SANDBOX_PROVIDER_ID, "Sandbox must never be the first attempt");
    assert.equal(attemptIds[attemptIds.length - 1], LOCAL_SANDBOX_PROVIDER_ID, "Sandbox must be the final attempt");

    const fallbackModels = route.fallbackProviders.filter((p) => p.id !== LOCAL_SANDBOX_PROVIDER_ID).map((p) => p.defaultModel);
    assert.ok(fallbackModels.includes("openai/gpt-oss-120b:free"));
    assert.ok(fallbackModels.includes("openrouter/owl-alpha"));
  } finally {
    await prisma.aIRouteChainEntry.deleteMany({ where: { chainId: chain.id } });
    await prisma.aIRouteChain.delete({ where: { id: chain.id } });
    await prisma.agent.delete({ where: { id: agent.id } });
  }
});

test("preferred provider that is not registered is recorded as a skip reason (not silently sandboxed-first)", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const agent = await prisma.agent.create({
    data: {
      slug: `ghost-provider-${suffix}`,
      name: "Ghost Provider Agent",
      title: "Test Agent",
      role: "Tester",
      specialty: "Routing",
      prompt: "test",
      systemPrompt: "test",
      skills: [],
      responseStyle: "concise",
      preferredProviderId: "ghost-provider-xyz",
      defaultModel: "ghost-model",
      fallbackModels: [],
      fallbackProviderIds: []
    }
  });

  try {
    const route = await selectAIProviderRoute({ agent, taskMode: "ASK" });
    assert.notEqual(route.provider.id, "ghost-provider-xyz", "Unregistered preferred provider must not be selected");
    assert.ok(route.skippedProviderIds?.includes("ghost-provider-xyz"), "Skip must be recorded for UI");
    assert.match(route.skippedReasons?.["ghost-provider-xyz"] ?? "", /PREFERRED_PROVIDER_NOT_FOUND/);
  } finally {
    await prisma.agent.delete({ where: { id: agent.id } });
  }
});

test("routing uses default fallback chain when agent has no fallbackModels or fallbackProviderIds", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const agent = await prisma.agent.create({
    data: {
      slug: `no-fallbacks-${suffix}`,
      name: "No Fallback Agent",
      title: "Test Agent",
      role: "Tester",
      specialty: "Routing",
      prompt: "test",
      systemPrompt: "test",
      skills: [],
      responseStyle: "concise",
      preferredProviderId: OPENROUTER_FREE_PROVIDER_ID,
      defaultModel: "openrouter/owl-alpha",
      fallbackModels: [],
      fallbackProviderIds: []
    }
  });

  try {
    const route = await selectAIProviderRoute({ agent, taskMode: "ASK" });
    assert.equal(route.provider.id, OPENROUTER_FREE_PROVIDER_ID);
    // When both arrays are empty, local sandbox must appear in the fallback chain as final safety net
    const hasSandbox = route.fallbackProviders.some((p) => p.id === LOCAL_SANDBOX_PROVIDER_ID);
    assert.ok(hasSandbox, "Default fallback chain must include local sandbox");
  } finally {
    await prisma.agent.delete({ where: { id: agent.id } });
  }
});
