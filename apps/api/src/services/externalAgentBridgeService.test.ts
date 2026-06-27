import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { prisma } from "../db/prisma.js";
import { createExternalAgentBridgeJob } from "./externalAgentBridgeService.js";
import { createLocalDocumentRoot, scanLocalDocumentRoot } from "./localDocumentAccessService.js";
import { bindFreshContextToWorkOrder } from "./projectContextBindingService.js";

async function createUser() {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return prisma.user.create({
    data: { email: `bridge-test-${suffix}@aikingdom.local`, displayName: "Bridge Test King", passwordHash: "test", role: "KING" }
  });
}

async function createBridgeAgent() {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return prisma.externalAgent.create({
    data: {
      name: `Bridge Agent ${suffix}`,
      type: "CLAUDE_CODE",
      roleTitle: "Bridge Test Agent",
      description: "Test agent for bridge service tests",
      capabilities: ["test"],
      executionMode: "MANUAL_COPY_PASTE",
      isActive: true,
      bridgeEnabled: true,
      command: "claude -p {PROMPT} --dangerously-skip-permissions",
      safetyLevel: "MEDIUM_RISK"
    }
  });
}

async function createWorkOrder(userId: string, overrides: Record<string, unknown> = {}) {
  return prisma.workOrder.create({
    data: {
      title: "Bridge test work order",
      objective: "Test the bridge dispatch gate",
      acceptanceCriteria: ["Bridge job created"],
      validationCommands: ["npm run typecheck"],
      createdByUserId: userId,
      status: "READY",
      ...overrides
    }
  });
}

async function enableBridge() {
  await prisma.setting.upsert({
    where: { key: "EXTERNAL_AGENT_BRIDGE_ENABLED" },
    create: { key: "EXTERNAL_AGENT_BRIDGE_ENABLED", value: "true", category: "SYSTEM" },
    update: { value: "true" }
  });
}

async function disableBridge() {
  await prisma.setting.upsert({
    where: { key: "EXTERNAL_AGENT_BRIDGE_ENABLED" },
    create: { key: "EXTERNAL_AGENT_BRIDGE_ENABLED", value: "false", category: "SYSTEM" },
    update: { value: "false" }
  });
}

test("createExternalAgentBridgeJob does not update WorkOrder when context is missing (no project)", async () => {
  await enableBridge();
  const user = await createUser();
  const agent = await createBridgeAgent();
  const workOrder = await createWorkOrder(user.id);

  const woBefore = await prisma.workOrder.findUniqueOrThrow({ where: { id: workOrder.id } });

  try {
    await assert.rejects(
      () => createExternalAgentBridgeJob({ workOrderId: workOrder.id, externalAgentId: agent.id, createdByUserId: user.id }),
      (err: Error) => {
        assert.equal(err.name, "ConflictError");
        return true;
      }
    );

    const wo = await prisma.workOrder.findUniqueOrThrow({ where: { id: workOrder.id } });
    assert.equal(wo.assignedExternalAgentId, woBefore.assignedExternalAgentId, "assignedExternalAgentId must be unchanged");
    assert.equal(wo.executionTarget, woBefore.executionTarget, "executionTarget must be unchanged");
  } finally {
    await prisma.workOrder.delete({ where: { id: workOrder.id } }).catch(() => undefined);
    await prisma.externalAgent.delete({ where: { id: agent.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
    await disableBridge();
  }
});

test("createExternalAgentBridgeJob does not update WorkOrder when an active AutomationJob exists", async () => {
  await enableBridge();
  const user = await createUser();
  const agent = await createBridgeAgent();
  const workOrder = await createWorkOrder(user.id);

  const activeJob = await prisma.automationJob.create({
    data: {
      workOrderId: workOrder.id,
      mode: "EXTERNAL_AGENT",
      status: "RUNNING",
      commandPolicy: "EXTERNAL_AGENT_NO_PUSH",
      allowedCommands: [],
      createdByUserId: user.id
    }
  });

  const woBefore = await prisma.workOrder.findUniqueOrThrow({ where: { id: workOrder.id } });

  try {
    await assert.rejects(
      () => createExternalAgentBridgeJob({ workOrderId: workOrder.id, externalAgentId: agent.id, createdByUserId: user.id }),
      (err: Error) => {
        assert.equal(err.name, "ConflictError");
        assert.match(err.message, /active automation job/i);
        return true;
      }
    );

    const wo = await prisma.workOrder.findUniqueOrThrow({ where: { id: workOrder.id } });
    assert.equal(wo.assignedExternalAgentId, woBefore.assignedExternalAgentId, "assignedExternalAgentId must be unchanged");
    assert.equal(wo.executionTarget, woBefore.executionTarget, "executionTarget must be unchanged");
  } finally {
    await prisma.automationJob.delete({ where: { id: activeJob.id } }).catch(() => undefined);
    await prisma.workOrder.delete({ where: { id: workOrder.id } }).catch(() => undefined);
    await prisma.externalAgent.delete({ where: { id: agent.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
    await disableBridge();
  }
});

test("createExternalAgentBridgeJob does not update WorkOrder when an active ExternalAgentRun exists", async () => {
  await enableBridge();
  const user = await createUser();
  const agent = await createBridgeAgent();
  const workOrder = await createWorkOrder(user.id);

  const activeRun = await prisma.externalAgentRun.create({
    data: {
      externalAgentId: agent.id,
      workOrderId: workOrder.id,
      status: "RUNNING",
      inputPrompt: "test prompt",
      attemptNumber: 1
    }
  });

  const woBefore = await prisma.workOrder.findUniqueOrThrow({ where: { id: workOrder.id } });

  try {
    await assert.rejects(
      () => createExternalAgentBridgeJob({ workOrderId: workOrder.id, externalAgentId: agent.id, createdByUserId: user.id }),
      (err: Error) => {
        assert.equal(err.name, "ConflictError");
        assert.match(err.message, /active external agent run/i);
        return true;
      }
    );

    const wo = await prisma.workOrder.findUniqueOrThrow({ where: { id: workOrder.id } });
    assert.equal(wo.assignedExternalAgentId, woBefore.assignedExternalAgentId, "assignedExternalAgentId must be unchanged");
    assert.equal(wo.executionTarget, woBefore.executionTarget, "executionTarget must be unchanged");
  } finally {
    await prisma.externalAgentRun.delete({ where: { id: activeRun.id } }).catch(() => undefined);
    await prisma.workOrder.delete({ where: { id: workOrder.id } }).catch(() => undefined);
    await prisma.externalAgent.delete({ where: { id: agent.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
    await disableBridge();
  }
});

test("createExternalAgentBridgeJob creates AutomationJob + ExternalAgentRun and updates lastExternalAgentRunId on success", async () => {
  await enableBridge();
  const user = await createUser();
  const agent = await createBridgeAgent();
  const project = await prisma.project.create({ data: { name: `Bridge Success Project ${Date.now()}` } });
  const repoDir = await fs.mkdtemp(path.join(os.tmpdir(), "bridge-test-"));
  await fs.writeFile(path.join(repoDir, "README.md"), "# Bridge Test Fixture");

  let workOrderId: string | null = null;
  try {
    const root = await createLocalDocumentRoot(project.id, { name: "repo", rootPath: repoDir });
    await scanLocalDocumentRoot(root.id);

    const workOrder = await createWorkOrder(user.id, { projectId: project.id });
    workOrderId = workOrder.id;
    await bindFreshContextToWorkOrder(workOrder.id);

    const result = await createExternalAgentBridgeJob({ workOrderId: workOrder.id, externalAgentId: agent.id, createdByUserId: user.id });

    assert.ok(result.job, "AutomationJob must be created");
    assert.equal(result.job.mode, "EXTERNAL_AGENT");
    assert.ok(result.externalAgentRun, "ExternalAgentRun must be created");
    assert.equal(result.externalAgentRun.status, "QUEUED");
    assert.equal(result.externalAgentRun.workOrderId, workOrder.id);
    assert.equal(result.externalAgentRun.externalAgentId, agent.id);

    const wo = await prisma.workOrder.findUniqueOrThrow({ where: { id: workOrder.id } });
    assert.equal(wo.lastExternalAgentRunId, result.externalAgentRun.id, "lastExternalAgentRunId must point to the new run");
    assert.equal(wo.assignedExternalAgentId, agent.id, "assignedExternalAgentId must be set");
    assert.equal(wo.executionTarget, "EXTERNAL_AGENT", "executionTarget must be set");
  } finally {
    if (workOrderId) {
      await prisma.externalAgentRun.deleteMany({ where: { workOrderId } }).catch(() => undefined);
      await prisma.automationJob.deleteMany({ where: { workOrderId } }).catch(() => undefined);
      await prisma.workOrder.delete({ where: { id: workOrderId } }).catch(() => undefined);
    }
    await prisma.project.delete({ where: { id: project.id } }).catch(() => undefined);
    await fs.rm(repoDir, { recursive: true, force: true }).catch(() => undefined);
    await prisma.externalAgent.delete({ where: { id: agent.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
    await disableBridge();
  }
});
