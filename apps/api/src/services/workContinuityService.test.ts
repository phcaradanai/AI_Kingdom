import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { prisma } from "../db/prisma.js";
import { getWorkContinuity, resolveExecutionReadiness } from "./workContinuityService.js";
import { buildExternalAgentContextPack } from "./externalAgentContextPackService.js";
import { createHandoffBrief, createImplementationReport } from "./externalAgentWorkOrderService.js";
import { bindFreshContextToWorkOrder } from "./projectContextBindingService.js";
import { createLocalDocumentRoot, scanLocalDocumentRoot } from "./localDocumentAccessService.js";

async function createUser(role: "KING" | "CROWN_PRINCE" = "KING") {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const user = await prisma.user.create({
    data: {
      email: `continuity-${role.toLowerCase()}-${suffix}@aikingdom.local`,
      displayName: `Continuity ${role}`,
      passwordHash: "test",
      role
    }
  });
  return user;
}

async function createTestWorkOrder(userId: string, overrides: Record<string, unknown> = {}) {
  return prisma.workOrder.create({
    data: {
      title: "Continuity test work order",
      objective: "Implement the continuity engine",
      instructions: "Follow the spec.",
      constraints: "Keep changes scoped.",
      acceptanceCriteria: ["Tests pass", "Types compile"],
      validationCommands: ["npm run typecheck", "npm run test"],
      createdByUserId: userId,
      status: "READY",
      ...overrides
    }
  });
}

async function createTestExternalAgent() {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return prisma.externalAgent.create({
    data: {
      name: `ContinuityAgent-${suffix}`,
      type: "CLAUDE_CODE",
      roleTitle: "Test Agent",
      description: "Test agent for continuity tests",
      capabilities: ["test"],
      executionMode: "MANUAL_COPY_PASTE",
      safetyLevel: "MEDIUM_RISK",
      isActive: true
    }
  });
}

test("getWorkContinuity returns NEW_TASK mode for fresh work order with no prior activity", async () => {
  const user = await createUser();
  const workOrder = await createTestWorkOrder(user.id);

  try {
    const continuity = await getWorkContinuity(workOrder.id);
    assert.equal(continuity.taskMode, "NEW_TASK");
    assert.equal(continuity.implementationReports.length, 0);
    assert.equal(continuity.failedAttempts.length, 0);
    assert.equal(continuity.doNotRepeat.length, 0);
    assert.deepEqual(continuity.filesChanged, []);
    assert.deepEqual(continuity.decisionsMade, []);
    assert.equal(continuity.workOrder.id, workOrder.id);
  } finally {
    await prisma.workOrder.delete({ where: { id: workOrder.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("getWorkContinuity returns CONTINUATION when implementation reports exist", async () => {
  const user = await createUser();
  const workOrder = await createTestWorkOrder(user.id);
  const report = await prisma.implementationReport.create({
    data: {
      workOrderId: workOrder.id,
      summary: "Partial implementation done",
      filesChanged: ["apps/api/src/services/foo.ts"],
      commandsRun: ["npm run typecheck"],
      testsRun: [],
      testResult: "PARTIAL",
      errors: [],
      decisionsMade: ["Keep types in api.ts"],
      remainingWork: ["Add tests"],
      nextRecommendedAction: "Write tests for the new service"
    }
  });

  try {
    const continuity = await getWorkContinuity(workOrder.id);
    assert.equal(continuity.taskMode, "CONTINUATION");
    assert.equal(continuity.implementationReports.length, 1);
    assert.ok(continuity.filesChanged.includes("apps/api/src/services/foo.ts"));
    assert.ok(continuity.decisionsMade.includes("Keep types in api.ts"));
    assert.ok(continuity.remainingWork.includes("Add tests"));
    assert.equal(continuity.nextRecommendedAction, "Write tests for the new service");
  } finally {
    await prisma.implementationReport.delete({ where: { id: report.id } }).catch(() => undefined);
    await prisma.workOrder.delete({ where: { id: workOrder.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("getWorkContinuity returns RETRY_AFTER_FAILURE when autoRetryCount > 0 and latest review verdict is NEEDS_FIX", async () => {
  const user = await createUser();
  const workOrder = await createTestWorkOrder(user.id, { autoRetryCount: 1 });
  const job = await prisma.automationJob.create({
    data: {
      workOrderId: workOrder.id,
      mode: "SANDBOX_PATCH",
      status: "COMPLETED",
      commandPolicy: "SANDBOX_PATCH_NO_PUSH",
      allowedCommands: [],
      createdByUserId: user.id
    }
  });
  const review = await prisma.agentReviewSummary.create({
    data: {
      automationJobId: job.id,
      workOrderId: workOrder.id,
      verdict: "NEEDS_FIX",
      confidence: "HIGH",
      kingRecommendation: "REQUEST_REVISION",
      summary: "Tests failed",
      whatPassed: [],
      whatFailed: ["npm run test returned exit code 1"],
      failedCommands: ["npm run test"],
      riskNotes: [],
      nextActions: ["Fix the failing test in workContinuityService.test.ts"]
    }
  });

  try {
    const continuity = await getWorkContinuity(workOrder.id);
    assert.equal(continuity.taskMode, "RETRY_AFTER_FAILURE");
    assert.ok(continuity.failedCommands.includes("npm run test"), "failed command should appear in failedCommands");
    assert.ok(continuity.doNotRepeat.includes("npm run test"), "failed command should appear in doNotRepeat");
  } finally {
    await prisma.agentReviewSummary.delete({ where: { id: review.id } }).catch(() => undefined);
    await prisma.automationJob.delete({ where: { id: job.id } }).catch(() => undefined);
    await prisma.workOrder.delete({ where: { id: workOrder.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("getWorkContinuity returns REVISION when autoRetryCount > 0 but no failure verdict", async () => {
  const user = await createUser();
  const workOrder = await createTestWorkOrder(user.id, { autoRetryCount: 1 });

  try {
    const continuity = await getWorkContinuity(workOrder.id);
    assert.equal(continuity.taskMode, "REVISION");
  } finally {
    await prisma.workOrder.delete({ where: { id: workOrder.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("getWorkContinuity includes failed run details in failedAttempts", async () => {
  const user = await createUser();
  const agent = await createTestExternalAgent();
  const workOrder = await createTestWorkOrder(user.id);
  const run = await prisma.externalAgentRun.create({
    data: {
      externalAgentId: agent.id,
      workOrderId: workOrder.id,
      status: "FAILED",
      attemptNumber: 1,
      inputPrompt: "Test prompt",
      errorMessage: "CLI exited with code 1",
      outputText: "TypeScript error in foo.ts",
      completedAt: new Date()
    }
  });

  try {
    const continuity = await getWorkContinuity(workOrder.id);
    assert.equal(continuity.failedAttempts.length, 1);
    assert.equal(continuity.failedAttempts[0]!.runId, run.id);
    assert.equal(continuity.failedAttempts[0]!.attemptNumber, 1);
    assert.equal(continuity.failedAttempts[0]!.errorMessage, "CLI exited with code 1");
    assert.ok(continuity.failedAttempts[0]!.outputSummary?.includes("TypeScript error"));
  } finally {
    await prisma.externalAgentRun.delete({ where: { id: run.id } }).catch(() => undefined);
    await prisma.workOrder.delete({ where: { id: workOrder.id } }).catch(() => undefined);
    await prisma.externalAgent.delete({ where: { id: agent.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("getWorkContinuity doNotRepeat includes errors from implementation reports", async () => {
  const user = await createUser();
  const workOrder = await createTestWorkOrder(user.id);
  const report = await prisma.implementationReport.create({
    data: {
      workOrderId: workOrder.id,
      summary: "Attempted implementation",
      filesChanged: [],
      commandsRun: [],
      testsRun: [],
      testResult: "FAILED",
      errors: ["Cannot find module 'foo' — check import path"],
      decisionsMade: [],
      remainingWork: []
    }
  });

  try {
    const continuity = await getWorkContinuity(workOrder.id);
    assert.ok(
      continuity.doNotRepeat.includes("Cannot find module 'foo' — check import path"),
      "report error should appear in doNotRepeat"
    );
  } finally {
    await prisma.implementationReport.delete({ where: { id: report.id } }).catch(() => undefined);
    await prisma.workOrder.delete({ where: { id: workOrder.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("resolveExecutionReadiness blocks when active AutomationJob exists", async () => {
  const user = await createUser();
  const workOrder = await createTestWorkOrder(user.id);
  const job = await prisma.automationJob.create({
    data: {
      workOrderId: workOrder.id,
      mode: "SANDBOX_PATCH",
      status: "QUEUED",
      commandPolicy: "SANDBOX_PATCH_NO_PUSH",
      allowedCommands: [],
      createdByUserId: user.id
    }
  });

  try {
    const result = await resolveExecutionReadiness(workOrder.id, "SANDBOX_PATCH");
    assert.equal(result.ok, false);
    assert.equal(result.requiredAction, "WAIT_FOR_ACTIVE_JOB");
    assert.equal(result.existingJob?.id, job.id);
    assert.ok(result.reason?.includes(job.id));
  } finally {
    await prisma.automationJob.delete({ where: { id: job.id } }).catch(() => undefined);
    await prisma.workOrder.delete({ where: { id: workOrder.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("resolveExecutionReadiness blocks when active ExternalAgentRun exists", async () => {
  const user = await createUser();
  const agent = await createTestExternalAgent();
  const workOrder = await createTestWorkOrder(user.id);
  const run = await prisma.externalAgentRun.create({
    data: {
      externalAgentId: agent.id,
      workOrderId: workOrder.id,
      status: "RUNNING",
      attemptNumber: 1,
      inputPrompt: "Test prompt"
    }
  });

  try {
    const result = await resolveExecutionReadiness(workOrder.id, "EXTERNAL_AGENT");
    assert.equal(result.ok, false);
    assert.equal(result.requiredAction, "WAIT_FOR_ACTIVE_RUN");
    assert.equal(result.existingRun?.id, run.id);
  } finally {
    await prisma.externalAgentRun.delete({ where: { id: run.id } }).catch(() => undefined);
    await prisma.workOrder.delete({ where: { id: workOrder.id } }).catch(() => undefined);
    await prisma.externalAgent.delete({ where: { id: agent.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("resolveExecutionReadiness returns REFRESH_CONTEXT when SANDBOX_PATCH requires project but none assigned", async () => {
  const user = await createUser();
  // No projectId — SANDBOX_PATCH requires a project with fresh context
  const workOrder = await createTestWorkOrder(user.id);

  try {
    const result = await resolveExecutionReadiness(workOrder.id, "SANDBOX_PATCH");
    assert.equal(result.ok, false);
    assert.equal(result.requiredAction, "REFRESH_CONTEXT");
    assert.ok(result.reason?.toLowerCase().includes("project"));
  } finally {
    await prisma.workOrder.delete({ where: { id: workOrder.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("buildExternalAgentContextPack includes prior failed report summary", async () => {
  const user = await createUser();
  const agent = await createTestExternalAgent();
  const workOrder = await createTestWorkOrder(user.id);
  const report = await prisma.implementationReport.create({
    data: {
      workOrderId: workOrder.id,
      summary: "Attempted to add the feature but TypeScript complained",
      filesChanged: ["apps/api/src/services/someService.ts"],
      commandsRun: ["npm run typecheck"],
      testsRun: [],
      testResult: "FAILED",
      errors: ["Type error in someService.ts line 42"],
      decisionsMade: ["Use strict mode"],
      remainingWork: ["Fix the type error", "Add tests"]
    }
  });

  try {
    const pack = await buildExternalAgentContextPack(workOrder.id, agent.id);
    assert.ok(pack.previousAttemptsSummary.includes("TypeScript complained"), "prior report should be in previousAttemptsSummary");
    assert.ok(pack.decisionsMade.includes("Use strict mode"), "decisions from report should be in pack");
    assert.ok(pack.filesChanged.includes("apps/api/src/services/someService.ts"), "changed files should be in pack");
    assert.ok(pack.doNotRepeat.includes("Type error in someService.ts line 42"), "report errors in doNotRepeat");
  } finally {
    await prisma.implementationReport.delete({ where: { id: report.id } }).catch(() => undefined);
    await prisma.workOrder.delete({ where: { id: workOrder.id } }).catch(() => undefined);
    await prisma.externalAgent.delete({ where: { id: agent.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("buildExternalAgentContextPack sets RETRY_AFTER_FAILURE mode and includes doNotRepeat from review", async () => {
  const user = await createUser();
  const agent = await createTestExternalAgent();
  const workOrder = await createTestWorkOrder(user.id, { autoRetryCount: 1 });
  const job = await prisma.automationJob.create({
    data: {
      workOrderId: workOrder.id,
      mode: "SANDBOX_PATCH",
      status: "COMPLETED",
      commandPolicy: "SANDBOX_PATCH_NO_PUSH",
      allowedCommands: [],
      createdByUserId: user.id
    }
  });
  const review = await prisma.agentReviewSummary.create({
    data: {
      automationJobId: job.id,
      workOrderId: workOrder.id,
      verdict: "NEEDS_FIX",
      confidence: "HIGH",
      kingRecommendation: "REQUEST_REVISION",
      summary: "Test suite failed",
      whatPassed: [],
      whatFailed: ["npm run test:api exited with code 1"],
      failedCommands: ["npm run test:api"],
      riskNotes: [],
      nextActions: ["Fix the broken test first"]
    }
  });

  try {
    const pack = await buildExternalAgentContextPack(workOrder.id, agent.id);
    assert.equal(pack.taskMode, "RETRY_AFTER_FAILURE");
    assert.ok(pack.doNotRepeat.includes("npm run test:api"), "failed command from review should be in doNotRepeat");
    assert.ok(pack.failedCommandsAndErrors.includes("npm run test:api"), "failed command in failedCommandsAndErrors");
  } finally {
    await prisma.agentReviewSummary.delete({ where: { id: review.id } }).catch(() => undefined);
    await prisma.automationJob.delete({ where: { id: job.id } }).catch(() => undefined);
    await prisma.workOrder.delete({ where: { id: workOrder.id } }).catch(() => undefined);
    await prisma.externalAgent.delete({ where: { id: agent.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("buildExternalAgentContextPack includes decisions already made in the context pack", async () => {
  const user = await createUser();
  const agent = await createTestExternalAgent();
  const workOrder = await createTestWorkOrder(user.id);
  const report = await prisma.implementationReport.create({
    data: {
      workOrderId: workOrder.id,
      summary: "Partial work done",
      filesChanged: [],
      commandsRun: [],
      testsRun: [],
      testResult: "NOT_RUN",
      errors: [],
      decisionsMade: ["Accepted decision: use Prisma transactions for all writes", "Skip migration for now"],
      remainingWork: []
    }
  });

  try {
    const pack = await buildExternalAgentContextPack(workOrder.id, agent.id);
    assert.ok(
      pack.decisionsMade.includes("Accepted decision: use Prisma transactions for all writes"),
      "accepted decisions should appear in the context pack"
    );
    assert.ok(pack.decisionsMade.includes("Skip migration for now"));
  } finally {
    await prisma.implementationReport.delete({ where: { id: report.id } }).catch(() => undefined);
    await prisma.workOrder.delete({ where: { id: workOrder.id } }).catch(() => undefined);
    await prisma.externalAgent.delete({ where: { id: agent.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("createHandoffBrief reuses existing brief when no new report submitted since brief creation", async () => {
  const user = await createUser();
  const agent = await createTestExternalAgent();
  const workOrder = await createTestWorkOrder(user.id, { assignedExternalAgentId: agent.id });

  // Create an implementation report so the first handoff brief picks it up
  const report = await createImplementationReport({
    workOrderId: workOrder.id,
    externalAgentId: agent.id,
    summary: "First implementation attempt",
    filesChanged: ["apps/api/src/services/foo.ts"],
    commandsRun: ["npm run typecheck"],
    testsRun: [],
    testResult: "PARTIAL",
    decisionsMade: ["Use service layer pattern"],
    remainingWork: ["Add tests"]
  });

  // Create first brief
  const firstBrief = await createHandoffBrief(workOrder.id);
  assert.equal(firstBrief.workOrderId, workOrder.id);

  // Call again without submitting a new report — should reuse
  const secondBrief = await createHandoffBrief(workOrder.id);
  assert.equal(secondBrief.id, firstBrief.id, "brief should be reused when no new report was submitted");

  try {
    // Verify brief count didn't grow
    const allBriefs = await prisma.handoffBrief.findMany({ where: { workOrderId: workOrder.id } });
    assert.equal(allBriefs.length, 1, "only one brief should exist");
  } finally {
    await prisma.handoffBrief.deleteMany({ where: { workOrderId: workOrder.id } }).catch(() => undefined);
    await prisma.implementationReport.delete({ where: { id: report.id } }).catch(() => undefined);
    await prisma.workOrder.delete({ where: { id: workOrder.id } }).catch(() => undefined);
    await prisma.externalAgent.delete({ where: { id: agent.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("resolveExecutionReadiness returns REFRESH_CONTEXT when WorkOrder is bound to an older snapshot than the project's latest", async () => {
  const user = await createUser();
  const project = await prisma.project.create({ data: { name: `Drift Test Project ${Date.now()}` } });
  const repoDir = await fs.mkdtemp(path.join(os.tmpdir(), "continuity-drift-test-"));
  await fs.writeFile(path.join(repoDir, "README.md"), "# Drift Fixture");

  try {
    const root = await createLocalDocumentRoot(project.id, { name: "repo", rootPath: repoDir });
    // First scan — snapshot A
    await scanLocalDocumentRoot(root.id);
    const workOrder = await createTestWorkOrder(user.id, { projectId: project.id });
    // Bind context → WO.localDocumentSnapshotId = snapshot A
    await bindFreshContextToWorkOrder(workOrder.id);

    // Second scan — snapshot B is now the project's latest
    await scanLocalDocumentRoot(root.id);

    // WO still bound to A; project latest is B → drift detected
    const result = await resolveExecutionReadiness(workOrder.id, "EXTERNAL_AGENT");
    assert.equal(result.ok, false);
    assert.equal(result.requiredAction, "REFRESH_CONTEXT");
    assert.ok(result.reason?.includes("outdated") || result.reason?.includes("Rebind"), "reason should mention rebind");
  } finally {
    await prisma.workOrder.deleteMany({ where: { projectId: project.id } }).catch(() => undefined);
    await prisma.project.delete({ where: { id: project.id } }).catch(() => undefined);
    await fs.rm(repoDir, { recursive: true, force: true });
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("createHandoffBrief creates new brief after a new report is submitted", async () => {
  const user = await createUser();
  const agent = await createTestExternalAgent();
  const workOrder = await createTestWorkOrder(user.id, { assignedExternalAgentId: agent.id });

  const firstReport = await createImplementationReport({
    workOrderId: workOrder.id,
    externalAgentId: agent.id,
    summary: "First attempt",
    filesChanged: ["apps/api/src/services/old.ts"],
    commandsRun: [],
    testsRun: [],
    testResult: "FAILED",
    decisionsMade: [],
    remainingWork: ["Try again"]
  });

  const firstBrief = await createHandoffBrief(workOrder.id);

  // Submit a new report after the brief
  const secondReport = await createImplementationReport({
    workOrderId: workOrder.id,
    externalAgentId: agent.id,
    summary: "Second attempt with fixes",
    filesChanged: ["apps/api/src/services/new.ts"],
    commandsRun: ["npm run test"],
    testsRun: ["npm run test"],
    testResult: "PASSED",
    decisionsMade: ["Use new approach"],
    remainingWork: []
  });

  // Now a new brief should be created
  const secondBrief = await createHandoffBrief(workOrder.id);
  assert.notEqual(secondBrief.id, firstBrief.id, "new brief should be created after new report");
  assert.match(secondBrief.handoffPrompt, /Second attempt with fixes/);

  try {
    const allBriefs = await prisma.handoffBrief.findMany({ where: { workOrderId: workOrder.id } });
    assert.equal(allBriefs.length, 2, "two briefs should exist");
  } finally {
    await prisma.handoffBrief.deleteMany({ where: { workOrderId: workOrder.id } }).catch(() => undefined);
    await prisma.implementationReport.deleteMany({ where: { workOrderId: workOrder.id } }).catch(() => undefined);
    await prisma.workOrder.delete({ where: { id: workOrder.id } }).catch(() => undefined);
    await prisma.externalAgent.delete({ where: { id: agent.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});
