import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { prisma } from "../db/prisma.js";
import { createTestUser } from "../test/testDb.js";
import { createLocalDocumentRoot, scanLocalDocumentRoot } from "./localDocumentAccessService.js";
import { dispatchRetry, maybeAutoRetry } from "./supervisedRetryService.js";

const createdWorkOrderIds: string[] = [];
const createdJobIds: string[] = [];
const createdUserIds: string[] = [];

const SETTING_KEY = "SUPERVISED_AUTO_RETRY_ENABLED";

async function setAutoRetry(enabled: boolean) {
  await prisma.setting.upsert({
    where: { key: SETTING_KEY },
    update: { value: String(enabled) },
    create: { key: SETTING_KEY, value: String(enabled), category: "SYSTEM", description: "test" }
  });
}

async function makeJob(opts: {
  status?: "NEEDS_REVIEW" | "COMPLETED";
  mode?: "SANDBOX_PATCH" | "EXTERNAL_AGENT" | "VALIDATION_ONLY";
  priority?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  autoRetryCount?: number;
  maxAutoRetries?: number;
  createdByUserId?: string | null;
  review?: { verdict: string } | null;
}) {
  const suffix = randomUUID();
  const workOrder = await prisma.workOrder.create({
    data: {
      title: `retry-test ${suffix}`,
      objective: "Supervised retry policy test",
      status: "NEEDS_REVIEW",
      priority: opts.priority ?? "LOW",
      autoRetryCount: opts.autoRetryCount ?? 0,
      maxAutoRetries: opts.maxAutoRetries ?? 2,
      isTestData: true
    }
  });
  createdWorkOrderIds.push(workOrder.id);

  const job = await prisma.automationJob.create({
    data: {
      workOrderId: workOrder.id,
      status: opts.status ?? "NEEDS_REVIEW",
      mode: opts.mode ?? "SANDBOX_PATCH",
      createdByUserId: opts.createdByUserId === undefined ? null : opts.createdByUserId
    }
  });
  createdJobIds.push(job.id);

  if (opts.review) {
    await prisma.agentReviewSummary.create({
      data: {
        automationJobId: job.id,
        workOrderId: workOrder.id,
        verdict: opts.review.verdict,
        confidence: "MEDIUM",
        kingRecommendation: "REQUEST_REVISION",
        summary: "test review"
      }
    });
  }

  return { workOrder, job };
}

after(async () => {
  await setAutoRetry(false);
  await prisma.agentReviewSummary.deleteMany({ where: { automationJobId: { in: createdJobIds } } }).catch(() => undefined);
  await prisma.automationJob.deleteMany({ where: { id: { in: createdJobIds } } }).catch(() => undefined);
  await prisma.notice.deleteMany({ where: { sourceId: { in: createdJobIds } } }).catch(() => undefined);
  await prisma.workOrder.deleteMany({ where: { id: { in: createdWorkOrderIds } } }).catch(() => undefined);
  await prisma.refreshToken.deleteMany({ where: { userId: { in: createdUserIds } } }).catch(() => undefined);
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } }).catch(() => undefined);
  await prisma.$disconnect();
});

// ---- dispatchRetry guards ----

test("dispatchRetry throws ConflictError when the job is not NEEDS_REVIEW", async () => {
  const { job } = await makeJob({ status: "COMPLETED", review: { verdict: "VALIDATION_FAILED" } });
  await assert.rejects(
    () => dispatchRetry({ jobId: job.id, triggeredBy: "KING", userId: "u" }),
    (err: Error) => err.name === "ConflictError"
  );
});

test("dispatchRetry returns mode_not_retryable for VALIDATION_ONLY", async () => {
  const { job } = await makeJob({ mode: "VALIDATION_ONLY", review: { verdict: "VALIDATION_FAILED" } });
  const result = await dispatchRetry({ jobId: job.id, triggeredBy: "KING", userId: "u" });
  assert.equal(result.retried, false);
  assert.match((result as { reason: string }).reason, /^mode_not_retryable/);
});

test("dispatchRetry refuses when there is no mechanical-failure review", async () => {
  const noReview = await makeJob({ review: null });
  const a = await dispatchRetry({ jobId: noReview.job.id, triggeredBy: "KING", userId: "u" });
  assert.equal(a.retried, false);
  assert.match((a as { reason: string }).reason, /^verdict_not_retryable/);

  const semantic = await makeJob({ review: { verdict: "NEEDS_FIX" } });
  const b = await dispatchRetry({ jobId: semantic.job.id, triggeredBy: "KING", userId: "u" });
  assert.equal(b.retried, false);
  assert.match((b as { reason: string }).reason, /^verdict_not_retryable/);
});

test("dispatchRetry returns retries_exhausted at the cap", async () => {
  const { job } = await makeJob({ autoRetryCount: 2, maxAutoRetries: 2, review: { verdict: "PATCH_FAILED" } });
  const result = await dispatchRetry({ jobId: job.id, triggeredBy: "KING", userId: "u" });
  assert.equal(result.retried, false);
  assert.equal((result as { reason: string }).reason, "retries_exhausted");
});

// ---- maybeAutoRetry gating ----

test("maybeAutoRetry is a no-op when the setting is off (default)", async () => {
  await setAutoRetry(false);
  const { job } = await makeJob({ priority: "LOW" });
  const result = await maybeAutoRetry({ job: { id: job.id, mode: job.mode, createdByUserId: job.createdByUserId }, verdict: "VALIDATION_FAILED" });
  assert.equal(result.retried, false);
  assert.equal((result as { reason: string }).reason, "auto_retry_disabled");
});

test("maybeAutoRetry skips a non-mechanical verdict", async () => {
  await setAutoRetry(true);
  const { job } = await makeJob({ priority: "LOW", createdByUserId: null });
  const result = await maybeAutoRetry({ job: { id: job.id, mode: job.mode, createdByUserId: job.createdByUserId }, verdict: "NEEDS_FIX" });
  assert.equal(result.retried, false);
  assert.match((result as { reason: string }).reason, /^verdict_not_mechanical/);
});

test("maybeAutoRetry skips non-LOW priority work", async () => {
  await setAutoRetry(true);
  const { user } = await createTestUser(randomUUID());
  createdUserIds.push(user.id);
  const { job } = await makeJob({ priority: "MEDIUM", createdByUserId: user.id });
  const result = await maybeAutoRetry({ job: { id: job.id, mode: job.mode, createdByUserId: job.createdByUserId }, verdict: "VALIDATION_FAILED" });
  assert.equal(result.retried, false);
  assert.match((result as { reason: string }).reason, /^priority_not_low/);
});

// ---- dispatchRetry happy path (the actual re-dispatch) ----

test("dispatchRetry re-dispatches a failed SANDBOX_PATCH job: old CANCELLED, count++, new job created", async () => {
  const { user } = await createTestUser(randomUUID());
  createdUserIds.push(user.id);

  // FRESH context: a scanned local document root on a linked project.
  const project = await prisma.project.create({ data: { name: `retry-fresh ${randomUUID()}` } });
  const repoDir = await fs.mkdtemp(path.join(os.tmpdir(), "retry-test-"));
  await fs.writeFile(path.join(repoDir, "README.md"), "# fixture");
  await fs.writeFile(path.join(repoDir, "package.json"), JSON.stringify({ name: "fixture", scripts: { test: "vitest" } }));
  const root = await createLocalDocumentRoot(project.id, { name: "repo", rootPath: repoDir });
  await scanLocalDocumentRoot(root.id);

  // WorkOrder with NO assigned internal/external agent → createAutomationJob skips plan
  // generation and the external-agent CLI, so no provider call is made.
  const workOrder = await prisma.workOrder.create({
    data: {
      title: `retry-happy ${randomUUID()}`,
      objective: "Re-dispatch after a mechanical failure",
      projectId: project.id,
      status: "NEEDS_REVIEW",
      priority: "LOW",
      autoRetryCount: 0,
      maxAutoRetries: 2,
      isTestData: true
    }
  });
  createdWorkOrderIds.push(workOrder.id);

  const failedJob = await prisma.automationJob.create({
    data: { workOrderId: workOrder.id, projectId: project.id, status: "NEEDS_REVIEW", mode: "SANDBOX_PATCH", createdByUserId: user.id }
  });
  createdJobIds.push(failedJob.id);
  await prisma.agentReviewSummary.create({
    data: {
      automationJobId: failedJob.id,
      workOrderId: workOrder.id,
      verdict: "PATCH_FAILED",
      confidence: "HIGH",
      kingRecommendation: "RETRY_WITH_FIXED_PATCH",
      summary: "Patch failed to apply.",
      whatFailed: ["git apply --check failed"]
    }
  });

  try {
    const result = await dispatchRetry({ jobId: failedJob.id, triggeredBy: "KING", userId: user.id });
    assert.equal(result.retried, true);
    const newJobId = (result as { newJobId: string }).newJobId;
    assert.equal((result as { attempt: number }).attempt, 1);

    const oldJob = await prisma.automationJob.findUnique({ where: { id: failedJob.id } });
    assert.equal(oldJob?.status, "CANCELLED");

    const updatedWO = await prisma.workOrder.findUnique({ where: { id: workOrder.id } });
    assert.equal(updatedWO?.autoRetryCount, 1);

    const newJob = await prisma.automationJob.findUnique({ where: { id: newJobId } });
    assert.ok(newJob);
    assert.notEqual(newJob!.id, failedJob.id);
    assert.equal(newJob!.mode, "SANDBOX_PATCH");
    assert.equal(newJob!.status, "APPROVED"); // the retry is the authorization
  } finally {
    const jobs = await prisma.automationJob.findMany({ where: { workOrderId: workOrder.id }, select: { id: true } });
    const jobIds = jobs.map((j) => j.id);
    await prisma.agentReviewSummary.deleteMany({ where: { automationJobId: { in: jobIds } } }).catch(() => undefined);
    await prisma.implementationReport.deleteMany({ where: { automationJobId: { in: jobIds } } }).catch(() => undefined);
    await prisma.automationJob.deleteMany({ where: { workOrderId: workOrder.id } }).catch(() => undefined);
    await prisma.workOrder.delete({ where: { id: workOrder.id } }).catch(() => undefined);
    await prisma.project.delete({ where: { id: project.id } }).catch(() => undefined);
    await fs.rm(repoDir, { recursive: true, force: true }).catch(() => undefined);
  }
});

test("maybeAutoRetry escalates to the King when retries are exhausted", async () => {
  await setAutoRetry(true);
  const { user } = await createTestUser(randomUUID());
  createdUserIds.push(user.id);
  const { job } = await makeJob({ priority: "LOW", autoRetryCount: 2, maxAutoRetries: 2, createdByUserId: user.id });
  const result = await maybeAutoRetry({ job: { id: job.id, mode: job.mode, createdByUserId: job.createdByUserId }, verdict: "VALIDATION_FAILED" });
  assert.equal(result.retried, false);
  assert.equal((result as { reason: string; escalated?: boolean }).reason, "retries_exhausted");
  assert.equal((result as { escalated?: boolean }).escalated, true);
});
