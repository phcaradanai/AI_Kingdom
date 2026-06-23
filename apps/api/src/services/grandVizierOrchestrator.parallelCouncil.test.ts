import assert from "node:assert/strict";
import test from "node:test";
import { prisma } from "../db/prisma.js";
import { processTaskWithGrandVizier } from "./grandVizierOrchestrator.js";

async function cleanup(taskId: string, userId: string) {
  const traces = await prisma.aIUsageTrace.findMany({ where: { taskId }, select: { traceId: true } });
  if (traces.length > 0) {
    await prisma.aIUsageTraceStep.deleteMany({ where: { traceId: { in: traces.map((t) => t.traceId) } } });
  }
  const sessions = await prisma.councilSession.findMany({ where: { taskId }, select: { id: true } });
  if (sessions.length > 0) {
    await prisma.treasuryLedger.deleteMany({ where: { source: { in: sessions.map((s) => `council:${s.id}`) } } }).catch(() => undefined);
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

// Council parallelization: with COUNCIL_PARALLEL_SPECIALISTS on, the four specialists run
// concurrently (so agentResponse.createdAt order is non-deterministic) and the Grand Vizier
// still runs last. This proves the deterministic re-sort keeps the canonical council order
// and that the parallel path produces a complete council + summary.
test("parallel specialists still yield canonical council order and a final summary", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const user = await prisma.user.create({
    data: { email: `cp-parallel-${suffix}@aikingdom.local`, displayName: "CP King", passwordHash: "test", role: "KING" }
  });
  const memorySetting = await prisma.setting.findUniqueOrThrow({ where: { key: "AUTO_SAVE_MEMORY" } });
  const task = await prisma.task.create({
    data: {
      createdBy: user.id,
      title: "Parallel council ordering",
      command: "Summarize the tradeoffs of running the council specialists in parallel.",
      mode: "PLAN",
      status: "PENDING"
    }
  });

  try {
    await prisma.setting.upsert({
      where: { key: "COUNCIL_PARALLEL_SPECIALISTS" },
      update: { value: "true" },
      create: { key: "COUNCIL_PARALLEL_SPECIALISTS", value: "true", category: "SYSTEM", description: "test" }
    });
    await prisma.setting.update({ where: { key: memorySetting.key }, data: { value: "false" } });

    const session = await processTaskWithGrandVizier(task.id, user.id);

    assert.equal(session.status, "COMPLETED");
    assert.deepEqual(
      session.responses.map((r) => r.role),
      ["Royal Archivist", "Royal Researcher", "Royal Architect", "Royal General", "Grand Vizier"],
      "canonical council order is preserved despite concurrent persistence"
    );
    for (const r of session.responses) {
      assert.ok(r.response && r.response.length > 0, `${r.role} response is non-empty`);
    }
    assert.ok(session.finalSummary, "Grand Vizier final summary is non-empty");
  } finally {
    await prisma.setting.update({ where: { key: "COUNCIL_PARALLEL_SPECIALISTS" }, data: { value: "false" } });
    await prisma.setting.update({ where: { key: memorySetting.key }, data: { value: memorySetting.value } });
    await cleanup(task.id, user.id);
  }
});
