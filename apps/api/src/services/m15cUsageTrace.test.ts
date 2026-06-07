import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { createApp } from "../app.js";
import { generateWithFallback } from "../ai/generateWithFallback.js";
import { prisma } from "../db/prisma.js";
import { signAccessToken, type AuthUser } from "../middleware/auth.js";
import { getTreasuryUsage } from "./treasuryService.js";
import { processTaskWithGrandVizier } from "./grandVizierOrchestrator.js";
import { addTraceStep, getAIUsageTraceDetails, sanitizePreview } from "./aiUsageTraceService.js";

async function createKing(suffix: string) {
  const user = await prisma.user.create({
    data: {
      email: `m15c-trace-${suffix}@aikingdom.local`,
      displayName: "M15C Trace King",
      passwordHash: "test",
      role: "KING"
    }
  });
  const session = await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: `m15c-trace-token-${suffix}`,
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

async function cleanupTaskTrace(taskId: string, userId: string) {
  const traces = await prisma.aIUsageTrace.findMany({ where: { taskId }, select: { traceId: true } });
  if (traces.length > 0) {
    await prisma.aIUsageTraceStep.deleteMany({ where: { traceId: { in: traces.map((t) => t.traceId) } } });
  }
  await prisma.agentActivity.deleteMany({ where: { taskId } });
  await prisma.usageRecord.deleteMany({ where: { taskId } });
  await prisma.aIUsageTrace.deleteMany({ where: { taskId } });
  await prisma.report.deleteMany({ where: { sourceTaskId: taskId } });
  await prisma.councilSession.deleteMany({ where: { taskId } });
  await prisma.task.deleteMany({ where: { id: taskId } });
  await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
}

test("Final counsel and council agent responses create trusted AIUsageTrace records", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const { user } = await createKing(suffix);
  const setting = await prisma.setting.findUniqueOrThrow({ where: { key: "AUTO_GENERATE_REPORTS" } });
  const task = await prisma.task.create({
    data: {
      createdBy: user.id,
      title: "Trace audit task",
      command: "Plan a concise traceable council response for audit.",
      mode: "ASK",
      status: "PENDING"
    }
  });

  try {
    await prisma.setting.update({ where: { key: setting.key }, data: { value: "false" } });
    const session = await processTaskWithGrandVizier(task.id, user.id);
    const traces = await prisma.aIUsageTrace.findMany({ where: { taskId: task.id }, orderBy: { createdAt: "asc" } });
    const finalTrace = traces.find((trace) => trace.sourceType === "FINAL_COUNSEL");
    const responseTrace = traces.find((trace) => trace.sourceType === "AGENT_RESPONSE");

    assert.ok(finalTrace, "final counsel trace exists");
    assert.equal(finalTrace.status, "COMPLETED");
    assert.equal(finalTrace.actorUserId, user.id);
    assert.equal(finalTrace.taskId, task.id);
    assert.equal(finalTrace.councilSessionId, session.id);
    assert.equal(finalTrace.operation, "final_counsel");
    assert.equal((finalTrace.metadata as { attributionStatus?: string } | null)?.attributionStatus, "TRUSTED");

    assert.ok(responseTrace, "agent response trace exists");
    assert.equal(responseTrace.taskId, task.id);
    assert.equal(responseTrace.councilSessionId, session.id);
    assert.ok(responseTrace.agentId);
    assert.equal(responseTrace.operation, "council_agent_response");

    const responseUsage = await prisma.usageRecord.findFirstOrThrow({ where: { traceId: responseTrace.traceId } });
    const responseActivity = await prisma.agentActivity.findFirstOrThrow({ where: { traceId: responseTrace.traceId } });
    assert.equal(responseUsage.attributionStatus, "TRUSTED");
    assert.equal(responseActivity.attributionStatus, "TRUSTED");
    assert.equal(responseActivity.usageRecordId, responseUsage.id);
  } finally {
    await prisma.setting.update({ where: { key: setting.key }, data: { value: setting.value } });
    await cleanupTaskTrace(task.id, user.id);
  }
});

test("Council processing creates AIUsageTraceStep records", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const { user } = await createKing(suffix);
  const setting = await prisma.setting.findUniqueOrThrow({ where: { key: "AUTO_GENERATE_REPORTS" } });
  const task = await prisma.task.create({
    data: {
      createdBy: user.id,
      title: "Step trace task",
      command: "Test council steps.",
      mode: "ASK",
      status: "PENDING"
    }
  });

  try {
    await prisma.setting.update({ where: { key: setting.key }, data: { value: "false" } });
    await processTaskWithGrandVizier(task.id, user.id);

    const traces = await prisma.aIUsageTrace.findMany({ where: { taskId: task.id }, orderBy: { createdAt: "asc" } });
    assert.ok(traces.length >= 2, "at least 2 traces (agent + final counsel)");

    const agentTrace = traces.find((t) => t.sourceType === "AGENT_RESPONSE");
    assert.ok(agentTrace, "agent response trace exists");
    const agentSteps = await prisma.aIUsageTraceStep.findMany({
      where: { traceId: agentTrace.traceId },
      orderBy: { sequence: "asc" }
    });
    assert.ok(agentSteps.length >= 3, `agent trace has at least 3 steps, got ${agentSteps.length}`);

    const providerCallStep = agentSteps.find((s) => s.stepType === "PROVIDER_CALL");
    assert.ok(providerCallStep, "has PROVIDER_CALL step");
    assert.equal(providerCallStep.status, "COMPLETED");

    const usageRecordedStep = agentSteps.find((s) => s.stepType === "USAGE_RECORDED");
    assert.ok(usageRecordedStep, "has USAGE_RECORDED step");
    assert.ok(usageRecordedStep.usageRecordId, "USAGE_RECORDED step links to UsageRecord");

    const agentResponseStep = agentSteps.find((s) => s.stepType === "AGENT_RESPONSE");
    assert.ok(agentResponseStep, "has AGENT_RESPONSE step");

    const traceCompletedStep = agentSteps.find((s) => s.stepType === "TRACE_COMPLETED");
    assert.ok(traceCompletedStep, "has TRACE_COMPLETED step");

    const finalTrace = traces.find((t) => t.sourceType === "FINAL_COUNSEL");
    assert.ok(finalTrace, "final counsel trace exists");
    const finalSteps = await prisma.aIUsageTraceStep.findMany({
      where: { traceId: finalTrace.traceId },
      orderBy: { sequence: "asc" }
    });
    assert.ok(finalSteps.length >= 3, `final trace has at least 3 steps, got ${finalSteps.length}`);

    const finalCounselStep = finalSteps.find((s) => s.stepType === "FINAL_COUNSEL");
    assert.ok(finalCounselStep, "has FINAL_COUNSEL step");
    assert.equal(finalCounselStep.status, "COMPLETED");

    const finalUsageStep = finalSteps.find((s) => s.stepType === "USAGE_RECORDED");
    assert.ok(finalUsageStep, "final trace has USAGE_RECORDED step");
  } finally {
    await prisma.setting.update({ where: { key: setting.key }, data: { value: setting.value } });
    await cleanupTaskTrace(task.id, user.id);
  }
});

test("getTraceDetail returns ordered steps and totals", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const { user } = await createKing(suffix);
  const setting = await prisma.setting.findUniqueOrThrow({ where: { key: "AUTO_GENERATE_REPORTS" } });
  const task = await prisma.task.create({
    data: {
      createdBy: user.id,
      title: "Detail trace task",
      command: "Test trace detail with steps.",
      mode: "ASK",
      status: "PENDING"
    }
  });

  try {
    await prisma.setting.update({ where: { key: setting.key }, data: { value: "false" } });
    await processTaskWithGrandVizier(task.id, user.id);

    const traces = await prisma.aIUsageTrace.findMany({ where: { taskId: task.id } });
    const agentTrace = traces.find((t) => t.sourceType === "AGENT_RESPONSE");
    assert.ok(agentTrace);

    const detail = await getAIUsageTraceDetails(agentTrace.traceId);
    assert.ok(detail, "detail returned");
    assert.equal(detail.hasTimelineSteps, true);
    assert.ok(detail.steps.length > 0, "steps array not empty");
    assert.ok(detail.totals.totalTokens >= 0, "totals.totalTokens computed");
    assert.ok(detail.totals.usageRecordCount > 0, "totals.usageRecordCount > 0");

    for (let i = 1; i < detail.steps.length; i++) {
      assert.ok(detail.steps[i]!.sequence >= detail.steps[i - 1]!.sequence, "steps ordered by sequence");
    }
  } finally {
    await prisma.setting.update({ where: { key: setting.key }, data: { value: setting.value } });
    await cleanupTaskTrace(task.id, user.id);
  }
});

test("Legacy trace without steps returns hasTimelineSteps: false", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const { user } = await createKing(suffix);
  const trace = await prisma.aIUsageTrace.create({
    data: {
      traceId: `legacy-no-steps-${suffix}`,
      actorUserId: user.id,
      actorRole: user.role,
      triggerType: "MANUAL_TEST",
      sourceType: "MANUAL_TEST",
      sourceId: suffix,
      operation: "legacy_test",
      purpose: "Legacy trace test",
      status: "COMPLETED"
    }
  });

  try {
    const detail = await getAIUsageTraceDetails(trace.traceId);
    assert.ok(detail, "detail returned");
    assert.equal(detail.hasTimelineSteps, false);
    assert.deepEqual(detail.steps, []);
  } finally {
    await prisma.aIUsageTrace.deleteMany({ where: { traceId: trace.traceId } });
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("Sanitizer redacts secrets in step previews", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const trace = await prisma.aIUsageTrace.create({
    data: {
      traceId: `step-sanitize-${suffix}`,
      actorRole: "KING",
      triggerType: "MANUAL_TEST",
      sourceType: "MANUAL_TEST",
      sourceId: suffix,
      operation: "sanitize_test",
      purpose: "Sanitize test",
      status: "COMPLETED"
    }
  });

  try {
    const step = await addTraceStep({
      traceId: trace.traceId,
      stepType: "PROVIDER_CALL",
      operation: "sanitize_test",
      title: "Sanitize test step",
      promptPreview: "api_key=my-super-secret Bearer sk-1234567890abcdef",
      responsePreview: "password=hunter2 response"
    });

    assert.ok(step.id);
    assert.ok(!step.promptPreview?.includes("my-super-secret"), "secret redacted from prompt");
    assert.ok(!step.promptPreview?.includes("sk-1234567890abcdef"), "API key redacted from prompt");
    assert.ok(!step.responsePreview?.includes("hunter2"), "password redacted from response");
  } finally {
    await prisma.aIUsageTraceStep.deleteMany({ where: { traceId: trace.traceId } });
    await prisma.aIUsageTrace.deleteMany({ where: { traceId: trace.traceId } });
  }
});

test("Provider test creates trusted trace and safe usage record", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const { user, token } = await createKing(suffix);
  let traceId: string | null = null;
  try {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/providers/mock/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ prompt: "Bearer secret-token sk-1234567890abcdef password=hunter2 readiness test" })
      });
      const body = await response.json() as { traceId: string; usageRecordId: string };
      assert.equal(response.status, 200);
      traceId = body.traceId;

      const trace = await prisma.aIUsageTrace.findUniqueOrThrow({ where: { traceId } });
      const usage = await prisma.usageRecord.findUniqueOrThrow({ where: { id: body.usageRecordId } });
      assert.equal(trace.triggerType, "PROVIDER_TEST");
      assert.equal(trace.sourceType, "PROVIDER_TEST");
      assert.equal(trace.actorUserId, user.id);
      assert.equal(usage.attributionStatus, "TRUSTED");
      assert.equal(usage.traceId, traceId);
      assert.equal(JSON.stringify(trace).includes("secret-token"), false);
      assert.equal(JSON.stringify(usage).includes("sk-1234567890abcdef"), false);
      assert.equal(JSON.stringify(usage).includes("hunter2"), false);
    });
  } finally {
    if (traceId) {
      await prisma.aIUsageTraceStep.deleteMany({ where: { traceId } });
      await prisma.usageRecord.deleteMany({ where: { traceId } });
      await prisma.aIUsageTrace.deleteMany({ where: { traceId } });
    }
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("Provider test route creates timeline steps", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const { user, token } = await createKing(suffix);
  let traceId: string | null = null;
  try {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/providers/mock/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ prompt: "Test step creation" })
      });
      const body = await response.json() as { traceId: string };
      assert.equal(response.status, 200);
      traceId = body.traceId;

      const steps = await prisma.aIUsageTraceStep.findMany({
        where: { traceId },
        orderBy: { sequence: "asc" }
      });
      assert.ok(steps.length >= 3, `provider test has at least 3 steps, got ${steps.length}`);

      const providerStep = steps.find((s) => s.stepType === "PROVIDER_CALL");
      assert.ok(providerStep, "has PROVIDER_CALL step");
      assert.equal(providerStep.status, "COMPLETED");

      const usageStep = steps.find((s) => s.stepType === "USAGE_RECORDED");
      assert.ok(usageStep, "has USAGE_RECORDED step");
      assert.ok(usageStep.usageRecordId, "USAGE_RECORDED links to record");

      const completedStep = steps.find((s) => s.stepType === "TRACE_COMPLETED");
      assert.ok(completedStep, "has TRACE_COMPLETED step");
    });
  } finally {
    if (traceId) {
      await prisma.aIUsageTraceStep.deleteMany({ where: { traceId } });
      await prisma.usageRecord.deleteMany({ where: { traceId } });
      await prisma.aIUsageTrace.deleteMany({ where: { traceId } });
    }
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("usage trace detail endpoint returns steps and totals", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const { user, token } = await createKing(suffix);
  const trace = await prisma.aIUsageTrace.create({
    data: {
      traceId: `trace-detail-${suffix}`,
      actorUserId: user.id,
      actorRole: user.role,
      triggerType: "MANUAL_TEST",
      sourceType: "MANUAL_TEST",
      sourceId: suffix,
      operation: "trace_detail_test",
      purpose: "Trace detail test",
      status: "COMPLETED",
      promptPreview: sanitizePreview("api_key=secret-value prompt"),
      responsePreview: "safe response"
    }
  });
  const usage = await prisma.usageRecord.create({
    data: {
      traceId: trace.traceId,
      attributionStatus: "TRUSTED",
      provider: "mock",
      providerId: "mock",
      model: "deterministic-mock-v1",
      promptTokens: 1,
      completionTokens: 1,
      totalTokens: 2,
      estimatedCostUSD: 0,
      estimatedCostLocal: 0,
      currency: "USD",
      purpose: "Trace detail test",
      sourceType: "MANUAL_TEST",
      sourceId: suffix,
      operation: "trace_detail_test"
    }
  });

  try {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/usage-traces/${trace.traceId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const body = await response.json() as { trace: { traceId: string; promptPreview: string }; usageRecords: Array<{ id: string }>; hasTimelineSteps: boolean; totals: { totalTokens: number } };
      assert.equal(response.status, 200);
      assert.equal(body.trace.traceId, trace.traceId);
      assert.equal(body.usageRecords[0]?.id, usage.id);
      assert.equal(JSON.stringify(body).includes("secret-value"), false);
      assert.equal(body.hasTimelineSteps, false);
      assert.equal(body.totals.totalTokens, 2);
    });
  } finally {
    await prisma.usageRecord.deleteMany({ where: { traceId: trace.traceId } });
    await prisma.aIUsageTrace.deleteMany({ where: { traceId: trace.traceId } });
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("Treasury usage returns attribution fields and legacy rows remain clearly unattributed", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const record = await prisma.usageRecord.create({
    data: {
      provider: "mock",
      providerId: "mock",
      model: "deterministic-mock-v1",
      promptTokens: 3,
      completionTokens: 4,
      totalTokens: 7,
      estimatedCostUSD: 0,
      estimatedCostLocal: 0,
      currency: "USD",
      purpose: "Legacy row test",
      sourceType: "LEGACY",
      sourceId: suffix,
      operation: "legacy_row_test"
    }
  });

  try {
    const records = await getTreasuryUsage(20);
    const row = records.find((item) => item.id === record.id);
    assert.ok(row);
    assert.equal(row.attributionStatus, "LEGACY_UNATTRIBUTED");
    assert.equal(row.traceId, null);
    assert.equal(row.triggerType, "LEGACY");
  } finally {
    await prisma.usageRecord.delete({ where: { id: record.id } }).catch(() => undefined);
  }
});

test("New provider calls without trace context are rejected", async () => {
  await assert.rejects(
    () => generateWithFallback({
      name: "mock",
      model: "deterministic-mock-v1",
      async generateAgentResponse() {
        return {
          response: "ok",
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }
        };
      }
    }, {
      command: "Unattributed call",
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
