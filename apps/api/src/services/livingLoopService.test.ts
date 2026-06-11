import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../db/prisma.js";
import {
  runLivingLoopOnce,
  observeKingdomState,
  proposeAutomationCandidates,
  dedupeCandidate,
  dataValueGate,
  createCandidate,
  applyCandidate,
  approveCandidate
} from "./livingLoopService.js";

async function createKingUser() {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return prisma.user.create({
    data: {
      email: `living-loop-king-${suffix}@aikingdom.local`,
      displayName: "Living Loop King",
      passwordHash: await bcrypt.hash("StrongPass123", 12),
      role: "KING",
      isActive: true
    }
  });
}

async function createWorkOrderChain() {
  const workOrder = await prisma.workOrder.create({
    data: { title: `Living Loop WO ${randomUUID()}`, objective: "Test objective" }
  });
  const job = await prisma.automationJob.create({
    data: { workOrderId: workOrder.id, mode: "SANDBOX_PATCH", status: "COMPLETED" }
  });
  return { workOrder, job };
}

test("loop disabled prevents scheduled run but manual run is still allowed for KING", async () => {
  const user = await createKingUser();
  try {
    await prisma.setting.upsert({
      where: { key: "LIVING_LOOP_ENABLED" },
      update: { value: "false" },
      create: { key: "LIVING_LOOP_ENABLED", value: "false", category: "SYSTEM" }
    });

    const scheduled = await runLivingLoopOnce("SCHEDULED");
    assert.equal(scheduled.run.status, "SKIPPED");
    assert.equal(scheduled.candidates.length, 0);

    const manual = await runLivingLoopOnce("MANUAL", user.id);
    assert.notEqual(manual.run.status, "SKIPPED");
    assert.equal(manual.run.triggerType, "MANUAL");
  } finally {
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("POST run creates a LivingLoopRun row with observed counts", async () => {
  const user = await createKingUser();
  try {
    await prisma.setting.upsert({
      where: { key: "LIVING_LOOP_ENABLED" },
      update: { value: "true" },
      create: { key: "LIVING_LOOP_ENABLED", value: "true", category: "SYSTEM" }
    });

    const { run } = await runLivingLoopOnce("MANUAL", user.id);
    const stored = await prisma.livingLoopRun.findUnique({ where: { id: run.id } });
    assert.ok(stored);
    assert.equal(stored!.status, "COMPLETED");
    assert.ok(stored!.observedCounts);
    assert.equal(stored!.triggerType, "MANUAL");
  } finally {
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("low-confidence candidate is skipped by the data value gate", () => {
  const skipReasons: string[] = [];
  const ok = dataValueGate(
    {
      title: "Patch Review: low confidence",
      summary: "This patch summary is long enough to pass.",
      reason: "Patch pending King review for low confidence case.",
      proposedAction: { action: "review_patch" },
      confidence: 50
    },
    70,
    skipReasons
  );
  assert.equal(ok, false);
  assert.ok(skipReasons.some((r) => r.startsWith("Low confidence")));
});

test("patch pending review creates a PATCH_REVIEW candidate and is deduplicated on re-run", async () => {
  const { workOrder, job } = await createWorkOrderChain();
  const patch = await prisma.patchArtifact.create({
    data: {
      automationJobId: job.id,
      workOrderId: workOrder.id,
      title: "Refactor auth middleware",
      summary: "Refactors auth middleware to use shared session validation helper.",
      validationStatus: "PENDING",
      riskLevel: "MEDIUM"
    }
  });
  let runId1: string | null = null;
  let runId2: string | null = null;
  try {
    const obs = await observeKingdomState();
    assert.ok(obs.patchesPendingReview.some((p) => p.id === patch.id));

    const candidates = await proposeAutomationCandidates(obs, { minConfidence: 70, maxCandidatesPerRun: 50, maxDailyCandidates: 1000, todayCount: 0 });
    const patchCandidate = candidates.find((c) => c.kind === "PATCH_REVIEW" && c.sourceId === patch.id);
    assert.ok(patchCandidate, "expected a PATCH_REVIEW candidate for the pending patch");

    const run1 = await prisma.livingLoopRun.create({ data: { status: "STARTED", triggerType: "MANUAL" } });
    runId1 = run1.id;
    const skipReasons1: string[] = [];
    const created = await createCandidate(patchCandidate!, run1.id, 70, skipReasons1);
    assert.ok(created);
    assert.equal(created!.kind, "PATCH_REVIEW");
    assert.equal(created!.sourceId, patch.id);

    // Re-running should detect a duplicate active candidate for the same source/kind.
    const isDuplicate = await dedupeCandidate({ sourceType: "PatchArtifact", sourceId: patch.id, kind: "PATCH_REVIEW" });
    assert.equal(isDuplicate, true);

    const run2 = await prisma.livingLoopRun.create({ data: { status: "STARTED", triggerType: "MANUAL" } });
    runId2 = run2.id;
    const skipReasons2: string[] = [];
    const createdAgain = await createCandidate(patchCandidate!, run2.id, 70, skipReasons2);
    assert.equal(createdAgain, null);
    assert.ok(skipReasons2.some((r) => r.startsWith("Duplicate:")));
  } finally {
    await prisma.automationCandidate.deleteMany({ where: { sourceType: "PatchArtifact", sourceId: patch.id } });
    if (runId1) await prisma.livingLoopRun.delete({ where: { id: runId1 } }).catch(() => undefined);
    if (runId2) await prisma.livingLoopRun.delete({ where: { id: runId2 } }).catch(() => undefined);
    await prisma.patchArtifact.delete({ where: { id: patch.id } }).catch(() => undefined);
    await prisma.automationJob.delete({ where: { id: job.id } }).catch(() => undefined);
    await prisma.workOrder.delete({ where: { id: workOrder.id } }).catch(() => undefined);
  }
});

test("stale runner creates a RUNNER_REVIEW candidate", async () => {
  const runner = await prisma.agentRunner.create({
    data: {
      name: `Stale Runner ${randomUUID()}`,
      status: "OFFLINE",
      tokenHash: randomUUID(),
      lastHeartbeatAt: new Date(Date.now() - 48 * 3600 * 1000)
    }
  });
  try {
    const obs = await observeKingdomState();
    assert.ok(obs.staleRunners.some((r) => r.id === runner.id));

    const candidates = await proposeAutomationCandidates(obs, { minConfidence: 70, maxCandidatesPerRun: 50, maxDailyCandidates: 1000, todayCount: 0 });
    const runnerCandidate = candidates.find((c) => c.kind === "RUNNER_REVIEW" && c.sourceId === runner.id);
    assert.ok(runnerCandidate, "expected a RUNNER_REVIEW candidate for the stale runner");
  } finally {
    await prisma.agentRunner.delete({ where: { id: runner.id } }).catch(() => undefined);
  }
});

test("repeated provider failures create a PROVIDER_REVIEW candidate", async () => {
  const providerName = `flaky-provider-${randomUUID()}`;
  const traceIds: string[] = [];
  for (let i = 0; i < 4; i++) {
    const trace = await prisma.aIUsageTrace.create({
      data: {
        traceId: randomUUID(),
        triggerType: "TEST",
        sourceType: "TEST",
        operation: "generate",
        purpose: "test",
        providerName,
        status: "FAILED",
        errorMessage: "Provider request timed out"
      }
    });
    traceIds.push(trace.id);
  }
  try {
    const obs = await observeKingdomState();
    const issue = obs.providerIssues.find((p) => p.providerName === providerName);
    assert.ok(issue, "expected provider issue for flaky provider");
    assert.ok(issue!.errorCount >= 3);

    const candidates = await proposeAutomationCandidates(obs, { minConfidence: 70, maxCandidatesPerRun: 50, maxDailyCandidates: 1000, todayCount: 0 });
    const providerCandidate = candidates.find((c) => c.kind === "PROVIDER_REVIEW" && c.sourceId === providerName);
    assert.ok(providerCandidate, "expected a PROVIDER_REVIEW candidate for the flaky provider");
  } finally {
    await prisma.aIUsageTrace.deleteMany({ where: { id: { in: traceIds } } });
  }
});

test("memory review candidate apply creates a pending knowledge candidate, not trusted memory", async () => {
  const { workOrder, job } = await createWorkOrderChain();
  const report = await prisma.implementationReport.create({
    data: {
      workOrderId: workOrder.id,
      automationJobId: job.id,
      summary: "Implemented feature X",
      decisionsMade: ["Chose approach A over B for performance reasons"],
      remainingWork: ["Write follow-up tests"],
      createdAt: new Date(Date.now() - 4 * 24 * 3600 * 1000)
    }
  });
  const user = await createKingUser();
  let candidateId: string | null = null;
  try {
    const candidate = await prisma.automationCandidate.create({
      data: {
        kind: "MEMORY_REVIEW",
        title: "Memory: Chose approach A over B",
        summary: "Report has 1 decision worth preserving.",
        reason: "Decisions worth preserving.",
        confidence: 70,
        priority: "LOW",
        riskLevel: "LOW",
        sourceType: "ImplementationReport",
        sourceId: report.id,
        workOrderId: workOrder.id,
        proposedAction: { action: "create_memory_candidate", targetId: report.id },
        provenance: { source: "ImplementationReport", id: report.id },
        status: "PENDING"
      }
    });
    candidateId = candidate.id;

    const approved = await approveCandidate(candidate.id, user.id);
    assert.equal(approved.status, "APPROVED");

    const applied = await applyCandidate(candidate.id, user.id);
    assert.equal(applied.status, "APPLIED");

    const knowledgeCandidates = await prisma.agentKnowledgeCandidate.findMany({ where: { sourceType: "ImplementationReport", sourceId: report.id } });
    assert.equal(knowledgeCandidates.length, 1);
    assert.equal(knowledgeCandidates[0]!.status, "PENDING");

    const trustedMemories = await prisma.agentKnowledgeMemory.findMany({ where: { sourceCandidateId: knowledgeCandidates[0]!.id } });
    assert.equal(trustedMemories.length, 0);

    await prisma.agentKnowledgeCandidate.deleteMany({ where: { id: knowledgeCandidates[0]!.id } });
  } finally {
    if (candidateId) await prisma.automationCandidate.delete({ where: { id: candidateId } }).catch(() => undefined);
    await prisma.implementationReport.delete({ where: { id: report.id } }).catch(() => undefined);
    await prisma.automationJob.delete({ where: { id: job.id } }).catch(() => undefined);
    await prisma.workOrder.delete({ where: { id: workOrder.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("cleanup candidate archives the inbox item only after KING approval and apply", async () => {
  const inboxItem = await prisma.projectInboxItem.create({
    data: {
      sourceType: "TEST",
      sourceId: randomUUID(),
      title: "Stale inbox item",
      summary: "Pending too long",
      status: "PENDING",
      createdAt: new Date(Date.now() - 48 * 3600 * 1000)
    }
  });
  const user = await createKingUser();
  let candidateId: string | null = null;
  try {
    const candidate = await prisma.automationCandidate.create({
      data: {
        kind: "CLEANUP_REVIEW",
        title: "Stale Inbox: Stale inbox item",
        summary: "Pending since a while ago.",
        reason: "Pending over 24h.",
        confidence: 60,
        priority: "LOW",
        riskLevel: "LOW",
        sourceType: "ProjectInboxItem",
        sourceId: inboxItem.id,
        proposedAction: { action: "archive_target", targetId: inboxItem.id },
        provenance: { source: "ProjectInboxItem", id: inboxItem.id },
        status: "PENDING"
      }
    });
    candidateId = candidate.id;

    // Apply before approval must fail and must not archive the item.
    await assert.rejects(() => applyCandidate(candidate.id, user.id));
    let current = await prisma.projectInboxItem.findUniqueOrThrow({ where: { id: inboxItem.id } });
    assert.equal(current.status, "PENDING");

    await approveCandidate(candidate.id, user.id);
    await applyCandidate(candidate.id, user.id);

    current = await prisma.projectInboxItem.findUniqueOrThrow({ where: { id: inboxItem.id } });
    assert.equal(current.status, "ARCHIVED");
  } finally {
    if (candidateId) await prisma.automationCandidate.delete({ where: { id: candidateId } }).catch(() => undefined);
    await prisma.projectInboxItem.delete({ where: { id: inboxItem.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("living loop run lifecycle writes audit log entries", async () => {
  const user = await createKingUser();
  try {
    await prisma.setting.upsert({
      where: { key: "LIVING_LOOP_ENABLED" },
      update: { value: "true" },
      create: { key: "LIVING_LOOP_ENABLED", value: "true", category: "SYSTEM" }
    });

    const { run } = await runLivingLoopOnce("MANUAL", user.id);

    const started = await prisma.auditLog.findFirst({ where: { action: "living_loop_run_started", resourceId: run.id } });
    const completed = await prisma.auditLog.findFirst({ where: { action: "living_loop_run_completed", resourceId: run.id } });
    assert.ok(started);
    assert.ok(completed);
  } finally {
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});
