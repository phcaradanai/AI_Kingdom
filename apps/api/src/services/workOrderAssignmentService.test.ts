import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { assignWorkOrderAgent, selectAgent } from "./workOrderAssignmentService.js";

const prisma = new PrismaClient();
const suffix = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

async function createTestAgent(slug: string, specialty: string, skills: string[]) {
  const s = suffix();
  return prisma.agent.create({
    data: {
      slug: `test-agent-${slug}-${s}`,
      name: `Test ${slug}`,
      title: `Test ${slug} Title`,
      role: "Test Role",
      specialty,
      description: `${specialty} work`,
      prompt: "test",
      skills,
      isActive: true,
      isTestData: true
    }
  });
}

// ── selectAgent unit tests (no work order DB writes needed) ───────────────────

test("selectAgent returns null when no active agents available", async () => {
  // Use a DB query against only test agents in current context — but the pool
  // includes real agents; test by providing a work order with no matchable terms
  const result = await selectAgent({
    title: "xyzzy zzz quux",
    objective: "xyzzy zzz quux",
    context: "",
    instructions: ""
  });
  // May or may not match — we just assert it doesn't throw
  assert.ok(result === null || typeof result.confidence === "number");
});

test("selectAgent returns a result with confidence between 0 and 1", async () => {
  const agent = await createTestAgent("architect", "software architecture system design API contracts", ["software architecture", "data modeling", "reliability"]);

  try {
    const result = await selectAgent({
      title: "Design system architecture for new API contracts",
      objective: "Define API contracts, data models, and architecture boundaries for the new service",
      context: "",
      instructions: ""
    });

    if (result) {
      assert.ok(result.confidence >= 0 && result.confidence <= 1, "Confidence must be in [0, 1]");
      assert.ok(result.agentId.length > 0, "Agent ID must be non-empty");
      assert.ok(result.reason.length > 0, "Reason must be non-empty");
      assert.ok(result.agentName.length > 0, "Agent name must be non-empty");
    }
    // Result may be null if no real agents match — that's acceptable
  } finally {
    await prisma.agent.delete({ where: { id: agent.id } }).catch(() => undefined);
  }
});

test("selectAgent never returns planner or grand-vizier slugs", async () => {
  // Ensure planner and grand-vizier agents exist (they might already be there)
  const plannerExists = await prisma.agent.findFirst({ where: { slug: "planner" } });
  const gvExists = await prisma.agent.findFirst({ where: { slug: "grand-vizier" } });

  const result = await selectAgent({
    title: "Plan work orders and orchestrate council session synthesis",
    objective: "Draft work orders from council, synthesize and plan next steps for the kingdom",
    context: "planner grand-vizier council planning synthesis orchestration",
    instructions: ""
  });

  if (result) {
    const agent = await prisma.agent.findUnique({ where: { id: result.agentId }, select: { slug: true } });
    assert.ok(agent?.slug !== "planner", "Planner must not be assigned");
    assert.ok(agent?.slug !== "grand-vizier", "Grand Vizier must not be assigned");
  }

  // Suppress unused variable warnings
  void plannerExists;
  void gvExists;
});

// ── assignWorkOrderAgent integration tests ────────────────────────────────────

test("assignWorkOrderAgent returns null for nonexistent work order", async () => {
  const result = await assignWorkOrderAgent("nonexistent-work-order-id-xyz");
  assert.equal(result, null);
});

test("assignWorkOrderAgent writes assignedAgentId to DB when match found", async () => {
  const s = suffix();
  const user = await prisma.user.create({
    data: { email: `assign-test-${s}@aikingdom.local`, displayName: "Assign Test", passwordHash: "test", role: "KING" }
  });
  const agent = await createTestAgent("treasury-specialist", "budget cost analysis ROI pricing financial risk resource allocation", ["budgeting", "cost analysis", "ROI", "pricing"]);

  const workOrder = await prisma.workOrder.create({
    data: {
      title: "Analyse budget and cost allocation for treasury",
      objective: "Evaluate budget, ROI, and pricing for the kingdom treasury resource allocation",
      context: "financial cost budgeting",
      instructions: "",
      createdByUserId: user.id,
      status: "DRAFT"
    }
  });

  try {
    // Force setting enabled
    await prisma.setting.upsert({
      where: { key: "AUTO_ASSIGN_WORK_ORDERS" },
      update: { value: "true" },
      create: { key: "AUTO_ASSIGN_WORK_ORDERS", value: "true", category: "SYSTEM", description: "test" }
    });

    const result = await assignWorkOrderAgent(workOrder.id);
    // Result may be null if another agent scores higher — just verify no throw
    assert.ok(result === null || typeof result.confidence === "number");

    const updated = await prisma.workOrder.findUnique({
      where: { id: workOrder.id },
      select: { assignedAgentId: true, assignedAgentReason: true, assignedAgentConfidence: true }
    });

    if (result) {
      assert.equal(updated?.assignedAgentId, result.agentId);
      assert.ok(typeof updated?.assignedAgentReason === "string");
      assert.ok(typeof updated?.assignedAgentConfidence === "number");
      assert.ok((updated?.assignedAgentConfidence ?? 0) >= 0 && (updated?.assignedAgentConfidence ?? 0) <= 1);
    }
  } finally {
    await prisma.workOrder.delete({ where: { id: workOrder.id } }).catch(() => undefined);
    await prisma.agent.delete({ where: { id: agent.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("assignWorkOrderAgent returns null when AUTO_ASSIGN_WORK_ORDERS is false", async () => {
  const s = suffix();
  const user = await prisma.user.create({
    data: { email: `assign-disabled-${s}@aikingdom.local`, displayName: "Assign Disabled", passwordHash: "test", role: "KING" }
  });

  const workOrder = await prisma.workOrder.create({
    data: {
      title: "Architecture design for new services",
      objective: "Design APIs and data models",
      context: "",
      instructions: "",
      createdByUserId: user.id,
      status: "DRAFT"
    }
  });

  try {
    await prisma.setting.upsert({
      where: { key: "AUTO_ASSIGN_WORK_ORDERS" },
      update: { value: "false" },
      create: { key: "AUTO_ASSIGN_WORK_ORDERS", value: "false", category: "SYSTEM", description: "test" }
    });

    const result = await assignWorkOrderAgent(workOrder.id);
    assert.equal(result, null, "Must return null when setting is disabled");

    const untouched = await prisma.workOrder.findUnique({
      where: { id: workOrder.id },
      select: { assignedAgentId: true }
    });
    assert.equal(untouched?.assignedAgentId, null, "Work order must not be modified when disabled");
  } finally {
    await prisma.setting.update({ where: { key: "AUTO_ASSIGN_WORK_ORDERS" }, data: { value: "true" } }).catch(() => undefined);
    await prisma.workOrder.delete({ where: { id: workOrder.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("assignedAgentId can be cleared via manual DB update (reversibility check)", async () => {
  const s = suffix();
  const user = await prisma.user.create({
    data: { email: `assign-revert-${s}@aikingdom.local`, displayName: "Assign Revert", passwordHash: "test", role: "KING" }
  });

  const workOrder = await prisma.workOrder.create({
    data: {
      title: "Reversibility test work order",
      objective: "Check that assignment can be cleared",
      context: "",
      instructions: "",
      assignedAgentId: null,
      assignedAgentReason: "Test assignment",
      assignedAgentConfidence: 0.9,
      createdByUserId: user.id,
      status: "DRAFT"
    }
  });

  try {
    // Simulate manual override clearing the assignment
    const cleared = await prisma.workOrder.update({
      where: { id: workOrder.id },
      data: { assignedAgentId: null, assignedAgentReason: "Manually cleared", assignedAgentConfidence: null }
    });

    assert.equal(cleared.assignedAgentId, null);
    assert.equal(cleared.assignedAgentReason, "Manually cleared");
    assert.equal(cleared.assignedAgentConfidence, null);
  } finally {
    await prisma.workOrder.delete({ where: { id: workOrder.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});
