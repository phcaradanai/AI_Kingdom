import assert from "node:assert/strict";
import test from "node:test";
import { prisma } from "../db/prisma.js";
import { processTaskWithGrandVizier } from "./grandVizierOrchestrator.js";

async function cleanup(taskId: string, userId: string) {
  const traces = await prisma.aIUsageTrace.findMany({ where: { taskId }, select: { traceId: true } });
  const sessions = await prisma.councilSession.findMany({ where: { taskId }, select: { id: true } });
  if (traces.length > 0) {
    await prisma.aIUsageTraceStep.deleteMany({ where: { traceId: { in: traces.map((trace) => trace.traceId) } } });
  }
  if (sessions.length > 0) {
    await prisma.treasuryLedger.deleteMany({ where: { source: { in: sessions.map((session) => `council:${session.id}`) } } }).catch(() => undefined);
  }
  await prisma.agentKnowledgeCandidate.deleteMany({ where: { taskId } });
  await prisma.agentActivity.deleteMany({ where: { taskId } });
  await prisma.usageRecord.deleteMany({ where: { taskId } });
  await prisma.aIUsageTrace.deleteMany({ where: { taskId } });
  await prisma.memory.deleteMany({ where: { sourceTaskId: taskId } });
  await prisma.report.deleteMany({ where: { sourceTaskId: taskId } });
  await prisma.councilSession.deleteMany({ where: { taskId } });
  await prisma.task.deleteMany({ where: { id: taskId } });
  await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
}

test("Royal Command council creates role-specific responses and a report without automation", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const user = await prisma.user.create({
    data: {
      email: `m17f-role-council-${suffix}@aikingdom.local`,
      displayName: "M17F King",
      passwordHash: "test",
      role: "KING"
    }
  });
  const reportSetting = await prisma.setting.findUniqueOrThrow({ where: { key: "AUTO_GENERATE_REPORTS" } });
  const memorySetting = await prisma.setting.findUniqueOrThrow({ where: { key: "AUTO_SAVE_MEMORY" } });
  const task = await prisma.task.create({
    data: {
      createdBy: user.id,
      title: "Diagnose final API failure",
      command: "Diagnose the final M17E-2 API test failure and prepare an external-agent handoff.",
      mode: "PLAN",
      status: "PENDING"
    }
  });

  try {
    await prisma.setting.update({ where: { key: reportSetting.key }, data: { value: "true" } });
    await prisma.setting.update({ where: { key: memorySetting.key }, data: { value: "false" } });

    const session = await processTaskWithGrandVizier(task.id, user.id);
    const roles = session.responses.map((response) => response.role);

    assert.equal(session.status, "COMPLETED");
    assert.deepEqual(roles, [
      "Royal Archivist",
      "Royal Researcher",
      "Royal Architect",
      "Royal General",
      "Grand Vizier"
    ]);
    assert.ok(session.responses.find((r) => r.role === "Royal Archivist")?.response, "Archivist response is non-empty");
    assert.ok(session.responses.find((r) => r.role === "Royal Researcher")?.response, "Researcher response is non-empty");
    assert.ok(session.responses.find((r) => r.role === "Royal Architect")?.response, "Architect response is non-empty");
    assert.ok(session.responses.find((r) => r.role === "Royal General")?.response, "General response is non-empty");
    assert.ok(session.finalSummary, "Grand Vizier final summary is non-empty");

    const report = await prisma.report.findFirst({ where: { sourceCouncilSessionId: session.id } });
    assert.ok(report, "final synthesis is persisted as a report");

    // COUNCIL_SYNTHESIS_CAPTURE is OFF by default (gated off — it produced circular
    // low-signal content). No COUNCIL_SESSION candidate expected unless the setting is
    // explicitly enabled. The learning loop feeds via CAPTURE_LESSONS_FROM_REVIEWS instead.

    const automationJobs = await prisma.automationJob.count({
      where: { workOrder: { sourceType: "COUNCIL_SESSION", sourceId: session.id } }
    });
    assert.equal(automationJobs, 0);
  } finally {
    await prisma.setting.update({ where: { key: reportSetting.key }, data: { value: reportSetting.value } });
    await prisma.setting.update({ where: { key: memorySetting.key }, data: { value: memorySetting.value } });
    await cleanup(task.id, user.id);
  }
});
