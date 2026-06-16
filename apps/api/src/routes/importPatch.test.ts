import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createHash, randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import bcrypt from "bcryptjs";
import type { User, WorkOrder } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { createApp } from "../app.js";

let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
let baseUrl: string;
let king: User;
let kingToken: string;
let workOrder: WorkOrder;
// Use an isolated token — never fall back to RUNNER_TOKEN to avoid clobbering the dev Local Runner row
const TEST_RUNNER_TOKEN = `import-patch-test-runner-${randomUUID()}`;

const VALID_PATCH = `diff --git a/src/hello.ts b/src/hello.ts
--- a/src/hello.ts
+++ b/src/hello.ts
@@ -1,2 +1,3 @@
 const x = 1;
+const y = 2;
`;

async function createUser(role: "KING" | "MINISTER") {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return prisma.user.create({
    data: {
      email: `import-patch-test-${role.toLowerCase()}-${suffix}@aikingdom.local`,
      displayName: `${role} Tester`,
      passwordHash: await bcrypt.hash("StrongPass123", 12),
      role,
      isActive: true
    }
  });
}

async function login(email: string) {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "StrongPass123" })
  });
  const body = (await res.json().catch(() => null)) as { token?: string };
  if (!body?.token) throw new Error(`login failed for ${email}: ${res.status}`);
  return body.token;
}

function authed(token: string, body?: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: body !== undefined ? JSON.stringify(body) : undefined
  };
}

before(async () => {
  const app = createApp();
  server = app.listen(0);
  const address = server.address();
  assert.equal(typeof address, "object");
  baseUrl = `http://127.0.0.1:${(address as AddressInfo).port}`;
  king = await createUser("KING");
  kingToken = await login(king.email);
  workOrder = await prisma.workOrder.create({
    data: { title: `Import Patch Route Test ${randomUUID()}`, objective: "Test", status: "READY" }
  });
});

after(async () => {
  server.close();
  await prisma.automationJob.deleteMany({ where: { workOrderId: workOrder.id } }).catch(() => undefined);
  await prisma.workOrder.delete({ where: { id: workOrder.id } }).catch(() => undefined);
  await prisma.auditLog.deleteMany({ where: { userId: king.id } }).catch(() => undefined);
  await prisma.user.delete({ where: { id: king.id } }).catch(() => undefined);
  await prisma.$disconnect();
});

test("POST /api/automation-jobs/:id/import-patch returns 404 for missing job", async () => {
  const res = await fetch(`${baseUrl}/api/automation-jobs/${randomUUID()}/import-patch`, authed(kingToken, { patchText: VALID_PATCH }));
  assert.equal(res.status, 404);
  const body = (await res.json()) as { error: string };
  assert.ok(body.error?.toLowerCase().includes("not found"));
});

test("POST /api/automation-jobs/:id/import-patch returns 400 for empty patch text", async () => {
  const job = await prisma.automationJob.create({
    data: { workOrderId: workOrder.id, mode: "SANDBOX_PATCH", status: "QUEUED", createdByUserId: king.id }
  });
  try {
    const res = await fetch(`${baseUrl}/api/automation-jobs/${job.id}/import-patch`, authed(kingToken, { patchText: "   " }));
    assert.equal(res.status, 400);
  } finally {
    await prisma.automationJob.delete({ where: { id: job.id } }).catch(() => undefined);
  }
});

test("POST /api/automation-jobs/:id/import-patch returns 409 for APPROVED job", async () => {
  const job = await prisma.automationJob.create({
    data: { workOrderId: workOrder.id, mode: "SANDBOX_PATCH", status: "APPROVED", createdByUserId: king.id, approvedByUserId: king.id }
  });
  try {
    const res = await fetch(`${baseUrl}/api/automation-jobs/${job.id}/import-patch`, authed(kingToken, { patchText: VALID_PATCH }));
    assert.equal(res.status, 409);
    const body = (await res.json()) as { error: string };
    assert.ok(body.error?.toLowerCase().includes("before approval"));
  } finally {
    await prisma.automationJob.delete({ where: { id: job.id } }).catch(() => undefined);
  }
});

test("POST /api/automation-jobs/:id/import-patch returns 422 for patch touching blocked path", async () => {
  const job = await prisma.automationJob.create({
    data: { workOrderId: workOrder.id, mode: "SANDBOX_PATCH", status: "QUEUED", createdByUserId: king.id }
  });
  try {
    const blockedPatch = `diff --git a/.env b/.env\n--- a/.env\n+++ b/.env\n@@ -1 +1,2 @@\n DB=x\n+EVIL=1\n`;
    const res = await fetch(`${baseUrl}/api/automation-jobs/${job.id}/import-patch`, authed(kingToken, { patchText: blockedPatch }));
    assert.equal(res.status, 422);
    const body = (await res.json()) as { error: string };
    assert.ok(body.error?.toLowerCase().includes("blocked"));
  } finally {
    await prisma.automationJob.delete({ where: { id: job.id } }).catch(() => undefined);
  }
});

test("POST /api/automation-jobs/:id/import-patch returns 422 for patch with path traversal", async () => {
  const job = await prisma.automationJob.create({
    data: { workOrderId: workOrder.id, mode: "SANDBOX_PATCH", status: "QUEUED", createdByUserId: king.id }
  });
  try {
    const traversalPatch = `diff --git a/../etc/passwd b/../etc/passwd\n--- a/../etc/passwd\n+++ b/../etc/passwd\n@@ -1 +1 @@\n-x\n+y`;
    const res = await fetch(`${baseUrl}/api/automation-jobs/${job.id}/import-patch`, authed(kingToken, { patchText: traversalPatch }));
    assert.equal(res.status, 422);
    const body = (await res.json()) as { error: string };
    assert.ok(body.error?.toLowerCase().includes("unsafe path"));
  } finally {
    await prisma.automationJob.delete({ where: { id: job.id } }).catch(() => undefined);
  }
});

test("POST /api/automation-jobs/:id/import-patch returns 422 for patch with secrets", async () => {
  const job = await prisma.automationJob.create({
    data: { workOrderId: workOrder.id, mode: "SANDBOX_PATCH", status: "QUEUED", createdByUserId: king.id }
  });
  try {
    const secretPatch = `diff --git a/c.ts b/c.ts\n--- a/c.ts\n+++ b/c.ts\n@@ -1 +1,2 @@\n x\n+const k = "sk-proj-abc1234567890ABCDEF";\n`;
    const res = await fetch(`${baseUrl}/api/automation-jobs/${job.id}/import-patch`, authed(kingToken, { patchText: secretPatch }));
    assert.equal(res.status, 422);
    const body = (await res.json()) as { error: string };
    assert.ok(body.error?.toLowerCase().includes("secret"));
  } finally {
    await prisma.automationJob.delete({ where: { id: job.id } }).catch(() => undefined);
  }
});

test("POST /api/automation-jobs/:id/import-patch succeeds for QUEUED job with valid patch", async () => {
  const job = await prisma.automationJob.create({
    data: { workOrderId: workOrder.id, mode: "SANDBOX_PATCH", status: "QUEUED", createdByUserId: king.id }
  });
  try {
    const res = await fetch(`${baseUrl}/api/automation-jobs/${job.id}/import-patch`, authed(kingToken, { patchText: VALID_PATCH }));
    assert.equal(res.status, 200);
    const body = (await res.json()) as { importedPatchStatus?: string };
    assert.equal(body.importedPatchStatus, "PENDING");
  } finally {
    await prisma.automationJob.delete({ where: { id: job.id } }).catch(() => undefined);
  }
});

test("PATCH /api/runner/jobs/:id/status rejects invalid importedPatchStatus", async () => {
  const tokenHash = createHash("sha256").update(TEST_RUNNER_TOKEN).digest("hex");
  const runner = await prisma.agentRunner.create({
    data: { name: `Test Runner Import Patch ${randomUUID()}`, tokenHash, status: "ONLINE" }
  });

  const job = await prisma.automationJob.create({
    data: { workOrderId: workOrder.id, mode: "SANDBOX_PATCH", status: "RUNNING", runnerId: runner.id, createdByUserId: king.id }
  });
  try {
    const res = await fetch(`${baseUrl}/api/runner/jobs/${job.id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${TEST_RUNNER_TOKEN}` },
      body: JSON.stringify({ status: "RUNNING", importedPatchStatus: "INVALID_VALUE" })
    });
    assert.equal(res.status, 400);
  } finally {
    await prisma.automationJob.delete({ where: { id: job.id } }).catch(() => undefined);
    await prisma.agentRunner.delete({ where: { id: runner.id } }).catch(() => undefined);
  }
});
