import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { prisma } from "../db/prisma.js";
import {
  buildDeterministicReview,
  createOrUpdateAgentReviewForJob,
  generateAgentReviewDraft,
  type ReviewInput
} from "./runnerResultReviewService.js";

const createdWorkOrderIds: string[] = [];
const createdJobIds: string[] = [];

after(async () => {
  await prisma.agentReviewSummary.deleteMany({ where: { automationJobId: { in: createdJobIds } } }).catch(() => undefined);
  await prisma.patchArtifact.deleteMany({ where: { automationJobId: { in: createdJobIds } } }).catch(() => undefined);
  await prisma.implementationReport.deleteMany({ where: { automationJobId: { in: createdJobIds } } }).catch(() => undefined);
  await prisma.automationJob.deleteMany({ where: { id: { in: createdJobIds } } }).catch(() => undefined);
  await prisma.workOrder.deleteMany({ where: { id: { in: createdWorkOrderIds } } }).catch(() => undefined);
  await prisma.$disconnect();
});

test("CHECK_FAILED produces PATCH_FAILED / RETRY_WITH_FIXED_PATCH", () => {
  const review = buildDeterministicReview(input({ importedPatchStatus: "CHECK_FAILED", errors: ["git apply --check failed"] }));
  assert.equal(review.verdict, "PATCH_FAILED");
  assert.equal(review.kingRecommendation, "RETRY_WITH_FIXED_PATCH");
});

test("NO_CHANGES produces NO_CHANGES / REQUEST_REVISION", () => {
  const review = buildDeterministicReview(input({ importedPatchStatus: "NO_CHANGES" }));
  assert.equal(review.verdict, "NO_CHANGES");
  assert.equal(review.kingRecommendation, "REQUEST_REVISION");
});

test("VALIDATION_FAILED produces VALIDATION_FAILED / REQUEST_REVISION", () => {
  const review = buildDeterministicReview(input({ importedPatchStatus: "VALIDATION_FAILED", testResult: "FAILED" }));
  assert.equal(review.verdict, "VALIDATION_FAILED");
  assert.equal(review.kingRecommendation, "REQUEST_REVISION");
});

test("VALIDATED with LOW risk produces PASS / APPROVE", () => {
  const review = buildDeterministicReview(input({ importedPatchStatus: "VALIDATED", riskLevel: "LOW", testResult: "PASSED" }));
  assert.equal(review.verdict, "PASS");
  assert.equal(review.kingRecommendation, "APPROVE");
});

test("VALIDATED with HIGH risk produces RISK_REVIEW / REVIEW_MANUALLY", () => {
  const review = buildDeterministicReview(input({ importedPatchStatus: "VALIDATED", riskLevel: "HIGH", testResult: "PASSED" }));
  assert.equal(review.verdict, "RISK_REVIEW");
  assert.equal(review.kingRecommendation, "REVIEW_MANUALLY");
});

test("report errors produce NEEDS_FIX / REQUEST_REVISION", () => {
  const review = buildDeterministicReview(input({ importedPatchStatus: "APPLIED_IN_SANDBOX", errors: ["Unhandled exception"] }));
  assert.equal(review.verdict, "NEEDS_FIX");
  assert.equal(review.kingRecommendation, "REQUEST_REVISION");
});

test("deterministic fallback works when AI output is invalid", async () => {
  const review = await generateAgentReviewDraft(
    input({ importedPatchStatus: "VALIDATED", riskLevel: "LOW", testResult: "PASSED" }),
    { useAi: true, aiGenerate: async () => "not valid json" }
  );
  assert.equal(review.verdict, "PASS");
  assert.equal(review.kingRecommendation, "APPROVE");
  assert.match(review.rawModelOutput ?? "", /not valid json/);
});

test("repeated review generation updates one AgentReviewSummary", async () => {
  const suffix = randomUUID();
  const workOrder = await prisma.workOrder.create({
    data: { title: `M17H idempotency ${suffix}`, objective: "Review idempotency", status: "READY", isTestData: true }
  });
  createdWorkOrderIds.push(workOrder.id);
  const job = await prisma.automationJob.create({
    data: {
      workOrderId: workOrder.id,
      status: "NEEDS_REVIEW",
      mode: "SANDBOX_PATCH",
      importedPatchStatus: "VALIDATED"
    }
  });
  createdJobIds.push(job.id);
  await prisma.implementationReport.create({
    data: {
      workOrderId: workOrder.id,
      automationJobId: job.id,
      summary: "Validated patch",
      filesChanged: ["src/foo.ts"],
      commandsRun: ["npm run test --workspace @ai-kingdom/api"],
      testsRun: ["npm run test --workspace @ai-kingdom/api"],
      testResult: "PASSED"
    }
  });
  await prisma.patchArtifact.create({
    data: {
      automationJobId: job.id,
      workOrderId: workOrder.id,
      title: "Validated patch",
      summary: "Validated patch",
      filesChanged: ["src/foo.ts"],
      riskLevel: "LOW"
    }
  });

  const first = await createOrUpdateAgentReviewForJob(job.id, { useAi: false });
  const second = await createOrUpdateAgentReviewForJob(job.id, { useAi: false });
  const count = await prisma.agentReviewSummary.count({ where: { automationJobId: job.id } });

  assert.equal(count, 1);
  assert.equal(second.id, first.id);
  assert.equal(second.verdict, "PASS");
});

function input(opts: {
  importedPatchStatus?: string | null;
  riskLevel?: string;
  testResult?: "NOT_RUN" | "PASSED" | "FAILED" | "PARTIAL";
  errors?: string[];
}): ReviewInput {
  const now = new Date();
  const automationJob = {
    id: "job-test",
    workOrderId: "wo-test",
    projectId: null,
    agentId: null,
    runnerId: null,
    status: "NEEDS_REVIEW",
    mode: "SANDBOX_PATCH",
    commandPolicy: null,
    allowedCommands: [],
    provenance: null,
    planJson: null,
    patchSummary: null,
    logsPreview: null,
    localDocumentSnapshotId: null,
    repositorySnapshotId: null,
    contextRequired: false,
    contextValidationStatus: "NOT_REQUIRED",
    contextValidationSummary: null,
    importedPatch: null,
    importedPatchStatus: opts.importedPatchStatus ?? null,
    createdByUserId: null,
    approvedByUserId: null,
    startedAt: null,
    completedAt: now,
    createdAt: now,
    updatedAt: now,
    workOrder: { id: "wo-test", title: "Test work order" },
    steps: []
  } as ReviewInput["automationJob"];
  const report = {
    id: "report-test",
    projectId: null,
    workOrderId: "wo-test",
    workSessionId: null,
    externalAgentId: null,
    automationJobId: "job-test",
    summary: "Runner report",
    filesChanged: ["src/foo.ts"],
    commandsRun: ["npm run test --workspace @ai-kingdom/api"],
    testsRun: ["npm run test --workspace @ai-kingdom/api"],
    testResult: opts.testResult ?? "PASSED",
    errors: opts.errors ?? [],
    decisionsMade: [],
    remainingWork: [],
    nextRecommendedAction: null,
    rawOutput: null,
    localDocumentSnapshotId: null,
    repositorySnapshotId: null,
    contextUsed: null,
    createdAt: now,
    updatedAt: now
  } as ReviewInput["report"];
  const patchArtifact = opts.riskLevel ? {
    id: "patch-test",
    automationJobId: "job-test",
    workOrderId: "wo-test",
    projectId: null,
    title: "Patch",
    summary: "Patch",
    diffStat: null,
    diffPreview: null,
    fullPatch: null,
    fullPatchTruncated: false,
    filesChanged: ["src/foo.ts"],
    riskLevel: opts.riskLevel,
    validationStatus: "PENDING",
    validationResults: [],
    reviewedByUserId: null,
    reviewNote: null,
    blockedPaths: [],
    branchName: null,
    branchPushed: false,
    prUrl: null,
    localDocumentSnapshotId: null,
    repositorySnapshotId: null,
    baseContextStatus: "FRESH",
    baseContextProvenance: null,
    createdAt: now,
    updatedAt: now
  } as ReviewInput["patchArtifact"] : null;
  return { automationJob, report, patchArtifact };
}
