import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { prisma } from "../db/prisma.js";
import { findCrossTaskLessons, formatCrossTaskLessons } from "./crossTaskLearningService.js";

const workOrderIds: string[] = [];
const jobIds: string[] = [];
let projectId: string | null = null;

async function addReviewedWorkOrder(opts: {
  title: string;
  objective: string;
  verdict: string;
  whatFailed?: string[];
  summary: string;
}) {
  const wo = await prisma.workOrder.create({
    data: { title: opts.title, objective: opts.objective, projectId, status: "NEEDS_REVIEW", isTestData: true }
  });
  workOrderIds.push(wo.id);
  const job = await prisma.automationJob.create({
    data: { workOrderId: wo.id, projectId, status: "NEEDS_REVIEW", mode: "SANDBOX_PATCH" }
  });
  jobIds.push(job.id);
  await prisma.agentReviewSummary.create({
    data: {
      automationJobId: job.id,
      workOrderId: wo.id,
      verdict: opts.verdict,
      confidence: "HIGH",
      kingRecommendation: opts.verdict === "PASS" ? "APPROVE" : "REQUEST_REVISION",
      summary: opts.summary,
      whatFailed: opts.whatFailed ?? []
    }
  });
  return wo;
}

after(async () => {
  await prisma.agentReviewSummary.deleteMany({ where: { automationJobId: { in: jobIds } } }).catch(() => undefined);
  await prisma.automationJob.deleteMany({ where: { id: { in: jobIds } } }).catch(() => undefined);
  await prisma.workOrder.deleteMany({ where: { id: { in: workOrderIds } } }).catch(() => undefined);
  if (projectId) await prisma.project.delete({ where: { id: projectId } }).catch(() => undefined);
  await prisma.$disconnect();
});

test("cross-task lessons are relevance-ranked and outcome-gated", async () => {
  const project = await prisma.project.create({ data: { name: `ctl-${randomUUID()}` } });
  projectId = project.id;

  // Relevant + failed → must surface as AVOID with its diagnosis.
  await addReviewedWorkOrder({
    title: "OAuth login token refresh",
    objective: "Refresh the OAuth access token before it expires.",
    verdict: "VALIDATION_FAILED",
    whatFailed: ["missing token expiry check before refresh"],
    summary: "Token refresh added but validation failed."
  });
  // Relevant + passed → must surface as WORKED.
  await addReviewedWorkOrder({
    title: "OAuth token storage hardening",
    objective: "Store the OAuth refresh token securely.",
    verdict: "PASS",
    summary: "Stored the refresh token in the secure store; tests pass."
  });
  // Irrelevant + failed → must be excluded (recency would have included it).
  await addReviewedWorkOrder({
    title: "Dashboard chart palette",
    objective: "Adjust the dashboard chart colors.",
    verdict: "PATCH_FAILED",
    whatFailed: ["used the wrong hex code"],
    summary: "Palette change failed to apply."
  });
  // Relevant but ambiguous verdict → must be excluded (not a clear lesson).
  await addReviewedWorkOrder({
    title: "OAuth scopes review",
    objective: "Review the OAuth token scopes.",
    verdict: "RISK_REVIEW",
    summary: "Needs manual review."
  });

  const lessons = await findCrossTaskLessons({
    decreeText: "Implement an OAuth token refresh endpoint with expiry handling",
    projectId
  });

  const titles = lessons.map((l) => l.title);
  assert.ok(titles.includes("OAuth login token refresh"), "relevant failure surfaces");
  assert.ok(titles.includes("OAuth token storage hardening"), "relevant success surfaces");
  assert.ok(!titles.includes("Dashboard chart palette"), "irrelevant work is excluded");
  assert.ok(!titles.includes("OAuth scopes review"), "ambiguous verdict is excluded");

  const failure = lessons.find((l) => l.title === "OAuth login token refresh");
  assert.equal(failure?.kind, "AVOID");
  const success = lessons.find((l) => l.title === "OAuth token storage hardening");
  assert.equal(success?.kind, "WORKED");

  const formatted = formatCrossTaskLessons(lessons);
  assert.match(formatted, /LESSONS FROM SIMILAR PAST WORK/);
  assert.match(formatted, /What to avoid/);
  assert.match(formatted, /missing token expiry check/);
});

test("no lessons → empty string (no section emitted)", async () => {
  const lessons = await findCrossTaskLessons({
    decreeText: "zzzqqq nonsense topic with no prior work whatsoever",
    projectId
  });
  assert.equal(lessons.length, 0);
  assert.equal(formatCrossTaskLessons(lessons), "");
});
