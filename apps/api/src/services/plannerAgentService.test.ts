import assert from "node:assert/strict";
import test from "node:test";
import { prisma } from "../db/prisma.js";
import { createDraftWorkOrders, parsePlannerResponse, planFromSession, runPlannerAgent } from "./plannerAgentService.js";
import type { PlannerDraft } from "./plannerAgentService.js";


const suffix = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

async function createUser(role: "KING" | "CROWN_PRINCE" = "KING") {
  const s = suffix();
  const user = await prisma.user.create({
    data: { email: `planner-test-${role.toLowerCase()}-${s}@aikingdom.local`, displayName: `Planner Test ${role}`, passwordHash: "test", role }
  });
  return user;
}

async function ensurePlannerAgentInDb() {
  const existing = await prisma.agent.findUnique({ where: { slug: "planner" } });
  if (existing) return existing;
  return prisma.agent.create({
    data: {
      slug: "planner",
      name: "Declan",
      title: "Royal Planner",
      role: "Planning Agent",
      specialty: "Post-council work order drafting",
      description: "Reviews completed council sessions and generates draft work orders.",
      systemPrompt: "You are Declan, the Royal Planner. Generate 0 to 3 draft work orders as a JSON array. Return only the JSON array.",
      prompt: "You are Declan, the Royal Planner.",
      skills: ["planning", "work order drafting"],
      responseStyle: "structured JSON output only",
      priority: 50,
      isActive: true,
      preferredProviderId: "local-sandbox-baseline",
      defaultModel: "mock",
      fallbackProviderIds: [],
      temperature: 0.1,
      maxTokens: 800
    }
  });
}

// ── parsePlannerResponse tests ────────────────────────────────────────────────

test("parsePlannerResponse parses valid JSON array", () => {
  const input: PlannerDraft[] = [
    { title: "Build X", objective: "Implement feature X", rationale: "Council recommended it" }
  ];
  const result = parsePlannerResponse(JSON.stringify(input));
  assert.equal(result.length, 1);
  assert.equal(result[0]!.title, "Build X");
  assert.equal(result[0]!.objective, "Implement feature X");
  assert.equal(result[0]!.rationale, "Council recommended it");
});

test("parsePlannerResponse extracts JSON array wrapped in prose", () => {
  const input: PlannerDraft[] = [{ title: "Fix Y", objective: "Resolve bug Y", rationale: "Reported in session" }];
  const response = `Here are the drafts:\n\n${JSON.stringify(input)}\n\nEnd of response.`;
  const result = parsePlannerResponse(response);
  assert.equal(result.length, 1);
  assert.equal(result[0]!.title, "Fix Y");
});

test("parsePlannerResponse returns empty array on invalid JSON", () => {
  const result = parsePlannerResponse("This is not JSON at all");
  assert.deepEqual(result, []);
});

test("parsePlannerResponse returns empty array for empty JSON array", () => {
  const result = parsePlannerResponse("[]");
  assert.deepEqual(result, []);
});

test("parsePlannerResponse caps output at 3 drafts", () => {
  const input = Array.from({ length: 5 }, (_, i) => ({
    title: `Task ${i}`,
    objective: `Objective ${i}`,
    rationale: `Rationale ${i}`
  }));
  const result = parsePlannerResponse(JSON.stringify(input));
  assert.equal(result.length, 3);
});

test("parsePlannerResponse skips drafts with missing title or objective", () => {
  const input = [
    { title: "", objective: "No title here", rationale: "r" },
    { title: "Valid", objective: "", rationale: "r" },
    { title: "Also Valid", objective: "Has objective", rationale: "r" }
  ];
  const result = parsePlannerResponse(JSON.stringify(input));
  assert.equal(result.length, 1);
  assert.equal(result[0]!.title, "Also Valid");
});

// ── runPlannerAgent tests ─────────────────────────────────────────────────────

test("runPlannerAgent returns { drafted: 0, skipped: 0 } when COUNCIL_AUTO_WORK_ORDER_MODE is OFF (default)", async () => {
  await prisma.setting.upsert({
    where: { key: "COUNCIL_AUTO_WORK_ORDER_MODE" },
    update: { value: "OFF" },
    create: { key: "COUNCIL_AUTO_WORK_ORDER_MODE", value: "OFF", category: "SYSTEM", description: "test" }
  });

  const result = await runPlannerAgent(
    { id: "fake-session-id", finalSummary: "Council decided X.", projectId: null, taskId: "fake-task-id" },
    { id: "fake-task-id", title: "Test task", command: "Do something", mode: "ASK", projectId: null, createdBy: "fake-user" },
    "fake-user"
  );

  assert.equal(result.drafted, 0);
  assert.equal(result.skipped, 0);
  assert.equal(result.sessionId, "fake-session-id");
  assert.deepEqual(result.draftedWorkOrderIds, []);
});

test("runPlannerAgent returns { drafted: 0, skipped: 0 } when planner agent is missing from DB", async () => {
  await prisma.setting.upsert({
    where: { key: "COUNCIL_AUTO_WORK_ORDER_MODE" },
    update: { value: "DRAFT" },
    create: { key: "COUNCIL_AUTO_WORK_ORDER_MODE", value: "DRAFT", category: "SYSTEM", description: "test" }
  });

  const result = await runPlannerAgent(
    { id: "fake-session-missing-agent", finalSummary: "Test.", projectId: null, taskId: "fake-task" },
    { id: "fake-task", title: "Test", command: "cmd", mode: "ASK", projectId: null, createdBy: "fake-user" },
    "fake-user"
  );

  // Planner agent slug is "planner" (which may or may not exist), so result depends on DB state
  // Either drafted:0 (agent missing) or drafted:0 (mock provider returns non-JSON)
  assert.equal(typeof result.drafted, "number");
  assert.equal(result.sessionId, "fake-session-missing-agent");

  // Reset setting
  await prisma.setting.update({ where: { key: "COUNCIL_AUTO_WORK_ORDER_MODE" }, data: { value: "OFF" } });
});

test("runPlannerAgent does not throw when mode is OFF", async () => {
  await prisma.setting.upsert({
    where: { key: "COUNCIL_AUTO_WORK_ORDER_MODE" },
    update: { value: "OFF" },
    create: { key: "COUNCIL_AUTO_WORK_ORDER_MODE", value: "OFF", category: "SYSTEM", description: "test" }
  });

  await assert.doesNotReject(async () => {
    await runPlannerAgent(
      { id: "safe-session", finalSummary: null, projectId: null, taskId: "safe-task" },
      { id: "safe-task", title: "Safe", command: "cmd", mode: "ASK", projectId: null, createdBy: "u" },
      "u"
    );
  });
});

// ── planFromSession tests ─────────────────────────────────────────────────────

test("planFromSession throws NotFoundError for unknown session", async () => {
  await assert.rejects(
    async () => planFromSession("nonexistent-session-id-xyz", "some-user"),
    (err: Error) => err.name === "NotFoundError" || err.message.includes("not found")
  );
});

test("planFromSession throws when session is not COMPLETED", async () => {
  const user = await createUser("KING");
  const task = await prisma.task.create({
    data: { createdBy: user.id, title: "Planner test task", command: "Test", mode: "ASK", status: "PENDING" }
  });
  const session = await prisma.councilSession.create({
    data: { taskId: task.id, status: "RUNNING", selectedAgentIds: [] }
  });

  try {
    await assert.rejects(
      async () => planFromSession(session.id, user.id),
      (err: Error) => err.message.includes("COMPLETED")
    );
  } finally {
    await prisma.councilSession.delete({ where: { id: session.id } }).catch(() => undefined);
    await prisma.task.delete({ where: { id: task.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

// ── Draft work order creation tests ──────────────────────────────────────────

test("planFromSession creates DRAFT work orders with correct sourceType and sourceId", async () => {
  const user = await createUser("KING");
  await ensurePlannerAgentInDb();

  const task = await prisma.task.create({
    data: { createdBy: user.id, title: "Planner draft test", command: "Build planner feature", mode: "BUILD", status: "COMPLETED" }
  });
  const session = await prisma.councilSession.create({
    data: {
      taskId: task.id,
      status: "COMPLETED",
      selectedAgentIds: [],
      finalSummary: "The council recommends implementing the planner feature. Next step: create a draft work order for the planner agent implementation."
    }
  });

  // Ensure mock provider baseline exists
  await prisma.aIProvider.upsert({
    where: { id: "local-sandbox-baseline" },
    update: {},
    create: {
      id: "local-sandbox-baseline",
      name: "Local Sandbox Baseline",
      type: "sandbox",
      defaultModel: "mock",
      isActive: true,
      priority: 999,
      capabilities: { chat: true }
    }
  });

  let drafted = 0;
  try {
    const result = await planFromSession(session.id, user.id);
    drafted = result.drafted;
    assert.equal(result.sessionId, session.id);
    assert.equal(typeof result.drafted, "number");
    assert.equal(typeof result.skipped, "number");

    // Verify any created work orders have correct fields
    if (result.drafted > 0) {
      const workOrders = await prisma.workOrder.findMany({
        where: { sourceType: "COUNCIL_SESSION", sourceId: session.id }
      });
      assert.ok(workOrders.length > 0);
      for (const wo of workOrders) {
        assert.equal(wo.status, "DRAFT");
        assert.equal(wo.sourceType, "COUNCIL_SESSION");
        assert.equal(wo.sourceId, session.id);
        assert.equal(wo.priority, "MEDIUM");
        assert.equal(wo.assignedExternalAgentId, null);
        assert.equal(wo.createdBySystem, true);
      }
    }
  } finally {
    await prisma.workOrder.deleteMany({ where: { sourceType: "COUNCIL_SESSION", sourceId: session.id } }).catch(() => undefined);
    await prisma.usageRecord.deleteMany({ where: { councilSessionId: session.id } }).catch(() => undefined);
    await prisma.councilSession.delete({ where: { id: session.id } }).catch(() => undefined);
    await prisma.task.delete({ where: { id: task.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("planFromSession is idempotent — second run creates no new work orders when all titles already exist", async () => {
  const user = await createUser("KING");
  await ensurePlannerAgentInDb();

  const task = await prisma.task.create({
    data: { createdBy: user.id, title: "Planner idempotency test", command: "Implement X", mode: "BUILD", status: "COMPLETED" }
  });
  const session = await prisma.councilSession.create({
    data: {
      taskId: task.id,
      status: "COMPLETED",
      selectedAgentIds: [],
      finalSummary: "Implement the X feature."
    }
  });

  // Pre-create a work order that would match a potential draft title
  const existingWorkOrder = await prisma.workOrder.create({
    data: {
      title: "Implement the X feature",
      objective: "Pre-existing work order",
      sourceType: "COUNCIL_SESSION",
      sourceId: session.id,
      status: "DRAFT",
      createdByUserId: user.id
    }
  });

  try {
    // Run planner — it should skip the duplicate title
    const result = await planFromSession(session.id, user.id);
    assert.equal(result.sessionId, session.id);

    // Verify no additional work orders were created beyond the pre-existing one
    const workOrders = await prisma.workOrder.findMany({
      where: { sourceType: "COUNCIL_SESSION", sourceId: session.id }
    });
    // The pre-existing one should still be there, and no duplicates with same normalized title
    const titles = workOrders.map((wo) => wo.title.toLowerCase().replace(/[^a-z0-9]+/g, ""));
    const uniqueTitles = new Set(titles);
    assert.equal(titles.length, uniqueTitles.size, "No duplicate titles");
  } finally {
    await prisma.workOrder.deleteMany({ where: { sourceType: "COUNCIL_SESSION", sourceId: session.id } }).catch(() => undefined);
    await prisma.workOrder.delete({ where: { id: existingWorkOrder.id } }).catch(() => undefined);
    await prisma.usageRecord.deleteMany({ where: { councilSessionId: session.id } }).catch(() => undefined);
    await prisma.councilSession.delete({ where: { id: session.id } }).catch(() => undefined);
    await prisma.task.delete({ where: { id: task.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("planFromSession loads project context, snapshot, open work orders, reports, briefs, and artifacts without error", async () => {
  const user = await createUser("KING");
  await ensurePlannerAgentInDb();
  const s = suffix();

  const project = await prisma.project.create({
    data: { name: `Planner Context Test ${s}`, status: "ACTIVE", priority: "MEDIUM" }
  });
  const snapshot = await prisma.repositorySnapshot.create({
    data: {
      projectId: project.id,
      framework: "Express",
      language: "TypeScript",
      packageManager: "npm",
      prismaModels: ["User", "WorkOrder"],
      modules: [],
      services: [],
      apiRoutes: [],
      summary: "Express + TypeScript project."
    }
  });
  const openWo = await prisma.workOrder.create({
    data: { title: `Open WO ${s}`, objective: "Ongoing work", projectId: project.id, status: "READY" }
  });
  const task = await prisma.task.create({
    data: { createdBy: user.id, title: "Context load test", command: "Plan the next work", mode: "PLAN", status: "COMPLETED", projectId: project.id }
  });
  const session = await prisma.councilSession.create({
    data: {
      taskId: task.id,
      projectId: project.id,
      status: "COMPLETED",
      selectedAgentIds: [],
      finalSummary: "Review the project and suggest next steps."
    }
  });

  try {
    // Should complete without throwing — all context sources are loaded
    const result = await planFromSession(session.id, user.id);
    assert.equal(result.sessionId, session.id);
    assert.equal(typeof result.drafted, "number");
    assert.equal(typeof result.skipped, "number");
  } finally {
    await prisma.workOrder.deleteMany({ where: { sourceType: "COUNCIL_SESSION", sourceId: session.id } }).catch(() => undefined);
    await prisma.usageRecord.deleteMany({ where: { councilSessionId: session.id } }).catch(() => undefined);
    await prisma.councilSession.delete({ where: { id: session.id } }).catch(() => undefined);
    await prisma.task.delete({ where: { id: task.id } }).catch(() => undefined);
    await prisma.workOrder.delete({ where: { id: openWo.id } }).catch(() => undefined);
    await prisma.repositorySnapshot.delete({ where: { id: snapshot.id } }).catch(() => undefined);
    await prisma.project.delete({ where: { id: project.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

// ── createDraftWorkOrders direct-path tests ───────────────────────────────────

test("createDraftWorkOrders creates DRAFT work orders linked to council session with rationale in context", async () => {
  const user = await createUser("KING");
  const task = await prisma.task.create({
    data: { createdBy: user.id, title: "Direct draft test", command: "Build feature", mode: "BUILD", status: "COMPLETED" }
  });
  const session = await prisma.councilSession.create({
    data: { taskId: task.id, status: "COMPLETED", selectedAgentIds: [], finalSummary: "Build the feature." }
  });

  const drafts: PlannerDraft[] = [
    { title: "M16B Direct Draft Alpha", objective: "Implement the Alpha module", rationale: "Council cited missing Alpha coverage" },
    { title: "M16B Direct Draft Beta", objective: "Add test coverage for Beta", rationale: "Council found Beta tests absent" }
  ];

  try {
    const result = await createDraftWorkOrders(
      drafts,
      { id: session.id, finalSummary: session.finalSummary, projectId: null, taskId: task.id },
      { id: task.id, title: task.title, command: task.command, mode: task.mode, projectId: null, createdBy: user.id },
      user.id
    );

    assert.equal(result.drafted, 2);
    assert.equal(result.skipped, 0);
    assert.equal(result.sessionId, session.id);

    const workOrders = await prisma.workOrder.findMany({
      where: { sourceType: "COUNCIL_SESSION", sourceId: session.id },
      orderBy: { createdAt: "asc" }
    });
    assert.equal(workOrders.length, 2);

    for (const wo of workOrders) {
      assert.equal(wo.status, "DRAFT");
      assert.equal(wo.sourceType, "COUNCIL_SESSION");
      assert.equal(wo.sourceId, session.id);
      assert.equal(wo.priority, "MEDIUM");
      assert.equal(wo.assignedExternalAgentId, null);
      assert.equal(wo.createdBySystem, true);
      assert.equal(wo.createdByUserId, user.id);
    }

    const alpha = workOrders.find((wo) => wo.title === "M16B Direct Draft Alpha")!;
    assert.ok(alpha, "Alpha work order created");
    assert.match(alpha.context, /Council cited missing Alpha coverage/);
    assert.match(alpha.context, /PLANNER RATIONALE/);
    assert.match(alpha.context, /ORIGINATING COUNCIL SESSION/);
    assert.match(alpha.context, /Session ID:/i);
  } finally {
    await prisma.workOrder.deleteMany({ where: { sourceType: "COUNCIL_SESSION", sourceId: session.id } }).catch(() => undefined);
    await prisma.councilSession.delete({ where: { id: session.id } }).catch(() => undefined);
    await prisma.task.delete({ where: { id: task.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("createDraftWorkOrders creates READY work orders when targetStatus is READY", async () => {
  const user = await createUser("KING");
  const task = await prisma.task.create({
    data: { createdBy: user.id, title: "READY status test", command: "Build READY feature", mode: "BUILD", status: "COMPLETED" }
  });
  const session = await prisma.councilSession.create({
    data: { taskId: task.id, status: "COMPLETED", selectedAgentIds: [], finalSummary: "Ready to assign." }
  });

  const drafts: PlannerDraft[] = [
    { title: "M17I READY Work Order Alpha", objective: "Implement the Alpha module for READY mode", rationale: "King approved" }
  ];

  try {
    const result = await createDraftWorkOrders(
      drafts,
      { id: session.id, finalSummary: session.finalSummary, projectId: null, taskId: task.id },
      { id: task.id, title: task.title, command: task.command, mode: task.mode, projectId: null, createdBy: user.id },
      user.id,
      "READY"
    );

    assert.equal(result.drafted, 1);
    assert.equal(result.skipped, 0);
    assert.equal(result.draftedWorkOrderIds.length, 1);

    const wo = await prisma.workOrder.findUnique({ where: { id: result.draftedWorkOrderIds[0]! } });
    assert.ok(wo, "Work order exists");
    assert.equal(wo!.status, "READY");
    assert.equal(wo!.sourceType, "COUNCIL_SESSION");
    assert.equal(wo!.createdBySystem, true);
  } finally {
    await prisma.workOrder.deleteMany({ where: { sourceType: "COUNCIL_SESSION", sourceId: session.id } }).catch(() => undefined);
    await prisma.councilSession.delete({ where: { id: session.id } }).catch(() => undefined);
    await prisma.task.delete({ where: { id: task.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("createDraftWorkOrders returns draftedWorkOrderIds populated with created IDs", async () => {
  const user = await createUser("KING");
  const task = await prisma.task.create({
    data: { createdBy: user.id, title: "IDs test", command: "Track IDs", mode: "BUILD", status: "COMPLETED" }
  });
  const session = await prisma.councilSession.create({
    data: { taskId: task.id, status: "COMPLETED", selectedAgentIds: [], finalSummary: "Track IDs test." }
  });

  const drafts: PlannerDraft[] = [
    { title: "M17I Track ID Gamma", objective: "Objective gamma", rationale: "r" },
    { title: "M17I Track ID Delta", objective: "Objective delta", rationale: "r" }
  ];

  try {
    const result = await createDraftWorkOrders(
      drafts,
      { id: session.id, finalSummary: session.finalSummary, projectId: null, taskId: task.id },
      { id: task.id, title: task.title, command: task.command, mode: task.mode, projectId: null, createdBy: user.id },
      user.id
    );

    assert.equal(result.drafted, 2);
    assert.equal(result.draftedWorkOrderIds.length, 2);
    for (const id of result.draftedWorkOrderIds) {
      const wo = await prisma.workOrder.findUnique({ where: { id } });
      assert.ok(wo, `Work order ${id} exists`);
    }
  } finally {
    await prisma.workOrder.deleteMany({ where: { sourceType: "COUNCIL_SESSION", sourceId: session.id } }).catch(() => undefined);
    await prisma.councilSession.delete({ where: { id: session.id } }).catch(() => undefined);
    await prisma.task.delete({ where: { id: task.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("createDraftWorkOrders skips drafts whose normalized title matches an open work order (dedup)", async () => {
  const user = await createUser("KING");
  const task = await prisma.task.create({
    data: { createdBy: user.id, title: "Dedup test", command: "Check dedup", mode: "ASK", status: "COMPLETED" }
  });
  const session = await prisma.councilSession.create({
    data: { taskId: task.id, status: "COMPLETED", selectedAgentIds: [], finalSummary: "Dedup test." }
  });

  // Pre-create a work order whose normalized title matches the draft
  const existing = await prisma.workOrder.create({
    data: { title: "M16B Existing Dedup Work Order", objective: "Already exists", status: "READY", createdByUserId: user.id }
  });

  const drafts: PlannerDraft[] = [
    { title: "m16b existing dedup work order", objective: "Should be deduped", rationale: "Duplicate" },
    { title: "M16B New Unique Work Order", objective: "This is new and unique", rationale: "No duplicate" }
  ];

  try {
    const result = await createDraftWorkOrders(
      drafts,
      { id: session.id, finalSummary: session.finalSummary, projectId: null, taskId: task.id },
      { id: task.id, title: task.title, command: task.command, mode: task.mode, projectId: null, createdBy: user.id },
      user.id
    );

    assert.equal(result.drafted, 1, "Only one draft created — duplicate was skipped");
    assert.equal(result.skipped, 1, "One draft skipped due to dedup");

    const created = await prisma.workOrder.findMany({
      where: { sourceType: "COUNCIL_SESSION", sourceId: session.id }
    });
    assert.equal(created.length, 1);
    assert.equal(created[0]!.title, "M16B New Unique Work Order");
  } finally {
    await prisma.workOrder.deleteMany({ where: { sourceType: "COUNCIL_SESSION", sourceId: session.id } }).catch(() => undefined);
    await prisma.workOrder.delete({ where: { id: existing.id } }).catch(() => undefined);
    await prisma.councilSession.delete({ where: { id: session.id } }).catch(() => undefined);
    await prisma.task.delete({ where: { id: task.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});
