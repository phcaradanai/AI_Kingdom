import assert from "node:assert/strict";
import test from "node:test";
import { assertSafeTestDatabase } from "../test/testDb.js";
import { prisma } from "../db/prisma.js";
import type { AIProvider } from "./aiProvider.js";
import { OpenAICompatibleProvider } from "./openAICompatibleProvider.js";
import { generateWithFallback, normalizeModelIdForProvider } from "./generateWithFallback.js";
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
      "Primary model failed: failing-prov / bad-model returned 404 Not Found. Final answer generated by Local Sandbox Baseline / local-sandbox-baseline."
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

test("normalizeModelIdForProvider: OpenRouter model IDs are returned unchanged", () => {
  assert.equal(
    normalizeModelIdForProvider("openrouter", "nvidia/nemotron-3-ultra-550b-a55b:free"),
    "nvidia/nemotron-3-ultra-550b-a55b:free",
    "nvidia model ID must not be prefixed"
  );
  assert.equal(
    normalizeModelIdForProvider("openrouter", "poolside/laguna-m.1:free"),
    "poolside/laguna-m.1:free",
    "poolside model ID must not be prefixed"
  );
  assert.equal(
    normalizeModelIdForProvider("openrouter", "openrouter/owl-alpha"),
    "openrouter/owl-alpha",
    "openrouter-namespaced model must remain unchanged"
  );
});

test("normalizeModelIdForProvider: whitespace is trimmed for all provider types", () => {
  assert.equal(normalizeModelIdForProvider("openrouter", "  nvidia/nemotron-3-ultra-550b-a55b:free  "), "nvidia/nemotron-3-ultra-550b-a55b:free");
  assert.equal(normalizeModelIdForProvider("deepseek", "  deepseek-chat  "), "deepseek-chat");
  assert.equal(normalizeModelIdForProvider("openai-compatible", "  gpt-4o  "), "gpt-4o");
});

test("normalizeModelIdForProvider: sandbox always returns local-sandbox-baseline", () => {
  assert.equal(normalizeModelIdForProvider("sandbox", "whatever"), "local-sandbox-baseline");
  assert.equal(normalizeModelIdForProvider("sandbox", ""), "local-sandbox-baseline");
});

test("OpenAICompatibleProvider sends stream: false in request body", async () => {
  const provider = new OpenAICompatibleProvider({
    providerId: "openrouter",
    apiKey: "dummy-key",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "model-1"
  });

  const originalFetch = global.fetch;
  let capturedBody: any = null;
  global.fetch = (async (_url: string, init?: RequestInit) => {
    capturedBody = JSON.parse(init?.body as string);
    return {
      ok: true,
      json: async () => ({ choices: [{ message: { content: "ok" } }] })
    } as any;
  }) as any;

  try {
    await provider.generateAgentResponse({
      command: "test",
      mode: "ASK",
      agentName: "test",
      agentRole: "test",
      agentSkills: [],
      systemPrompt: "test",
      responseStyle: "concise"
    });
    assert.equal(capturedBody?.stream, false, "stream must be false in request body");
  } finally {
    global.fetch = originalFetch;
  }
});

test("OpenAICompatibleProvider classifies timeout as PROVIDER_TIMEOUT", async () => {
  const provider = new OpenAICompatibleProvider({
    providerId: "openrouter",
    apiKey: "dummy-key",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "model-1",
    timeoutMs: 10
  });

  const originalFetch = global.fetch;
  global.fetch = (async () => new Promise(() => {})) as any;

  try {
    await assert.rejects(
      async () => provider.generateAgentResponse({
        command: "test",
        mode: "ASK",
        agentName: "test",
        agentRole: "test",
        agentSkills: [],
        systemPrompt: "test",
        responseStyle: "concise"
      }),
      (err: any) => {
        assert.match(err.message, /PROVIDER_TIMEOUT/);
        assert.equal(err.errorCode, "PROVIDER_TIMEOUT");
        return true;
      }
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("generateWithFallback: primary timeout falls back without blocking next provider", async () => {
  const traceId = `test-timeout-fallback-${Date.now()}`;
  await createAIUsageTrace({
    traceId,
    triggerType: "TEST",
    sourceType: "TEST",
    operation: "test",
    purpose: "test",
    attributionStatus: "TRUSTED"
  });

  const timingOutProvider = new OpenAICompatibleProvider({
    providerId: "timing-out-provider",
    apiKey: "dummy-key",
    baseUrl: "https://example.com/v1",
    defaultModel: "slow-model",
    timeoutMs: 10
  });

  let fallbackCalled = false;
  const fallbackProvider: AIProvider = {
    name: "fallback-prov",
    model: "fallback-model",
    async generateAgentResponse() {
      fallbackCalled = true;
      return { response: "fallback", usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } };
    }
  };

  const originalFetch = global.fetch;
  global.fetch = (async () => new Promise(() => {})) as any;

  try {
    const result = await generateWithFallback(
      [timingOutProvider, fallbackProvider],
      { command: "test", mode: "ASK", agentName: "t", agentRole: "t", agentSkills: [], systemPrompt: "t", responseStyle: "concise" },
      { traceId, attributionStatus: "TRUSTED", sourceType: "TEST", operation: "test", purpose: "test" }
    );

    assert.ok(fallbackCalled, "Fallback provider must still be called after primary timeout");
    assert.equal(result.fallbackUsed, true);
    assert.match(result.errorMessage ?? "", /PROVIDER_TIMEOUT/);
  } finally {
    global.fetch = originalFetch;
    await prisma.aIUsageTrace.delete({ where: { traceId } }).catch(() => undefined);
  }
});

test("OpenAICompatibleProvider sends exact model ID in request body", async () => {
  const provider = new OpenAICompatibleProvider({
    providerId: "openrouter",
    apiKey: "dummy-key",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "nvidia/nemotron-3-ultra-550b-a55b:free"
  });

  const originalFetch = global.fetch;
  let capturedBody: any = null;
  global.fetch = (async (_url: string, init?: RequestInit) => {
    capturedBody = JSON.parse(init?.body as string);
    return {
      ok: true,
      json: async () => ({
        model: "nvidia/nemotron-3-ultra-550b-a55b:free",
        choices: [{ message: { content: "Response" } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
      })
    } as any;
  }) as any;

  try {
    const result = await provider.generateAgentResponse({
      command: "test",
      mode: "ASK",
      agentName: "test",
      agentRole: "test",
      agentSkills: [],
      systemPrompt: "test",
      responseStyle: "concise"
    });
    assert.equal(capturedBody?.model, "nvidia/nemotron-3-ultra-550b-a55b:free", "Request body must use exact model ID");
    assert.equal(result.responseModel, "nvidia/nemotron-3-ultra-550b-a55b:free", "responseModel must reflect API response");
  } finally {
    global.fetch = originalFetch;
  }
});

test("fallback notice uses provider display name and model separately", async () => {
  const traceId = `test-display-notice-${Date.now()}`;
  await createAIUsageTrace({
    traceId,
    triggerType: "TEST",
    sourceType: "TEST",
    operation: "test",
    purpose: "test",
    attributionStatus: "TRUSTED"
  });

  const failingProvider = new OpenAICompatibleProvider({
    providerId: "openrouter",
    apiKey: "dummy-key",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "nvidia/nemotron-3-ultra-550b-a55b:free"
  });

  const originalFetch = global.fetch;
  global.fetch = (async () => ({ ok: false, text: async () => "Service Unavailable", status: 503 } as any)) as any;

  const originalFetchModels = openRouterModelService._service.fetchOpenRouterModels;
  openRouterModelService._service.fetchOpenRouterModels = async () => ({
    models: ["nvidia/nemotron-3-ultra-550b-a55b:free"],
    success: true
  });

  try {
    const result = await generateWithFallback(
      failingProvider,
      { command: "test", mode: "ASK", agentName: "t", agentRole: "t", agentSkills: [], systemPrompt: "t", responseStyle: "concise" },
      { traceId, attributionStatus: "TRUSTED", sourceType: "TEST", operation: "test", purpose: "test" }
    );

    assert.ok(result.fallbackUsed, "Should fall back");
    assert.ok(result.fallbackNotice?.includes("OpenRouter"), "Notice must show 'OpenRouter' not raw provider ID");
    assert.ok(!result.fallbackNotice?.includes("openrouter/nvidia"), "Notice must not prepend providerType to model ID");
    assert.ok(result.fallbackNotice?.includes("nvidia/nemotron-3-ultra-550b-a55b:free"), "Model ID must appear unmodified in notice");
    assert.ok(result.fallbackNotice?.includes("Local Sandbox Baseline"), "Final provider must use display name");
  } finally {
    openRouterModelService._service.fetchOpenRouterModels = originalFetchModels;
    global.fetch = originalFetch;
    await prisma.aIUsageTrace.delete({ where: { traceId } }).catch(() => undefined);
  }
});
