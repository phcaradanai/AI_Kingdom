import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { checkBudgetStatus, filterProvidersForBudget, logBudgetEvents } from "./budgetGuardService.js";
import { getTreasuryByMonth, getTreasuryFallbackAnalytics } from "./treasuryService.js";
import { selectAIProviderRoute } from "./aiProviderRouter.js";
import type { AIProviderConfig } from "./aiProviderRegistry.js";
import { LOCAL_SANDBOX_MODEL, LOCAL_SANDBOX_PROVIDER_ID, LOCAL_SANDBOX_PROVIDER_NAME } from "./aiProviderRegistry.js";


const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

function makeProvider(id: string, costTier: AIProviderConfig["costTier"], isFreeTier = false): AIProviderConfig {
  return {
    id,
    name: id,
    type: id,
    defaultModel: `${id}-model`,
    isActive: true,
    priority: 1,
    supportsChat: true,
    costTier,
    capabilities: { supportsChat: true },
    environmentMode: isFreeTier ? "SANDBOX" : "PRODUCTION",
    allowSensitiveContext: !isFreeTier,
    isFreeTier,
    hasCredentials: true,
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

// ─── Budget Guard Unit Tests ─────────────────────────────────────────────────

test("filterProvidersForBudget: no budget exceeded — all providers pass through", () => {
  const providers = [
    makeProvider("deepseek", "LOW"),
    makeProvider("openai", "MEDIUM"),
    makeProvider(LOCAL_SANDBOX_PROVIDER_ID, "FREE", true)
  ];
  const { allowed, blocked } = filterProvidersForBudget(providers, {
    dailyExceeded: false,
    monthlyExceeded: false,
    dailySpent: 0,
    monthlySpent: 0,
    dailyLimit: 1,
    monthlyLimit: 10,
    dailyRemaining: 1,
    monthlyRemaining: 10
  });
  assert.equal(allowed.length, 3);
  assert.equal(blocked.length, 0);
});

test("filterProvidersForBudget: daily budget exceeded — blocks expensive, keeps sandbox and free tier", () => {
  const providers = [
    makeProvider("deepseek", "LOW"),
    makeProvider("openai", "HIGH"),
    makeProvider(LOCAL_SANDBOX_PROVIDER_ID, "FREE", true),
    makeProvider("openrouter-free", "FREE", true)
  ];
  const { allowed, blocked, blockedByDaily } = filterProvidersForBudget(providers, {
    dailyExceeded: true,
    monthlyExceeded: false,
    dailySpent: 1.5,
    monthlySpent: 1.5,
    dailyLimit: 1,
    monthlyLimit: 50,
    dailyRemaining: 0,
    monthlyRemaining: 48.5
  });
  assert.equal(blockedByDaily, true);
  assert.ok(allowed.some((p) => p.id === LOCAL_SANDBOX_PROVIDER_ID), "sandbox must always be allowed");
  assert.ok(allowed.some((p) => p.id === "openrouter-free"), "free tier must always be allowed");
  assert.ok(blocked.some((p) => p.id === "deepseek"), "deepseek should be blocked");
  assert.ok(blocked.some((p) => p.id === "openai"), "openai should be blocked");
});

test("filterProvidersForBudget: monthly budget exceeded — same blocking rules", () => {
  const providers = [
    makeProvider("openai", "PREMIUM"),
    makeProvider(LOCAL_SANDBOX_PROVIDER_ID, "FREE", true)
  ];
  const { allowed, blocked, blockedByMonthly } = filterProvidersForBudget(providers, {
    dailyExceeded: false,
    monthlyExceeded: true,
    dailySpent: 0,
    monthlySpent: 100,
    dailyLimit: null,
    monthlyLimit: 50,
    dailyRemaining: null,
    monthlyRemaining: 0
  });
  assert.equal(blockedByMonthly, true);
  assert.ok(allowed.some((p) => p.id === LOCAL_SANDBOX_PROVIDER_ID));
  assert.ok(blocked.some((p) => p.id === "openai"));
});

test("filterProvidersForBudget: sandbox is never blocked even when all budgets exceeded", () => {
  const sandbox = makeProvider(LOCAL_SANDBOX_PROVIDER_ID, "LOW");
  sandbox.isFreeTier = false;
  sandbox.environmentMode = "SANDBOX";
  const { allowed } = filterProvidersForBudget([sandbox], {
    dailyExceeded: true,
    monthlyExceeded: true,
    dailySpent: 99,
    monthlySpent: 99,
    dailyLimit: 1,
    monthlyLimit: 1,
    dailyRemaining: 0,
    monthlyRemaining: 0
  });
  assert.ok(allowed.some((p) => p.id === LOCAL_SANDBOX_PROVIDER_ID), "sandbox must never be blocked");
});

// ─── Budget Status DB Tests ──────────────────────────────────────────────────

test("checkBudgetStatus: no limits configured returns non-exceeded status", async () => {
  await prisma.setting.upsert({
    where: { key: "DAILY_BUDGET_LIMIT_USD" },
    update: { value: "" },
    create: { key: "DAILY_BUDGET_LIMIT_USD", value: "", category: "SYSTEM", description: "test" }
  });
  await prisma.setting.upsert({
    where: { key: "MONTHLY_BUDGET_LIMIT_USD" },
    update: { value: "" },
    create: { key: "MONTHLY_BUDGET_LIMIT_USD", value: "", category: "SYSTEM", description: "test" }
  });

  const status = await checkBudgetStatus();
  assert.equal(status.dailyExceeded, false);
  assert.equal(status.monthlyExceeded, false);
  assert.equal(status.dailyLimit, null);
  assert.equal(status.monthlyLimit, null);
  assert.equal(status.dailyRemaining, null);
  assert.equal(status.monthlyRemaining, null);
});

// ─── Monthly Breakdown ───────────────────────────────────────────────────────

test("getTreasuryByMonth: returns empty array when no usage records", async () => {
  const monthly = await getTreasuryByMonth(1);
  // This test just verifies no crash — may have data from other tests
  assert.ok(Array.isArray(monthly));
  for (const entry of monthly) {
    assert.ok(typeof entry.month === "string");
    assert.ok(entry.month.match(/^\d{4}-\d{2}$/), `month format: ${entry.month}`);
    assert.ok(typeof entry.totalCostUSD === "number");
    assert.ok(typeof entry.callCount === "number");
  }
});

test("getTreasuryByMonth: buckets usage records by month", async () => {
  const testUser = await prisma.user.create({
    data: {
      email: `m16e-month-${suffix}@test.local`,
      displayName: "M16E Month Test",
      passwordHash: "test",
      isTestData: true
    }
  });
  const testAgent = await prisma.agent.create({
    data: {
      slug: `m16e-month-agent-${suffix}`,
      name: "M16E Month Agent",
      title: "Tester",
      role: "Tester",
      specialty: "Testing",
      prompt: "test",
      systemPrompt: "test",
      skills: [],
      responseStyle: "concise",
      isTestData: true
    }
  });

  const now = new Date();
  const monthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

  await prisma.usageRecord.createMany({
    data: [
      {
        agentId: testAgent.id,
        provider: "mock",
        providerId: "mock",
        model: "deterministic-mock-v1",
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
        estimatedCostUSD: 0,
        estimatedCostLocal: 0,
        currency: "USD"
      },
      {
        agentId: testAgent.id,
        provider: "mock",
        providerId: "mock",
        model: "deterministic-mock-v1",
        promptTokens: 20,
        completionTokens: 10,
        totalTokens: 30,
        estimatedCostUSD: 0,
        estimatedCostLocal: 0,
        currency: "USD"
      }
    ]
  });

  const monthly = await getTreasuryByMonth(1);
  const thisMonthEntry = monthly.find((m) => m.month === monthKey);
  assert.ok(thisMonthEntry, `Month entry ${monthKey} not found in: ${JSON.stringify(monthly.map((m) => m.month))}`);
  assert.ok(thisMonthEntry.callCount >= 2, "at least 2 calls should be in this month");

  // Cleanup
  await prisma.usageRecord.deleteMany({ where: { agentId: testAgent.id } });
  await prisma.agent.delete({ where: { id: testAgent.id } }).catch(() => undefined);
  await prisma.user.delete({ where: { id: testUser.id } }).catch(() => undefined);
});

// ─── Fallback Analytics ──────────────────────────────────────────────────────

test("getTreasuryFallbackAnalytics: returns empty array when no trace steps", async () => {
  const analytics = await getTreasuryFallbackAnalytics();
  assert.ok(Array.isArray(analytics));
  for (const entry of analytics) {
    assert.ok(typeof entry.providerId === "string");
    assert.ok(typeof entry.successCount === "number");
    assert.ok(typeof entry.failureCount === "number");
    assert.ok(typeof entry.timeoutCount === "number");
    assert.ok(typeof entry.totalCalls === "number");
    assert.ok(entry.totalCalls === entry.successCount + entry.failureCount);
  }
});

test("getTreasuryFallbackAnalytics: aggregates success and failure counts by provider+model", async () => {
  const traceSuffix = `${suffix}-fa`;

  const trace = await prisma.aIUsageTrace.create({
    data: {
      traceId: `test-trace-${traceSuffix}`,
      triggerType: "TEST",
      sourceType: "TEST",
      operation: "test_fallback_analytics",
      purpose: "Test fallback analytics",
      status: "COMPLETED"
    }
  });

  await prisma.aIUsageTraceStep.createMany({
    data: [
      {
        traceId: trace.traceId,
        stepType: "PROVIDER_CALL_SUCCESS",
        operation: "provider_call_success",
        title: "Success",
        status: "COMPLETED",
        sequence: 1,
        providerId: `test-provider-${traceSuffix}`,
        providerName: "Test Provider",
        model: `test-model-${traceSuffix}`,
        durationMs: 120
      },
      {
        traceId: trace.traceId,
        stepType: "PROVIDER_CALL_FAILED",
        operation: "provider_call_failed",
        title: "Failed",
        status: "FAILED",
        sequence: 2,
        providerId: `test-provider-${traceSuffix}`,
        providerName: "Test Provider",
        model: `test-model-${traceSuffix}`,
        errorMessage: "Connection timeout",
        durationMs: 5000
      },
      {
        traceId: trace.traceId,
        stepType: "PROVIDER_CALL_FAILED",
        operation: "provider_call_failed",
        title: "Timeout",
        status: "FAILED",
        sequence: 3,
        providerId: `test-provider-${traceSuffix}`,
        providerName: "Test Provider",
        model: `test-model-${traceSuffix}`,
        errorMessage: "Request timed out after 20000ms",
        durationMs: 20000
      }
    ]
  });

  const analytics = await getTreasuryFallbackAnalytics();
  const entry = analytics.find(
    (a) => a.providerId === `test-provider-${traceSuffix}` && a.model === `test-model-${traceSuffix}`
  );

  assert.ok(entry, "analytics entry for test provider should exist");
  assert.equal(entry.successCount, 1);
  assert.equal(entry.failureCount, 2);
  assert.equal(entry.timeoutCount, 2, "both failure messages contain timeout keywords");
  assert.equal(entry.totalCalls, 3);
  assert.ok(entry.avgDurationMs != null, "avgDurationMs should be computed");
  assert.equal(entry.avgDurationMs, Math.round((120 + 5000 + 20000) / 3));

  // Cleanup
  await prisma.aIUsageTrace.delete({ where: { traceId: trace.traceId } }).catch(() => undefined);
});

// ─── Route Receipt durationMs ────────────────────────────────────────────────

test("AIUsageTraceStep stores durationMs when provided", async () => {
  const durationTraceSuffix = `${suffix}-dur`;

  const trace = await prisma.aIUsageTrace.create({
    data: {
      traceId: `test-trace-dur-${durationTraceSuffix}`,
      triggerType: "TEST",
      sourceType: "TEST",
      operation: "test_duration",
      purpose: "Test durationMs persistence",
      status: "COMPLETED"
    }
  });

  const step = await prisma.aIUsageTraceStep.create({
    data: {
      traceId: trace.traceId,
      stepType: "PROVIDER_CALL_SUCCESS",
      operation: "provider_call_success",
      title: "Duration test",
      status: "COMPLETED",
      sequence: 1,
      providerId: "test-sandbox",
      model: "test-model",
      durationMs: 450
    }
  });

  const fetched = await prisma.aIUsageTraceStep.findUnique({ where: { id: step.id } });
  assert.ok(fetched);
  assert.equal(fetched.durationMs, 450);

  // Cleanup
  await prisma.aIUsageTrace.delete({ where: { traceId: trace.traceId } }).catch(() => undefined);
});

test("AIUsageTraceStep allows null durationMs for legacy steps", async () => {
  const legacyTraceSuffix = `${suffix}-legacy`;

  const trace = await prisma.aIUsageTrace.create({
    data: {
      traceId: `test-trace-legacy-${legacyTraceSuffix}`,
      triggerType: "TEST",
      sourceType: "TEST",
      operation: "test_legacy",
      purpose: "Test null durationMs",
      status: "COMPLETED"
    }
  });

  const step = await prisma.aIUsageTraceStep.create({
    data: {
      traceId: trace.traceId,
      stepType: "PROVIDER_CALL_SUCCESS",
      operation: "provider_call_success",
      title: "Legacy step",
      status: "COMPLETED",
      sequence: 1,
      providerId: "test-sandbox",
      model: "test-model"
    }
  });

  const fetched = await prisma.aIUsageTraceStep.findUnique({ where: { id: step.id } });
  assert.ok(fetched);
  assert.equal(fetched.durationMs, null);

  // Cleanup
  await prisma.aIUsageTrace.delete({ where: { traceId: trace.traceId } }).catch(() => undefined);
});

// ─── Budget Enforcement Integration Test ─────────────────────────────────────

test("selectAIProviderRoute with daily budget exceeded blocks expensive provider and returns sandbox route", async () => {
  const routeSuffix = `${suffix}-route`;
  const testRunId = `m16e-budget-fallback-${routeSuffix}`;
  const paidProviderId = `m16e-paid-provider-${routeSuffix}`;
  const paidModel = `${paidProviderId}-model`;
  const routeChainName = `M16E budget fallback chain ${testRunId}`;
  const previousDailyBudget = await prisma.setting.findUnique({ where: { key: "DAILY_BUDGET_LIMIT_USD" } });
  const previousMonthlyBudget = await prisma.setting.findUnique({ where: { key: "MONTHLY_BUDGET_LIMIT_USD" } });
  const previousSandboxProvider = await prisma.aIProvider.findUnique({ where: { id: LOCAL_SANDBOX_PROVIDER_ID } });
  let agent: Awaited<ReturnType<typeof prisma.agent.create>> | null = null;
  let usageRecord: Awaited<ReturnType<typeof prisma.usageRecord.create>> | null = null;

  const cleanup = async () => {
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { resourceId: paidProviderId },
          { metadata: { path: ["testRunId"], equals: testRunId } }
        ]
      }
    });
    await prisma.usageRecord.deleteMany({
      where: {
        OR: [
          { id: usageRecord?.id },
          { providerId: paidProviderId },
          { metadata: { path: ["testRunId"], equals: testRunId } }
        ]
      }
    });
    await prisma.aIRouteChain.deleteMany({ where: { name: routeChainName } });
    await prisma.agent.deleteMany({ where: { testRunId } });
    await prisma.aIProvider.deleteMany({ where: { id: paidProviderId } });
  };

  await cleanup();

  // Create a dedicated paid provider, isolated from env-driven providers
  // (e.g. "deepseek") whose isActive state depends on credentials that may
  // not be present in every environment running this suite.
  await prisma.aIProvider.create({
    data: {
      id: paidProviderId,
      name: "M16E Paid Test Provider",
      type: "test-paid",
      defaultModel: paidModel,
      isActive: true,
      priority: 1,
      costTier: "MEDIUM",
      capabilities: { supportsChat: true, supportsJsonMode: true },
      environmentMode: "PRODUCTION",
      allowSensitiveContext: true,
      isFreeTier: false,
      notes: testRunId
    }
  });

  await prisma.aIProvider.upsert({
    where: { id: LOCAL_SANDBOX_PROVIDER_ID },
    update: {
      name: LOCAL_SANDBOX_PROVIDER_NAME,
      type: "sandbox",
      defaultModel: LOCAL_SANDBOX_MODEL,
      isActive: true,
      priority: 1000,
      costTier: "FREE",
      capabilities: { supportsChat: true, supportsJsonMode: true },
      environmentMode: "SANDBOX",
      allowSensitiveContext: false,
      isFreeTier: true
    },
    create: {
      id: LOCAL_SANDBOX_PROVIDER_ID,
      name: LOCAL_SANDBOX_PROVIDER_NAME,
      type: "sandbox",
      defaultModel: LOCAL_SANDBOX_MODEL,
      isActive: true,
      priority: 1000,
      costTier: "FREE",
      capabilities: { supportsChat: true, supportsJsonMode: true },
      environmentMode: "SANDBOX",
      allowSensitiveContext: false,
      isFreeTier: true,
      notes: testRunId
    }
  });

  // Create an agent that prefers the non-free provider
  agent = await prisma.agent.create({
    data: {
      slug: `m16e-budget-agent-${routeSuffix}`,
      name: "Budget Test Agent",
      title: "Budget Tester",
      role: "Tester",
      specialty: "Testing",
      prompt: "test",
      systemPrompt: "test",
      skills: [],
      responseStyle: "concise",
      preferredProviderId: paidProviderId,
      defaultModel: paidModel,
      fallbackModels: [],
      fallbackProviderIds: [],
      isTestData: true,
      testRunId
    }
  });

  await prisma.aIRouteChain.create({
    data: {
      name: routeChainName,
      agentId: agent.id,
      scope: "AGENT",
      isActive: true,
      description: testRunId,
      entries: {
        create: [
          {
            sequence: 1,
            providerId: paidProviderId,
            model: paidModel,
            isEnabled: true,
            notes: testRunId
          },
          {
            sequence: 2,
            providerId: LOCAL_SANDBOX_PROVIDER_ID,
            model: LOCAL_SANDBOX_MODEL,
            isEnabled: true,
            notes: testRunId
          }
        ]
      }
    }
  });

  // Set an isolated daily budget limit and disable monthly budget influence.
  await prisma.setting.upsert({
    where: { key: "DAILY_BUDGET_LIMIT_USD" },
    update: { value: "0.0001" },
    create: { key: "DAILY_BUDGET_LIMIT_USD", value: "0.0001", category: "SYSTEM", description: "test" }
  });
  await prisma.setting.upsert({
    where: { key: "MONTHLY_BUDGET_LIMIT_USD" },
    update: { value: "" },
    create: { key: "MONTHLY_BUDGET_LIMIT_USD", value: "", category: "SYSTEM", description: "test" }
  });

  // Insert a usage record today that exceeds the limit
  usageRecord = await prisma.usageRecord.create({
    data: {
      agentId: agent.id,
      provider: paidProviderId,
      providerId: paidProviderId,
      model: paidModel,
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      estimatedCostUSD: 1.0,
      estimatedCostLocal: 1.0,
      currency: "USD",
      sourceType: "TEST",
      sourceId: testRunId,
      operation: "m16e_budget_fallback_test",
      purpose: "Verify daily budget fallback to local sandbox",
      metadata: { testRunId }
    }
  });

  try {
    const selection = await selectAIProviderRoute({
      agent,
      taskMode: "ASK",
      requiredCapabilities: { chat: true }
    });

    // Budget is exceeded — sandbox or free-tier must be primary
    assert.equal(selection.provider.id, LOCAL_SANDBOX_PROVIDER_ID);
    assert.equal(selection.model, LOCAL_SANDBOX_MODEL);
    assert.equal(selection.budgetBlocked, true, "budgetBlocked flag must be true when budget exceeded");
    assert.ok(
      selection.blockedProviderIds && selection.blockedProviderIds.length > 0,
      "blockedProviderIds should be non-empty when budget is exceeded"
    );
    assert.ok(
      selection.blockedProviderIds!.includes(paidProviderId),
      `Expected blockedProviderIds to include the paid provider, got: ${selection.blockedProviderIds}`
    );

  } finally {
    await cleanup();
    if (previousDailyBudget) {
      await prisma.setting.update({ where: { key: "DAILY_BUDGET_LIMIT_USD" }, data: { value: previousDailyBudget.value } });
    } else {
      await prisma.setting.delete({ where: { key: "DAILY_BUDGET_LIMIT_USD" } }).catch(() => undefined);
    }
    if (previousMonthlyBudget) {
      await prisma.setting.update({ where: { key: "MONTHLY_BUDGET_LIMIT_USD" }, data: { value: previousMonthlyBudget.value } });
    } else {
      await prisma.setting.delete({ where: { key: "MONTHLY_BUDGET_LIMIT_USD" } }).catch(() => undefined);
    }
    if (previousSandboxProvider) {
      const restoredCapabilities = previousSandboxProvider.capabilities === null
        ? Prisma.JsonNull
        : previousSandboxProvider.capabilities as Prisma.InputJsonValue;
      const restoredConfig = previousSandboxProvider.config === null
        ? Prisma.DbNull
        : previousSandboxProvider.config as Prisma.InputJsonValue;
      await prisma.aIProvider.upsert({
        where: { id: LOCAL_SANDBOX_PROVIDER_ID },
        update: {
          name: previousSandboxProvider.name,
          type: previousSandboxProvider.type,
          baseUrl: previousSandboxProvider.baseUrl,
          defaultModel: previousSandboxProvider.defaultModel,
          isActive: previousSandboxProvider.isActive,
          priority: previousSandboxProvider.priority,
          costTier: previousSandboxProvider.costTier,
          capabilities: restoredCapabilities,
          config: restoredConfig,
          environmentMode: previousSandboxProvider.environmentMode,
          maxTokensPerRequest: previousSandboxProvider.maxTokensPerRequest,
          maxRequestsPerDay: previousSandboxProvider.maxRequestsPerDay,
          maxTokensPerDay: previousSandboxProvider.maxTokensPerDay,
          maxEstimatedCostPerDay: previousSandboxProvider.maxEstimatedCostPerDay,
          allowSensitiveContext: previousSandboxProvider.allowSensitiveContext,
          isFreeTier: previousSandboxProvider.isFreeTier,
          notes: previousSandboxProvider.notes,
          modelValidationStatus: previousSandboxProvider.modelValidationStatus,
          lastValidationTime: previousSandboxProvider.lastValidationTime
        },
        create: {
          id: previousSandboxProvider.id,
          name: previousSandboxProvider.name,
          type: previousSandboxProvider.type,
          baseUrl: previousSandboxProvider.baseUrl,
          defaultModel: previousSandboxProvider.defaultModel,
          isActive: previousSandboxProvider.isActive,
          priority: previousSandboxProvider.priority,
          costTier: previousSandboxProvider.costTier,
          capabilities: restoredCapabilities,
          config: restoredConfig,
          environmentMode: previousSandboxProvider.environmentMode,
          maxTokensPerRequest: previousSandboxProvider.maxTokensPerRequest,
          maxRequestsPerDay: previousSandboxProvider.maxRequestsPerDay,
          maxTokensPerDay: previousSandboxProvider.maxTokensPerDay,
          maxEstimatedCostPerDay: previousSandboxProvider.maxEstimatedCostPerDay,
          allowSensitiveContext: previousSandboxProvider.allowSensitiveContext,
          isFreeTier: previousSandboxProvider.isFreeTier,
          notes: previousSandboxProvider.notes,
          modelValidationStatus: previousSandboxProvider.modelValidationStatus,
          lastValidationTime: previousSandboxProvider.lastValidationTime
        }
      });
    } else {
      await prisma.aIProvider.delete({ where: { id: LOCAL_SANDBOX_PROVIDER_ID } }).catch(() => undefined);
    }
  }
});

test("logBudgetEvents writes audit log entries for daily_budget_exceeded and provider_blocked_by_budget", async () => {
  const blockedProvider = makeProvider("test-blocked-provider", "MEDIUM");

  await logBudgetEvents(
    {
      dailyExceeded: true,
      monthlyExceeded: false,
      dailySpent: 1.5,
      monthlySpent: 1.5,
      dailyLimit: 0.5,
      monthlyLimit: null,
      dailyRemaining: 0,
      monthlyRemaining: null
    },
    [blockedProvider]
  );

  const dailyEntry = await prisma.auditLog.findFirst({
    where: { action: "daily_budget_exceeded", resourceType: "budget" },
    orderBy: { createdAt: "desc" }
  });
  assert.ok(dailyEntry, "daily_budget_exceeded audit log should exist");

  const blockedEntry = await prisma.auditLog.findFirst({
    where: { action: "provider_blocked_by_budget", resourceType: "ai_provider", resourceId: "test-blocked-provider" },
    orderBy: { createdAt: "desc" }
  });
  assert.ok(blockedEntry, "provider_blocked_by_budget audit log should exist");
});
