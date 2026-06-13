/**
 * M17B: Kingdom Living Agent Runner — Sandbox Act
 * 10 required tests.
 */

import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import type { AddressInfo } from "node:net";
import crypto from "node:crypto";
import path from "node:path";
import os from "node:os";
import { prisma } from "../db/prisma.js";
import { createApp } from "../app.js";
import { signAccessToken } from "../middleware/auth.js";
import { hashToken } from "../middleware/runnerAuth.js";
import { validateCommand } from "./commandValidatorService.js";
import { redactSecrets } from "./secretRedactorService.js";
import { checkPathSafety } from "./workspacePathService.js";


// ── Helpers ───────────────────────────────────────────────────────────────────

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
  const suffix = `m17b-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const user = await prisma.user.create({
    data: {
      email: `${suffix}@aikingdom.local`,
      displayName: "M17B King",
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
  const token = signAccessToken({ id: user.id, email: user.email, displayName: user.displayName, role: user.role, sessionId: session.id });
  return { user, token };
}

async function makeMinisterToken() {
  const suffix = `m17b-min-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const user = await prisma.user.create({
    data: {
      email: `${suffix}@aikingdom.local`,
      displayName: "M17B Minister",
      passwordHash: "test",
      role: "MINISTER",
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
  const token = signAccessToken({ id: user.id, email: user.email, displayName: user.displayName, role: user.role, sessionId: session.id });
  return { user, token };
}

async function makeWorkOrder(userId: string, title?: string) {
  return prisma.workOrder.create({
    data: {
      title: title ?? `M17B Test WO ${Date.now()}`,
      objective: "Test objective",
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
      name: `Test Runner ${Date.now()}`,
      tokenHash: hashToken(token),
      status: "OFFLINE"
    }
  });
}

// ── Test group: RBAC ──────────────────────────────────────────────────────────

describe("M17B Test 1: Non-KING cannot approve job", () => {
  let jobId: string;
  let ministerToken: string;
  let workOrderId: string;
  let kingUserId: string;

  before(async () => {
    const king = await makeKingToken();
    kingUserId = king.user.id;
    const minister = await makeMinisterToken();
    ministerToken = minister.token;
    const wo = await makeWorkOrder(king.user.id);
    workOrderId = wo.id;
    const job = await prisma.automationJob.create({
      data: { workOrderId, status: "QUEUED", mode: "SANDBOX_PATCH", createdByUserId: kingUserId }
    });
    jobId = job.id;
  });

  after(async () => {
    await prisma.automationJob.deleteMany({ where: { id: jobId } });
    await prisma.workOrder.deleteMany({ where: { isTestData: true, id: workOrderId } });
    await prisma.user.deleteMany({ where: { isTestData: true, email: { contains: "m17b" } } });
  });

  it("returns 403 when Minister tries to approve", async () => {
    await withServer(async (base) => {
      const res = await fetch(`${base}/api/automation-jobs/${jobId}/approve`, {
        method: "POST",
        headers: { Authorization: `Bearer ${ministerToken}`, "Content-Type": "application/json" }
      });
      assert.equal(res.status, 403);
    });
  });
});

// ── Test group: Runner auth ───────────────────────────────────────────────────

describe("M17B Test 2+3: Runner claim requires APPROVED status and RUNNER_TOKEN", () => {
  let jobId: string;
  let runnerToken: string;
  let runnerId: string;
  let workOrderId: string;
  let kingUserId: string;

  before(async () => {
    const king = await makeKingToken();
    kingUserId = king.user.id;
    const wo = await makeWorkOrder(king.user.id);
    workOrderId = wo.id;
    runnerToken = crypto.randomBytes(32).toString("hex");
    const runner = await makeRunner(runnerToken);
    runnerId = runner.id;
    const job = await prisma.automationJob.create({
      data: { workOrderId, status: "QUEUED", mode: "SANDBOX_PATCH", createdByUserId: kingUserId }
    });
    jobId = job.id;
  });

  after(async () => {
    await prisma.automationJob.deleteMany({ where: { id: jobId } });
    await prisma.agentRunner.deleteMany({ where: { id: runnerId } });
    await prisma.workOrder.deleteMany({ where: { isTestData: true, id: workOrderId } });
    await prisma.user.deleteMany({ where: { isTestData: true, email: { contains: "m17b" } } });
  });

  it("Test 2: Runner cannot claim a QUEUED (unapproved) job", async () => {
    await withServer(async (base) => {
      const res = await fetch(`${base}/api/runner/jobs/claim`, {
        method: "POST",
        headers: { Authorization: `Bearer ${runnerToken}`, "Content-Type": "application/json" }
      });
      assert.equal(res.status, 200);
      const body = await res.json() as { job: unknown };
      assert.equal(body.job, null, "Should return null — no APPROVED jobs available");
    });
  });

  it("Test 3: Missing RUNNER_TOKEN returns 401", async () => {
    await withServer(async (base) => {
      const res = await fetch(`${base}/api/runner/jobs/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
        // No Authorization header
      });
      assert.equal(res.status, 401);
    });
  });

  it("Test 3b: JWT (user token) cannot access runner routes", async () => {
    const king = await makeKingToken();
    await withServer(async (base) => {
      const res = await fetch(`${base}/api/runner/jobs/claim`, {
        method: "POST",
        headers: { Authorization: `Bearer ${king.token}`, "Content-Type": "application/json" }
      });
      // Should return 401 because JWT is not a valid RUNNER_TOKEN
      assert.equal(res.status, 401);
    });
    await prisma.user.delete({ where: { id: king.user.id } }).catch(() => undefined);
  });
});

// ── Test group: Duplicate job prevention ─────────────────────────────────────

describe("M17B Test 4: Duplicate active job for same WorkOrder is rejected", () => {
  let workOrderId: string;
  let kingUserId: string;
  let jobId: string;

  before(async () => {
    const king = await makeKingToken();
    kingUserId = king.user.id;
    const wo = await makeWorkOrder(king.user.id, "Duplicate test WO");
    workOrderId = wo.id;
    const job = await prisma.automationJob.create({
      data: { workOrderId, status: "APPROVED", mode: "SANDBOX_PATCH", createdByUserId: kingUserId }
    });
    jobId = job.id;
  });

  after(async () => {
    await prisma.automationJob.deleteMany({ where: { workOrderId } });
    await prisma.workOrder.deleteMany({ where: { isTestData: true, id: workOrderId } });
    await prisma.user.deleteMany({ where: { isTestData: true, email: { contains: "m17b" } } });
  });

  it("returns 409 when creating a second active job for the same WorkOrder", async () => {
    const king = await makeKingToken();
    await withServer(async (base) => {
      const res = await fetch(`${base}/api/automation-jobs`, {
        method: "POST",
        headers: { Authorization: `Bearer ${king.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ workOrderId, mode: "SANDBOX_PATCH" })
      });
      assert.equal(res.status, 409);
    });
    await prisma.user.delete({ where: { id: king.user.id } }).catch(() => undefined);
  });
});

// ── Test group: Command validator (pure, no DB) ───────────────────────────────

describe("M17B Tests 5-7: Command validator", () => {
  it("Test 5: Allows workspace npm run test", () => {
    const result = validateCommand("npm", ["run", "test", "--workspace", "@ai-kingdom/api"]);
    assert.equal(result.allowed, true);
  });

  it("Test 5a: Blocks root npm run test", () => {
    const result = validateCommand("npm", ["run", "test"]);
    assert.equal(result.allowed, false);
  });

  it("Test 5b: Allows npm run typecheck", () => {
    const result = validateCommand("npm", ["run", "typecheck"]);
    assert.equal(result.allowed, true);
  });

  it("Test 5c: Allows git status", () => {
    const result = validateCommand("git", ["status"]);
    assert.equal(result.allowed, true);
  });

  it("Test 5d: Allows git diff", () => {
    const result = validateCommand("git", ["diff"]);
    assert.equal(result.allowed, true);
  });

  it("Test 6: Blocks rm", () => {
    const result = validateCommand("rm", ["-rf", "."]);
    assert.equal(result.allowed, false);
  });

  it("Test 6b: Blocks sudo", () => {
    const result = validateCommand("sudo", ["npm", "install"]);
    assert.equal(result.allowed, false);
  });

  it("Test 6c: Blocks curl", () => {
    const result = validateCommand("curl", ["https://example.com"]);
    assert.equal(result.allowed, false);
  });

  it("Test 6d: Blocks ssh", () => {
    const result = validateCommand("ssh", ["user@host"]);
    assert.equal(result.allowed, false);
  });

  it("Test 6e: Blocks docker", () => {
    const result = validateCommand("docker", ["run", "ubuntu"]);
    assert.equal(result.allowed, false);
  });

  it("Test 7: Blocks shell pipe in args", () => {
    const result = validateCommand("npm", ["run", "test | cat"]);
    assert.equal(result.allowed, false);
  });

  it("Test 7b: Blocks semicolon in command", () => {
    const result = validateCommand("npm;rm", ["-rf", "."]);
    assert.equal(result.allowed, false);
  });

  it("Test 7c: Blocks backtick substitution", () => {
    const result = validateCommand("npm", ["run", "`curl attacker.com`"]);
    assert.equal(result.allowed, false);
  });

  it("Test 7d: Blocks $(...) substitution", () => {
    const result = validateCommand("npm", ["run", "$(cat /etc/passwd)"]);
    assert.equal(result.allowed, false);
  });

  it("Test 6f: Blocks cat .env", () => {
    const result = validateCommand("cat", [".env"]);
    assert.equal(result.allowed, false);
  });

  it("Test 5e: Allows cat package.json", () => {
    const result = validateCommand("cat", ["package.json"]);
    assert.equal(result.allowed, true);
  });

  it("Test 6g: Blocks npm run unknown-script", () => {
    const result = validateCommand("npm", ["run", "deploy:prod"]);
    assert.equal(result.allowed, false);
  });
});

// ── Test group: Workspace path safety (pure) ──────────────────────────────────

describe("M17B Test 8: Runner cannot write outside workspace", () => {
  const workspace = path.join(os.tmpdir(), "m17b-test-workspace");

  it("Blocks path traversal ../ escape", () => {
    const result = checkPathSafety(workspace, "../outside-workspace/evil.ts");
    assert.equal(result.safe, false);
  });

  it("Blocks absolute path outside workspace", () => {
    const result = checkPathSafety(workspace, "/etc/passwd");
    assert.equal(result.safe, false);
  });

  it("Allows path inside workspace", () => {
    const result = checkPathSafety(workspace, "src/index.ts");
    assert.equal(result.safe, true);
  });

  it("Allows nested path inside workspace", () => {
    const result = checkPathSafety(workspace, "apps/api/src/server.ts");
    assert.equal(result.safe, true);
  });

  it("Allows the workspace root itself", () => {
    const result = checkPathSafety(workspace, ".");
    assert.equal(result.safe, true);
  });
});

// ── Test group: Secret redaction (pure) ───────────────────────────────────────

describe("M17B Test 9: Logs redact secrets", () => {
  it("Redacts Bearer token", () => {
    const input = "Authorization: Bearer sk-abcdefghij1234567890";
    const output = redactSecrets(input);
    assert.ok(!output.includes("sk-abcdefghij"), `Expected redaction, got: ${output}`);
  });

  it("Redacts DATABASE_URL", () => {
    const input = "DATABASE_URL=postgresql://user:pass@localhost/db";
    const output = redactSecrets(input);
    assert.ok(!output.includes("pass@"), `Expected redaction, got: ${output}`);
  });

  it("Redacts RUNNER_TOKEN env var", () => {
    const input = "RUNNER_TOKEN=supersecrettoken12345";
    const output = redactSecrets(input);
    assert.ok(!output.includes("supersecrettoken"), `Expected redaction, got: ${output}`);
  });

  it("Redacts OpenAI key pattern", () => {
    const input = "key: sk-proj-abcdefghijklmnopqrst";
    const output = redactSecrets(input);
    assert.ok(!output.includes("sk-proj-abc"), `Expected redaction, got: ${output}`);
  });

  it("Does not corrupt non-secret output", () => {
    const input = "Tests passed: 42/42";
    const output = redactSecrets(input);
    assert.equal(output, input);
  });
});

// ── Test group: Report submission ─────────────────────────────────────────────

describe("M17B Test 10: Report submission creates ImplementationReport and leaves job NEEDS_REVIEW", () => {
  let jobId: string;
  let runnerToken: string;
  let runnerId: string;
  let workOrderId: string;
  let kingUserId: string;

  before(async () => {
    const king = await makeKingToken();
    kingUserId = king.user.id;
    const wo = await makeWorkOrder(king.user.id, "Report submission test WO");
    workOrderId = wo.id;
    runnerToken = crypto.randomBytes(32).toString("hex");
    const runner = await makeRunner(runnerToken);
    runnerId = runner.id;
    const job = await prisma.automationJob.create({
      data: {
        workOrderId,
        status: "RUNNING",
        mode: "SANDBOX_PATCH",
        runnerId,
        createdByUserId: kingUserId
      }
    });
    jobId = job.id;
  });

  after(async () => {
    await prisma.implementationReport.deleteMany({ where: { automationJobId: jobId } });
    await prisma.automationJob.deleteMany({ where: { id: jobId } });
    await prisma.agentRunner.deleteMany({ where: { id: runnerId } });
    await prisma.workOrder.deleteMany({ where: { isTestData: true, id: workOrderId } });
    await prisma.user.deleteMany({ where: { isTestData: true, email: { contains: "m17b" } } });
  });

  it("creates ImplementationReport and sets job to NEEDS_REVIEW", async () => {
    await withServer(async (base) => {
      const res = await fetch(`${base}/api/runner/jobs/${jobId}/report`, {
        method: "POST",
        headers: { Authorization: `Bearer ${runnerToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: "All tests passed in sandbox",
          filesChanged: ["src/foo.ts"],
          commandsRun: ["npm run test"],
          testsRun: ["npm run test"],
          testResult: "PASSED",
          errors: [],
          decisionsMade: ["Used existing patterns"],
          remainingWork: [],
          nextRecommendedAction: "Review diff"
        })
      });
      assert.equal(res.status, 201, `Expected 201, got ${res.status}`);

      // Verify job is NEEDS_REVIEW
      const job = await prisma.automationJob.findUnique({ where: { id: jobId } });
      assert.equal(job?.status, "NEEDS_REVIEW");

      // Verify ImplementationReport was created
      const report = await prisma.implementationReport.findFirst({ where: { automationJobId: jobId } });
      assert.ok(report, "ImplementationReport should exist");
      assert.equal(report?.summary, "All tests passed in sandbox");
      assert.equal(report?.testResult, "PASSED");
    });
  });
});
