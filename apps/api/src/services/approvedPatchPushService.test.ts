import assert from "node:assert/strict";
import test from "node:test";
import { prisma } from "../db/prisma.js";
import { createApprovedPatchPushJob, APPLY_APPROVED_PATCH_PUSH } from "./approvedPatchPushService.js";

async function makeUser() {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return prisma.user.create({
    data: { email: `push-king-${suffix}@aikingdom.local`, displayName: "Push King", passwordHash: "test", role: "KING" }
  });
}

async function makeFixture(opts: { validationStatus?: string; fullPatch?: string | null; fullPatchTruncated?: boolean; branchPushed?: boolean } = {}) {
  const user = await makeUser();
  const workOrder = await prisma.workOrder.create({
    data: { title: `Push WO ${Date.now()}`, objective: "Apply approved patch", acceptanceCriteria: [], validationCommands: [], createdByUserId: user.id, status: "NEEDS_REVIEW" }
  });
  const job = await prisma.automationJob.create({
    data: { workOrderId: workOrder.id, status: "NEEDS_REVIEW", mode: "SANDBOX_PATCH" }
  });
  const artifact = await prisma.patchArtifact.create({
    data: {
      automationJobId: job.id,
      workOrderId: workOrder.id,
      title: "Approved patch",
      summary: "diff",
      fullPatch: opts.fullPatch === undefined ? "diff --git a/x b/x\n+1" : opts.fullPatch,
      fullPatchTruncated: opts.fullPatchTruncated ?? false,
      riskLevel: "LOW",
      validationStatus: opts.validationStatus ?? "APPROVED",
      branchName: "kingdom/job-abc12345-fix",
      branchPushed: opts.branchPushed ?? false
    }
  });
  return { user, workOrder, job, artifact };
}

async function cleanup(workOrderId: string, userId: string) {
  await prisma.patchArtifact.deleteMany({ where: { workOrderId } }).catch(() => undefined);
  await prisma.automationJob.deleteMany({ where: { workOrderId } }).catch(() => undefined);
  await prisma.workOrder.delete({ where: { id: workOrderId } }).catch(() => undefined);
  await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
}

test("createApprovedPatchPushJob queues a SANDBOX_PATCH job carrying the approved diff + push policy", async () => {
  const { user, workOrder, artifact } = await makeFixture();
  try {
    const job = await createApprovedPatchPushJob(artifact.id, user.id);
    assert.equal(job.mode, "SANDBOX_PATCH");
    assert.equal(job.commandPolicy, APPLY_APPROVED_PATCH_PUSH);
    assert.equal(job.status, "QUEUED");
    assert.equal(job.importedPatch, artifact.fullPatch);
    assert.equal(job.contextValidationStatus, "NOT_REQUIRED");
    const prov = job.provenance as Record<string, unknown>;
    assert.equal(prov.sourcePatchArtifactId, artifact.id);
  } finally {
    await cleanup(workOrder.id, user.id);
  }
});

test("createApprovedPatchPushJob refuses a non-approved artifact", async () => {
  const { user, workOrder, artifact } = await makeFixture({ validationStatus: "PENDING" });
  try {
    await assert.rejects(() => createApprovedPatchPushJob(artifact.id, user.id), /APPROVED/);
  } finally {
    await cleanup(workOrder.id, user.id);
  }
});

test("createApprovedPatchPushJob refuses when the diff is missing or truncated", async () => {
  const missing = await makeFixture({ fullPatch: null });
  try {
    await assert.rejects(() => createApprovedPatchPushJob(missing.artifact.id, missing.user.id), /no stored diff/);
  } finally {
    await cleanup(missing.workOrder.id, missing.user.id);
  }

  const truncated = await makeFixture({ fullPatchTruncated: true });
  try {
    await assert.rejects(() => createApprovedPatchPushJob(truncated.artifact.id, truncated.user.id), /truncated/);
  } finally {
    await cleanup(truncated.workOrder.id, truncated.user.id);
  }
});

test("createApprovedPatchPushJob refuses an already-pushed patch and dedupes active apply jobs", async () => {
  const pushed = await makeFixture({ branchPushed: true });
  try {
    await assert.rejects(() => createApprovedPatchPushJob(pushed.artifact.id, pushed.user.id), /already been pushed/);
  } finally {
    await cleanup(pushed.workOrder.id, pushed.user.id);
  }

  const dup = await makeFixture();
  try {
    await createApprovedPatchPushJob(dup.artifact.id, dup.user.id);
    await assert.rejects(() => createApprovedPatchPushJob(dup.artifact.id, dup.user.id), /already active/);
  } finally {
    await cleanup(dup.workOrder.id, dup.user.id);
  }
});
