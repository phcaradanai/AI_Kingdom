import assert from "node:assert/strict";
import test from "node:test";
import { MockAIProvider } from "./mockAIProvider.js";

test("mock provider generates deterministic royal counsel", async () => {
  const provider = new MockAIProvider();
  const result = await provider.generateAgentResponse({
    command: "Plan the launch of the council workflow",
    mode: "PLAN",
    agentName: "Cassian",
    agentRole: "Royal General",
    agentSkills: ["roadmaps", "milestones"],
    systemPrompt: "You are the Royal General.",
    responseStyle: "direct"
  });

  assert.equal(provider.name, "mock");
  assert.equal(provider.model, "deterministic-mock-v1");
  assert.match(result.response, /Royal General/);
  assert.match(result.response, /PLAN/);
  assert.match(result.response, /Plan the launch/);
  assert.ok(result.usage.promptTokens > 0);
  assert.ok(result.usage.completionTokens > 0);
  assert.equal(result.usage.totalTokens, result.usage.promptTokens + result.usage.completionTokens);
});
