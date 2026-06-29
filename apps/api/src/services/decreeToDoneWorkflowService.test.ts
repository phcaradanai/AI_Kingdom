import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { prisma } from "../db/prisma.js";
import { createLocalDocumentRoot, scanLocalDocumentRoot } from "./localDocumentAccessService.js";
import {
  acceptAndLearnDecreeToDoneWorkflow,
  chooseWorkflowExternalAgent,
  reconcileWorkflowForAutomationJob,
  retryDecreeToDoneWorkflow,
  startOrContinueDecreeToDoneWorkflow
} from "./decreeToDoneWorkflowService.js";

const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

async function createUser() {
  const suffix = uid();
  return prisma.user.create({
    data: { email: `workflow-${suffix}@test.local`, displayName: "Workflow King", passwordHash: "test", role: "KING" }
  });
}

async function createFreshProject() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "decree-workflow-"));
  const project = await prisma.project.create({ data: { name: `Workflow Project ${uid()}` } });
  const root = await createLocalDocumentRoot(project.id, { name: "workspace", rootPath: dir });
  await scanLocalDocumentRoot(root.id);
  return { project, dir };
}

async function createSourceRecords(userId: string, projectId: string) {
  const task = await prisma.task.create({
    data: { title: `BUILD workflow ${uid()}`, command: "Build the scoped workflow change", mode: "BUILD", status: "COMPLETED", createdBy: userId, projectId }
  });
  const council = await prisma.councilSession.create({
    data: { taskId: task.id, projectId, status: "COMPLETED", selectedAgentIds: [], finalSummary: "Execution decision: implement the scoped change." }
  });
  const workOrder = await prisma.workOrder.create({
    data: {
      projectId,
      title: `Execution work ${uid()}`,
      objective: "Implement the exact scoped behavior.",
      context: `Task ${task.id}; Council ${council.id}`,
      acceptanceCriteria: ["The scoped behavior works.", "Validation passes."],
      validationCommands: ["npm run typecheck"],
      sourceType: "COUNCIL_SESSION",
      sourceId: council.id,
      status: "READY",
      priority: "LOW",
      createdByUserId: userId
    }
  });
  return { task, council, workOrder };
}

async function setSetting(key: string, value: string) {
  const previous = await prisma.setting.findUnique({ where: { key } });
  await prisma.setting.upsert({
    where: { key },
    create: { key, value, category: "SYSTEM" },
    update: { value }
  });
  return async () => {
    if (previous) await prisma.setting.update({ where: { key }, data: { value: previous.value } });
    else await prisma.setting.delete({ where: { key } }).catch(() => undefined);
  };
}

async function isolateExternalRuntime() {
  const agents = await prisma.externalAgent.findMany({ select: { id: true, isActive: true } });
  const runners = await prisma.agentRunner.findMany({ select: { id: true, status: true, lastHeartbeatAt: true } });
  await prisma.externalAgent.updateMany({ data: { isActive: false } });
  await prisma.agentRunner.updateMany({ data: { status: "OFFLINE" } });
  return async () => {
    for (const agent of agents) await prisma.externalAgent.update({ where: { id: agent.id }, data: { isActive: agent.isActive } }).catch(() => undefined);
    for (const runner of runners) await prisma.agentRunner.update({ where: { id: runner.id }, data: { status: runner.status, lastHeartbeatAt: runner.lastHeartbeatAt } }).catch(() => undefined);
  };
}

async function cleanupFixture(input: { userId: string; projectId: string; workOrderIds?: string[]; dir?: string }) {
  if (input.workOrderIds?.length) await prisma.workOrder.deleteMany({ where: { id: { in: input.workOrderIds } } }).catch(() => undefined);
  await prisma.task.deleteMany({ where: { createdBy: input.userId } }).catch(() => undefined);
  await prisma.agentKnowledgeMemory.deleteMany({ where: { projectId: input.projectId } }).catch(() => undefined);
  await prisma.agentKnowledgeCandidate.deleteMany({ where: { projectId: input.projectId } }).catch(() => undefined);
  await prisma.project.delete({ where: { id: input.projectId } }).catch(() => undefined);
  await prisma.user.delete({ where: { id: input.userId } }).catch(() => undefined);
  if (input.dir) await rm(input.dir, { recursive: true, force: true });
}

test("workflow is idempotent and reuses completed council and execution Work Order", async () => {
  const restoreRuntime = await isolateExternalRuntime();
  const user = await createUser();
  const { project, dir } = await createFreshProject();
  const source = await createSourceRecords(user.id, project.id);
  try {
    const first = await startOrContinueDecreeToDoneWorkflow(source.task.id, user.id);
    const second = await startOrContinueDecreeToDoneWorkflow(source.task.id, user.id);
    assert.equal(first.id, second.id);
    assert.equal(second.workOrderId, source.workOrder.id);
    assert.equal(second.status, "BLOCKED");
    assert.equal(second.currentStep, "RESOLVE_AGENT");
    assert.equal(await prisma.workflowRun.count({ where: { sourceTaskId: source.task.id } }), 1);
    assert.equal(await prisma.councilSession.count({ where: { taskId: source.task.id } }), 1);
    assert.equal(await prisma.workOrder.count({ where: { sourceType: "COUNCIL_SESSION", sourceId: source.council.id } }), 1);
    assert.equal(await prisma.automationJob.count({ where: { workOrderId: source.workOrder.id } }), 0);
  } finally {
    await cleanupFixture({ userId: user.id, projectId: project.id, workOrderIds: [source.workOrder.id], dir });
    await restoreRuntime();
  }
});

test("stale or unreadable local docs block before council and expose Fix Context", async () => {
  const user = await createUser();
  const dir = await mkdtemp(path.join(os.tmpdir(), "decree-stale-"));
  const project = await prisma.project.create({ data: { name: `Stale Workflow ${uid()}` } });
  await createLocalDocumentRoot(project.id, { name: "missing-workspace", rootPath: dir });
  await rm(dir, { recursive: true, force: true });
  const task = await prisma.task.create({
    data: { title: "BUILD with stale context", command: "Build only after context repair", mode: "BUILD", createdBy: user.id, projectId: project.id }
  });
  try {
    const workflow = await startOrContinueDecreeToDoneWorkflow(task.id, user.id);
    assert.equal(workflow.status, "BLOCKED");
    assert.equal(workflow.currentStep, "CHECK_CONTEXT");
    assert.equal(workflow.primaryAction, "Fix Context");
    assert.match(workflow.lastError ?? "", /after scanning approved local docs/i);
    assert.equal(await prisma.councilSession.count({ where: { taskId: task.id } }), 0);
  } finally {
    await cleanupFixture({ userId: user.id, projectId: project.id });
  }
});

test("multiple ready agents create one choice gate; mechanical retry and Accept & Learn close the workflow", async () => {
  const restoreRuntime = await isolateExternalRuntime();
  const restoreChoice = await setSetting("REQUIRE_KING_EXTERNAL_AGENT_CHOICE", "true");
  const restoreBridge = await setSetting("EXTERNAL_AGENT_BRIDGE_ENABLED", "true");
  const user = await createUser();
  const { project, dir } = await createFreshProject();
  const source = await createSourceRecords(user.id, project.id);
  const suffix = uid();
  const [claude, codex] = await Promise.all([
    prisma.externalAgent.create({ data: { name: `Claude ${suffix}`, roleTitle: "Executor", type: "CLAUDE_CODE", command: "claude", bridgeEnabled: true } }),
    prisma.externalAgent.create({ data: { name: `Codex ${suffix}`, roleTitle: "Executor", type: "CODEX", command: "codex", bridgeEnabled: true } })
  ]);
  const runner = await prisma.agentRunner.create({
    data: {
      name: `Workflow runner ${suffix}`,
      tokenHash: `workflow-${suffix}`,
      status: "ONLINE",
      lastHeartbeatAt: new Date(),
      capabilitiesUpdatedAt: new Date(),
      agentCapabilities: [{ type: "CLAUDE_CODE", available: true }, { type: "CODEX", available: true }]
    }
  });
  try {
    const choice = await startOrContinueDecreeToDoneWorkflow(source.task.id, user.id);
    assert.equal(choice.primaryAction, "Choose Agent");
    assert.equal(choice.availableAgents.length, 2);
    await startOrContinueDecreeToDoneWorkflow(source.task.id, user.id);
    assert.equal(await prisma.matter.count({ where: { sourceType: "WORK_ORDER_EXTERNAL_AGENT_CHOICE", sourceId: source.workOrder.id } }), 1);

    const dispatched = await chooseWorkflowExternalAgent(choice.id, claude.id, user.id);
    assert.equal(dispatched.status, "RUNNING");
    assert.equal(dispatched.currentStep, "VALIDATE_RESULT");
    assert.equal(await prisma.automationJob.count({ where: { workOrderId: source.workOrder.id } }), 1);
    const firstJobId = dispatched.automationJobId!;
    await startOrContinueDecreeToDoneWorkflow(source.task.id, user.id);
    assert.equal(await prisma.automationJob.count({ where: { workOrderId: source.workOrder.id } }), 1, "continue must not duplicate an active job");

    await prisma.externalAgentRun.updateMany({ where: { automationJobId: firstJobId }, data: { status: "SUCCEEDED", completedAt: new Date() } });
    const firstReport = await prisma.implementationReport.create({
      data: { workOrderId: source.workOrder.id, projectId: project.id, automationJobId: firstJobId, summary: "Implementation ran but validation failed mechanically.", filesChanged: ["src/change.ts"], testsRun: ["npm test"], testResult: "FAILED", errors: ["test failed"] }
    });
    const firstPatch = await prisma.patchArtifact.create({
      data: { automationJobId: firstJobId, workOrderId: source.workOrder.id, projectId: project.id, title: "First patch", summary: "Retryable patch", filesChanged: ["src/change.ts"], validationStatus: "PENDING", baseContextStatus: "FRESH" }
    });
    await prisma.agentReviewSummary.create({
      data: { automationJobId: firstJobId, workOrderId: source.workOrder.id, projectId: project.id, verdict: "VALIDATION_FAILED", confidence: "HIGH", kingRecommendation: "RETRY_WITH_FIXED_PATCH", summary: "Validation failed for a mechanical reason.", sourceReportId: firstReport.id, patchArtifactId: firstPatch.id }
    });
    await prisma.automationJob.update({ where: { id: firstJobId }, data: { status: "NEEDS_REVIEW" } });
    const retryReady = await reconcileWorkflowForAutomationJob(firstJobId);
    assert.equal(retryReady?.primaryAction, "Retry");

    const retried = await retryDecreeToDoneWorkflow(choice.id, user.id);
    assert.notEqual(retried.automationJobId, firstJobId);
    assert.equal(retried.currentStep, "VALIDATE_RESULT");
    assert.equal(await prisma.automationJob.count({ where: { workOrderId: source.workOrder.id } }), 2);
    const passingJobId = retried.automationJobId!;

    await prisma.externalAgentRun.updateMany({ where: { automationJobId: passingJobId }, data: { status: "SUCCEEDED", completedAt: new Date() } });
    const passingReport = await prisma.implementationReport.create({
      data: { workOrderId: source.workOrder.id, projectId: project.id, automationJobId: passingJobId, summary: "Implementation and all required validation completed successfully.", filesChanged: ["src/change.ts"], testsRun: ["npm test"], testResult: "PASSED" }
    });
    const passingPatch = await prisma.patchArtifact.create({
      data: { automationJobId: passingJobId, workOrderId: source.workOrder.id, projectId: project.id, title: "Passing patch", summary: "Validated patch", filesChanged: ["src/change.ts"], validationStatus: "PENDING", baseContextStatus: "FRESH" }
    });
    await prisma.agentReviewSummary.create({
      data: { automationJobId: passingJobId, workOrderId: source.workOrder.id, projectId: project.id, verdict: "PASS", confidence: "HIGH", kingRecommendation: "APPROVE", summary: "The patch satisfies the acceptance criteria and validation passed.", whatPassed: ["Tests passed"], sourceReportId: passingReport.id, patchArtifactId: passingPatch.id }
    });
    await prisma.agentKnowledgeCandidate.create({
      data: { agentId: "workflow-reviewer", projectId: project.id, sourceType: "AGENT_REVIEW", sourceId: passingJobId, title: "Successful workflow lesson", content: "The scoped retry corrected validation and completed successfully.", status: "PENDING", category: "WORKFLOW_RULE" }
    });
    await prisma.automationJob.update({ where: { id: passingJobId }, data: { status: "NEEDS_REVIEW" } });
    await prisma.workOrder.update({ where: { id: source.workOrder.id }, data: { status: "NEEDS_REVIEW" } });
    const acceptReady = await reconcileWorkflowForAutomationJob(passingJobId);
    assert.equal(acceptReady?.primaryAction, "Accept & Learn");

    const completed = await acceptAndLearnDecreeToDoneWorkflow(choice.id, user.id);
    assert.equal(completed.status, "COMPLETED");
    assert.equal(completed.currentStep, "DONE");
    assert.equal((await prisma.workOrder.findUniqueOrThrow({ where: { id: source.workOrder.id } })).status, "COMPLETED");
    assert.equal((await prisma.automationJob.findUniqueOrThrow({ where: { id: passingJobId } })).status, "COMPLETED");
    assert.equal((await prisma.patchArtifact.findUniqueOrThrow({ where: { id: passingPatch.id } })).validationStatus, "APPROVED");
    assert.equal(await prisma.agentKnowledgeMemory.count({ where: { sourceCandidateId: { not: null }, projectId: project.id } }), 1);
  } finally {
    await cleanupFixture({ userId: user.id, projectId: project.id, workOrderIds: [source.workOrder.id], dir });
    await prisma.externalAgent.deleteMany({ where: { id: { in: [claude.id, codex.id] } } }).catch(() => undefined);
    await prisma.agentRunner.delete({ where: { id: runner.id } }).catch(() => undefined);
    await restoreChoice();
    await restoreBridge();
    await restoreRuntime();
  }
});

test("dispatch preconditions block when the global bridge is disabled", async () => {
  const restoreRuntime = await isolateExternalRuntime();
  const restoreChoice = await setSetting("REQUIRE_KING_EXTERNAL_AGENT_CHOICE", "true");
  const restoreBridge = await setSetting("EXTERNAL_AGENT_BRIDGE_ENABLED", "false");
  const user = await createUser();
  const { project, dir } = await createFreshProject();
  const source = await createSourceRecords(user.id, project.id);
  const suffix = uid();
  const agent = await prisma.externalAgent.create({ data: { name: `Only agent ${suffix}`, roleTitle: "Executor", type: "GENERIC_CLI", command: "agent", bridgeEnabled: true } });
  const runner = await prisma.agentRunner.create({
    data: { name: `Bridge gate runner ${suffix}`, tokenHash: `bridge-gate-${suffix}`, status: "ONLINE", lastHeartbeatAt: new Date(), capabilitiesUpdatedAt: new Date(), agentCapabilities: [{ type: "GENERIC_CLI", available: true }] }
  });
  try {
    const workflow = await startOrContinueDecreeToDoneWorkflow(source.task.id, user.id);
    assert.equal(workflow.status, "BLOCKED");
    assert.equal(workflow.currentStep, "DISPATCH_RUNNER");
    assert.equal(workflow.primaryAction, "Dispatch");
    assert.match(workflow.lastError ?? "", /bridge is disabled/i);
    assert.equal(await prisma.automationJob.count({ where: { workOrderId: source.workOrder.id } }), 0);
  } finally {
    await cleanupFixture({ userId: user.id, projectId: project.id, workOrderIds: [source.workOrder.id], dir });
    await prisma.externalAgent.delete({ where: { id: agent.id } }).catch(() => undefined);
    await prisma.agentRunner.delete({ where: { id: runner.id } }).catch(() => undefined);
    await restoreChoice();
    await restoreBridge();
    await restoreRuntime();
  }
});
