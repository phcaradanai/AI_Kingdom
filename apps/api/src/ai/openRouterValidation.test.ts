import assert from "node:assert/strict";
import test from "node:test";
import { assertSafeTestDatabase } from "../test/testDb.js";
import { prisma } from "../db/prisma.js";
import { OpenAICompatibleProvider } from "./openAICompatibleProvider.js";
import { generateWithFallback } from "./generateWithFallback.js";
import { createAIUsageTrace } from "../services/aiUsageTraceService.js";
import * as openRouterModelService from "../services/openRouterModelService.js";

// Call assertSafeTestDatabase at load time
assertSafeTestDatabase();

test("OpenAICompatibleProvider URL construction", async () => {
  // Test that /chat/completions is not double appended
  const provider1 = new OpenAICompatibleProvider({
    providerId: "test-compat-1",
    apiKey: "dummy-key",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "model-1"
  });
  
  assert.equal((provider1 as any).baseUrl, "https://openrouter.ai/api/v1");

  const originalFetch = global.fetch;
  let requestedUrl = "";
  global.fetch = (async (url: string) => {
    requestedUrl = url;
    return {
      ok: true,
      json: async () => ({ choices: [{ message: { content: "Success response" } }] }),
      status: 200
    } as any;
  }) as any;

  try {
    await provider1.generateAgentResponse({
      command: "hello",
      mode: "ASK",
      agentName: "test",
      agentRole: "test",
      agentSkills: [],
      systemPrompt: "test",
      responseStyle: "concise"
    });
    assert.equal(requestedUrl, "https://openrouter.ai/api/v1/chat/completions");

    // Try with baseUrl already ending in /chat/completions
    const provider2 = new OpenAICompatibleProvider({
      providerId: "test-compat-2",
      apiKey: "dummy-key",
      baseUrl: "https://openrouter.ai/api/v1/chat/completions",
      defaultModel: "model-1"
    });
    await provider2.generateAgentResponse({
      command: "hello",
      mode: "ASK",
      agentName: "test",
      agentRole: "test",
      agentSkills: [],
      systemPrompt: "test",
      responseStyle: "concise"
    });
    assert.equal(requestedUrl, "https://openrouter.ai/api/v1/chat/completions");
  } finally {
    global.fetch = originalFetch;
  }
});

test("OpenAICompatibleProvider 404 error properties", async () => {
  const provider = new OpenAICompatibleProvider({
    providerId: "test-compat-404",
    apiKey: "dummy-key",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "model-1"
  });

  const originalFetch = global.fetch;
  global.fetch = (async () => {
    return {
      ok: false,
      text: async () => "Not Found",
      status: 404
    } as any;
  }) as any;

  try {
    await assert.rejects(
      async () => {
        await provider.generateAgentResponse({
          command: "hello",
          mode: "ASK",
          agentName: "test",
          agentRole: "test",
          agentSkills: [],
          systemPrompt: "test",
          responseStyle: "concise"
        });
      },
      (err: any) => {
        assert.equal(err.statusCode, 404);
        assert.equal(err.providerId, "test-compat-404");
        assert.equal(err.model, "model-1");
        assert.equal(err.endpointPath, "/chat/completions");
        assert.match(err.message, /provider error 404: Not Found/);
        return true;
      }
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("generateWithFallback fallback result and notice structure", async () => {
  const traceId = `test-fallback-trace-${Date.now()}`;
  await createAIUsageTrace({
    traceId,
    triggerType: "TEST",
    sourceType: "TEST",
    operation: "test",
    purpose: "test",
    attributionStatus: "TRUSTED"
  });

  const failingProvider = new OpenAICompatibleProvider({
    providerId: "failing-prov",
    apiKey: "dummy-key",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "bad-model"
  });

  const originalFetch = global.fetch;
  global.fetch = (async () => {
    return {
      ok: false,
      text: async () => "Not Found",
      status: 404
    } as any;
  }) as any;

  const originalFetchModels = openRouterModelService._service.fetchOpenRouterModels;
  openRouterModelService._service.fetchOpenRouterModels = async () => ({
    models: ["bad-model"],
    success: true
  });

  try {
    const result = await generateWithFallback(
      failingProvider,
      {
        command: "hello",
        mode: "ASK",
        agentName: "test",
        agentRole: "test",
        agentSkills: [],
        systemPrompt: "test",
        responseStyle: "concise"
      },
      {
        traceId,
        attributionStatus: "TRUSTED",
        sourceType: "TEST",
        operation: "test",
        purpose: "test"
      }
    );

    assert.equal(result.fallbackUsed, true);
    assert.equal(result.attemptedProviderId, "failing-prov");
    assert.equal(result.attemptedModel, "bad-model");
    assert.equal(result.finalProviderId, "local-sandbox-baseline");
    assert.equal(result.finalModel, "local-sandbox-baseline");
    assert.equal(result.errorCode, "404");
    assert.ok(result.errorMessage?.includes("failing-prov provider error 404: Not Found"));
    assert.equal(
      result.fallbackNotice,
      "Primary model failed: failing-prov/bad-model returned 404 Not Found. Final answer generated by local-sandbox-baseline/local-sandbox-baseline."
    );

    const steps = await prisma.aIUsageTraceStep.findMany({
      where: { traceId },
      orderBy: { sequence: "asc" }
    });

    const stepTypes = steps.map(s => s.stepType);
    assert.ok(stepTypes.includes("PROVIDER_CALL_FAILED"), "Should record failure step");
    assert.ok(stepTypes.includes("PROVIDER_FALLBACK"), "Should record fallback step");
    assert.ok(stepTypes.includes("PROVIDER_CALL_SUCCESS"), "Should record success step");

    const failStep = steps.find(s => s.stepType === "PROVIDER_CALL_FAILED")!;
    assert.equal(failStep.providerId, "failing-prov");
    assert.equal(failStep.model, "bad-model");
    assert.equal((failStep.metadata as any)?.statusCode, 404);

  } finally {
    openRouterModelService._service.fetchOpenRouterModels = originalFetchModels;
    global.fetch = originalFetch;
    await prisma.aIUsageTrace.delete({ where: { traceId } }).catch(() => undefined);
  }
});

test("generateWithFallback invalid model blocks call directly and falls back", async () => {
  const traceId = `test-blocked-trace-${Date.now()}`;
  await createAIUsageTrace({
    traceId,
    triggerType: "TEST",
    sourceType: "TEST",
    operation: "test",
    purpose: "test",
    attributionStatus: "TRUSTED"
  });

  const providerId = "openrouter-test-blocked";
  await prisma.aIProvider.upsert({
    where: { id: providerId },
    update: { type: "openrouter", defaultModel: "non-existent-model", isActive: true },
    create: { id: providerId, name: "OpenRouter Test Blocked", type: "openrouter", defaultModel: "non-existent-model", isActive: true, priority: 100, costTier: "MEDIUM", capabilities: { supportsChat: true } }
  });

  const targetProvider = new OpenAICompatibleProvider({
    providerId,
    apiKey: "dummy-key",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "non-existent-model"
  });

  const originalFetch = global.fetch;
  let fetchCalled = false;
  global.fetch = (async () => {
    fetchCalled = true;
    return { ok: true } as any;
  }) as any;

  const originalFetchModels = openRouterModelService._service.fetchOpenRouterModels;
  openRouterModelService._service.fetchOpenRouterModels = async () => ({
    models: ["existent-model-1", "existent-model-2"],
    success: true
  });

  try {
    const result = await generateWithFallback(
      targetProvider,
      {
        command: "hello",
        mode: "ASK",
        agentName: "test",
        agentRole: "test",
        agentSkills: [],
        systemPrompt: "test",
        responseStyle: "concise"
      },
      {
        traceId,
        attributionStatus: "TRUSTED",
        sourceType: "TEST",
        operation: "test",
        purpose: "test"
      }
    );

    assert.equal(fetchCalled, false, "Fetch should not be called since model is invalid");
    assert.equal(result.fallbackUsed, true);
    assert.equal(result.attemptedProviderId, providerId);
    assert.equal(result.attemptedModel, "non-existent-model");
    assert.equal(result.finalProviderId, "local-sandbox-baseline");
    assert.equal(result.finalModel, "local-sandbox-baseline");
    assert.equal(result.errorCode, "404");
    assert.match(result.errorMessage ?? "", /non-existent-model/);

    const dbProv = await prisma.aIProvider.findUnique({ where: { id: providerId } });
    assert.equal(dbProv?.modelValidationStatus, "INVALID_MODEL");

  } finally {
    openRouterModelService._service.fetchOpenRouterModels = originalFetchModels;
    global.fetch = originalFetch;
    await prisma.aIUsageTrace.delete({ where: { traceId } }).catch(() => undefined);
    await prisma.aIProvider.delete({ where: { id: providerId } }).catch(() => undefined);
  }
});
