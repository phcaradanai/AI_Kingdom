import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { prisma } from "../db/prisma.js";
import { checkProjectLocalDocsHealth, proposeAutomationCandidates, type Observation } from "./livingLoopService.js";
import { createLocalDocumentRoot, scanLocalDocumentRoot } from "./localDocumentAccessService.js";

async function createProject() {
  return prisma.project.create({ data: { name: `Local Docs Loop Test ${randomUUID()}` } });
}

async function makeTempRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "local-docs-loop-test-"));
  await fs.writeFile(path.join(dir, "README.md"), "# Loop Test\n\nLocal docs health check fixture.");
  return dir;
}

async function cleanup(projectId: string, ...dirs: string[]) {
  await prisma.project.delete({ where: { id: projectId } }).catch(() => undefined);
  for (const dir of dirs) {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

function emptyObservation(): Observation {
  return {
    workOrdersNeedingReview: [],
    staleWorkOrders: [],
    failedJobs: [],
    needsReviewJobs: [],
    staleJobs: [],
    patchesPendingReview: [],
    staleRunners: [],
    providerIssues: [],
    staleInboxItems: [],
    workOrdersReadyForPatch: [],
    mattersAwaitingDecision: [],
    reportsWithRemainingWork: [],
    localDocsIssues: [],
    workOrdersMissingLocalContext: []
  };
}

test("checkProjectLocalDocsHealth reports MISSING_ROOT when no root is configured", async () => {
  const project = await createProject();
  try {
    const issue = await checkProjectLocalDocsHealth(project.id, project.name);
    assert.equal(issue?.issue, "MISSING_ROOT");
    assert.equal(issue?.projectId, project.id);
  } finally {
    await cleanup(project.id);
  }
});

test("checkProjectLocalDocsHealth reports MISSING_SNAPSHOT when a root exists but was never scanned", async () => {
  const project = await createProject();
  const dir = await makeTempRepo();
  try {
    await createLocalDocumentRoot(project.id, { name: "repo", rootPath: dir });
    const issue = await checkProjectLocalDocsHealth(project.id, project.name);
    assert.equal(issue?.issue, "MISSING_SNAPSHOT");
  } finally {
    await cleanup(project.id, dir);
  }
});

test("checkProjectLocalDocsHealth reports SCAN_FAILED when the latest scan failed", async () => {
  const project = await createProject();
  const dir = await makeTempRepo();
  try {
    const root = await createLocalDocumentRoot(project.id, { name: "repo", rootPath: dir });
    await fs.rm(dir, { recursive: true, force: true });
    await scanLocalDocumentRoot(root.id);

    const issue = await checkProjectLocalDocsHealth(project.id, project.name);
    assert.equal(issue?.issue, "SCAN_FAILED");
  } finally {
    await cleanup(project.id, dir);
  }
});

test("checkProjectLocalDocsHealth reports STALE_SNAPSHOT when the snapshot is older than the freshness window", async () => {
  const project = await createProject();
  const dir = await makeTempRepo();
  try {
    const root = await createLocalDocumentRoot(project.id, { name: "repo", rootPath: dir });
    const snapshot = await scanLocalDocumentRoot(root.id);
    await prisma.localDocumentSnapshot.update({
      where: { id: snapshot.id },
      data: { scannedAt: new Date(Date.now() - 25 * 3600 * 1000) }
    });

    const issue = await checkProjectLocalDocsHealth(project.id, project.name);
    assert.equal(issue?.issue, "STALE_SNAPSHOT");
  } finally {
    await cleanup(project.id, dir);
  }
});

test("checkProjectLocalDocsHealth reports DOCS_CHANGED and marks the snapshot stale when a tracked doc changes", async () => {
  const project = await createProject();
  const dir = await makeTempRepo();
  try {
    const root = await createLocalDocumentRoot(project.id, { name: "repo", rootPath: dir });
    const snapshot = await scanLocalDocumentRoot(root.id);

    const future = new Date(Date.now() + 60_000);
    await fs.utimes(path.join(dir, "README.md"), future, future);

    const issue = await checkProjectLocalDocsHealth(project.id, project.name);
    assert.equal(issue?.issue, "DOCS_CHANGED");
    assert.match(issue?.detail ?? "", /README\.md/);

    const stored = await prisma.localDocumentSnapshot.findUnique({ where: { id: snapshot.id } });
    assert.equal(stored?.scanStatus, "STALE");
  } finally {
    await cleanup(project.id, dir);
  }
});

test("checkProjectLocalDocsHealth returns null for a fresh, unchanged snapshot", async () => {
  const project = await createProject();
  const dir = await makeTempRepo();
  try {
    const root = await createLocalDocumentRoot(project.id, { name: "repo", rootPath: dir });
    await scanLocalDocumentRoot(root.id);

    const issue = await checkProjectLocalDocsHealth(project.id, project.name);
    assert.equal(issue, null);
  } finally {
    await cleanup(project.id, dir);
  }
});

test("local docs issues propose PROJECT_REVIEW candidates with provenance", async () => {
  const obs = emptyObservation();
  obs.localDocsIssues.push({
    projectId: "project-1",
    projectName: "Castle",
    issue: "MISSING_ROOT",
    detail: "No Local Document Root is configured for this project."
  });

  const candidates = await proposeAutomationCandidates(obs, { minConfidence: 70, maxCandidatesPerRun: 50, maxDailyCandidates: 1000, todayCount: 0 });
  const candidate = candidates.find((c) => c.kind === "PROJECT_REVIEW" && c.sourceId === "project-1");
  assert.ok(candidate, "expected a PROJECT_REVIEW candidate for the local docs issue");
  assert.equal(candidate!.title, "Local Docs Root Missing: Castle");
  assert.equal(candidate!.projectId, "project-1");
  assert.equal((candidate!.provenance as Record<string, unknown>).localDocsIssue, "MISSING_ROOT");
  assert.equal((candidate!.proposedAction as Record<string, unknown>).action, "review_local_docs");
});

test("work orders blocked by missing local context propose WORK_ORDER_REVIEW candidates", async () => {
  const obs = emptyObservation();
  obs.workOrdersMissingLocalContext.push({
    id: "wo-1",
    title: "Refactor the gate",
    priority: "HIGH",
    projectId: "project-1",
    projectName: "Castle"
  });

  const candidates = await proposeAutomationCandidates(obs, { minConfidence: 70, maxCandidatesPerRun: 50, maxDailyCandidates: 1000, todayCount: 0 });
  const candidate = candidates.find((c) => c.kind === "WORK_ORDER_REVIEW" && c.sourceId === "wo-1");
  assert.ok(candidate, "expected a WORK_ORDER_REVIEW candidate for the blocked work order");
  assert.equal(candidate!.title, "Work Order Blocked: Refactor the gate");
  assert.equal(candidate!.priority, "HIGH");
  assert.equal((candidate!.provenance as Record<string, unknown>).reason, "missing_local_context");
  assert.equal((candidate!.proposedAction as Record<string, unknown>).action, "review_local_docs_blocker");
});
