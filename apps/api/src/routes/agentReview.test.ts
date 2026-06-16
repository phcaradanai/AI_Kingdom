import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { createApp } from "../app.js";
import { prisma } from "../db/prisma.js";
import { signAccessToken } from "../middleware/auth.js";

let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
let baseUrl: string;
const createdUserIds: string[] = [];
const createdWorkOrderIds: string[] = [];
const createdJobIds: string[] = [];

before(async () => {
  const app = createApp();
  server = app.listen(0);
  const address = server.address();
  assert.equal(typeof address, "object");
  baseUrl = `http://127.0.0.1:${(address as AddressInfo).port}`;
});

after(async () => {
  server.close();
  await prisma.agentReviewSummary.deleteMany({ where: { automationJobId: { in: createdJobIds } } }).catch(() => undefined);
  await prisma.patchArtifact.deleteMany({ where: { automationJobId: { in: createdJobIds } } }).catch(() => undefined);
  await prisma.implementationReport.deleteMany({ where: { automationJobId: { in: createdJobIds } } }).catch(() => undefined);
  await prisma.automationJob.deleteMany({ where: { id: { in: createdJobIds } } }).catch(() => undefined);
  await prisma.workOrder.deleteMany({ where: { id: { in: createdWorkOrderIds } } }).catch(() => undefined);
  await prisma.refreshToken.deleteMany({ where: { userId: { in: createdUserIds } } }).catch(() => undefined);
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } }).catch(() => undefined);
  await prisma.$disconnect();
});

test("GET /api/automation-jobs/:id/agent-review returns existing review", async () => {
  const king = await makeUser("KING");
  const job = await makeJob("NEEDS_REVIEW");
  await prisma.agentReviewSummary.create({
    data: {
      automationJobId: job.id,
      workOrderId: job.workOrderId,
      verdict: "PASS",
      confidence: "HIGH",
      kingRecommendation: "APPROVE",
      summary: "Validated and ready for King review"
    }
  });

  const res = await fetch(`${baseUrl}/api/automation-jobs/${job.id}/agent-review`, authed(king.token));
  assert.equal(res.status, 200);
  const body = await res.json() as { agentReview?: { verdict?: string; kingRecommendation?: string } | null };
  assert.equal(body.agentReview?.verdict, "PASS");
  assert.equal(body.agentReview?.kingRecommendation, "APPROVE");
});

test("GET /api/automation-jobs/:id/agent-review returns null when missing", async () => {
  const king = await makeUser("KING");
  const job = await makeJob("NEEDS_REVIEW");

  const res = await fetch(`${baseUrl}/api/automation-jobs/${job.id}/agent-review`, authed(king.token));
  assert.equal(res.status, 200);
  const body = await res.json() as { agentReview?: unknown };
  assert.equal(body.agentReview, null);
});

test("POST regenerate creates review for NEEDS_REVIEW job", async () => {
  const king = await makeUser("KING");
  const job = await makeJob("NEEDS_REVIEW", "VALIDATION_FAILED");
  await prisma.implementationReport.create({
    data: {
      workOrderId: job.workOrderId,
      automationJobId: job.id,
      summary: "Validation failed",
      commandsRun: ["npm run test --workspace @ai-kingdom/api"],
      testsRun: ["npm run test --workspace @ai-kingdom/api"],
      testResult: "FAILED",
      errors: ["API test failed"]
    }
  });

  const res = await fetch(`${baseUrl}/api/automation-jobs/${job.id}/agent-review/regenerate`, authed(king.token, "POST"));
  assert.equal(res.status, 200);
  const body = await res.json() as { agentReview?: { verdict?: string; kingRecommendation?: string } };
  assert.equal(body.agentReview?.verdict, "VALIDATION_FAILED");
  assert.equal(body.agentReview?.kingRecommendation, "REQUEST_REVISION");
  const count = await prisma.agentReviewSummary.count({ where: { automationJobId: job.id } });
  assert.equal(count, 1);
});

test("POST regenerate rejects non-NEEDS_REVIEW job", async () => {
  const king = await makeUser("KING");
  const job = await makeJob("QUEUED");

  const res = await fetch(`${baseUrl}/api/automation-jobs/${job.id}/agent-review/regenerate`, authed(king.token, "POST"));
  assert.equal(res.status, 409);
});

test("non-KING cannot access agent review endpoints", async () => {
  const minister = await makeUser("MINISTER");
  const job = await makeJob("NEEDS_REVIEW");

  const getRes = await fetch(`${baseUrl}/api/automation-jobs/${job.id}/agent-review`, authed(minister.token));
  const postRes = await fetch(`${baseUrl}/api/automation-jobs/${job.id}/agent-review/regenerate`, authed(minister.token, "POST"));
  assert.equal(getRes.status, 403);
  assert.equal(postRes.status, 403);
});

async function makeUser(role: "KING" | "MINISTER") {
  const suffix = `m17h-${role.toLowerCase()}-${randomUUID()}`;
  const user = await prisma.user.create({
    data: {
      email: `${suffix}@aikingdom.local`,
      displayName: `${role} M17H`,
      passwordHash: "test",
      role,
      isTestData: true
    }
  });
  createdUserIds.push(user.id);
  const session = await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: `hash-${suffix}`,
      expiresAt: new Date(Date.now() + 3_600_000)
    }
  });
  const token = signAccessToken({ id: user.id, email: user.email, displayName: user.displayName, role: user.role, sessionId: session.id });
  return { user, token };
}

async function makeJob(status: "NEEDS_REVIEW" | "QUEUED", importedPatchStatus?: string) {
  const workOrder = await prisma.workOrder.create({
    data: { title: `M17H route ${randomUUID()}`, objective: "Route test", status: "READY", isTestData: true }
  });
  createdWorkOrderIds.push(workOrder.id);
  const job = await prisma.automationJob.create({
    data: {
      workOrderId: workOrder.id,
      status,
      mode: "SANDBOX_PATCH",
      importedPatchStatus: importedPatchStatus ?? null
    }
  });
  createdJobIds.push(job.id);
  return job;
}

function authed(token: string, method = "GET"): RequestInit {
  return {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
  };
}
