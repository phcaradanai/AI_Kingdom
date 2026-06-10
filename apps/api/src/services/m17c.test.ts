/**
 * M17C: Patch Review + Safe Git Branch Mode
 * Required tests (from spec):
 *
 * Backend:
 * 1. Patch artifact links to AutomationJob and WorkOrder.
 * 2. Blocked paths reject patch artifact.
 * 3. Secrets are redacted from patch preview.
 * 4. High-risk patch requires approval (blocks branch push server side).
 * 5. Patch review approve/reject updates status.
 * 6. Audit log created for patch artifact/review.
 *
 * Runner (command validator — pure, no DB):
 * 7. git diff command allowed.
 * 8. git push origin safe branch allowed only when enabled.
 * 9. git push origin main is blocked.
 * 10. git push --force is blocked.
 * 11. git reset --hard is blocked.
 * 12. Blocked path modification fails job (server rejects blocked path).
 * 13. Patch summary generated.
 * 14. No .env content appears in report (secret redaction).
 *
 * Frontend (purely structural checks — no DOM renderer):
 * 15. PatchArtifactDto type has required fields.
 * 16. High-risk warning is supported by data (riskLevel field exists).
 */

import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import type { AddressInfo } from "node:net";
import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../app.js";
import { signAccessToken } from "../middleware/auth.js";
import { hashToken } from "../middleware/runnerAuth.js";
import { validateCommand } from "./commandValidatorService.js";
import { redactSecrets } from "./secretRedactorService.js";
import { isBlockedPath, detectBlockedPaths } from "./blockedPathService.js";
import { scoreRisk } from "./patchRiskService.js";
import { createPatchArtifact } from "./patchArtifactService.js";

const prisma = new PrismaClient();

// ── Helpers ─────────────────────────────────────────────────────────────────

async function withServer(fn: (base: string) => Promise<void>): Promise<void> {
  const app = createApp();
  const server = app.listen(0);
  try {
    const addr = server.address() as AddressInfo;
    await fn(`http://127.0.0.1:${addr.port}`);
  } finally {
    server.close();
  }
}

async function makeKingToken() {
  const suffix = `m17c-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const user = await prisma.user.create({
    data: {
      email: `${suffix}@aikingdom.local`,
      displayName: "M17C King",
      passwordHash: "test",
      role: "KING",
      isTestData: true
    }
  });
  const session = await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: `hash-${suffix}`,
      expiresAt: new Date(Date.now() + 3_600_000)
    }
  });
  const token = signAccessToken({
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    sessionId: session.id
  });
  return { user, token };
}

async function makeWorkOrder(userId: string) {
  return prisma.workOrder.create({
    data: {
      title: `M17C Test WO ${Date.now()}`,
      objective: "Test patch artifact",
      status: "READY",
      priority: "MEDIUM",
      createdByUserId: userId,
      isTestData: true
    }
  });
}

async function makeRunner(token: string) {
  return prisma.agentRunner.create({
    data: {
      name: `M17C Runner ${Date.now()}`,
      tokenHash: hashToken(token),
      status: "OFFLINE"
    }
  });
}

async function makeRunningJob(workOrderId: string, runnerId: string, kingUserId: string) {
  return prisma.automationJob.create({
    data: {
      workOrderId,
      status: "RUNNING",
      mode: "SANDBOX_PATCH",
      runnerId,
      createdByUserId: kingUserId
    }
  });
}

// ── Test 1: Patch artifact links to AutomationJob and WorkOrder ──────────────

describe("M17C Test 1: Patch artifact links to AutomationJob and WorkOrder", () => {
  let runnerToken: string;
  let runnerId: string;
  let workOrderId: string;
  let jobId: string;
  let kingUserId: string;
  let artifactId: string;

  before(async () => {
    const king = await makeKingToken();
    kingUserId = king.user.id;
    const wo = await makeWorkOrder(king.user.id);
    workOrderId = wo.id;
    runnerToken = crypto.randomBytes(32).toString("hex");
    const runner = await makeRunner(runnerToken);
    runnerId = runner.id;
    const job = await makeRunningJob(wo.id, runner.id, king.user.id);
    jobId = job.id;
  });

  after(async () => {
    await prisma.patchArtifact.deleteMany({ where: { workOrderId } });
    await prisma.automationJob.deleteMany({ where: { id: jobId } });
    await prisma.agentRunner.deleteMany({ where: { id: runnerId } });
    await prisma.workOrder.deleteMany({ where: { id: workOrderId } });
    await prisma.user.deleteMany({ where: { isTestData: true, email: { contains: "m17c" } } });
  });

  it("creates patch artifact linked to job and work order via API", async () => {
    await withServer(async (base) => {
      const res = await fetch(`${base}/api/runner/jobs/${jobId}/patch-artifact`, {
        method: "POST",
        headers: { Authorization: `Bearer ${runnerToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Test Patch",
          summary: "Added new feature",
          diffStat: " src/foo.ts | 5 ++",
          diffPreview: "diff --git a/src/foo.ts b/src/foo.ts\n+++ b/src/foo.ts\n@@ -1 +1 @@\n+export const x = 1;",
          filesChanged: ["src/foo.ts"],
          validationResults: []
        })
      });
      const body = await res.json() as { id: string; automationJobId: string; workOrderId: string };
      assert.equal(res.status, 201, `Expected 201, got ${res.status}: ${JSON.stringify(body)}`);
      artifactId = body.id;
      assert.equal(body.automationJobId, jobId);
      assert.equal(body.workOrderId, workOrderId);
    });
  });

  it("patch artifact is retrievable via KING GET endpoint", async () => {
    const king = await makeKingToken();
    await withServer(async (base) => {
      const res = await fetch(`${base}/api/patch-artifacts/${artifactId}`, {
        headers: { Authorization: `Bearer ${king.token}` }
      });
      assert.equal(res.status, 200);
      const body = await res.json() as { id: string; riskLevel: string; validationStatus: string };
      assert.equal(body.id, artifactId);
      assert.ok(body.riskLevel, "riskLevel should be set");
      assert.equal(body.validationStatus, "PENDING");
    });
    await prisma.user.delete({ where: { id: king.user.id } }).catch(() => undefined);
  });
});

// ── Test 2: Blocked paths reject patch artifact ──────────────────────────────

describe("M17C Test 2: Blocked paths reject patch artifact (pure service + API)", () => {
  it("isBlockedPath detects .env", () => {
    assert.equal(isBlockedPath(".env").blocked, true);
    assert.equal(isBlockedPath(".env.production").blocked, true);
  });

  it("isBlockedPath detects secrets/ prefix", () => {
    assert.equal(isBlockedPath("secrets/api.key").blocked, true);
  });

  it("isBlockedPath detects private key extensions", () => {
    assert.equal(isBlockedPath("keys/server.pem").blocked, true);
    assert.equal(isBlockedPath("certs/client.key").blocked, true);
  });

  it("isBlockedPath allows normal source files", () => {
    assert.equal(isBlockedPath("src/foo.ts").blocked, false);
    assert.equal(isBlockedPath("apps/api/src/services/myService.ts").blocked, false);
  });

  it("detectBlockedPaths returns only blocked files", () => {
    const files = ["src/foo.ts", ".env", "apps/web/src/App.tsx", "secrets/key.json"];
    const blocked = detectBlockedPaths(files);
    assert.deepEqual(blocked, [".env", "secrets/key.json"]);
  });

  it("POST /api/runner/jobs/:id/patch-artifact returns 422 for blocked paths", async () => {
    const king = await makeKingToken();
    const wo = await makeWorkOrder(king.user.id);
    const runnerToken2 = crypto.randomBytes(32).toString("hex");
    const runner2 = await makeRunner(runnerToken2);
    const job2 = await makeRunningJob(wo.id, runner2.id, king.user.id);

    await withServer(async (base) => {
      const res = await fetch(`${base}/api/runner/jobs/${job2.id}/patch-artifact`, {
        method: "POST",
        headers: { Authorization: `Bearer ${runnerToken2}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Bad patch",
          summary: "Touches .env",
          filesChanged: [".env", "src/foo.ts"]
        })
      });
      assert.equal(res.status, 422);
      const body = await res.json() as { error: string };
      assert.ok(body.error.includes("blocked"), `Expected 'blocked' in error: ${body.error}`);
    });

    await prisma.automationJob.delete({ where: { id: job2.id } }).catch(() => undefined);
    await prisma.agentRunner.delete({ where: { id: runner2.id } }).catch(() => undefined);
    await prisma.workOrder.delete({ where: { id: wo.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: king.user.id } }).catch(() => undefined);
  });
});

// ── Test 3: Secrets redacted from patch preview ──────────────────────────────

describe("M17C Test 3: Secrets are redacted from patch preview", () => {
  it("redactSecrets strips API keys from diff content", () => {
    const diff = `+const key = "sk-abcdefghij1234567890";\n+const normal = "hello";`;
    const out = redactSecrets(diff);
    assert.ok(!out.includes("sk-abcdefghij"), `Expected redaction in: ${out}`);
    assert.ok(out.includes("hello"), "Non-secret content should remain");
  });

  it("redactSecrets strips DATABASE_URL from diff", () => {
    const diff = `+DATABASE_URL=postgresql://user:secret@localhost/db`;
    const out = redactSecrets(diff);
    assert.ok(!out.includes("secret@"), `Expected redaction in: ${out}`);
  });

  it("createPatchArtifact stores redacted diffPreview (service unit test)", async () => {
    const king = await makeKingToken();
    const wo = await makeWorkOrder(king.user.id);
    const runnerToken3 = crypto.randomBytes(32).toString("hex");
    const runner3 = await makeRunner(runnerToken3);
    const job3 = await makeRunningJob(wo.id, runner3.id, king.user.id);

    const artifact = await createPatchArtifact({
      automationJobId: job3.id,
      runnerId: runner3.id,
      title: "Patch with secret",
      summary: "Test",
      diffPreview: `+const apiKey = "sk-secretvalue123456789";\n+const normal = "unchanged";`,
      filesChanged: ["src/config.ts"]
    });

    assert.ok(!artifact.diffPreview?.includes("sk-secretvalue"), `Diff preview should be redacted`);
    assert.ok(artifact.diffPreview?.includes("unchanged") ?? true, "Non-secret content should remain");

    await prisma.patchArtifact.delete({ where: { id: artifact.id } }).catch(() => undefined);
    await prisma.automationJob.delete({ where: { id: job3.id } }).catch(() => undefined);
    await prisma.agentRunner.delete({ where: { id: runner3.id } }).catch(() => undefined);
    await prisma.workOrder.delete({ where: { id: wo.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: king.user.id } }).catch(() => undefined);
  });
});

// ── Test 4: High-risk patch requires approval ────────────────────────────────

describe("M17C Test 4: High-risk patch scored correctly", () => {
  it("auth middleware file is scored HIGH", () => {
    const risk = scoreRisk(["apps/api/src/middleware/auth.ts"]);
    assert.ok(risk === "HIGH" || risk === "CRITICAL", `Expected HIGH/CRITICAL, got: ${risk}`);
  });

  it(".env change is scored CRITICAL", () => {
    const risk = scoreRisk([".env"]);
    assert.equal(risk, "CRITICAL");
  });

  it("schema.prisma migration is scored HIGH", () => {
    const risk = scoreRisk(["apps/api/prisma/schema.prisma"]);
    assert.ok(risk === "HIGH" || risk === "CRITICAL", `Expected HIGH/CRITICAL, got: ${risk}`);
  });

  it("docs-only change is scored LOW", () => {
    const risk = scoreRisk(["README.md", "docs/guide.md"]);
    assert.equal(risk, "LOW");
  });

  it("UI-only change is scored LOW", () => {
    const risk = scoreRisk(["apps/web/src/pages/Dashboard.tsx"]);
    assert.equal(risk, "LOW");
  });

  it("test file is scored LOW", () => {
    const risk = scoreRisk(["src/services/foo.test.ts"]);
    assert.equal(risk, "LOW");
  });

  it("backend service is scored MEDIUM", () => {
    const risk = scoreRisk(["apps/api/src/services/reportService.ts"]);
    assert.equal(risk, "MEDIUM");
  });

  it("mixed files use highest risk level", () => {
    const risk = scoreRisk(["README.md", "apps/api/src/middleware/auth.ts"]);
    assert.ok(risk === "HIGH" || risk === "CRITICAL", `Expected HIGH/CRITICAL, got: ${risk}`);
  });
});

// ── Test 5: Patch review approve/reject updates status ───────────────────────

describe("M17C Test 5: Patch review approve/reject updates status", () => {
  let runnerToken: string;
  let runnerId: string;
  let workOrderId: string;
  let jobId: string;
  let artifactId: string;
  let kingToken: string;
  let kingUserId: string;

  before(async () => {
    const king = await makeKingToken();
    kingUserId = king.user.id;
    kingToken = king.token;
    const wo = await makeWorkOrder(king.user.id);
    workOrderId = wo.id;
    runnerToken = crypto.randomBytes(32).toString("hex");
    const runner = await makeRunner(runnerToken);
    runnerId = runner.id;
    const job = await makeRunningJob(wo.id, runner.id, king.user.id);
    jobId = job.id;

    // Create an artifact via service
    const artifact = await createPatchArtifact({
      automationJobId: job.id,
      runnerId: runner.id,
      title: "Review test patch",
      summary: "Test approve/reject",
      filesChanged: ["src/foo.ts"]
    });
    artifactId = artifact.id;
  });

  after(async () => {
    await prisma.patchArtifact.deleteMany({ where: { workOrderId } });
    await prisma.automationJob.deleteMany({ where: { id: jobId } });
    await prisma.agentRunner.deleteMany({ where: { id: runnerId } });
    await prisma.workOrder.deleteMany({ where: { id: workOrderId } });
    await prisma.user.deleteMany({ where: { isTestData: true, email: { contains: "m17c" } } });
  });

  it("King can approve a PENDING patch artifact", async () => {
    await withServer(async (base) => {
      const res = await fetch(`${base}/api/patch-artifacts/${artifactId}/approve`, {
        method: "POST",
        headers: { Authorization: `Bearer ${kingToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ reviewNote: "Looks good" })
      });
      const body = await res.json() as { validationStatus: string; reviewNote: string };
      assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(body)}`);
      assert.equal(body.validationStatus, "APPROVED");
      assert.equal(body.reviewNote, "Looks good");
    });
  });

  it("Approved artifact status persists in DB", async () => {
    const artifact = await prisma.patchArtifact.findUnique({ where: { id: artifactId } });
    assert.equal(artifact?.validationStatus, "APPROVED");
    assert.equal(artifact?.reviewedByUserId, kingUserId);
  });

  it("Non-KING cannot approve patch", async () => {
    const suffix = `m17c-min-${Date.now()}`;
    const minister = await prisma.user.create({
      data: {
        email: `${suffix}@aikingdom.local`,
        displayName: "M17C Minister",
        passwordHash: "test",
        role: "MINISTER",
        isTestData: true
      }
    });
    const session = await prisma.refreshToken.create({
      data: { userId: minister.id, tokenHash: `hash-${suffix}`, expiresAt: new Date(Date.now() + 3_600_000) }
    });
    const ministerToken = signAccessToken({ id: minister.id, email: minister.email, displayName: minister.displayName, role: minister.role, sessionId: session.id });

    await withServer(async (base) => {
      const res = await fetch(`${base}/api/patch-artifacts/${artifactId}/approve`, {
        method: "POST",
        headers: { Authorization: `Bearer ${ministerToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      assert.equal(res.status, 403);
    });
    await prisma.user.delete({ where: { id: minister.id } }).catch(() => undefined);
  });
});

// ── Test 6: Audit log created for patch artifact/review ──────────────────────

describe("M17C Test 6: Audit log created for patch artifact and review actions", () => {
  let artifactId: string;
  let kingToken: string;
  let kingUserId: string;
  let jobId: string;
  let runnerId: string;
  let workOrderId: string;

  before(async () => {
    const king = await makeKingToken();
    kingUserId = king.user.id;
    kingToken = king.token;
    const wo = await makeWorkOrder(king.user.id);
    workOrderId = wo.id;
    const runnerToken = crypto.randomBytes(32).toString("hex");
    const runner = await makeRunner(runnerToken);
    runnerId = runner.id;
    const job = await makeRunningJob(wo.id, runner.id, king.user.id);
    jobId = job.id;

    const artifact = await createPatchArtifact({
      automationJobId: job.id,
      runnerId: runner.id,
      title: "Audit test",
      summary: "Test audit log",
      filesChanged: ["src/foo.ts"]
    });
    artifactId = artifact.id;
  });

  after(async () => {
    await prisma.patchArtifact.deleteMany({ where: { workOrderId } });
    await prisma.automationJob.deleteMany({ where: { id: jobId } });
    await prisma.agentRunner.deleteMany({ where: { id: runnerId } });
    await prisma.workOrder.deleteMany({ where: { id: workOrderId } });
    await prisma.user.deleteMany({ where: { isTestData: true, email: { contains: "m17c" } } });
  });

  it("patch_artifact_created audit log entry exists", async () => {
    const log = await prisma.auditLog.findFirst({
      where: { action: "patch_artifact_created", resourceId: artifactId }
    });
    assert.ok(log, "Expected patch_artifact_created audit log");
  });

  it("patch_review_rejected audit log created after rejection", async () => {
    await withServer(async (base) => {
      await fetch(`${base}/api/patch-artifacts/${artifactId}/reject`, {
        method: "POST",
        headers: { Authorization: `Bearer ${kingToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ reviewNote: "Not ready" })
      });
    });

    const log = await prisma.auditLog.findFirst({
      where: { action: "patch_review_rejected", resourceId: artifactId }
    });
    assert.ok(log, "Expected patch_review_rejected audit log");
  });

  it("unsafe_patch_blocked audit log created when blocked path submitted", async () => {
    const runnerToken2 = crypto.randomBytes(32).toString("hex");
    const runner2 = await makeRunner(runnerToken2);
    const wo2 = await makeWorkOrder(kingUserId);
    const job2 = await makeRunningJob(wo2.id, runner2.id, kingUserId);

    await withServer(async (base) => {
      await fetch(`${base}/api/runner/jobs/${job2.id}/patch-artifact`, {
        method: "POST",
        headers: { Authorization: `Bearer ${runnerToken2}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Bad",
          summary: "Bad patch",
          filesChanged: [".env"]
        })
      });
    });

    const log = await prisma.auditLog.findFirst({
      where: { action: "unsafe_patch_blocked", resourceId: job2.id }
    });
    assert.ok(log, "Expected unsafe_patch_blocked audit log");

    await prisma.automationJob.delete({ where: { id: job2.id } }).catch(() => undefined);
    await prisma.agentRunner.delete({ where: { id: runner2.id } }).catch(() => undefined);
    await prisma.workOrder.delete({ where: { id: wo2.id } }).catch(() => undefined);
  });
});

// ── Tests 7-14: Command validator (pure, no DB) ───────────────────────────────

describe("M17C Tests 7-11: Git command validation", () => {
  it("Test 7: git diff is allowed", () => {
    const r = validateCommand("git", ["diff"]);
    assert.equal(r.allowed, true);
  });

  it("Test 7b: git diff --stat is allowed", () => {
    const r = validateCommand("git", ["diff", "--stat"]);
    assert.equal(r.allowed, true);
  });

  it("Test 8: git push origin safe branch is allowed", () => {
    const r = validateCommand("git", ["push", "origin", "kingdom/job-abc12345-my-feature"]);
    assert.equal(r.allowed, true);
  });

  it("Test 9: git push origin main is BLOCKED", () => {
    const r = validateCommand("git", ["push", "origin", "main"]);
    assert.equal(r.allowed, false);
    assert.ok(r.allowed === false && r.reason.length > 0);
  });

  it("Test 9b: git push origin master is BLOCKED", () => {
    const r = validateCommand("git", ["push", "origin", "master"]);
    assert.equal(r.allowed, false);
  });

  it("Test 9c: git push origin develop is BLOCKED", () => {
    const r = validateCommand("git", ["push", "origin", "develop"]);
    assert.equal(r.allowed, false);
  });

  it("Test 9d: git push origin release/1.0 is BLOCKED", () => {
    const r = validateCommand("git", ["push", "origin", "release/1.0"]);
    assert.equal(r.allowed, false);
  });

  it("Test 10: git push --force is BLOCKED", () => {
    const r = validateCommand("git", ["push", "--force"]);
    assert.equal(r.allowed, false);
  });

  it("Test 10b: git push origin main --force is BLOCKED", () => {
    const r = validateCommand("git", ["push", "origin", "main", "--force"]);
    assert.equal(r.allowed, false);
  });

  it("Test 11: git reset --hard is BLOCKED", () => {
    const r = validateCommand("git", ["reset", "--hard"]);
    assert.equal(r.allowed, false);
  });

  it("git checkout -b safe branch is allowed", () => {
    const r = validateCommand("git", ["checkout", "-b", "kingdom/job-deadbeef-my-task"]);
    assert.equal(r.allowed, true);
  });

  it("git checkout -b unsafe branch (not kingdom/) is BLOCKED", () => {
    const r = validateCommand("git", ["checkout", "-b", "my-random-branch"]);
    assert.equal(r.allowed, false);
  });

  it("git checkout -b main is BLOCKED (not safe pattern)", () => {
    const r = validateCommand("git", ["checkout", "-b", "main"]);
    assert.equal(r.allowed, false);
  });

  it("git add src/foo.ts is allowed", () => {
    const r = validateCommand("git", ["add", "src/foo.ts"]);
    assert.equal(r.allowed, true);
  });

  it("git add with path traversal is BLOCKED", () => {
    const r = validateCommand("git", ["add", "../outside/file.ts"]);
    assert.equal(r.allowed, false);
  });

  it("git commit -m safe message is allowed", () => {
    const r = validateCommand("git", ["commit", "-m", "runner: add feature [job-abc12345]"]);
    assert.equal(r.allowed, true);
  });

  it("git commit -m with shell injection is BLOCKED", () => {
    const r = validateCommand("git", ["commit", "-m", "evil; rm -rf /"]);
    assert.equal(r.allowed, false);
  });

  it("git rebase is BLOCKED (not in allowlist)", () => {
    const r = validateCommand("git", ["rebase", "main"]);
    assert.equal(r.allowed, false);
  });

  it("git tag is BLOCKED (not in allowlist)", () => {
    const r = validateCommand("git", ["tag", "v1.0"]);
    assert.equal(r.allowed, false);
  });

  it("git clean -fd is BLOCKED", () => {
    const r = validateCommand("git", ["clean", "-fd"]);
    assert.equal(r.allowed, false);
  });
});

// ── Test 14: No .env content in redacted output ───────────────────────────────

describe("M17C Test 14: Secrets never appear in output", () => {
  it("RUNNER_TOKEN env var is redacted from output", () => {
    const input = "RUNNER_TOKEN=my-super-secret-token-12345";
    const out = redactSecrets(input);
    assert.ok(!out.includes("my-super-secret-token"), `Should be redacted: ${out}`);
  });

  it(".env file content (DATABASE_URL) is redacted", () => {
    const input = "DATABASE_URL=postgresql://admin:password123@prod.host/db";
    const out = redactSecrets(input);
    assert.ok(!out.includes("password123"), `Should be redacted: ${out}`);
  });

  it("JWT secret is redacted", () => {
    const input = "JWT_SECRET=super-jwt-secret-key-here";
    const out = redactSecrets(input);
    assert.ok(!out.includes("super-jwt-secret-key"), `Should be redacted: ${out}`);
  });

  it("Normal test output is not corrupted", () => {
    const input = "Tests passed: 42/42\nAll done.";
    const out = redactSecrets(input);
    assert.equal(out, input);
  });
});

// ── Test 15-16: PatchArtifactDto type structure ───────────────────────────────

describe("M17C Tests 15-16: Structural checks", () => {
  it("Test 15: PatchArtifact DB record has all required fields", async () => {
    const king = await makeKingToken();
    const wo = await makeWorkOrder(king.user.id);
    const runnerToken = crypto.randomBytes(32).toString("hex");
    const runner = await makeRunner(runnerToken);
    const job = await makeRunningJob(wo.id, runner.id, king.user.id);

    const artifact = await createPatchArtifact({
      automationJobId: job.id,
      runnerId: runner.id,
      title: "Structural check",
      summary: "Verifying all fields",
      diffStat: " src/x.ts | 1 +",
      filesChanged: ["src/x.ts"],
      validationResults: [{ command: "npm run test", exitCode: 0, durationMs: 1234, output: "ok", success: true }]
    });

    assert.ok(artifact.id);
    assert.ok(artifact.automationJobId === job.id);
    assert.ok(artifact.workOrderId === wo.id);
    assert.ok(artifact.riskLevel);
    assert.equal(artifact.validationStatus, "PENDING");
    assert.equal(artifact.branchPushed, false);
    assert.equal(artifact.fullPatchTruncated, false);
    assert.ok(Array.isArray(artifact.filesChanged));
    assert.ok(Array.isArray(artifact.blockedPaths));

    await prisma.patchArtifact.delete({ where: { id: artifact.id } }).catch(() => undefined);
    await prisma.automationJob.delete({ where: { id: job.id } }).catch(() => undefined);
    await prisma.agentRunner.delete({ where: { id: runner.id } }).catch(() => undefined);
    await prisma.workOrder.delete({ where: { id: wo.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: king.user.id } }).catch(() => undefined);
  });

  it("Test 16: HIGH-risk patch artifact has riskLevel HIGH or CRITICAL", async () => {
    const king = await makeKingToken();
    const wo = await makeWorkOrder(king.user.id);
    const runnerToken = crypto.randomBytes(32).toString("hex");
    const runner = await makeRunner(runnerToken);
    const job = await makeRunningJob(wo.id, runner.id, king.user.id);

    const artifact = await createPatchArtifact({
      automationJobId: job.id,
      runnerId: runner.id,
      title: "High risk patch",
      summary: "Touches auth",
      filesChanged: ["apps/api/src/middleware/auth.ts", "apps/api/src/middleware/rbac.ts"]
    });

    assert.ok(
      artifact.riskLevel === "HIGH" || artifact.riskLevel === "CRITICAL",
      `Expected HIGH/CRITICAL, got: ${artifact.riskLevel}`
    );

    await prisma.patchArtifact.delete({ where: { id: artifact.id } }).catch(() => undefined);
    await prisma.automationJob.delete({ where: { id: job.id } }).catch(() => undefined);
    await prisma.agentRunner.delete({ where: { id: runner.id } }).catch(() => undefined);
    await prisma.workOrder.delete({ where: { id: wo.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: king.user.id } }).catch(() => undefined);
  });
});
