import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { prisma } from "../db/prisma.js";
import {
  repairWorkOrderContext,
  repairProjectWorkOrderContexts
} from "./projectContextBindingService.js";
import {
  createLocalDocumentRoot,
  markLocalSnapshotStale,
  scanLocalDocumentRoot
} from "./localDocumentAccessService.js";

async function createProject() {
  return prisma.project.create({ data: { name: `Context Repair Test ${randomUUID()}` } });
}

async function makeTempRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "context-repair-test-"));
  await fs.writeFile(path.join(dir, "README.md"), "# Context Repair Fixture\n");
  return dir;
}

async function cleanup(projectId: string, ...dirs: string[]) {
  await prisma.workOrder.deleteMany({ where: { projectId } }).catch(() => undefined);
  await prisma.project.delete({ where: { id: projectId } }).catch(() => undefined);
  for (const dir of dirs) {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test("repairWorkOrderContext: MISSING → FRESH when project has a scanned snapshot", async () => {
  const project = await createProject();
  const repoDir = await makeTempRepo();
  try {
    const root = await createLocalDocumentRoot(project.id, { name: "repo", rootPath: repoDir });
    await scanLocalDocumentRoot(root.id);

    const workOrder = await prisma.workOrder.create({
      data: { title: `Repair Missing WO ${randomUUID()}`, objective: "Test objective", status: "READY", projectId: project.id }
    });
    assert.equal(workOrder.contextBindingStatus, "MISSING");

    const result = await repairWorkOrderContext(workOrder.id);
    assert.equal(result.status, "BOUND");
    assert.equal(result.previousStatus, "MISSING");
    assert.equal(result.newStatus, "FRESH");

    const updated = await prisma.workOrder.findUniqueOrThrow({ where: { id: workOrder.id } });
    assert.equal(updated.contextBindingStatus, "FRESH");
    assert.ok(updated.contextBoundAt, "contextBoundAt must be set after repair");
  } finally {
    await cleanup(project.id, repoDir);
  }
});

test("repairWorkOrderContext: STALE → FRESH after re-binding with valid snapshot", async () => {
  const project = await createProject();
  const repoDir = await makeTempRepo();
  try {
    const root = await createLocalDocumentRoot(project.id, { name: "repo", rootPath: repoDir });
    await scanLocalDocumentRoot(root.id);

    const workOrder = await prisma.workOrder.create({
      data: { title: `Repair Stale WO ${randomUUID()}`, objective: "Test objective", status: "READY", projectId: project.id, contextBindingStatus: "STALE" }
    });

    const result = await repairWorkOrderContext(workOrder.id);
    assert.equal(result.status, "BOUND");
    assert.equal(result.previousStatus, "STALE");
    assert.equal(result.newStatus, "FRESH");

    const updated = await prisma.workOrder.findUniqueOrThrow({ where: { id: workOrder.id } });
    assert.equal(updated.contextBindingStatus, "FRESH");
  } finally {
    await cleanup(project.id, repoDir);
  }
});

test("repairWorkOrderContext: no project → SKIPPED, row not mutated", async () => {
  const workOrder = await prisma.workOrder.create({
    data: { title: `Repair No Project WO ${randomUUID()}`, objective: "Test objective", status: "READY" }
  });
  try {
    const result = await repairWorkOrderContext(workOrder.id);
    assert.equal(result.status, "SKIPPED");
    assert.equal(result.skipReason, "no_project");
    assert.equal(result.newStatus, null);

    const unchanged = await prisma.workOrder.findUniqueOrThrow({ where: { id: workOrder.id } });
    assert.equal(unchanged.contextBoundAt, null, "contextBoundAt must not be written when skipped");
  } finally {
    await prisma.workOrder.delete({ where: { id: workOrder.id } }).catch(() => undefined);
  }
});

test("repairWorkOrderContext: snapshot unavailable → remains MISSING", async () => {
  const project = await createProject();
  const repoDir = await makeTempRepo();
  try {
    await createLocalDocumentRoot(project.id, { name: "repo", rootPath: repoDir });
    // Root configured but never scanned — no snapshot available

    const workOrder = await prisma.workOrder.create({
      data: { title: `Repair No Snapshot WO ${randomUUID()}`, objective: "Test objective", status: "READY", projectId: project.id }
    });

    const result = await repairWorkOrderContext(workOrder.id);
    assert.equal(result.status, "BOUND");
    assert.equal(result.newStatus, "MISSING");

    const updated = await prisma.workOrder.findUniqueOrThrow({ where: { id: workOrder.id } });
    assert.equal(updated.contextBindingStatus, "MISSING");
  } finally {
    await cleanup(project.id, repoDir);
  }
});

test("repairProjectWorkOrderContexts: bulk-repairs MISSING and STALE, skips no-project WOs", async () => {
  const project = await createProject();
  const repoDir = await makeTempRepo();
  const noProjectWo = await prisma.workOrder.create({
    data: { title: `Bulk No Project WO ${randomUUID()}`, objective: "Test objective", status: "READY" }
  });
  try {
    const root = await createLocalDocumentRoot(project.id, { name: "repo", rootPath: repoDir });
    await scanLocalDocumentRoot(root.id);

    const missing = await prisma.workOrder.create({
      data: { title: `Bulk Missing WO ${randomUUID()}`, objective: "Test objective", status: "READY", projectId: project.id }
    });
    const stale = await prisma.workOrder.create({
      data: { title: `Bulk Stale WO ${randomUUID()}`, objective: "Test objective", status: "READY", projectId: project.id, contextBindingStatus: "STALE" }
    });
    const fresh = await prisma.workOrder.create({
      data: { title: `Bulk Fresh WO ${randomUUID()}`, objective: "Test objective", status: "READY", projectId: project.id, contextBindingStatus: "FRESH" }
    });

    const bulk = await repairProjectWorkOrderContexts(project.id);
    assert.equal(bulk.projectId, project.id);
    // Only MISSING and STALE are included (fresh is excluded from the query)
    assert.equal(bulk.results.length, 2);
    assert.equal(bulk.repaired, 2, "both MISSING and STALE should become FRESH");
    assert.equal(bulk.skipped, 0);

    const updatedMissing = await prisma.workOrder.findUniqueOrThrow({ where: { id: missing.id } });
    const updatedStale = await prisma.workOrder.findUniqueOrThrow({ where: { id: stale.id } });
    const untouchedFresh = await prisma.workOrder.findUniqueOrThrow({ where: { id: fresh.id } });
    assert.equal(updatedMissing.contextBindingStatus, "FRESH");
    assert.equal(updatedStale.contextBindingStatus, "FRESH");
    assert.equal(untouchedFresh.contextBindingStatus, "FRESH", "fresh WO must not be touched");
    assert.equal(untouchedFresh.contextBoundAt, null, "fresh WO contextBoundAt must remain null");
  } finally {
    await prisma.workOrder.delete({ where: { id: noProjectWo.id } }).catch(() => undefined);
    await cleanup(project.id, repoDir);
  }
});

test("repairProjectWorkOrderContexts: stale snapshot → all WOs remain MISSING after repair attempt", async () => {
  const project = await createProject();
  const repoDir = await makeTempRepo();
  try {
    const root = await createLocalDocumentRoot(project.id, { name: "repo", rootPath: repoDir });
    await scanLocalDocumentRoot(root.id);
    await markLocalSnapshotStale(project.id, "test-induced staleness");

    const wo = await prisma.workOrder.create({
      data: { title: `Bulk Stale Snap WO ${randomUUID()}`, objective: "Test objective", status: "READY", projectId: project.id }
    });

    const bulk = await repairProjectWorkOrderContexts(project.id);
    assert.equal(bulk.repaired, 0, "stale snapshot → cannot repair to FRESH");
    assert.equal(bulk.attempted, 1);

    const updated = await prisma.workOrder.findUniqueOrThrow({ where: { id: wo.id } });
    assert.equal(updated.contextBindingStatus, "STALE");
  } finally {
    await cleanup(project.id, repoDir);
  }
});
