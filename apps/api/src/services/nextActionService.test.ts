import assert from "node:assert/strict";
import test from "node:test";
import { prisma } from "../db/prisma.js";
import {
  computeEscalationBonus,
  riskFromPriority,
  mapWorkOrderToActions,
  computeNextActions,
  type WorkOrderRow
} from "./nextActionService.js";

// ── Pure helper tests (no DB) ─────────────────────────────────────────────────

test("computeEscalationBonus: 0 hours → 0", () => {
  assert.equal(computeEscalationBonus(0), 0);
});

test("computeEscalationBonus: 12 hours → 4", () => {
  assert.equal(computeEscalationBonus(12), 4);
});

test("computeEscalationBonus: 72 hours → 24", () => {
  assert.equal(computeEscalationBonus(72), 24);
});

test("computeEscalationBonus: 100 hours → capped at 25", () => {
  assert.equal(computeEscalationBonus(100), 25);
});

test("riskFromPriority: 90 → CRITICAL", () => {
  assert.equal(riskFromPriority(90), "CRITICAL");
});

test("riskFromPriority: 70 → HIGH", () => {
  assert.equal(riskFromPriority(70), "HIGH");
});

test("riskFromPriority: 50 → MEDIUM", () => {
  assert.equal(riskFromPriority(50), "MEDIUM");
});

test("riskFromPriority: 20 → LOW", () => {
  assert.equal(riskFromPriority(20), "LOW");
});

// ── mapWorkOrderToActions unit tests (no DB) ──────────────────────────────────

function makeWO(overrides: Partial<WorkOrderRow> = {}): WorkOrderRow {
  return {
    id: "wo-unit-test",
    title: "Test Work Order",
    status: "READY",
    priority: "MEDIUM",
    contextBindingStatus: "FRESH",
    assignedExternalAgentId: null,
    updatedAt: new Date(),
    handoffBriefs: [],
    workSessions: [],
    ...overrides
  };
}

test("mapWorkOrderToActions: COMPLETED → empty array (terminal)", () => {
  const result = mapWorkOrderToActions(makeWO({ status: "COMPLETED" }), new Date().toISOString());
  assert.equal(result.length, 0);
});

test("mapWorkOrderToActions: CANCELLED → empty array (terminal)", () => {
  const result = mapWorkOrderToActions(makeWO({ status: "CANCELLED" }), new Date().toISOString());
  assert.equal(result.length, 0);
});

test("mapWorkOrderToActions: ARCHIVED → empty array (terminal)", () => {
  const result = mapWorkOrderToActions(makeWO({ status: "ARCHIVED" }), new Date().toISOString());
  assert.equal(result.length, 0);
});

test("mapWorkOrderToActions: NEEDS_REVIEW CRITICAL → priority 90, riskLevel CRITICAL", () => {
  const result = mapWorkOrderToActions(
    makeWO({ status: "NEEDS_REVIEW", priority: "CRITICAL" }),
    new Date().toISOString()
  );
  assert.equal(result.length, 1);
  assert.ok(result[0]);
  assert.equal(result[0].priority, 90);
  assert.equal(result[0].riskLevel, "CRITICAL");
  assert.equal(result[0].abstractState, "AWAITING_DECISION");
});

test("mapWorkOrderToActions: NEEDS_REVIEW HIGH → priority 82, riskLevel HIGH", () => {
  const result = mapWorkOrderToActions(
    makeWO({ status: "NEEDS_REVIEW", priority: "HIGH" }),
    new Date().toISOString()
  );
  assert.equal(result.length, 1);
  assert.ok(result[0]);
  assert.equal(result[0].priority, 82);
  assert.equal(result[0].riskLevel, "HIGH");
});

test("mapWorkOrderToActions: NEEDS_REVIEW MEDIUM sorts above READY MEDIUM", () => {
  const now = new Date().toISOString();
  const needsReviewItems = mapWorkOrderToActions(
    makeWO({ status: "NEEDS_REVIEW", priority: "MEDIUM" }),
    now
  );
  const readyItems = mapWorkOrderToActions(
    makeWO({ status: "READY", priority: "MEDIUM" }),
    now
  );
  const needsReviewItem = needsReviewItems[0];
  const readyItem = readyItems[0];
  assert.ok(needsReviewItem);
  assert.ok(readyItem);
  assert.ok(
    needsReviewItem.priority > readyItem.priority,
    `NEEDS_REVIEW priority ${needsReviewItem.priority} should exceed READY priority ${readyItem.priority}`
  );
});

test("mapWorkOrderToActions: READY no agent → Assign Agent, priority 50", () => {
  const result = mapWorkOrderToActions(
    makeWO({ status: "READY", assignedExternalAgentId: null }),
    new Date().toISOString()
  );
  assert.equal(result.length, 1);
  assert.ok(result[0]);
  assert.equal(result[0].actionLabel, "Assign Agent");
  assert.equal(result[0].priority, 50);
});

test("mapWorkOrderToActions: READY with agent and no handoffs → Create Handoff, priority 55", () => {
  const result = mapWorkOrderToActions(
    makeWO({ status: "READY", assignedExternalAgentId: "agent-1", handoffBriefs: [] }),
    new Date().toISOString()
  );
  assert.equal(result.length, 1);
  assert.ok(result[0]);
  assert.equal(result[0].actionLabel, "Create Handoff");
  assert.equal(result[0].priority, 55);
});

test("mapWorkOrderToActions: STALE context → Bind Context action included", () => {
  const handoffDate = new Date(Date.now() - 3600 * 1000); // 1h ago
  const sessionDate = new Date(Date.now() - 1800 * 1000); // 30min ago (after handoff)
  const result = mapWorkOrderToActions(
    makeWO({
      status: "READY",
      contextBindingStatus: "STALE",
      assignedExternalAgentId: "agent-1",
      handoffBriefs: [{ id: "hb-1", createdAt: handoffDate }],
      workSessions: [{ id: "ws-1", createdAt: sessionDate }]
    }),
    new Date().toISOString()
  );
  const ctxItem = result.find(i => i.id === "WorkOrder:ctx:wo-unit-test");
  assert.ok(ctxItem, "Expected a context binding action");
  assert.equal(ctxItem!.actionLabel, "Bind Context");
  assert.equal(ctxItem!.abstractState, "BLOCKED");
});

test("mapWorkOrderToActions: handoff with no post-handoff session → Send Handoff (HandoffBrief item)", () => {
  const handoffDate = new Date(Date.now() - 3600 * 1000); // 1h ago
  const sessionDate = new Date(Date.now() - 7200 * 1000); // 2h ago (before handoff)
  const result = mapWorkOrderToActions(
    makeWO({
      status: "IN_PROGRESS",
      assignedExternalAgentId: "agent-1",
      handoffBriefs: [{ id: "hb-1", createdAt: handoffDate }],
      workSessions: [{ id: "ws-1", createdAt: sessionDate }]
    }),
    new Date().toISOString()
  );
  const handoffItem = result.find(i => i.entityType === "HandoffBrief");
  assert.ok(handoffItem, "Expected HandoffBrief action");
  assert.equal(handoffItem!.actionLabel, "Send Handoff");
  assert.equal(handoffItem!.entityId, "hb-1");
});

test("mapWorkOrderToActions: handoff with post-handoff session → no HandoffBrief action", () => {
  const handoffDate = new Date(Date.now() - 3600 * 1000); // 1h ago
  const sessionDate = new Date(Date.now() - 1800 * 1000); // 30min ago (after handoff)
  const result = mapWorkOrderToActions(
    makeWO({
      status: "IN_PROGRESS",
      assignedExternalAgentId: "agent-1",
      handoffBriefs: [{ id: "hb-1", createdAt: handoffDate }],
      workSessions: [{ id: "ws-1", createdAt: sessionDate }]
    }),
    new Date().toISOString()
  );
  const handoffItem = result.find(i => i.entityType === "HandoffBrief");
  assert.equal(handoffItem, undefined, "No HandoffBrief action expected when response session exists");
});

test("mapWorkOrderToActions: escalation bonus increases priority for older work orders", () => {
  const oldDate = new Date(Date.now() - 48 * 3600 * 1000); // 48h ago → escalation 16
  const freshDate = new Date();
  const oldItems = mapWorkOrderToActions(
    makeWO({ status: "NEEDS_REVIEW", priority: "MEDIUM", updatedAt: oldDate }),
    new Date().toISOString()
  );
  const freshItems = mapWorkOrderToActions(
    makeWO({ status: "NEEDS_REVIEW", priority: "MEDIUM", updatedAt: freshDate }),
    new Date().toISOString()
  );
  const oldItem = oldItems[0];
  const freshItem = freshItems[0];
  assert.ok(oldItem);
  assert.ok(freshItem);
  assert.ok(
    oldItem.priority > freshItem.priority,
    `Older item priority ${oldItem.priority} should exceed fresh item priority ${freshItem.priority}`
  );
});

// ── Integration tests (real DB, isTestData fixtures only) ────────────────────

test("computeNextActions: isTestData WorkOrder excluded from queue", async () => {
  const wo = await prisma.workOrder.create({
    data: {
      title: "NA-test isTestData exclusion",
      objective: "nextAction test exclusion",
      status: "NEEDS_REVIEW",
      priority: "CRITICAL",
      isTestData: true
    }
  });
  try {
    const result = await computeNextActions();
    const found = result.queue.find(i => i.entityId === wo.id);
    assert.equal(found, undefined, "isTestData WorkOrder must not appear in next-action queue");
  } finally {
    await prisma.workOrder.delete({ where: { id: wo.id } });
  }
});

test("computeNextActions: topAction equals queue[0]", async () => {
  const result = await computeNextActions();
  if (result.queue.length === 0) {
    assert.equal(result.topAction, null);
  } else {
    assert.deepEqual(result.topAction, result.queue[0]);
  }
});

test("computeNextActions: entityTypes filter limits results to requested types", async () => {
  const result = await computeNextActions({ entityTypes: ["AutomationJob"] });
  for (const item of result.queue) {
    assert.equal(
      item.entityType,
      "AutomationJob",
      `Expected only AutomationJob items but got ${item.entityType}`
    );
  }
});

test("computeNextActions: minRisk=CRITICAL returns only CRITICAL-risk items", async () => {
  const result = await computeNextActions({ minRisk: "CRITICAL" });
  for (const item of result.queue) {
    assert.equal(
      item.riskLevel,
      "CRITICAL",
      `Expected only CRITICAL items but got ${item.riskLevel}`
    );
  }
});
