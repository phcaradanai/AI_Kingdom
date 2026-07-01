import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { prisma } from "../db/prisma.js";
import { createApp } from "../app.js";
import { signAccessToken, type AuthUser } from "../middleware/auth.js";
import { calculateCostDetailed, calculateCostUSD, getPricing } from "../pricing/providerPricing.js";
import { getTreasuryAttentionTraces, getTreasuryByAgent, getTreasuryByProvider, getTreasuryDailyReport, getTreasuryOverview } from "./treasuryService.js";


async function withTestServer(fn: (baseUrl: string, kingToken: string) => Promise<void>) {
  const app = createApp();
  const server = app.listen(0);
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const user = await prisma.user.create({
    data: { email: `treasury-king-${suffix}@aikingdom.local`, displayName: "Treasury King", passwordHash: "test", role: "KING" }
  });
  const session = await prisma.refreshToken.create({
    data: { userId: user.id, tokenHash: `treasury-token-${suffix}`, expiresAt: new Date(Date.now() + 3600_000) }
  });
  try {
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const authUser: AuthUser = { id: user.id, email: user.email, displayName: user.displayName, role: user.role, sessionId: session.id };
    const token = signAccessToken(authUser);
    await fn(baseUrl, token);
  } finally {
    server.close();
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
}

async function createUsageFixture(suffix: string) {
  const user = await prisma.user.create({
    data: { email: `usage-fixture-${suffix}@aikingdom.local`, displayName: "Usage King", passwordHash: "test" }
  });
  const agent = await prisma.agent.create({
    data: {
      slug: `usage-agent-${suffix}`,
      name: "Usage Agent",
      title: "Usage Tester",
      role: "Tester",
      specialty: "Usage",
      prompt: "test",
      systemPrompt: "test",
      skills: [],
      responseStyle: "concise"
    }
  });
  const task = await prisma.task.create({
    data: { createdBy: user.id, title: "Usage task", command: "test", mode: "ASK", status: "COMPLETED" }
  });
  const session = await prisma.councilSession.create({
    data: { taskId: task.id, status: "COMPLETED", selectedAgentIds: [agent.id], consultedMemoryIds: [], autoSavedMemoryIds: [] }
  });
  await prisma.usageRecord.create({
    data: {
      taskId: task.id,
      councilSessionId: session.id,
      agentId: agent.id,
      provider: "mock",
      providerId: "mock",
      model: "deterministic-mock-v1",
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      estimatedCostUSD: 0,
      estimatedCostLocal: 0,
      currency: "USD"
    }
  });
  return { user, agent, task, session };
}

test("pricing table returns zero cost for mock provider", () => {
  const pricing = getPricing("mock", "deterministic-mock-v1");
  assert.equal(pricing.inputPerMillion, 0);
  assert.equal(pricing.outputPerMillion, 0);
});

test("pricing table returns known cost for gpt-4o-mini", () => {
  const pricing = getPricing("openai", "gpt-4o-mini");
  assert.equal(pricing.inputPerMillion, 0.15);
  assert.equal(pricing.outputPerMillion, 0.6);
});

test("calculateCostUSD returns zero for mock model", () => {
  const cost = calculateCostUSD("mock", "deterministic-mock-v1", 1000, 500);
  assert.equal(cost, 0);
});

test("calculateCostUSD calculates correct cost for gpt-4o-mini", () => {
  // 1M input + 1M output = $0.15 + $0.60 = $0.75
  const cost = calculateCostUSD("openai", "gpt-4o-mini", 1_000_000, 1_000_000);
  assert.equal(cost, 0.75);
});

test("calculateCostUSD returns zero for unknown model", () => {
  const cost = calculateCostUSD("unknown-provider", "unknown-model", 1000, 500);
  assert.equal(cost, 0);
});

test("calculateCostUSD deepseek-chat cost > 0", () => {
  const cost = calculateCostUSD("deepseek", "deepseek-chat", 1_000_000, 1_000_000);
  assert.ok(cost > 0, "deepseek-chat should have non-zero cost");
  // deepseek-chat is now alias of V4 Flash: $0.14 input (miss) + $0.28 output = $0.42
  assert.equal(cost, 0.42);
});

test("calculateCostUSD deepseek-v4-pro exact key cost > 0", () => {
  const cost = calculateCostUSD("deepseek", "deepseek-v4-pro", 1_000_000, 1_000_000);
  assert.ok(cost > 0, "deepseek-v4-pro should have non-zero cost");
  // V4 Pro static fallback: $0.435 cache-miss input + $0.87 output = $1.305
  assert.equal(cost, 1.305);
});

test("calculateCostUSD deepseek-v4-pro via alias (partial model name) cost > 0", () => {
  // Model strings from the API may include version suffixes; alias matching should handle them
  const cost = calculateCostUSD("deepseek", "deepseek-v4-pro-20250601", 1_000_000, 1_000_000);
  assert.ok(cost > 0, "aliased deepseek v4-pro variant should have non-zero cost");
});

test("calculateCostUSD deepseek-reasoner cost > 0", () => {
  const cost = calculateCostUSD("deepseek", "deepseek-reasoner", 1_000_000, 1_000_000);
  assert.ok(cost > 0, "deepseek-reasoner should have non-zero cost");
  // deepseek-reasoner is now alias of V4 Flash: $0.14 input (miss) + $0.28 output = $0.42
  assert.equal(cost, 0.42);
});

test("calculateCostDetailed returns pricingStatus known for exact match", () => {
  const result = calculateCostDetailed("deepseek", "deepseek-chat", 1_000_000, 0);
  assert.equal(result.pricingStatus, "known");
  assert.ok(result.costUSD > 0);
  assert.equal(result.resolvedKey, "deepseek:deepseek-chat");
});

test("calculateCostDetailed returns pricingStatus aliased for fuzzy match", () => {
  const result = calculateCostDetailed("deepseek", "deepseek-v4-pro-20250601", 1_000_000, 0);
  assert.equal(result.pricingStatus, "aliased");
  assert.ok(result.costUSD > 0);
  assert.equal(result.resolvedKey, "deepseek:deepseek-v4-pro");
});

test("calculateCostDetailed returns pricingStatus unknown for unrecognised model", () => {
  const result = calculateCostDetailed("unknown-provider", "unknown-model", 1000, 500);
  assert.equal(result.pricingStatus, "unknown");
  assert.equal(result.costUSD, 0);
  assert.equal(result.resolvedKey, undefined);
});

test("treasury overview returns correct structure", async () => {
  const overview = await getTreasuryOverview();
  assert.ok(typeof overview.costToday === "number");
  assert.ok(typeof overview.costThisMonth === "number");
  assert.ok(typeof overview.costAllTime === "number");
  assert.ok(typeof overview.totalTasksTracked === "number");
  assert.ok(typeof overview.totalSessionsTracked === "number");
  assert.ok(typeof overview.budgetStatus === "object");
  assert.ok(typeof overview.budgetStatus.dailyWarning === "boolean");
  assert.ok(typeof overview.budgetStatus.monthlyWarning === "boolean");
});

test("treasury by agent aggregates usage correctly", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const { user, agent, task, session } = await createUsageFixture(suffix);

  try {
    const agentStats = await getTreasuryByAgent();
    const entry = agentStats.find((a) => a.agentId === agent.id);
    assert.ok(entry, "agent should appear in treasury by agent");
    assert.equal(entry.callCount, 1);
    assert.equal(entry.totalTokens, 150);
    assert.equal(entry.agent?.slug, agent.slug);
  } finally {
    await prisma.usageRecord.deleteMany({ where: { councilSessionId: session.id } });
    await prisma.councilSession.delete({ where: { id: session.id } });
    await prisma.task.delete({ where: { id: task.id } });
    await prisma.agent.delete({ where: { id: agent.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("treasury by provider aggregates per model", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const { user, agent, task, session } = await createUsageFixture(suffix);

  try {
    const providers = await getTreasuryByProvider();
    const mockEntry = providers.find((p) => p.provider === "mock" && p.model === "deterministic-mock-v1");
    assert.ok(mockEntry, "mock provider should appear in provider breakdown");
    assert.equal(mockEntry.providerId, "mock");
    assert.ok(mockEntry.callCount >= 1);
  } finally {
    await prisma.usageRecord.deleteMany({ where: { councilSessionId: session.id } });
    await prisma.councilSession.delete({ where: { id: session.id } });
    await prisma.task.delete({ where: { id: task.id } });
    await prisma.agent.delete({ where: { id: agent.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("treasury daily report buckets by date", async () => {
  const daily = await getTreasuryDailyReport(30);
  assert.ok(Array.isArray(daily));
  for (const row of daily) {
    assert.ok(typeof row.date === "string");
    assert.match(row.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(typeof row.totalCostUSD === "number");
    assert.ok(typeof row.callCount === "number");
  }
});

test("treasury attention traces include failed attempts and aggregate expensive usage without previews", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const expensiveTraceId = `treasury-expensive-${suffix}`;
  const failedTraceId = `treasury-failed-${suffix}`;
  await prisma.aIUsageTrace.createMany({
    data: [
      {
        traceId: expensiveTraceId,
        triggerType: "SYSTEM_PROCESS",
        sourceType: "TREASURY_TEST",
        operation: "expensive_call",
        purpose: "Verify expensive trace evidence",
        providerId: "openrouter",
        providerType: "openrouter",
        providerName: "OpenRouter",
        model: "test-model",
        status: "COMPLETED",
        completedAt: new Date(),
      },
      {
        traceId: failedTraceId,
        triggerType: "SYSTEM_PROCESS",
        sourceType: "TREASURY_TEST",
        operation: "failed_call",
        purpose: "Verify failed trace evidence",
        providerId: "deepseek",
        providerType: "deepseek",
        providerName: "DeepSeek",
        model: "test-model",
        status: "FAILED",
        failedAt: new Date(),
        errorMessage: "sanitized provider failure",
      },
    ],
  });
  const usage = await prisma.usageRecord.create({
    data: {
      traceId: expensiveTraceId,
      provider: "openrouter",
      providerId: "openrouter",
      model: "test-model",
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      estimatedCostUSD: 0.9,
      estimatedCostLocal: 0,
      currency: "USD",
    },
  });

  try {
    const traces = await getTreasuryAttentionTraces(50);
    const expensive = traces.find((trace) => trace.traceId === expensiveTraceId);
    const failed = traces.find((trace) => trace.traceId === failedTraceId);
    assert.equal(expensive?.attentionKind, "EXPENSIVE");
    assert.equal(expensive?.totalCostUSD, 0.9);
    assert.equal(expensive?.totalTokens, 150);
    assert.equal(failed?.attentionKind, "FAILED");
    assert.equal(failed?.failureCount, 1);
    assert.equal("errorMessage" in (failed ?? {}), false, "attention feed must not expose error text");
  } finally {
    await prisma.usageRecord.delete({ where: { id: usage.id } });
    await prisma.aIUsageTrace.deleteMany({ where: { traceId: { in: [expensiveTraceId, failedTraceId] } } });
  }
});

test("budget warning triggers when cost exceeds daily limit", async () => {
  const setting = await prisma.setting.upsert({
    where: { key: "DAILY_BUDGET_LIMIT_USD" },
    update: { value: "0.0001" },
    create: { key: "DAILY_BUDGET_LIMIT_USD", value: "0.0001", category: "SYSTEM", description: "test" }
  });

  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const { user, agent, task, session } = await createUsageFixture(suffix);
  await prisma.usageRecord.updateMany({
    where: { councilSessionId: session.id },
    data: { estimatedCostUSD: 1.0 }
  });

  try {
    const overview = await getTreasuryOverview();
    // The daily warning fires because daily cost >= $0.0001 limit
    assert.equal(overview.budgetStatus.dailyWarning, true);
  } finally {
    await prisma.setting.update({ where: { key: setting.key }, data: { value: "" } });
    await prisma.usageRecord.deleteMany({ where: { councilSessionId: session.id } });
    await prisma.councilSession.delete({ where: { id: session.id } });
    await prisma.task.delete({ where: { id: task.id } });
    await prisma.agent.delete({ where: { id: agent.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("treasury API requires KING role", async () => {
  const app = createApp();
  const server = app.listen(0);
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const scribe = await prisma.user.create({
    data: { email: `treasury-scribe-${suffix}@aikingdom.local`, displayName: "Scribe", passwordHash: "test", role: "SCRIBE" }
  });
  const scribes = await prisma.refreshToken.create({
    data: { userId: scribe.id, tokenHash: `scribe-token-${suffix}`, expiresAt: new Date(Date.now() + 3600_000) }
  });

  try {
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const scribesAuth: AuthUser = { id: scribe.id, email: scribe.email, displayName: scribe.displayName, role: scribe.role, sessionId: scribes.id };
    const scribeToken = signAccessToken(scribesAuth);

    const response = await fetch(`${baseUrl}/api/treasury/overview`, {
      headers: { Authorization: `Bearer ${scribeToken}` }
    });
    assert.equal(response.status, 403);
  } finally {
    server.close();
    await prisma.user.delete({ where: { id: scribe.id } }).catch(() => undefined);
  }
});

test("treasury overview API returns data for KING", async () => {
  await withTestServer(async (baseUrl, token) => {
    const response = await fetch(`${baseUrl}/api/treasury/overview`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.ok(typeof body.costToday === "number");
    assert.ok(typeof body.budgetStatus === "object");
  });
});
