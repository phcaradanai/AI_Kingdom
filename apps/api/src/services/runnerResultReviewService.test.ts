import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../../");
import { prisma } from "../db/prisma.js";
import {
  buildDeterministicReview,
  createOrUpdateAgentReviewForJob,
  generateAgentReviewDraft,
  normalizeKingRecommendation,
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

test("M24 Phase C: AI downgrades a mechanically-PASS result when an acceptance criterion is unmet", async () => {
  const review = await generateAgentReviewDraft(
    input({ importedPatchStatus: "VALIDATED", riskLevel: "LOW", testResult: "PASSED", acceptanceCriteria: ["GET /api/health/version returns the build version"] }),
    {
      useAi: true,
      aiGenerate: async () => JSON.stringify({
        summary: "Tests pass but the version field was not added.",
        acceptanceCriteriaAssessment: [
          { criterion: "GET /api/health/version returns the build version", met: false, note: "No version field in the diff" }
        ]
      })
    }
  );
  assert.equal(review.verdict, "NEEDS_FIX");
  assert.equal(review.kingRecommendation, "REQUEST_REVISION");
  assert.equal(review.acceptanceCriteriaDowngraded, true);
  assert.ok(review.whatFailed.some((item) => /Acceptance criterion not met/.test(item)));
  // A revision prompt must be available now that the result is no longer APPROVE.
  assert.ok(review.externalAgentPrompt && review.externalAgentPrompt.length > 0);
});

test("M24 Phase C: AI keeps PASS when all acceptance criteria are met", async () => {
  const review = await generateAgentReviewDraft(
    input({ importedPatchStatus: "VALIDATED", riskLevel: "LOW", testResult: "PASSED", acceptanceCriteria: ["Endpoint returns version"] }),
    {
      useAi: true,
      aiGenerate: async () => JSON.stringify({
        summary: "Version field added and tests pass.",
        acceptanceCriteriaAssessment: [{ criterion: "Endpoint returns version", met: true }]
      })
    }
  );
  assert.equal(review.verdict, "PASS");
  assert.equal(review.kingRecommendation, "APPROVE");
  assert.notEqual(review.acceptanceCriteriaDowngraded, true);
});

test("M24 Phase C: ambiguous (met omitted) does not downgrade a PASS", async () => {
  const review = await generateAgentReviewDraft(
    input({ importedPatchStatus: "VALIDATED", riskLevel: "LOW", testResult: "PASSED", acceptanceCriteria: ["Endpoint returns version"] }),
    {
      useAi: true,
      aiGenerate: async () => JSON.stringify({
        summary: "Cannot confirm from the diff.",
        acceptanceCriteriaAssessment: [{ criterion: "Endpoint returns version" }]
      })
    }
  );
  assert.equal(review.verdict, "PASS");
  assert.equal(review.kingRecommendation, "APPROVE");
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
  acceptanceCriteria?: string[];
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
    workOrder: { id: "wo-test", title: "Test work order", acceptanceCriteria: opts.acceptanceCriteria ?? [] },
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

// V1 Release Lock: review metadata consistency tests

test("normalizeKingRecommendation: PASS + REQUEST_REVISION → APPROVE", () => {
  assert.equal(normalizeKingRecommendation("PASS", "REQUEST_REVISION"), "APPROVE");
});

test("normalizeKingRecommendation: PASS + RETRY_WITH_FIXED_PATCH → APPROVE", () => {
  assert.equal(normalizeKingRecommendation("PASS", "RETRY_WITH_FIXED_PATCH"), "APPROVE");
});

test("normalizeKingRecommendation: PASS + REJECT → APPROVE", () => {
  assert.equal(normalizeKingRecommendation("PASS", "REJECT"), "APPROVE");
});

test("normalizeKingRecommendation: PASS + APPROVE → APPROVE (unchanged)", () => {
  assert.equal(normalizeKingRecommendation("PASS", "APPROVE"), "APPROVE");
});

test("normalizeKingRecommendation: non-PASS verdict is not mutated", () => {
  assert.equal(normalizeKingRecommendation("NEEDS_FIX", "REQUEST_REVISION"), "REQUEST_REVISION");
  assert.equal(normalizeKingRecommendation("VALIDATION_FAILED", "RETRY_WITH_FIXED_PATCH"), "RETRY_WITH_FIXED_PATCH");
});

test("README contains DECREE_TO_DONE product flow description", () => {
  const readme = readFileSync(join(REPO_ROOT, "README.md"), "utf8");
  assert.ok(readme.includes("DECREE_TO_DONE"), "README must describe the DECREE_TO_DONE workflow");
  assert.ok(readme.includes("Mission Control"), "README must reference Mission Control for BUILD flow");
});

test("NEXT_TASK.md describes V1 release state, not stale Wave 4H Treasury task", () => {
  const nextTask = readFileSync(join(REPO_ROOT, "NEXT_TASK.md"), "utf8");
  assert.ok(!nextTask.startsWith("# Next Task\n\n## Premium UX Wave 4H: Treasury"), "NEXT_TASK must not still point to Wave 4H Treasury as the primary task");
});
