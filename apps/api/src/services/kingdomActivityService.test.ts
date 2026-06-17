import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { prisma } from "../db/prisma.js";
import { getKingdomActivity } from "./kingdomActivityService.js";

test("getKingdomActivity: returns computedAt and activities array", async () => {
  const dto = await getKingdomActivity(10);
  assert.ok(typeof dto.computedAt === "string", "computedAt should be an ISO string");
  assert.ok(Array.isArray(dto.activities), "activities should be an array");
  for (const act of dto.activities) {
    assert.ok(act.id, "activity should have id");
    assert.ok(act.timestamp, "activity should have timestamp");
    assert.ok(act.actor, "activity should have actor");
    assert.ok(act.type, "activity should have type");
    assert.ok(act.summary, "activity should have summary");
    assert.ok(act.sourceReference.entityType, "should have sourceReference.entityType");
  }
});

test("getKingdomActivity: includes recent work order status changes", async () => {
  const wo = await prisma.workOrder.create({
    data: {
      title: `Activity Stream WO ${randomUUID()}`,
      objective: "Test activity stream",
      status: "NEEDS_REVIEW",
      isTestData: false
    }
  });
  try {
    const dto = await getKingdomActivity(100);
    const found = dto.activities.find(a => a.sourceReference.entityId === wo.id && a.type === "WORK_ORDER");
    assert.ok(found, "Should find the work order activity");
    assert.equal(found.type, "WORK_ORDER");
    assert.ok(found.summary.includes("NEEDS_REVIEW") || found.summary.includes("flagged"), "Summary should describe status");
  } finally {
    await prisma.workOrder.delete({ where: { id: wo.id } }).catch(() => undefined);
  }
});

test("getKingdomActivity: respects limit parameter", async () => {
  const dto = await getKingdomActivity(5);
  assert.ok(dto.activities.length <= 5, "Should not exceed requested limit");
});
