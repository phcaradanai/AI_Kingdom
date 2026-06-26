import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { prisma } from "../db/prisma.js";
import { createOrUpdateAgentReviewForJob } from "./runnerResultReviewService.js";

const agentIds: string[] = [];
const workOrderIds: string[] = [];
const jobIds: string[] = [];
const projectIds: string[] = [];

async function setCapture(enabled: boolean) {
  await prisma.setting.upsert({
    where: { key: "CAPTURE_LESSONS_FROM_REVIEWS" },
    update: { value: String(enabled) },
    create: { key: "CAPTURE_LESSONS_FROM_REVIEWS", value: String(enabled), category: "SYSTEM", description: "test" }
  });
}

async function setCaptureSuccesses(enabled: boolean) {
  await prisma.setting.upsert({
    where: { key: "CAPTURE_SUCCESSES_FROM_REVIEWS" },
    update: { value: String(enabled) },
    create: { key: "CAPTURE_SUCCESSES_FROM_REVIEWS", value: String(enabled), category: "SYSTEM", description: "test" }
  });
}

async function makeFailedReviewJob() {
  const suffix = randomUUID();
  // Unique but transient-safe tag: the value gate rejects titles containing isolated 7-8 hex
  // runs (uuids), so we avoid hex and keep the token attached to a leading letter.
  const tag = `wo${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const agent = await prisma.agent.create({
    data: { slug: `reviewer-${suffix}`, name: `Reviewer ${suffix}`, title: "Test Reviewer", role: "MINISTER", specialty: "review", prompt: "review", isActive: true }
  });
  agentIds.push(agent.id);
  // A project linkage is required by the knowledge value gate.
  const project = await prisma.project.create({ data: { name: `Capture Lesson Project ${tag}` } });
  projectIds.push(project.id);
  const workOrder = await prisma.workOrder.create({
    data: { title: `Add export endpoint ${tag}`, objective: "Add a thing", status: "NEEDS_REVIEW", projectId: project.id, assignedAgentId: agent.id, isTestData: true }
  });
  workOrderIds.push(workOrder.id);
  const job = await prisma.automationJob.create({
    data: { workOrderId: workOrder.id, projectId: project.id, status: "NEEDS_REVIEW", mode: "SANDBOX_PATCH" }
  });
  jobIds.push(job.id);
  await prisma.implementationReport.create({
    data: {
      workOrderId: workOrder.id,
      automationJobId: job.id,
      summary: "Attempted the change but tests fail.",
      filesChanged: ["src/foo.ts"],
      commandsRun: ["npm run test"],
      testsRun: ["npm run test"],
      testResult: "FAILED",
      errors: ["typecheck failed: missing import './bar'"],
      decisionsMade: [],
      remainingWork: ["fix the import"]
    }
  });
  return { agent, workOrder, job };
}

async function makePassedReviewJob() {
  const suffix = randomUUID();
  const tag = `wo${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const agent = await prisma.agent.create({
    data: { slug: `reviewer-pass-${suffix}`, name: `Reviewer Pass ${suffix}`, title: "Test Reviewer", role: "MINISTER", specialty: "review", prompt: "review", isActive: true }
  });
  agentIds.push(agent.id);
  const project = await prisma.project.create({ data: { name: `Success Lesson Project ${tag}` } });
  projectIds.push(project.id);
  const workOrder = await prisma.workOrder.create({
    data: { title: `Add authentication middleware ${tag}`, objective: "Add JWT middleware", status: "NEEDS_REVIEW", projectId: project.id, assignedAgentId: agent.id, isTestData: true }
  });
  workOrderIds.push(workOrder.id);
  const job = await prisma.automationJob.create({
    data: { workOrderId: workOrder.id, projectId: project.id, status: "NEEDS_REVIEW", mode: "SANDBOX_PATCH", importedPatchStatus: "VALIDATED" }
  });
  jobIds.push(job.id);
  await prisma.implementationReport.create({
    data: {
      workOrderId: workOrder.id,
      automationJobId: job.id,
      summary: "Added JWT middleware successfully. Typecheck and all tests pass.",
      filesChanged: ["src/middleware/auth.ts"],
      commandsRun: ["npm run typecheck", "npm run test:api"],
      testsRun: ["npm run test:api"],
      testResult: "PASSED"
    }
  });
  await prisma.patchArtifact.create({
    data: {
      automationJobId: job.id,
      workOrderId: workOrder.id,
      title: `Auth patch ${tag}`,
      summary: "JWT middleware patch",
      filesChanged: ["src/middleware/auth.ts"],
      riskLevel: "LOW"
    }
  });
  return { agent, workOrder, job };
}

after(async () => {
  await setCapture(false);
  await setCaptureSuccesses(false);
  await prisma.agentKnowledgeCandidate.deleteMany({ where: { proposedByAgentId: { in: agentIds } } }).catch(() => undefined);
  await prisma.agentReviewSummary.deleteMany({ where: { automationJobId: { in: jobIds } } }).catch(() => undefined);
  await prisma.implementationReport.deleteMany({ where: { automationJobId: { in: jobIds } } }).catch(() => undefined);
  await prisma.automationJob.deleteMany({ where: { id: { in: jobIds } } }).catch(() => undefined);
  await prisma.workOrder.deleteMany({ where: { id: { in: workOrderIds } } }).catch(() => undefined);
  await prisma.project.deleteMany({ where: { id: { in: projectIds } } }).catch(() => undefined);
  await prisma.agent.deleteMany({ where: { id: { in: agentIds } } }).catch(() => undefined);
  await prisma.$disconnect();
});

test("a failed review proposes a PENDING knowledge candidate when capture is ON", async () => {
  await setCapture(true);
  const { agent, job } = await makeFailedReviewJob();

  const review = await createOrUpdateAgentReviewForJob(job.id, { useAi: false });
  assert.equal(review.verdict, "NEEDS_FIX");

  const candidate = await prisma.agentKnowledgeCandidate.findFirst({
    where: { proposedByAgentId: agent.id, sourceType: "AGENT_REVIEW" }
  });
  assert.ok(candidate, "a knowledge candidate is proposed from the failed review");
  assert.equal(candidate.status, "PENDING");
  assert.match(candidate.content, /missing import/);
});

test("no candidate is proposed when capture is OFF", async () => {
  await setCapture(false);
  const { agent, job } = await makeFailedReviewJob();

  const review = await createOrUpdateAgentReviewForJob(job.id, { useAi: false });
  assert.equal(review.verdict, "NEEDS_FIX");

  const candidate = await prisma.agentKnowledgeCandidate.findFirst({
    where: { proposedByAgentId: agent.id, sourceType: "AGENT_REVIEW" }
  });
  assert.equal(candidate, null, "gate off → no candidate");
});

test("a passed review proposes a WORKFLOW_RULE candidate when CAPTURE_SUCCESSES_FROM_REVIEWS is ON", async () => {
  await setCaptureSuccesses(true);
  const { agent, job } = await makePassedReviewJob();

  const review = await createOrUpdateAgentReviewForJob(job.id, { useAi: false });
  assert.equal(review.verdict, "PASS");

  const candidate = await prisma.agentKnowledgeCandidate.findFirst({
    where: { proposedByAgentId: agent.id, sourceType: "AGENT_REVIEW", traceId: `review-success:${job.id}` }
  });
  assert.ok(candidate, "a WORKFLOW_RULE candidate should be proposed from the passed review");
  assert.equal(candidate.status, "PENDING", "success candidates require King approval");
  assert.equal(candidate.category, "WORKFLOW_RULE");
  assert.ok(candidate.title?.includes("Success lesson"), "title should mark it as a success lesson");
});

test("no success candidate proposed when CAPTURE_SUCCESSES_FROM_REVIEWS is OFF", async () => {
  await setCaptureSuccesses(false);
  const { agent, job } = await makePassedReviewJob();

  const review = await createOrUpdateAgentReviewForJob(job.id, { useAi: false });
  assert.equal(review.verdict, "PASS");

  const candidate = await prisma.agentKnowledgeCandidate.findFirst({
    where: { proposedByAgentId: agent.id, traceId: `review-success:${job.id}` }
  });
  assert.equal(candidate, null, "gate off → no success candidate");
});
