import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { prisma } from "../db/prisma.js";
import { refreshWorkOrderContext } from "./refreshWorkOrderContextService.js";
import { createLocalDocumentRoot, scanLocalDocumentRoot } from "./localDocumentAccessService.js";

async function createProject() {
  return prisma.project.create({ data: { name: `Refresh Context Test ${randomUUID()}` } });
}

async function makeTempRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "refresh-context-test-"));
  await fs.writeFile(path.join(dir, "README.md"), "# Refresh Context Fixture\n");
  return dir;
}

async function cleanup(projectId: string, ...dirs: string[]) {
  await prisma.workOrder.deleteMany({ where: { projectId } }).catch(() => undefined);
  await prisma.project.delete({ where: { id: projectId } }).catch(() => undefined);
  for (const dir of dirs) {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test("refreshWorkOrderContext: no project → SKIPPED, no scan", async () => {
  const workOrder = await prisma.workOrder.create({
    data: { title: `Refresh No Project WO ${randomUUID()}`, objective: "Test objective", status: "READY" }
  });
  try {
    const result = await refreshWorkOrderContext(workOrder.id);
    assert.equal(result.status, "SKIPPED");
    assert.equal(result.skipReason, "no_project");
    assert.equal(result.scanRan, false);
    assert.equal(result.newStatus, null);

    const unchanged = await prisma.workOrder.findUniqueOrThrow({ where: { id: workOrder.id } });
    assert.equal(unchanged.contextBoundAt, null, "contextBoundAt must not be written when skipped");
  } finally {
    await prisma.workOrder.delete({ where: { id: workOrder.id } }).catch(() => undefined);
  }
});

test("refreshWorkOrderContext: MISSING with no snapshot → scans → FRESH", async () => {
  const project = await createProject();
  const repoDir = await makeTempRepo();
  try {
    await createLocalDocumentRoot(project.id, { name: "repo", rootPath: repoDir });

    const workOrder = await prisma.workOrder.create({
      data: { title: `Refresh Missing WO ${randomUUID()}`, objective: "Test objective", status: "READY", projectId: project.id }
    });
    assert.equal(workOrder.contextBindingStatus, "MISSING");

    const result = await refreshWorkOrderContext(workOrder.id);
    assert.equal(result.status, "REFRESHED");
    assert.equal(result.oldStatus, "MISSING");
    assert.equal(result.scanRan, true);
    assert.equal(result.newStatus, "FRESH");
    assert.deepEqual(result.scanFailures, []);

    const updated = await prisma.workOrder.findUniqueOrThrow({ where: { id: workOrder.id } });
    assert.equal(updated.contextBindingStatus, "FRESH");
    assert.ok(updated.contextBoundAt, "contextBoundAt must be set after refresh");
  } finally {
    await cleanup(project.id, repoDir);
  }
});

test("refreshWorkOrderContext: STALE with changed local docs → scans → FRESH", async () => {
  const project = await createProject();
  const repoDir = await makeTempRepo();
  try {
    const root = await createLocalDocumentRoot(project.id, { name: "repo", rootPath: repoDir });
    // Scan to create an initial snapshot, then modify a file to make docs changed
    await scanLocalDocumentRoot(root.id);

    const workOrder = await prisma.workOrder.create({
      data: {
        title: `Refresh Stale WO ${randomUUID()}`,
        objective: "Test objective",
        status: "READY",
        projectId: project.id,
        contextBindingStatus: "STALE"
      }
    });

    // Modify a tracked file to simulate local docs changed
    await fs.writeFile(path.join(repoDir, "README.md"), "# Updated content\n");

    const result = await refreshWorkOrderContext(workOrder.id);
    assert.equal(result.status, "REFRESHED");
    assert.equal(result.oldStatus, "STALE");
    assert.equal(result.scanRan, true);
    // After re-scanning, the new snapshot covers the updated files → FRESH
    assert.equal(result.newStatus, "FRESH");
    assert.deepEqual(result.scanFailures, []);
  } finally {
    await cleanup(project.id, repoDir);
  }
});

test("refreshWorkOrderContext: scan failure on bad root path → scanRan true, scanFailures recorded, still rebinds", async () => {
  const project = await createProject();
  // Create a real dir so createLocalDocumentRoot accepts it, then delete it so scan fails
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "refresh-context-bad-root-"));
  try {
    await createLocalDocumentRoot(project.id, { name: "bad-root", rootPath: tempDir });
    // Remove the dir so the scan cannot access it
    await fs.rm(tempDir, { recursive: true, force: true });

    const workOrder = await prisma.workOrder.create({
      data: { title: `Refresh Scan Fail WO ${randomUUID()}`, objective: "Test objective", status: "READY", projectId: project.id }
    });

    const result = await refreshWorkOrderContext(workOrder.id);
    assert.equal(result.status, "REFRESHED");
    assert.equal(result.scanRan, true, "scanRan must be true even when scan produces a FAILED snapshot");
    assert.ok(result.scanFailures.length > 0, "scanFailures must record the failed root");
    assert.match(result.scanFailures[0]!, /bad-root/);
    // newStatus will be MISSING since no snapshot succeeded
    assert.equal(result.newStatus, "MISSING");
  } finally {
    await cleanup(project.id);
  }
});

test("refreshWorkOrderContext: no active roots → no scan, rebinds as PARTIAL", async () => {
  const project = await createProject();
  const workOrder = await prisma.workOrder.create({
    data: { title: `Refresh No Roots WO ${randomUUID()}`, objective: "Test objective", status: "READY", projectId: project.id }
  });
  try {
    const result = await refreshWorkOrderContext(workOrder.id);
    assert.equal(result.status, "REFRESHED");
    assert.equal(result.scanRan, false);
    assert.deepEqual(result.scanFailures, []);
    // No roots → PARTIAL binding status
    assert.equal(result.newStatus, "PARTIAL");
  } finally {
    await cleanup(project.id);
  }
});
