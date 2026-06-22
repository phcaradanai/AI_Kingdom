import assert from "node:assert/strict";
import crypto from "node:crypto";
import { after, before, beforeEach, test } from "node:test";
import { prisma } from "../db/prisma.js";
import { assertSafeTestDatabase } from "../test/testDb.js";
import { maybeGrowAgentMaxTokens } from "./maxTokensAutoGrowService.js";

const suffix = crypto.randomUUID().slice(0, 8);
let agentId: string;

async function setSetting(key: string, value: string) {
  await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value, category: "SYSTEM", description: key } });
}

before(async () => {
  assertSafeTestDatabase();
  await setSetting("AI_MAX_TOKENS_AUTOGROW", "true");
  await setSetting("AI_MAX_TOKENS_CEILING", "16000");
  const agent = await prisma.agent.create({
    data: {
      slug: `grow-agent-${suffix}`, name: "Grow Agent", title: "Tester", role: "MINISTER", specialty: "testing", prompt: "test",
      parameterMode: "MANUAL", maxTokens: 8000,
      modelParameters: { max_tokens: 8000, reasoning: { enabled: false, effort: "none", max_tokens: null, exclude: true } }
    }
  });
  agentId = agent.id;
});

beforeEach(async () => {
  await prisma.agent.update({ where: { id: agentId }, data: { maxTokens: 8000, modelParameters: { max_tokens: 8000 } } });
  await setSetting("AI_MAX_TOKENS_AUTOGROW", "true");
  await setSetting("AI_MAX_TOKENS_CEILING", "16000");
});

after(async () => {
  await prisma.agent.deleteMany({ where: { id: agentId } });
});

test("grows and persists BOTH knobs when a real provider truncates (finish_reason=length)", async () => {
  const r = await maybeGrowAgentMaxTokens({
    agentId, contentBudgetUsed: 8000, finishReason: "length", providerType: "openrouter", model: "deepseek/deepseek-v4-flash"
  });
  assert.equal(r.grown, true);
  if (r.grown) {
    assert.equal(r.from, 8000);
    assert.equal(r.to, 12000); // 8000 * 1.5 = 12000, rounded to 1000
  }
  const agent = await prisma.agent.findUnique({ where: { id: agentId }, select: { maxTokens: true, modelParameters: true } });
  assert.equal(agent!.maxTokens, 12000);
  assert.equal((agent!.modelParameters as { max_tokens?: number }).max_tokens, 12000);
});

test("does NOT grow on a sandbox/mock winner", async () => {
  const r = await maybeGrowAgentMaxTokens({ agentId, contentBudgetUsed: 8000, finishReason: "length", providerType: "sandbox" });
  assert.equal(r.grown, false);
  const agent = await prisma.agent.findUnique({ where: { id: agentId }, select: { maxTokens: true } });
  assert.equal(agent!.maxTokens, 8000);
});

test("does NOT grow when the response finished normally (stop)", async () => {
  const r = await maybeGrowAgentMaxTokens({ agentId, contentBudgetUsed: 8000, finishReason: "stop", providerType: "openrouter" });
  assert.equal(r.grown, false);
});

test("caps growth at the ceiling and never exceeds it", async () => {
  // current 12000, factor would give 18000, ceiling 16000 → caps at 16000
  await prisma.agent.update({ where: { id: agentId }, data: { maxTokens: 12000, modelParameters: { max_tokens: 12000 } } });
  const r = await maybeGrowAgentMaxTokens({ agentId, contentBudgetUsed: 12000, finishReason: "length", providerType: "openrouter" });
  assert.equal(r.grown, true);
  if (r.grown) assert.equal(r.to, 16000);
  // already at ceiling → no further growth
  const r2 = await maybeGrowAgentMaxTokens({ agentId, contentBudgetUsed: 16000, finishReason: "length", providerType: "openrouter" });
  assert.equal(r2.grown, false);
});

test("does NOT grow when the kill-switch is off", async () => {
  await setSetting("AI_MAX_TOKENS_AUTOGROW", "false");
  const r = await maybeGrowAgentMaxTokens({ agentId, contentBudgetUsed: 8000, finishReason: "length", providerType: "openrouter" });
  assert.equal(r.grown, false);
});
