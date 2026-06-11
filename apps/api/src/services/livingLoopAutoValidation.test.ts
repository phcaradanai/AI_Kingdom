import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import type { AutomationCandidate } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import {
  AUTO_VALIDATION_PROVENANCE_SOURCE,
  autoCreateValidationJobs,
  countAutoValidationJobsToday,
  isWorkOrderEligibleForValidation,
  observeKingdomState,
  proposeAutomationCandidates
} from "./livingLoopService.js";

async function setSetting(key: string, value: string) {
  await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value, category: "SYSTEM" } });
}

async function createWorkOrder(overrides?: { status?: "NEEDS_REVIEW" | "ARCHIVED" | "CANCELLED" | "FAILED"; isTestData?: boolean }) {
  return prisma.workOrder.create({
    data: {
      title: `Auto Validation WO ${randomUUID()}`,
      objective: "Verify the implementation passes validation checks",
      status: overrides?.status ?? "NEEDS_REVIEW",
      isTestData: overrides?.isTestData ?? false
    }
  });
}

async function createRun() {
  return prisma.livingLoopRun.create({ data: { status: "STARTED", triggerType: "MANUAL" } });
}

async function createOnlineRunner() {
  return prisma.agentRunner.create({
    data: { name: `Validation Runner ${randomUUID()}`, status: "ONLINE", tokenHash: randomUUID(), lastHeartbeatAt: new Date() }
  });
}

async function createValidationCandidate(workOrderId: string, loopRunId: string, confidence = 80): Promise<AutomationCandidate> {
  return prisma.automationCandidate.create({
    data: {
      kind: "VALIDATION_JOB",
      title: `Validate Work Order: auto validation test ${randomUUID()}`,
      summary: "Run validation-only checks for a work order awaiting review.",
      reason: "Work order is in NEEDS_REVIEW; safe VALIDATION_ONLY job can verify it.",
      confidence,
      priority: "MEDIUM",
      riskLevel: "LOW",
      sourceType: "WorkOrder",
      sourceId: workOrderId,
      workOrderId,
      proposedAction: { action: "create_validation_job", targetId: workOrderId, mode: "VALIDATION_ONLY" },
      provenance: { source: "WorkOrder", id: workOrderId, kind: "VALIDATION_JOB" },
      status: "PENDING",
      loopRunId
    }
  });
}

type Ctx = { workOrderIds: string[]; candidateIds: string[]; runIds: string[]; runnerIds: string[]; jobIds: string[] };

async function cleanup(ctx: Ctx) {
  await prisma.automationJob.deleteMany({ where: { OR: [{ id: { in: ctx.jobIds } }, { workOrderId: { in: ctx.workOrderIds } }] } }).catch(() => undefined);
  await prisma.automationCandidate.deleteMany({ where: { id: { in: ctx.candidateIds } } }).catch(() => undefined);
  for (const id of ctx.runIds) await prisma.livingLoopRun.delete({ where: { id } }).catch(() => undefined);
  await prisma.agentRunner.deleteMany({ where: { id: { in: ctx.runnerIds } } }).catch(() => undefined);
  await prisma.workOrder.deleteMany({ where: { id: { in: ctx.workOrderIds } } }).catch(() => undefined);
}

function newCtx(): Ctx {
  return { workOrderIds: [], candidateIds: [], runIds: [], runnerIds: [], jobIds: [] };
}

test("auto validation disabled: candidates remain pending and no job is created", async () => {
  const ctx = newCtx();
  try {
    await setSetting("LIVING_LOOP_AUTO_CREATE_VALIDATION_JOBS", "false");
    const wo = await createWorkOrder(); ctx.workOrderIds.push(wo.id);
    const run = await createRun(); ctx.runIds.push(run.id);
    const candidate = await createValidationCandidate(wo.id, run.id); ctx.candidateIds.push(candidate.id);

    const summary = await autoCreateValidationJobs(run.id, [candidate]);
    assert.equal(summary.enabled, false);
    assert.equal(summary.createdJobs.length, 0);
    assert.ok(summary.skippedReasons.some((r) => r.includes("disabled")));

    const jobs = await prisma.automationJob.findMany({ where: { workOrderId: wo.id } });
    assert.equal(jobs.length, 0);
    const refreshed = await prisma.automationCandidate.findUniqueOrThrow({ where: { id: candidate.id } });
    assert.equal(refreshed.status, "PENDING");
  } finally {
    await cleanup(ctx);
  }
});

test("auto validation enabled: creates VALIDATION_ONLY job linked to candidate and run, candidate becomes APPLIED, audit written", async () => {
  const ctx = newCtx();
  try {
    await setSetting("LIVING_LOOP_AUTO_CREATE_VALIDATION_JOBS", "true");
    await setSetting("LIVING_LOOP_MIN_CONFIDENCE", "70");
    await setSetting("LIVING_LOOP_MAX_DAILY_VALIDATION_JOBS", "1000");
    await setSetting("LIVING_LOOP_VALIDATION_JOB_COOLDOWN_MINUTES", "60");
    const runner = await createOnlineRunner(); ctx.runnerIds.push(runner.id);
    const wo = await createWorkOrder(); ctx.workOrderIds.push(wo.id);
    const run = await createRun(); ctx.runIds.push(run.id);
    const candidate = await createValidationCandidate(wo.id, run.id, 85); ctx.candidateIds.push(candidate.id);

    const summary = await autoCreateValidationJobs(run.id, [candidate]);
    assert.equal(summary.enabled, true);
    assert.equal(summary.createdJobs.length, 1);
    const { jobId } = summary.createdJobs[0]!;
    ctx.jobIds.push(jobId);

    // Job is VALIDATION_ONLY, claimable, and carries loopRunId + candidateId provenance
    const job = await prisma.automationJob.findUniqueOrThrow({ where: { id: jobId } });
    assert.equal(job.mode, "VALIDATION_ONLY");
    assert.equal(job.status, "APPROVED");
    assert.equal(job.workOrderId, wo.id);
    const provenance = job.provenance as { source: string; loopRunId: string; candidateId: string };
    assert.equal(provenance.source, AUTO_VALIDATION_PROVENANCE_SOURCE);
    assert.equal(provenance.loopRunId, run.id);
    assert.equal(provenance.candidateId, candidate.id);

    // Candidate becomes APPLIED and links to the job
    const applied = await prisma.automationCandidate.findUniqueOrThrow({ where: { id: candidate.id } });
    assert.equal(applied.status, "APPLIED");
    assert.equal(applied.automationJobId, jobId);

    // Audit log entry exists
    const audit = await prisma.auditLog.findFirst({ where: { action: "living_loop_auto_validation_job_created", resourceId: jobId } });
    assert.ok(audit, "expected living_loop_auto_validation_job_created audit entry");
  } finally {
    await cleanup(ctx);
  }
});

test("duplicate active job prevents auto validation", async () => {
  const ctx = newCtx();
  try {
    await setSetting("LIVING_LOOP_AUTO_CREATE_VALIDATION_JOBS", "true");
    await setSetting("LIVING_LOOP_MAX_DAILY_VALIDATION_JOBS", "1000");
    const runner = await createOnlineRunner(); ctx.runnerIds.push(runner.id);
    const wo = await createWorkOrder(); ctx.workOrderIds.push(wo.id);
    const existing = await prisma.automationJob.create({ data: { workOrderId: wo.id, mode: "SANDBOX_PATCH", status: "RUNNING" } });
    ctx.jobIds.push(existing.id);
    const run = await createRun(); ctx.runIds.push(run.id);
    const candidate = await createValidationCandidate(wo.id, run.id); ctx.candidateIds.push(candidate.id);

    const summary = await autoCreateValidationJobs(run.id, [candidate]);
    assert.equal(summary.createdJobs.length, 0);
    assert.ok(summary.skippedReasons.some((r) => r.includes("Active automation job")));

    const jobs = await prisma.automationJob.findMany({ where: { workOrderId: wo.id } });
    assert.equal(jobs.length, 1);
  } finally {
    await cleanup(ctx);
  }
});

test("cooldown prevents repeated validation job and writes cooldown audit", async () => {
  const ctx = newCtx();
  try {
    await setSetting("LIVING_LOOP_AUTO_CREATE_VALIDATION_JOBS", "true");
    await setSetting("LIVING_LOOP_MAX_DAILY_VALIDATION_JOBS", "1000");
    await setSetting("LIVING_LOOP_VALIDATION_JOB_COOLDOWN_MINUTES", "60");
    const runner = await createOnlineRunner(); ctx.runnerIds.push(runner.id);
    const wo = await createWorkOrder(); ctx.workOrderIds.push(wo.id);
    // Recent VALIDATION_ONLY job in a terminal state (so the active-job guard does not trigger first)
    const recent = await prisma.automationJob.create({ data: { workOrderId: wo.id, mode: "VALIDATION_ONLY", status: "COMPLETED" } });
    ctx.jobIds.push(recent.id);
    const run = await createRun(); ctx.runIds.push(run.id);
    const candidate = await createValidationCandidate(wo.id, run.id); ctx.candidateIds.push(candidate.id);

    const summary = await autoCreateValidationJobs(run.id, [candidate]);
    assert.equal(summary.createdJobs.length, 0);
    assert.ok(summary.skippedReasons.some((r) => r.includes("cooldown")));

    const audit = await prisma.auditLog.findFirst({ where: { action: "validation_job_cooldown_blocked", resourceId: candidate.id } });
    assert.ok(audit, "expected validation_job_cooldown_blocked audit entry");
  } finally {
    await cleanup(ctx);
  }
});

test("daily validation limit is enforced with audit", async () => {
  const ctx = newCtx();
  try {
    await setSetting("LIVING_LOOP_AUTO_CREATE_VALIDATION_JOBS", "true");
    const todayCount = await countAutoValidationJobsToday();
    await setSetting("LIVING_LOOP_MAX_DAILY_VALIDATION_JOBS", String(todayCount));
    const runner = await createOnlineRunner(); ctx.runnerIds.push(runner.id);
    const wo = await createWorkOrder(); ctx.workOrderIds.push(wo.id);
    const run = await createRun(); ctx.runIds.push(run.id);
    const candidate = await createValidationCandidate(wo.id, run.id); ctx.candidateIds.push(candidate.id);

    const summary = await autoCreateValidationJobs(run.id, [candidate]);
    assert.equal(summary.createdJobs.length, 0);
    assert.ok(summary.skippedReasons.some((r) => r.includes("Daily validation job limit")));

    const audit = await prisma.auditLog.findFirst({ where: { action: "validation_job_daily_limit_blocked", resourceId: candidate.id } });
    assert.ok(audit, "expected validation_job_daily_limit_blocked audit entry");
  } finally {
    await cleanup(ctx);
    await setSetting("LIVING_LOOP_MAX_DAILY_VALIDATION_JOBS", "10");
  }
});

test("low confidence candidate is skipped", async () => {
  const ctx = newCtx();
  try {
    await setSetting("LIVING_LOOP_AUTO_CREATE_VALIDATION_JOBS", "true");
    await setSetting("LIVING_LOOP_MIN_CONFIDENCE", "70");
    await setSetting("LIVING_LOOP_MAX_DAILY_VALIDATION_JOBS", "1000");
    const runner = await createOnlineRunner(); ctx.runnerIds.push(runner.id);
    const wo = await createWorkOrder(); ctx.workOrderIds.push(wo.id);
    const run = await createRun(); ctx.runIds.push(run.id);
    const candidate = await createValidationCandidate(wo.id, run.id, 40); ctx.candidateIds.push(candidate.id);

    const summary = await autoCreateValidationJobs(run.id, [candidate]);
    assert.equal(summary.createdJobs.length, 0);
    assert.ok(summary.skippedReasons.some((r) => r.includes("Confidence 40 below threshold")));

    const jobs = await prisma.automationJob.findMany({ where: { workOrderId: wo.id } });
    assert.equal(jobs.length, 0);
  } finally {
    await cleanup(ctx);
  }
});

test("archived/cancelled/failed and junk/test work orders are not eligible for validation", async () => {
  assert.equal(isWorkOrderEligibleForValidation({ status: "ARCHIVED" }).eligible, false);
  assert.equal(isWorkOrderEligibleForValidation({ status: "CANCELLED" }).eligible, false);
  assert.equal(isWorkOrderEligibleForValidation({ status: "FAILED" }).eligible, false);
  assert.equal(isWorkOrderEligibleForValidation({ status: "NEEDS_REVIEW", isTestData: true }).eligible, false);
  assert.equal(isWorkOrderEligibleForValidation({ status: "NEEDS_REVIEW", workQuality: "JUNK" }).eligible, false);
  assert.equal(isWorkOrderEligibleForValidation({ status: "NEEDS_REVIEW", dataQuality: "TEST" }).eligible, false);
  assert.equal(isWorkOrderEligibleForValidation({ status: "NEEDS_REVIEW" }).eligible, true);
});

test("offline runner prevents auto validation", async () => {
  const ctx = newCtx();
  try {
    await setSetting("LIVING_LOOP_AUTO_CREATE_VALIDATION_JOBS", "true");
    await setSetting("LIVING_LOOP_MAX_DAILY_VALIDATION_JOBS", "1000");
    // Make sure no online runner exists for this test
    const onlineRunners = await prisma.agentRunner.findMany({ where: { status: "ONLINE" }, select: { id: true } });
    await prisma.agentRunner.updateMany({ where: { status: "ONLINE" }, data: { status: "OFFLINE" } });
    const wo = await createWorkOrder(); ctx.workOrderIds.push(wo.id);
    const run = await createRun(); ctx.runIds.push(run.id);
    const candidate = await createValidationCandidate(wo.id, run.id); ctx.candidateIds.push(candidate.id);

    try {
      const summary = await autoCreateValidationJobs(run.id, [candidate]);
      assert.equal(summary.createdJobs.length, 0);
      assert.ok(summary.skippedReasons.some((r) => r.includes("No online runner")));
    } finally {
      await prisma.agentRunner.updateMany({ where: { id: { in: onlineRunners.map((r) => r.id) } }, data: { status: "ONLINE" } });
    }
  } finally {
    await cleanup(ctx);
  }
});

test("living loop proposes a VALIDATION_JOB candidate for an eligible NEEDS_REVIEW work order", async () => {
  const ctx = newCtx();
  try {
    const wo = await createWorkOrder(); ctx.workOrderIds.push(wo.id);
    const obs = await observeKingdomState();
    assert.ok(obs.workOrdersNeedingReview.some((w) => w.id === wo.id));

    const candidates = await proposeAutomationCandidates(obs, { minConfidence: 70, maxCandidatesPerRun: 100, maxDailyCandidates: 1000, todayCount: 0 });
    const validationCandidate = candidates.find((c) => c.kind === "VALIDATION_JOB" && c.sourceId === wo.id);
    assert.ok(validationCandidate, "expected a VALIDATION_JOB candidate for the NEEDS_REVIEW work order");
    assert.equal(validationCandidate!.riskLevel, "LOW");
    assert.equal(validationCandidate!.workOrderId, wo.id);
  } finally {
    await cleanup(ctx);
  }
});

test("test-data work order does not produce a VALIDATION_JOB candidate", async () => {
  const ctx = newCtx();
  try {
    const wo = await createWorkOrder({ isTestData: true }); ctx.workOrderIds.push(wo.id);
    const obs = await observeKingdomState();
    const candidates = await proposeAutomationCandidates(obs, { minConfidence: 70, maxCandidatesPerRun: 100, maxDailyCandidates: 1000, todayCount: 0 });
    const validationCandidate = candidates.find((c) => c.kind === "VALIDATION_JOB" && c.sourceId === wo.id);
    assert.equal(validationCandidate, undefined);
  } finally {
    await cleanup(ctx);
  }
});
