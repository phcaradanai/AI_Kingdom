import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import bcrypt from "bcryptjs";
import { prisma } from "../db/prisma.js";
import {
  attachContextToPatchArtifact,
  bindFreshContextToWorkOrder,
  explainContextBindingStatus,
  getProjectContextBinding,
  markWorkOrderContextStale,
  validateContextForAutomationJob
} from "./projectContextBindingService.js";
import { createAutomationJob, submitReport } from "./automationJobService.js";
import { createWorkOrder } from "./externalAgentWorkOrderService.js";
import {
  createLocalDocumentRoot,
  getLatestLocalDocumentSnapshot,
  markLocalSnapshotStale,
  scanLocalDocumentRoot
} from "./localDocumentAccessService.js";

async function createProject() {
  return prisma.project.create({ data: { name: `Context Binding Test ${randomUUID()}` } });
}

async function makeTempRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "context-binding-test-"));
  await fs.writeFile(path.join(dir, "README.md"), "# Context Binding Fixture\n\nUsed by projectContextBinding tests.");
  await fs.writeFile(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "fixture", scripts: { dev: "vite", test: "vitest" }, dependencies: { express: "^4.0.0" } }, null, 2)
  );
  return dir;
}

async function cleanup(projectId: string, ...dirs: string[]) {
  await prisma.project.delete({ where: { id: projectId } }).catch(() => undefined);
  for (const dir of dirs) {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

async function createKingUser() {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return prisma.user.create({
    data: {
      email: `context-binding-king-${suffix}@aikingdom.local`,
      displayName: "Context Binding King",
      passwordHash: await bcrypt.hash("StrongPass123", 12),
      role: "KING",
      isActive: true
    }
  });
}

test("getProjectContextBinding: PARTIAL without roots, MISSING before scan, FRESH after scan", async () => {
  const project = await createProject();
  const repoDir = await makeTempRepo();
  try {
    const noRoots = await getProjectContextBinding(project.id);
    assert.equal(noRoots.status, "PARTIAL");
    assert.ok(noRoots.warnings.some((w) => w.includes("No Local Document Root")));

    const root = await createLocalDocumentRoot(project.id, { name: "repo", rootPath: repoDir });
    const noSnapshot = await getProjectContextBinding(project.id);
    assert.equal(noSnapshot.status, "MISSING");
    assert.equal(noSnapshot.localDocumentSnapshotId, null);

    const snapshot = await scanLocalDocumentRoot(root.id);
    const fresh = await getProjectContextBinding(project.id);
    assert.equal(fresh.status, "FRESH");
    assert.equal(fresh.localDocumentSnapshotId, snapshot.id);
    assert.ok(fresh.importantDocs.includes("README.md"));
    assert.equal(fresh.rootPathHashes[0]?.length, 64, "provenance carries path hashes, not raw paths");
  } finally {
    await cleanup(project.id, repoDir);
  }
});

test("work order creation auto-binds the latest READY local snapshot", async () => {
  const project = await createProject();
  const repoDir = await makeTempRepo();
  try {
    const root = await createLocalDocumentRoot(project.id, { name: "repo", rootPath: repoDir });
    const snapshot = await scanLocalDocumentRoot(root.id);

    const result = await createWorkOrder(
      {
        title: `Context Binding WO ${randomUUID()}`,
        objective: "Verify that work order creation automatically binds the latest local docs snapshot for the project.",
        projectId: project.id,
        status: "READY"
      },
      true
    );
    assert.equal(result.status, "CREATED");
    const workOrder = result.workOrder!;
    assert.equal(workOrder.contextBindingStatus, "FRESH");
    assert.equal(workOrder.localDocumentSnapshotId, snapshot.id);
    assert.ok(workOrder.contextBoundAt, "contextBoundAt must be set");

    const summary = workOrder.contextBindingSummary as Record<string, unknown>;
    assert.equal(summary.projectId, project.id);
    assert.equal(summary.localDocumentSnapshotId, snapshot.id);
    assert.ok(Array.isArray(summary.importantDocs));

    const provenance = workOrder.contextBindingProvenance as Record<string, unknown>;
    assert.equal(provenance.source, "PROJECT_CONTEXT_BINDING");
    assert.ok(Array.isArray(provenance.rootIds) && (provenance.rootIds as string[]).includes(root.id));
  } finally {
    await prisma.workOrder.deleteMany({ where: { projectId: project.id } }).catch(() => undefined);
    await cleanup(project.id, repoDir);
  }
});

test("mark-context-stale sets STALE and bind-context restores FRESH", async () => {
  const project = await createProject();
  const repoDir = await makeTempRepo();
  try {
    const root = await createLocalDocumentRoot(project.id, { name: "repo", rootPath: repoDir });
    await scanLocalDocumentRoot(root.id);
    const workOrder = await prisma.workOrder.create({
      data: { title: `Stale Rebind WO ${randomUUID()}`, objective: "Test objective", status: "READY", projectId: project.id }
    });

    const stale = await markWorkOrderContextStale(workOrder.id, "Docs changed underneath the binding");
    assert.equal(stale.contextBindingStatus, "STALE");
    const staleSummary = stale.contextBindingSummary as Record<string, unknown>;
    assert.equal(staleSummary.staleReason, "Docs changed underneath the binding");

    const { workOrder: rebound, binding } = await bindFreshContextToWorkOrder(workOrder.id);
    assert.equal(rebound.contextBindingStatus, "FRESH");
    assert.equal(binding?.status, "FRESH");

    const audit = await prisma.auditLog.findFirst({
      where: { action: "work_order_context_bound", resourceId: workOrder.id },
      orderBy: { createdAt: "desc" }
    });
    assert.ok(audit, "binding must be audited");
  } finally {
    await prisma.workOrder.deleteMany({ where: { projectId: project.id } }).catch(() => undefined);
    await cleanup(project.id, repoDir);
  }
});

test("stale local docs snapshot makes the work order binding STALE", async () => {
  const project = await createProject();
  const repoDir = await makeTempRepo();
  try {
    const root = await createLocalDocumentRoot(project.id, { name: "repo", rootPath: repoDir });
    await scanLocalDocumentRoot(root.id);
    await markLocalSnapshotStale(project.id, "test-induced staleness");

    const workOrder = await prisma.workOrder.create({
      data: { title: `Stale Docs WO ${randomUUID()}`, objective: "Test objective", status: "READY", projectId: project.id }
    });
    const { workOrder: bound } = await bindFreshContextToWorkOrder(workOrder.id);
    assert.equal(bound.contextBindingStatus, "STALE");
  } finally {
    await prisma.workOrder.deleteMany({ where: { projectId: project.id } }).catch(() => undefined);
    await cleanup(project.id, repoDir);
  }
});

test("validateContextForAutomationJob enforces SANDBOX_PATCH rules and allows VALIDATION_ONLY with warnings", async () => {
  const noProjectWO = await prisma.workOrder.create({
    data: { title: `No Project WO ${randomUUID()}`, objective: "Test objective", status: "READY" }
  });
  const partialProject = await createProject(); // no roots → PARTIAL
  const partialWO = await prisma.workOrder.create({
    data: { title: `Partial WO ${randomUUID()}`, objective: "Test objective", status: "READY", projectId: partialProject.id }
  });
  const missingProject = await createProject();
  const repoDir = await makeTempRepo();
  let missingWO: { id: string } | null = null;
  let staleWO: { id: string } | null = null;
  try {
    // No project linkage
    const projectMissing = await validateContextForAutomationJob(noProjectWO.id, "SANDBOX_PATCH");
    assert.equal(projectMissing.ok, false);
    assert.equal(projectMissing.skipToken, "project_missing");

    const notRequired = await validateContextForAutomationJob(noProjectWO.id, "VALIDATION_ONLY");
    assert.equal(notRequired.ok, true);
    assert.equal(notRequired.status, "NOT_REQUIRED");

    // PARTIAL (project without roots)
    const partialPatch = await validateContextForAutomationJob(partialWO.id, "SANDBOX_PATCH");
    assert.equal(partialPatch.ok, false);
    assert.equal(partialPatch.skipToken, "partial");

    const partialValidation = await validateContextForAutomationJob(partialWO.id, "VALIDATION_ONLY");
    assert.equal(partialValidation.ok, true);
    assert.equal(partialValidation.status, "PARTIAL");
    assert.ok(partialValidation.warnings.length > 0, "PARTIAL validation must carry a warning");

    // MISSING (root configured but never scanned)
    const missingRoot = await createLocalDocumentRoot(missingProject.id, { name: "repo", rootPath: repoDir });
    missingWO = await prisma.workOrder.create({
      data: { title: `Missing WO ${randomUUID()}`, objective: "Test objective", status: "READY", projectId: missingProject.id }
    });
    const missing = await validateContextForAutomationJob(missingWO.id, "SANDBOX_PATCH");
    assert.equal(missing.ok, false);
    assert.equal(missing.skipToken, "missing");

    // FRESH then STALE
    await scanLocalDocumentRoot(missingRoot.id);
    const fresh = await validateContextForAutomationJob(missingWO.id, "SANDBOX_PATCH");
    assert.equal(fresh.ok, true);
    assert.equal(fresh.status, "FRESH");

    await markLocalSnapshotStale(missingProject.id, "test-induced staleness");
    staleWO = missingWO;
    const stale = await validateContextForAutomationJob(staleWO.id, "SANDBOX_PATCH");
    assert.equal(stale.ok, false);
    assert.equal(stale.skipToken, "stale");
  } finally {
    await prisma.workOrder.deleteMany({ where: { id: { in: [noProjectWO.id, partialWO.id, ...(missingWO ? [missingWO.id] : [])] } } }).catch(() => undefined);
    await cleanup(partialProject.id);
    await cleanup(missingProject.id, repoDir);
  }
});

test("createAutomationJob stores context ids for VALIDATION_ONLY and rejects SANDBOX_PATCH on missing context", async () => {
  const user = await createKingUser();
  const project = await createProject();
  const repoDir = await makeTempRepo();
  let jobId: string | null = null;
  try {
    const root = await createLocalDocumentRoot(project.id, { name: "repo", rootPath: repoDir });
    const snapshot = await scanLocalDocumentRoot(root.id);
    const workOrder = await prisma.workOrder.create({
      data: { title: `Job Context WO ${randomUUID()}`, objective: "Test objective", status: "READY", projectId: project.id }
    });

    const job = await createAutomationJob({ workOrderId: workOrder.id, mode: "VALIDATION_ONLY", createdByUserId: user.id });
    jobId = job.id;
    assert.equal(job.contextValidationStatus, "FRESH");
    assert.equal(job.contextRequired, false);
    assert.equal(job.localDocumentSnapshotId, snapshot.id);
    const summary = job.contextValidationSummary as Record<string, unknown>;
    assert.equal(summary.status, "FRESH");
    const provenance = job.provenance as Record<string, unknown>;
    assert.ok(provenance.contextBinding, "job provenance must include the context binding");

    // SANDBOX_PATCH against a project with no snapshot is rejected with a clear error.
    const blockedProject = await createProject();
    await createLocalDocumentRoot(blockedProject.id, { name: "repo", rootPath: repoDir });
    const blockedWO = await prisma.workOrder.create({
      data: { title: `Blocked Patch WO ${randomUUID()}`, objective: "Test objective", status: "READY", projectId: blockedProject.id }
    });
    try {
      await assert.rejects(
        () => createAutomationJob({ workOrderId: blockedWO.id, mode: "SANDBOX_PATCH", createdByUserId: user.id }),
        (err: Error) => err.name === "ContextBindingError"
      );
      const audit = await prisma.auditLog.findFirst({
        where: { action: "automation_job_context_rejected", resourceId: blockedWO.id }
      });
      assert.ok(audit, "rejection must be audited");
    } finally {
      await prisma.workOrder.delete({ where: { id: blockedWO.id } }).catch(() => undefined);
      await cleanup(blockedProject.id);
    }
  } finally {
    if (jobId) await prisma.automationJob.delete({ where: { id: jobId } }).catch(() => undefined);
    await prisma.workOrder.deleteMany({ where: { projectId: project.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
    await cleanup(project.id, repoDir);
  }
});

test("patch artifacts and implementation reports store base context provenance", async () => {
  const project = await createProject();
  const repoDir = await makeTempRepo();
  const runner = await prisma.agentRunner.create({
    data: { name: `Context Runner ${randomUUID()}`, status: "ONLINE", tokenHash: randomUUID(), lastHeartbeatAt: new Date() }
  });
  try {
    const root = await createLocalDocumentRoot(project.id, { name: "repo", rootPath: repoDir });
    const snapshot = await scanLocalDocumentRoot(root.id);
    const workOrder = await prisma.workOrder.create({
      data: { title: `Patch Context WO ${randomUUID()}`, objective: "Test objective", status: "READY", projectId: project.id }
    });
    const job = await prisma.automationJob.create({
      data: {
        workOrderId: workOrder.id,
        projectId: project.id,
        mode: "SANDBOX_PATCH",
        status: "RUNNING",
        runnerId: runner.id,
        localDocumentSnapshotId: snapshot.id,
        contextRequired: true,
        contextValidationStatus: "FRESH",
        contextValidationSummary: { status: "FRESH", warnings: [] }
      }
    });

    const artifact = await prisma.patchArtifact.create({
      data: {
        automationJobId: job.id,
        workOrderId: workOrder.id,
        projectId: project.id,
        title: "Test patch",
        summary: "Test patch summary",
        filesChanged: ["README.md"]
      }
    });
    await attachContextToPatchArtifact(artifact.id, job);
    const updatedArtifact = await prisma.patchArtifact.findUniqueOrThrow({ where: { id: artifact.id } });
    assert.equal(updatedArtifact.baseContextStatus, "FRESH");
    assert.equal(updatedArtifact.localDocumentSnapshotId, snapshot.id);
    const baseProvenance = updatedArtifact.baseContextProvenance as Record<string, unknown>;
    assert.equal(baseProvenance.source, "PROJECT_CONTEXT_BINDING");
    assert.equal(baseProvenance.automationJobId, job.id);

    const report = await submitReport(job.id, runner.id, {
      summary: "Sandbox run with context",
      filesChanged: ["README.md"],
      commandsRun: ["npm run test"],
      testsRun: ["npm run test"],
      testResult: "PASSED",
      errors: [],
      decisionsMade: [],
      remainingWork: [],
      contextUsed: { localDocumentSnapshotId: snapshot.id, contextValidationStatus: "FRESH", warnings: [] }
    });
    assert.equal(report.localDocumentSnapshotId, snapshot.id);
    const contextUsed = report.contextUsed as Record<string, unknown>;
    assert.equal(contextUsed.contextValidationStatus, "FRESH");
  } finally {
    await prisma.workOrder.deleteMany({ where: { projectId: project.id } }).catch(() => undefined);
    await prisma.agentRunner.delete({ where: { id: runner.id } }).catch(() => undefined);
    await cleanup(project.id, repoDir);
  }
});

test("createAutomationJob allows VALIDATION_ONLY with drift warning when WorkOrder is bound to an older snapshot", async () => {
  const user = await createKingUser();
  const project = await createProject();
  const repoDir = await makeTempRepo();
  try {
    const root = await createLocalDocumentRoot(project.id, { name: "repo", rootPath: repoDir });
    // First scan — snapshot A
    await scanLocalDocumentRoot(root.id);
    const workOrder = await prisma.workOrder.create({
      data: { title: `Snapshot Drift WO ${randomUUID()}`, objective: "Test objective", status: "READY", projectId: project.id }
    });
    // Bind context → WO.localDocumentSnapshotId = snapshot A
    await bindFreshContextToWorkOrder(workOrder.id);

    // Second scan — snapshot B is now the project's latest
    await scanLocalDocumentRoot(root.id);

    // VALIDATION_ONLY passes the drift gate (read-only) — job is created with a drift warning.
    const job = await createAutomationJob({ workOrderId: workOrder.id, mode: "VALIDATION_ONLY", createdByUserId: user.id });
    assert.equal(job.mode, "VALIDATION_ONLY");
    const summary = job.contextValidationSummary as Record<string, unknown>;
    assert.ok(summary.snapshotDrift, "drift warning should be present in contextValidationSummary");
    const drift = summary.snapshotDrift as Record<string, unknown>;
    assert.equal(drift.warning, true);
    assert.ok(drift.message);

    await prisma.automationJob.delete({ where: { id: job.id } }).catch(() => undefined);
  } finally {
    await prisma.workOrder.deleteMany({ where: { projectId: project.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
    await cleanup(project.id, repoDir);
  }
});

test("createAutomationJob rejects SANDBOX_PATCH with ContextBindingError when WorkOrder is bound to an older snapshot", async () => {
  const user = await createKingUser();
  const project = await createProject();
  const repoDir = await makeTempRepo();
  try {
    const root = await createLocalDocumentRoot(project.id, { name: "repo", rootPath: repoDir });
    await scanLocalDocumentRoot(root.id);
    const workOrder = await prisma.workOrder.create({
      data: { title: `Snapshot Drift SANDBOX WO ${randomUUID()}`, objective: "Test objective", status: "READY", projectId: project.id }
    });
    await bindFreshContextToWorkOrder(workOrder.id);
    // Advance the project's latest snapshot — WO now bound to an older one.
    await scanLocalDocumentRoot(root.id);

    await assert.rejects(
      () => createAutomationJob({ workOrderId: workOrder.id, mode: "SANDBOX_PATCH", createdByUserId: user.id }),
      (err: Error) => err.name === "ContextBindingError" && err.message.includes("outdated local-document snapshot")
    );
  } finally {
    await prisma.workOrder.deleteMany({ where: { projectId: project.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
    await cleanup(project.id, repoDir);
  }
});

test("explainContextBindingStatus flags a work order bound to an older snapshot", async () => {
  const project = await createProject();
  const repoDir = await makeTempRepo();
  try {
    const root = await createLocalDocumentRoot(project.id, { name: "repo", rootPath: repoDir });
    await scanLocalDocumentRoot(root.id);
    const workOrder = await prisma.workOrder.create({
      data: { title: `Explain WO ${randomUUID()}`, objective: "Test objective", status: "READY", projectId: project.id }
    });
    await bindFreshContextToWorkOrder(workOrder.id);

    // A newer scan supersedes the bound snapshot.
    await scanLocalDocumentRoot(root.id);
    const latest = await getLatestLocalDocumentSnapshot(project.id);
    const bound = await prisma.workOrder.findUniqueOrThrow({ where: { id: workOrder.id } });
    assert.notEqual(bound.localDocumentSnapshotId, latest?.id);

    const explanation = await explainContextBindingStatus(project.id, workOrder.id);
    assert.ok(explanation.lines.some((line) => line.includes("older local docs snapshot")));
  } finally {
    await prisma.workOrder.deleteMany({ where: { projectId: project.id } }).catch(() => undefined);
    await cleanup(project.id, repoDir);
  }
});
