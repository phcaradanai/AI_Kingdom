import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { prisma } from "../db/prisma.js";
import { getKingdomPresence } from "./kingdomPresenceService.js";

async function createTestAgent(suffix = randomUUID()) {
  return prisma.agent.create({
    data: {
      slug: `presence-test-agent-${suffix}`,
      name: `Presence Test Agent ${suffix}`,
      title: "Test",
      role: "TESTER",
      specialty: "Testing",
      prompt: "test",
      isTestData: true
    }
  });
}

test("getKingdomPresence: agent with no activity appears IDLE", async () => {
  const agent = await createTestAgent();
  try {
    const dto = await getKingdomPresence();
    const found = dto.agents.find(a => a.id === agent.id);
    assert.ok(found, "Agent should appear in presence list");
    assert.equal(found.state, "IDLE");
    assert.equal(found.currentTask, null);
    assert.equal(found.blockingReason, null);
  } finally {
    await prisma.agent.delete({ where: { id: agent.id } }).catch(() => undefined);
  }
});

test("getKingdomPresence: agent with NEEDS_REVIEW job appears WAITING_REVIEW", async () => {
  const agent = await createTestAgent();
  const project = await prisma.project.create({ data: { name: `Presence Test Project ${randomUUID()}` } });
  const workOrder = await prisma.workOrder.create({
    data: {
      title: `Presence Test WO ${randomUUID()}`,
      objective: "Test objective",
      projectId: project.id,
      status: "IN_PROGRESS",
      assignedAgentId: agent.id
    }
  });
  const job = await prisma.automationJob.create({
    data: {
      workOrderId: workOrder.id,
      projectId: project.id,
      agentId: agent.id,
      status: "NEEDS_REVIEW",
      mode: "SANDBOX_PATCH"
    }
  });
  try {
    const dto = await getKingdomPresence();
    const found = dto.agents.find(a => a.id === agent.id);
    assert.ok(found, "Agent should appear in presence list");
    assert.equal(found.state, "WAITING_REVIEW");
    assert.ok(found.currentWorkOrder, "Should expose the work order");
    assert.equal(found.currentWorkOrder!.id, workOrder.id);
  } finally {
    await prisma.automationJob.delete({ where: { id: job.id } }).catch(() => undefined);
    await prisma.workOrder.delete({ where: { id: workOrder.id } }).catch(() => undefined);
    await prisma.project.delete({ where: { id: project.id } }).catch(() => undefined);
    await prisma.agent.delete({ where: { id: agent.id } }).catch(() => undefined);
  }
});

test("getKingdomPresence: agent with FAILED job appears BLOCKED", async () => {
  const agent = await createTestAgent();
  const project = await prisma.project.create({ data: { name: `Presence Blocked Project ${randomUUID()}` } });
  const workOrder = await prisma.workOrder.create({
    data: {
      title: `Blocked WO ${randomUUID()}`,
      objective: "Test",
      projectId: project.id,
      status: "IN_PROGRESS",
      assignedAgentId: agent.id
    }
  });
  const job = await prisma.automationJob.create({
    data: {
      workOrderId: workOrder.id,
      projectId: project.id,
      agentId: agent.id,
      status: "FAILED",
      mode: "SANDBOX_PATCH"
    }
  });
  try {
    const dto = await getKingdomPresence();
    const found = dto.agents.find(a => a.id === agent.id);
    assert.ok(found, "Agent should appear in presence list");
    assert.equal(found.state, "BLOCKED");
    assert.equal(found.blockingReason, "Automation job failed");
  } finally {
    await prisma.automationJob.delete({ where: { id: job.id } }).catch(() => undefined);
    await prisma.workOrder.delete({ where: { id: workOrder.id } }).catch(() => undefined);
    await prisma.project.delete({ where: { id: project.id } }).catch(() => undefined);
    await prisma.agent.delete({ where: { id: agent.id } }).catch(() => undefined);
  }
});
