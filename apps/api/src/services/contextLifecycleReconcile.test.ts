import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { prisma } from "../db/prisma.js";
import {
  extractMilestoneCode,
  isMilestoneConfirmedInStatus,
  reconcileContextWarnings
} from "./workOrderLifecycleReconcileService.js";
import {
  createLocalDocumentRoot,
  scanLocalDocumentRoot
} from "./localDocumentAccessService.js";

// ---- pure function unit tests ----

test("extractMilestoneCode: extracts M16B from title", () => {
  assert.equal(extractMilestoneCode("M16B Planner Agent + Context Awareness"), "M16B");
});

test("extractMilestoneCode: extracts M17E-2 from title", () => {
  assert.equal(extractMilestoneCode("M17E-2 WorkOrder Context Binding"), "M17E-2");
});

test("extractMilestoneCode: returns null for non-milestone titles", () => {
  assert.equal(extractMilestoneCode("Planner Agent Overhaul"), null);
});

test("isMilestoneConfirmedInStatus: detects code with (complete) on same line", () => {
  const content = "- M16B (complete): Planner Agent feature was delivered.\n- M17A: pending";
  assert.equal(isMilestoneConfirmedInStatus("M16B", content), true);
});

test("isMilestoneConfirmedInStatus: does not match when code absent", () => {
  const content = "- M16A (complete): Some other milestone.\n- M17A: pending";
  assert.equal(isMilestoneConfirmedInStatus("M16B", content), false);
});

test("isMilestoneConfirmedInStatus: M17E does not false-positive on M17E-2 (complete)", () => {
  const content = "- M17E-2 (complete): Context binding.\n- M17E-3: planned";
  // M17E alone should NOT match M17E-2 (complete) — the -2 suffix means it's a different milestone
  assert.equal(isMilestoneConfirmedInStatus("M17E", content), false);
});

test("isMilestoneConfirmedInStatus: M17E-2 matches M17E-2 (complete)", () => {
  const content = "- M17E-2 (complete): Context binding.";
  assert.equal(isMilestoneConfirmedInStatus("M17E-2", content), true);
});

// ---- integration tests ----

async function makeTempRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "reconcile-test-"));
  await fs.writeFile(path.join(dir, "README.md"), "# Reconcile Fixture\n");
  return dir;
}

async function cleanup(opts: { projectId?: string; workOrderIds?: string[]; dirs?: string[] }) {
  if (opts.workOrderIds?.length) {
    await prisma.implementationReport.deleteMany({ where: { workOrderId: { in: opts.workOrderIds } } }).catch(() => undefined);
    await prisma.handoffBrief.deleteMany({ where: { workOrderId: { in: opts.workOrderIds } } }).catch(() => undefined);
    await prisma.workOrder.deleteMany({ where: { id: { in: opts.workOrderIds } } }).catch(() => undefined);
  }
  if (opts.projectId) {
    await prisma.workOrder.deleteMany({ where: { projectId: opts.projectId } }).catch(() => undefined);
    await prisma.project.delete({ where: { id: opts.projectId } }).catch(() => undefined);
  }
  for (const dir of opts.dirs ?? []) {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test("reconcile: WO with PASSED impl report and no remaining work → ARCHIVED", async () => {
  const wo = await prisma.workOrder.create({
    data: {
      title: `M99A Completed Feature ${randomUUID()}`,
      objective: "Test objective",
      status: "READY",
      contextBindingStatus: "MISSING"
    }
  });
  await prisma.implementationReport.create({
    data: {
      workOrderId: wo.id,
      summary: "Feature delivered",
      testResult: "PASSED",
      remainingWork: []
    }
  });
  try {
    const result = await reconcileContextWarnings({ projectStatusContent: "" });
    const entry = result.results.find((r) => r.workOrderId === wo.id);
    assert.ok(entry, "WO should appear in results");
    assert.equal(entry.action, "ARCHIVED");
    assert.ok(entry.evidenceFound.some((e) => e.includes("ImplementationReport")));

    const updated = await prisma.workOrder.findUniqueOrThrow({ where: { id: wo.id } });
    assert.equal(updated.status, "ARCHIVED");
    assert.ok(updated.archiveReason?.includes("lifecycle reconciliation"));
    assert.equal(updated.workQuality, "COMPLETED_ARCHIVE");
    assert.ok(updated.archivedAt);
    assert.equal(result.archived, 1);
  } finally {
    await cleanup({ workOrderIds: [wo.id] });
  }
});

test("reconcile: WO with completion handoff brief → ARCHIVED", async () => {
  const wo = await prisma.workOrder.create({
    data: {
      title: `M99B Handoff Complete ${randomUUID()}`,
      objective: "Test objective",
      status: "IN_PROGRESS",
      contextBindingStatus: "STALE"
    }
  });
  await prisma.handoffBrief.create({
    data: {
      workOrderId: wo.id,
      title: "Final handoff",
      currentStatus: "All work is complete and delivered",
      nextSteps: [],
      handoffPrompt: "Nothing remaining"
    }
  });
  try {
    const result = await reconcileContextWarnings({ projectStatusContent: "" });
    const entry = result.results.find((r) => r.workOrderId === wo.id);
    assert.ok(entry);
    assert.equal(entry.action, "ARCHIVED");
    assert.ok(entry.evidenceFound.some((e) => e.includes("HandoffBrief")));

    const updated = await prisma.workOrder.findUniqueOrThrow({ where: { id: wo.id } });
    assert.equal(updated.status, "ARCHIVED");
  } finally {
    await cleanup({ workOrderIds: [wo.id] });
  }
});

test("reconcile: WO with PROJECT_STATUS.md confirmation → ARCHIVED", async () => {
  const code = `M99Z`;
  const wo = await prisma.workOrder.create({
    data: {
      title: `${code} Test Milestone ${randomUUID()}`,
      objective: "Test objective",
      status: "READY",
      contextBindingStatus: "MISSING"
    }
  });
  const statusContent = `- ${code} (complete): This milestone was delivered.\n- M99ZA: pending`;
  try {
    const result = await reconcileContextWarnings({ projectStatusContent: statusContent });
    const entry = result.results.find((r) => r.workOrderId === wo.id);
    assert.ok(entry);
    assert.equal(entry.action, "ARCHIVED");
    assert.ok(entry.evidenceFound.some((e) => e.includes("PROJECT_STATUS.md")));

    const updated = await prisma.workOrder.findUniqueOrThrow({ where: { id: wo.id } });
    assert.equal(updated.status, "ARCHIVED");
  } finally {
    await cleanup({ workOrderIds: [wo.id] });
  }
});

test("reconcile: WO with project and scanned snapshot and no completion evidence → CONTEXT_REPAIRED", async () => {
  const project = await prisma.project.create({ data: { name: `Reconcile Project ${randomUUID()}` } });
  const repoDir = await makeTempRepo();
  try {
    const root = await createLocalDocumentRoot(project.id, { name: "repo", rootPath: repoDir });
    await scanLocalDocumentRoot(root.id);

    const wo = await prisma.workOrder.create({
      data: {
        title: `Active WO No Evidence ${randomUUID()}`,
        objective: "Still in progress",
        status: "READY",
        projectId: project.id,
        contextBindingStatus: "MISSING"
      }
    });

    const result = await reconcileContextWarnings({ projectStatusContent: "" });
    const entry = result.results.find((r) => r.workOrderId === wo.id);
    assert.ok(entry);
    assert.equal(entry.action, "CONTEXT_REPAIRED");
    assert.equal(result.contextRepaired >= 1, true);

    const updated = await prisma.workOrder.findUniqueOrThrow({ where: { id: wo.id } });
    assert.equal(updated.status, "READY", "status unchanged — only context binding updated");
    assert.equal(updated.contextBindingStatus, "FRESH");
  } finally {
    await cleanup({ projectId: project.id, dirs: [repoDir] });
  }
});

test("reconcile: WO with no project and no evidence → SKIPPED", async () => {
  const wo = await prisma.workOrder.create({
    data: {
      title: `No Project No Evidence ${randomUUID()}`,
      objective: "Unlinked work order",
      status: "READY",
      contextBindingStatus: "MISSING"
    }
  });
  try {
    const result = await reconcileContextWarnings({ projectStatusContent: "" });
    const entry = result.results.find((r) => r.workOrderId === wo.id);
    assert.ok(entry);
    assert.equal(entry.action, "SKIPPED");
    assert.ok(entry.reason.includes("No linked project"));
    assert.equal(result.skipped >= 1, true);

    const unchanged = await prisma.workOrder.findUniqueOrThrow({ where: { id: wo.id } });
    assert.equal(unchanged.status, "READY", "status must not be mutated when SKIPPED");
  } finally {
    await cleanup({ workOrderIds: [wo.id] });
  }
});

test("reconcile: NEEDS_REVIEW WO with completion handoff brief → ARCHIVED", async () => {
  const wo = await prisma.workOrder.create({
    data: {
      title: `M99C Needs Review Complete ${randomUUID()}`,
      objective: "Was in review when context went stale",
      status: "NEEDS_REVIEW",
      contextBindingStatus: "STALE"
    }
  });
  await prisma.handoffBrief.create({
    data: {
      workOrderId: wo.id,
      title: "Final review handoff",
      currentStatus: "Work is finished and delivered to review",
      nextSteps: [],
      handoffPrompt: "Nothing remaining"
    }
  });
  try {
    const result = await reconcileContextWarnings({ projectStatusContent: "" });
    const entry = result.results.find((r) => r.workOrderId === wo.id);
    assert.ok(entry, "NEEDS_REVIEW WO should appear in results");
    assert.equal(entry.action, "ARCHIVED");
    assert.ok(entry.evidenceFound.some((e) => e.includes("HandoffBrief")));
    assert.equal(entry.previousStatus, "NEEDS_REVIEW");
    assert.equal(entry.newStatus, "ARCHIVED");

    const updated = await prisma.workOrder.findUniqueOrThrow({ where: { id: wo.id } });
    assert.equal(updated.status, "ARCHIVED");
    assert.equal(updated.workQuality, "COMPLETED_ARCHIVE");
    assert.ok(updated.archivedAt);
  } finally {
    await cleanup({ workOrderIds: [wo.id] });
  }
});

test("reconcile: audit log is created when WO is archived", async () => {
  const wo = await prisma.workOrder.create({
    data: {
      title: `M99D Audit Log Test ${randomUUID()}`,
      objective: "Audit trail test",
      status: "READY",
      contextBindingStatus: "MISSING"
    }
  });
  await prisma.implementationReport.create({
    data: {
      workOrderId: wo.id,
      summary: "Feature delivered",
      testResult: "PASSED",
      remainingWork: []
    }
  });
  try {
    await reconcileContextWarnings({ projectStatusContent: "" });

    const logs = await prisma.auditLog.findMany({
      where: { action: "reconcile_archive_work_order", resourceId: wo.id }
    });
    assert.equal(logs.length, 1, "exactly one audit log entry for the archive");
    const log = logs[0]!;
    assert.equal(log.userId, null, "system-triggered reconcile has null userId");
    assert.equal(log.resourceType, "work_order");
    const meta = log.metadata as Record<string, unknown>;
    assert.equal(meta.previousStatus, "READY");
    assert.ok(Array.isArray(meta.evidence) && (meta.evidence as string[]).length > 0);
  } finally {
    await cleanup({ workOrderIds: [wo.id] });
    await prisma.auditLog.deleteMany({ where: { action: "reconcile_archive_work_order", resourceId: wo.id } }).catch(() => undefined);
  }
});

test("reconcile: FRESH WO and already-ARCHIVED WO are not inspected", async () => {
  const freshWo = await prisma.workOrder.create({
    data: {
      title: `Fresh WO Should Be Skipped ${randomUUID()}`,
      objective: "Fresh context",
      status: "READY",
      contextBindingStatus: "FRESH"
    }
  });
  const archivedWo = await prisma.workOrder.create({
    data: {
      title: `Archived WO Should Be Skipped ${randomUUID()}`,
      objective: "Already done",
      status: "ARCHIVED",
      contextBindingStatus: "MISSING"
    }
  });
  try {
    const result = await reconcileContextWarnings({ projectStatusContent: "" });
    const freshEntry = result.results.find((r) => r.workOrderId === freshWo.id);
    const archivedEntry = result.results.find((r) => r.workOrderId === archivedWo.id);
    assert.equal(freshEntry, undefined, "FRESH WO must not appear in reconcile results");
    assert.equal(archivedEntry, undefined, "Already-ARCHIVED WO must not appear in reconcile results");
  } finally {
    await cleanup({ workOrderIds: [freshWo.id, archivedWo.id] });
  }
});
