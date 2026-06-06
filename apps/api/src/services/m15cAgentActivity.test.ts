import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { createApp } from "../app.js";
import { prisma } from "../db/prisma.js";
import { signAccessToken, type AuthUser } from "../middleware/auth.js";
import { completeAgentActivity, failAgentActivity, startAgentActivity } from "./agentActivityService.js";
import { buildUsageAttribution, sanitizePreview } from "./usageAttributionService.js";

async function createAgent(suffix: string) {
  return prisma.agent.create({
    data: {
      slug: `m15c-agent-${suffix}`,
      name: `M15C Agent ${suffix}`,
      title: "M15C Test Agent",
      role: "Tester",
      specialty: "Activity tests",
      prompt: "test",
      systemPrompt: "test",
      skills: [],
      responseStyle: "concise",
      priority: 999
    }
  });
}

async function createUserToken(suffix: string) {
  const user = await prisma.user.create({
    data: {
      email: `m15c-${suffix}@aikingdom.local`,
      displayName: "M15C Tester",
      passwordHash: "test",
      role: "SCRIBE"
    }
  });
  const session = await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: `m15c-token-${suffix}`,
      expiresAt: new Date(Date.now() + 3600_000)
    }
  });
  const authUser: AuthUser = { id: user.id, email: user.email, displayName: user.displayName, role: user.role, sessionId: session.id };
  return { user, token: signAccessToken(authUser) };
}

async function withServer(fn: (baseUrl: string) => Promise<void>) {
  const app = createApp();
  const server = app.listen(0);
  try {
    const address = server.address() as AddressInfo;
    await fn(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
  }
}

test("sanitizePreview truncates long text", () => {
  const value = sanitizePreview("x".repeat(600), 100);
  assert.equal(value?.length, 100);
  assert.equal(value?.endsWith("…"), true);
});

test("sanitizePreview redacts bearer tokens", () => {
  const value = sanitizePreview("Authorization: Bearer abc.def_123-SECRET");
  assert.equal(value?.includes("abc.def_123-SECRET"), false);
  assert.match(value ?? "", /Bearer \[REDACTED\]/);
});

test("sanitizePreview redacts sk-* keys", () => {
  const value = sanitizePreview("key sk-1234567890abcdef should not remain");
  assert.equal(value?.includes("sk-1234567890abcdef"), false);
  assert.match(value ?? "", /sk-\[REDACTED\]/);
});

test("AgentActivity starts and completes", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const agent = await createAgent(suffix);
  try {
    const activity = await startAgentActivity({
      agentId: agent.id,
      status: "THINKING",
      activityType: "AGENT_RESPONSE",
      title: "Testing response",
      providerName: "mock",
      model: "deterministic-mock-v1"
    });
    assert.equal(activity.status, "THINKING");

    const completed = await completeAgentActivity(activity.id, { tokensUsed: 42, estimatedCostUSD: 0.01 });
    assert.equal(completed.status, "COMPLETED");
    assert.equal(completed.tokensUsed, 42);
    assert.ok(completed.endedAt);
  } finally {
    await prisma.agentActivity.deleteMany({ where: { agentId: agent.id } });
    await prisma.agent.delete({ where: { id: agent.id } }).catch(() => undefined);
  }
});

test("AgentActivity fails safely", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const agent = await createAgent(suffix);
  try {
    const activity = await startAgentActivity({
      agentId: agent.id,
      activityType: "AGENT_RESPONSE",
      title: "Unsafe failure"
    });
    const failed = await failAgentActivity(activity.id, new Error("Bearer secret-token sk-1234567890abcdef failed"));
    assert.equal(failed.status, "FAILED");
    assert.ok(failed.endedAt);
    assert.equal(failed.errorMessage?.includes("secret-token"), false);
    assert.equal(failed.errorMessage?.includes("sk-1234567890abcdef"), false);
  } finally {
    await prisma.agentActivity.deleteMany({ where: { agentId: agent.id } });
    await prisma.agent.delete({ where: { id: agent.id } }).catch(() => undefined);
  }
});

test("current activities endpoint returns idle state for agents without activity", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const agent = await createAgent(suffix);
  const { user, token } = await createUserToken(suffix);
  try {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/agent-activities/current`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const body = await response.json() as { activities: Array<{ agent: { id: string }; status: string; activityType: string }> };
      assert.equal(response.status, 200);
      const row = body.activities.find((activity) => activity.agent.id === agent.id);
      assert.ok(row);
      assert.equal(row.status, "IDLE");
      assert.equal(row.activityType, "IDLE");
    });
  } finally {
    await prisma.agentActivity.deleteMany({ where: { agentId: agent.id } });
    await prisma.agent.delete({ where: { id: agent.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("current activities endpoint returns latest active and completed state", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const agent = await createAgent(suffix);
  const { user, token } = await createUserToken(suffix);
  try {
    const activity = await startAgentActivity({
      agentId: agent.id,
      status: "RESPONDING",
      activityType: "AGENT_RESPONSE",
      title: "Active response",
      tokensUsed: 12
    });

    await withServer(async (baseUrl) => {
      const activeResponse = await fetch(`${baseUrl}/api/agent-activities/current`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const activeBody = await activeResponse.json() as { activities: Array<{ agent: { id: string }; status: string; title: string }> };
      assert.equal(activeBody.activities.find((row) => row.agent.id === agent.id)?.status, "RESPONDING");

      await completeAgentActivity(activity.id, { title: "Completed response", tokensUsed: 24 });
      const completedResponse = await fetch(`${baseUrl}/api/agent-activities/current`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const completedBody = await completedResponse.json() as { activities: Array<{ agent: { id: string }; status: string; tokensUsed: number }> };
      const row = completedBody.activities.find((item) => item.agent.id === agent.id);
      assert.equal(row?.status, "COMPLETED");
      assert.equal(row?.tokensUsed, 24);
    });
  } finally {
    await prisma.agentActivity.deleteMany({ where: { agentId: agent.id } });
    await prisma.agent.delete({ where: { id: agent.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("UsageRecord can store attribution fields", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const user = await prisma.user.create({
    data: { email: `m15c-usage-${suffix}@aikingdom.local`, displayName: "Usage M15C", passwordHash: "test" }
  });
  const project = await prisma.project.create({
    data: { name: `M15C Usage ${suffix}`, description: "usage attribution test" }
  });
  try {
    const record = await prisma.usageRecord.create({
      data: {
        provider: "mock",
        providerId: "mock",
        model: "deterministic-mock-v1",
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
        estimatedCostUSD: 0,
        estimatedCostLocal: 0,
        currency: "USD",
        ...buildUsageAttribution({
          projectId: project.id,
          purpose: "Provider test",
          sourceType: "MANUAL_TEST",
          sourceId: "manual-test",
          operation: "usage_attribution_test",
          requestLabel: "Manual attribution test",
          prompt: "Bearer hidden-token",
          response: "ok",
          metadata: { apiKey: "sk-1234567890abcdef", safe: "visible" }
        })
      }
    });

    assert.equal(record.projectId, project.id);
    assert.equal(record.sourceType, "MANUAL_TEST");
    assert.equal(record.promptPreview?.includes("hidden-token"), false);
    assert.equal(JSON.stringify(record.metadata).includes("sk-1234567890abcdef"), false);
  } finally {
    await prisma.usageRecord.deleteMany({ where: { projectId: project.id } });
    await prisma.project.delete({ where: { id: project.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});
