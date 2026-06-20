import assert from "node:assert/strict";
import test, { after } from "node:test";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AutomationCandidate } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import {
  AUTO_CONTEXT_REPAIR_ACTION,
  autoRepairContext
} from "./livingLoopService.js";
import { createLocalDocumentRoot } from "./localDocumentAccessService.js";

async function setSetting(key: string, value: string) {
  await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value, category: "SYSTEM" } });
}

// Reset the settings this file mutates back to their defaults so they cannot leak
// into other living-loop tests when the full suite runs (--test-concurrency=1).
after(async () => {
  await setSetting("LIVING_LOOP_AUTO_CONTEXT_REPAIR", "false");
  await setSetting("LIVING_LOOP_MAX_DAILY_CONTEXT_REPAIRS", "20");
  await setSetting("LIVING_LOOP_CONTEXT_REPAIR_COOLDOWN_MINUTES", "30");
});

async function makeTempRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "auto-context-repair-test-"));
  await fs.writeFile(path.join(dir, "README.md"), "# Auto Context Repair Fixture\n");
  await fs.writeFile(path.join(dir, "package.json"), JSON.stringify({ name: "fixture", scripts: { test: "echo ok" } }));
  return dir;
}

async function createProjectWithScannableRoot(repoDir: string) {
  const project = await prisma.project.create({ data: { name: `Auto Context Repair ${randomUUID()}` } });
  await createLocalDocumentRoot(project.id, { name: "repo", rootPath: repoDir });
  return project;
}

async function createWorkOrder(projectId: string | null) {
  return prisma.workOrder.create({
    data: {
      title: `Auto Context Repair WO ${randomUUID()}`,
      objective: "Repair the work order context binding",
      status: "READY",
      projectId,
      contextBindingStatus: "MISSING"
    }
  });
}

async function createRun() {
  return prisma.livingLoopRun.create({ data: { status: "STARTED", triggerType: "MANUAL" } });
}

async function createContextCandidate(workOrderId: string, projectId: string | null, loopRunId: string, reason = "context_missing"): Promise<AutomationCandidate> {
  return prisma.automationCandidate.create({
    data: {
      kind: "WORK_ORDER_REVIEW",
      title: `Bind Context: ${workOrderId}`,
      summary: "Work order has no project context binding.",
      reason: "Work order context binding must be FRESH before SANDBOX_PATCH jobs can run.",
      confidence: 75,
      priority: "MEDIUM",
      riskLevel: "LOW",
      sourceType: "WorkOrder",
      sourceId: workOrderId,
      projectId,
      workOrderId,
      proposedAction: { action: "bind_work_order_context", targetId: workOrderId },
      provenance: { source: "WorkOrder", id: workOrderId, kind: "WORK_ORDER_REVIEW", reason },
      status: "PENDING",
      loopRunId
    }
  });
}

type Ctx = { workOrderIds: string[]; candidateIds: string[]; runIds: string[]; projectIds: string[]; dirs: string[] };
function newCtx(): Ctx { return { workOrderIds: [], candidateIds: [], runIds: [], projectIds: [], dirs: [] }; }

async function cleanup(ctx: Ctx) {
  await prisma.auditLog.deleteMany({ where: { resourceId: { in: [...ctx.workOrderIds, ...ctx.candidateIds] } } }).catch(() => undefined);
  await prisma.automationCandidate.deleteMany({ where: { id: { in: ctx.candidateIds } } }).catch(() => undefined);
  await prisma.workOrder.deleteMany({ where: { id: { in: ctx.workOrderIds } } }).catch(() => undefined);
  for (const id of ctx.runIds) await prisma.livingLoopRun.delete({ where: { id } }).catch(() => undefined);
  for (const projectId of ctx.projectIds) {
    await prisma.localDocumentInsight.deleteMany({ where: { projectId } }).catch(() => undefined);
    await prisma.localDocumentSnapshot.deleteMany({ where: { projectId } }).catch(() => undefined);
    await prisma.localDocumentRoot.deleteMany({ where: { projectId } }).catch(() => undefined);
    await prisma.project.delete({ where: { id: projectId } }).catch(() => undefined);
  }
  for (const dir of ctx.dirs) await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
}

test("auto context repair disabled: candidate stays pending and context is not bound", async () => {
  const ctx = newCtx();
  try {
    await setSetting("LIVING_LOOP_AUTO_CONTEXT_REPAIR", "false");
    const repoDir = await makeTempRepo(); ctx.dirs.push(repoDir);
    const project = await createProjectWithScannableRoot(repoDir); ctx.projectIds.push(project.id);
    const wo = await createWorkOrder(project.id); ctx.workOrderIds.push(wo.id);
    const run = await createRun(); ctx.runIds.push(run.id);
    const candidate = await createContextCandidate(wo.id, project.id, run.id); ctx.candidateIds.push(candidate.id);

    const summary = await autoRepairContext(run.id, [candidate]);
    assert.equal(summary.enabled, false);
    assert.equal(summary.repaired.length, 0);
    assert.ok(summary.skippedReasons.some((r) => r.includes("disabled")));

    const refreshedWo = await prisma.workOrder.findUniqueOrThrow({ where: { id: wo.id } });
    assert.equal(refreshedWo.contextBindingStatus, "MISSING");
    const refreshedCandidate = await prisma.automationCandidate.findUniqueOrThrow({ where: { id: candidate.id } });
    assert.equal(refreshedCandidate.status, "PENDING");
  } finally {
    await cleanup(ctx);
  }
});

test("auto context repair enabled: MISSING context is rebound to FRESH and candidate is APPLIED", async () => {
  const ctx = newCtx();
  try {
    await setSetting("LIVING_LOOP_AUTO_CONTEXT_REPAIR", "true");
    await setSetting("LIVING_LOOP_MAX_DAILY_CONTEXT_REPAIRS", "1000");
    await setSetting("LIVING_LOOP_CONTEXT_REPAIR_COOLDOWN_MINUTES", "30");
    const repoDir = await makeTempRepo(); ctx.dirs.push(repoDir);
    const project = await createProjectWithScannableRoot(repoDir); ctx.projectIds.push(project.id);
    const wo = await createWorkOrder(project.id); ctx.workOrderIds.push(wo.id);
    const run = await createRun(); ctx.runIds.push(run.id);
    const candidate = await createContextCandidate(wo.id, project.id, run.id); ctx.candidateIds.push(candidate.id);

    const summary = await autoRepairContext(run.id, [candidate]);
    assert.equal(summary.enabled, true);
    assert.equal(summary.repaired.length, 1);
    const repaired = summary.repaired[0];
    assert.ok(repaired);
    assert.equal(repaired.workOrderId, wo.id);
    assert.equal(repaired.previousStatus, "MISSING");

    const refreshedWo = await prisma.workOrder.findUniqueOrThrow({ where: { id: wo.id } });
    assert.equal(refreshedWo.contextBindingStatus, "FRESH");
    const refreshedCandidate = await prisma.automationCandidate.findUniqueOrThrow({ where: { id: candidate.id } });
    assert.equal(refreshedCandidate.status, "APPLIED");

    const auditEntry = await prisma.auditLog.findFirst({ where: { action: AUTO_CONTEXT_REPAIR_ACTION, resourceId: wo.id } });
    assert.ok(auditEntry, "expected an auto context repair audit entry for the work order");
  } finally {
    await cleanup(ctx);
  }
});

test("auto context repair skips a candidate whose work order has no linked project", async () => {
  const ctx = newCtx();
  try {
    await setSetting("LIVING_LOOP_AUTO_CONTEXT_REPAIR", "true");
    await setSetting("LIVING_LOOP_MAX_DAILY_CONTEXT_REPAIRS", "1000");
    const wo = await createWorkOrder(null); ctx.workOrderIds.push(wo.id);
    const run = await createRun(); ctx.runIds.push(run.id);
    const candidate = await createContextCandidate(wo.id, null, run.id); ctx.candidateIds.push(candidate.id);

    const summary = await autoRepairContext(run.id, [candidate]);
    assert.equal(summary.repaired.length, 0);
    assert.ok(summary.skippedReasons.some((r) => r.includes("no linked project")));

    const refreshedCandidate = await prisma.automationCandidate.findUniqueOrThrow({ where: { id: candidate.id } });
    assert.equal(refreshedCandidate.status, "PENDING");
  } finally {
    await cleanup(ctx);
  }
});

test("auto context repair respects the per-work-order cooldown", async () => {
  const ctx = newCtx();
  try {
    await setSetting("LIVING_LOOP_AUTO_CONTEXT_REPAIR", "true");
    await setSetting("LIVING_LOOP_MAX_DAILY_CONTEXT_REPAIRS", "1000");
    await setSetting("LIVING_LOOP_CONTEXT_REPAIR_COOLDOWN_MINUTES", "30");
    const repoDir = await makeTempRepo(); ctx.dirs.push(repoDir);
    const project = await createProjectWithScannableRoot(repoDir); ctx.projectIds.push(project.id);
    const wo = await createWorkOrder(project.id); ctx.workOrderIds.push(wo.id);
    const run = await createRun(); ctx.runIds.push(run.id);
    const candidate = await createContextCandidate(wo.id, project.id, run.id); ctx.candidateIds.push(candidate.id);

    // Simulate a repair that just happened (within the cooldown window).
    await prisma.auditLog.create({ data: { action: AUTO_CONTEXT_REPAIR_ACTION, resourceType: "work_order", resourceId: wo.id, metadata: { loopRunId: run.id } } });

    const summary = await autoRepairContext(run.id, [candidate]);
    assert.equal(summary.repaired.length, 0);
    assert.ok(summary.skippedReasons.some((r) => r.includes("cooldown")));
  } finally {
    await cleanup(ctx);
  }
});

test("auto context repair respects the daily limit", async () => {
  const ctx = newCtx();
  try {
    await setSetting("LIVING_LOOP_AUTO_CONTEXT_REPAIR", "true");
    await setSetting("LIVING_LOOP_MAX_DAILY_CONTEXT_REPAIRS", "0");
    const repoDir = await makeTempRepo(); ctx.dirs.push(repoDir);
    const project = await createProjectWithScannableRoot(repoDir); ctx.projectIds.push(project.id);
    const wo = await createWorkOrder(project.id); ctx.workOrderIds.push(wo.id);
    const run = await createRun(); ctx.runIds.push(run.id);
    const candidate = await createContextCandidate(wo.id, project.id, run.id); ctx.candidateIds.push(candidate.id);

    const summary = await autoRepairContext(run.id, [candidate]);
    assert.equal(summary.repaired.length, 0);
    assert.ok(summary.skippedReasons.some((r) => r.toLowerCase().includes("daily")));

    const refreshedWo = await prisma.workOrder.findUniqueOrThrow({ where: { id: wo.id } });
    assert.equal(refreshedWo.contextBindingStatus, "MISSING");
  } finally {
    await cleanup(ctx);
  }
});
