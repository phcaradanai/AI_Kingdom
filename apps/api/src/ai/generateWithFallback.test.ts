import assert from "node:assert/strict";
import test from "node:test";
import type { AIProvider } from "./aiProvider.js";
import { generateWithFallback } from "./generateWithFallback.js";
import { prisma } from "../db/prisma.js";
import { buildTraceContext, createAIUsageTrace } from "../services/aiUsageTraceService.js";

async function createTestTrace(label: string) {
  const trace = await createAIUsageTrace({
    triggerType: "SYSTEM_PROCESS",
    triggerLabel: label,
    sourceType: "MANUAL_TEST",
    sourceId: label,
    operation: "generate_with_fallback_test",
    purpose: "Generate with fallback test",
    attributionStatus: "PARTIAL"
  });
  return buildTraceContext({
    traceId: trace.traceId,
    triggerType: "SYSTEM_PROCESS",
    sourceType: "MANUAL_TEST",
    sourceId: label,
    operation: "generate_with_fallback_test",
    purpose: "Generate with fallback test",
    attributionStatus: "PARTIAL"
  });
}

test("failed AI provider falls back to mock response without throwing", async () => {
  const failingProvider: AIProvider = {
    name: "openai",
    model: "failing-model",
    async generateAgentResponse() {
      throw new Error("simulated provider failure");
    }
  };

  const traceContext = await createTestTrace(`fallback-mock-${Date.now()}`);
  const result = await generateWithFallback(failingProvider, {
    command: "Build the throne room processing flow",
    mode: "BUILD",
    agentName: "Seraphine",
    agentRole: "Royal Architect",
    agentSkills: ["architecture"],
    systemPrompt: "You are the Royal Architect.",
    responseStyle: "structured"
  }, traceContext);

  assert.equal(result.providerName, "mock");
  assert.equal(result.modelUsed, "deterministic-mock-v1");
  assert.match(result.response, /Royal Architect/);
  assert.match(result.fallbackNotice ?? "", /simulated provider failure/);
  assert.ok(result.usage.totalTokens > 0);
});

test("fallback chain tries the next configured provider before mock", async () => {
  const failingProvider: AIProvider = {
    name: "deepseek",
    model: "deepseek-chat",
    async generateAgentResponse() {
      throw new Error("timeout");
    }
  };
  const succeedingProvider: AIProvider = {
    name: "openrouter",
    model: "openai/gpt-4o-mini",
    async generateAgentResponse() {
      return {
        response: "OpenRouter counsel",
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 }
      };
    }
  };

  const traceContext = await createTestTrace(`fallback-chain-${Date.now()}`);
  const result = await generateWithFallback([failingProvider, succeedingProvider], {
    command: "Build a fallback chain",
    mode: "BUILD",
    agentName: "Seraphine",
    agentRole: "Royal Architect",
    agentSkills: ["architecture"],
    systemPrompt: "You are the Royal Architect.",
    responseStyle: "structured"
  }, traceContext);

  assert.equal(result.providerName, "openrouter");
  assert.deepEqual(result.attemptedProviders, ["deepseek", "openrouter"]);
  assert.match(result.fallbackNotice ?? "", /deepseek failed: timeout/);
  assert.match(result.fallbackNotice ?? "", /Fallback used: openrouter/);
});

test("generateWithFallback rejects missing trace context", async () => {
  const provider: AIProvider = {
    name: "mock",
    model: "deterministic-mock-v1",
    async generateAgentResponse() {
      return {
        response: "ok",
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }
      };
    }
  };

  await assert.rejects(
    () => generateWithFallback(provider, {
      command: "No trace",
      mode: "ASK",
      agentName: "Aurelian",
      agentRole: "Grand Vizier",
      agentSkills: [],
      systemPrompt: "test",
      responseStyle: "brief"
    }, undefined as never),
    /requires trace context/
  );
});

test.after(async () => {
  await prisma.aIUsageTrace.deleteMany({ where: { operation: "generate_with_fallback_test" } });
});
