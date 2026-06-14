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

test("Royal Command council creates role-specific responses and a learning candidate without automation", async () => {
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
    assert.match(session.responses.find((response) => response.role === "Royal Archivist")?.response ?? "", /Archivist Evidence Report/);
    assert.match(session.responses.find((response) => response.role === "Royal Researcher")?.response ?? "", /Researcher Hypotheses/);
    assert.match(session.responses.find((response) => response.role === "Royal Architect")?.response ?? "", /Architect Patch Plan/);
    assert.match(session.responses.find((response) => response.role === "Royal General")?.response ?? "", /General Execution Checklist/);
    assert.match(session.finalSummary ?? "", /Grand Vizier Final Decision/);
    assert.match(session.finalSummary ?? "", /Architect|General|Archivist|Researcher/);

    const report = await prisma.report.findFirst({ where: { sourceCouncilSessionId: session.id } });
    assert.ok(report, "final synthesis is persisted as a report");

    const candidate = await prisma.agentKnowledgeCandidate.findFirst({
      where: { councilSessionId: session.id, sourceType: "COUNCIL_SESSION" }
    });
    assert.ok(candidate, "learning candidate is created");
    assert.equal(candidate.status, "PENDING");
    assert.match(candidate.content, /Failure pattern:/);
    assert.match(candidate.content, /Evidence:/);
    assert.match(candidate.content, /Lesson:/);
    assert.match(candidate.content, /Recommended future behavior:/);

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
