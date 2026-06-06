import assert from "node:assert/strict";
import test from "node:test";
import type { AIProvider } from "./aiProvider.js";
import { generateWithFallback } from "./generateWithFallback.js";

test("failed AI provider falls back to mock response without throwing", async () => {
  const failingProvider: AIProvider = {
    name: "openai",
    model: "failing-model",
    async generateAgentResponse() {
      throw new Error("simulated provider failure");
    }
  };

  const result = await generateWithFallback(failingProvider, {
    command: "Build the throne room processing flow",
    mode: "BUILD",
    agentName: "Seraphine",
    agentRole: "Royal Architect",
    agentSkills: ["architecture"],
    systemPrompt: "You are the Royal Architect.",
    responseStyle: "structured"
  });

  assert.equal(result.providerName, "mock");
  assert.equal(result.modelUsed, "deterministic-mock-v1");
  assert.match(result.response, /Royal Architect/);
  assert.match(result.fallbackNotice ?? "", /simulated provider failure/);
  assert.ok(result.usage.totalTokens > 0);
});
