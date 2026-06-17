import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { prisma } from "../db/prisma.js";
import { getKingdomHealth } from "./kingdomHealthService.js";

test("getKingdomHealth: returns computedAt, overallStatus, and all health items", async () => {
  const dto = await getKingdomHealth();
  assert.ok(typeof dto.computedAt === "string", "computedAt should be a string");
  assert.ok(["HEALTHY", "WARNING", "CRITICAL"].includes(dto.overallStatus), "overallStatus should be valid");
  assert.ok(Array.isArray(dto.items), "items should be an array");
  assert.ok(dto.items.length > 0, "Should return health items");

  for (const item of dto.items) {
    assert.ok(item.key, "item should have key");
    assert.ok(item.label, "item should have label");
    assert.ok(["HEALTHY", "WARNING", "CRITICAL"].includes(item.status), "item status should be valid");
    assert.ok(typeof item.reason === "string", "item should have reason");
  }

  // Check that all expected health dimensions are present
  const keys = dto.items.map(i => i.key);
  assert.ok(keys.includes("context_health"), "Should include context_health");
  assert.ok(keys.includes("review_queue"), "Should include review_queue");
  assert.ok(keys.includes("runner_queue"), "Should include runner_queue");
  assert.ok(keys.includes("provider_availability"), "Should include provider_availability");
  assert.ok(keys.includes("external_agent_backlog"), "Should include external_agent_backlog");
  assert.ok(keys.includes("knowledge_processing"), "Should include knowledge_processing");
});

test("getKingdomHealth: context_health WARNING when stale work orders exist", async () => {
  const project = await prisma.project.create({ data: { name: `Health Test Project ${randomUUID()}` } });
  const workOrders: string[] = [];
  for (let i = 0; i < 2; i++) {
    const wo = await prisma.workOrder.create({
      data: {
        title: `Health Stale WO ${randomUUID()}`,
        objective: "Test stale context",
        status: "READY",
        projectId: project.id,
        contextBindingStatus: "STALE",
        isTestData: false
      }
    });
    workOrders.push(wo.id);
  }
  try {
    const dto = await getKingdomHealth();
    const contextItem = dto.items.find(i => i.key === "context_health");
    assert.ok(contextItem, "Should have context_health item");
    assert.ok(
      contextItem.status === "WARNING" || contextItem.status === "CRITICAL",
      `Expected WARNING or CRITICAL for context_health, got ${contextItem.status}`
    );
  } finally {
    for (const id of workOrders) {
      await prisma.workOrder.delete({ where: { id } }).catch(() => undefined);
    }
    await prisma.project.delete({ where: { id: project.id } }).catch(() => undefined);
  }
});

test("getKingdomHealth: overallStatus is worst of all item statuses", async () => {
  const dto = await getKingdomHealth();
  const worst = dto.items.reduce<"HEALTHY" | "WARNING" | "CRITICAL">((acc, item) => {
    if (item.status === "CRITICAL") return "CRITICAL";
    if (item.status === "WARNING" && acc !== "CRITICAL") return "WARNING";
    return acc;
  }, "HEALTHY");
  assert.equal(dto.overallStatus, worst, "overallStatus should equal the worst item status");
});
