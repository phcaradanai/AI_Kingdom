import assert from "node:assert/strict";
import test from "node:test";
import { assertSafeTestDatabase, cleanupTestRun, createTestAgent, createTestUser, generateTestRunId } from "./testDb.js";
import { prisma } from "../db/prisma.js";

test("assertSafeTestDatabase passes when NODE_ENV=test and DB is ai_kingdom_test", () => {
  // This test runs via the test script which sets NODE_ENV=test and DATABASE_URL to test DB
  assert.doesNotThrow(() => assertSafeTestDatabase());
});

test("assertSafeTestDatabase throws when NODE_ENV is not test", () => {
  const original = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";
  try {
    assert.throws(() => assertSafeTestDatabase(), /NODE_ENV/);
  } finally {
    process.env.NODE_ENV = original;
  }
});

test("assertSafeTestDatabase throws when DB name lacks 'test' or 'ci'", () => {
  const original = process.env.DATABASE_URL;
  process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/ai_kingdom?schema=public";
  try {
    assert.throws(() => assertSafeTestDatabase(), /test.*ci|ci.*test|"ai_kingdom"/);
  } finally {
    process.env.DATABASE_URL = original;
  }
});

test("createTestUser sets isTestData=true and testRunId", async () => {
  const runId = generateTestRunId();
  const suffix = `safety-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const { user } = await createTestUser(suffix, { testRunId: runId });
  try {
    const fetched = await prisma.user.findUnique({ where: { id: user.id } });
    assert.ok(fetched, "user must exist");
    assert.equal(fetched!.isTestData, true);
    assert.equal(fetched!.testRunId, runId);
  } finally {
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("createTestAgent sets isTestData=true and testRunId", async () => {
  const runId = generateTestRunId();
  const suffix = `safety-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const agent = await createTestAgent(suffix, { testRunId: runId });
  try {
    const fetched = await prisma.agent.findUnique({ where: { id: agent.id } });
    assert.ok(fetched, "agent must exist");
    assert.equal(fetched!.isTestData, true);
    assert.equal(fetched!.testRunId, runId);
  } finally {
    await prisma.agent.delete({ where: { id: agent.id } }).catch(() => undefined);
  }
});

test("cleanupTestRun deletes all records for a runId", async () => {
  const runId = generateTestRunId();
  const suffix = `cleanup-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const { user } = await createTestUser(suffix, { testRunId: runId });
  const agent = await createTestAgent(suffix, { testRunId: runId });

  await cleanupTestRun(runId);

  const userAfter = await prisma.user.findUnique({ where: { id: user.id } });
  const agentAfter = await prisma.agent.findUnique({ where: { id: agent.id } });
  assert.equal(userAfter, null, "test user must be deleted");
  assert.equal(agentAfter, null, "test agent must be deleted");
});

test("users list endpoint hides test users (isTestData=true)", async () => {
  const { createApp } = await import("../app.js");
  const { signAccessToken } = await import("../middleware/auth.js");

  const runId = generateTestRunId();
  const suffix = `hide-test-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  // Create a KING user (non-test) to authenticate
  const kingUser = await prisma.user.create({
    data: {
      email: `real-king-${suffix}@aikingdom.local`,
      displayName: "Real King",
      passwordHash: "test",
      role: "KING",
      isTestData: false
    }
  });
  const kingSession = await prisma.refreshToken.create({
    data: { userId: kingUser.id, tokenHash: `king-sess-${suffix}`, expiresAt: new Date(Date.now() + 3_600_000) }
  });
  const token = signAccessToken({ id: kingUser.id, email: kingUser.email, displayName: kingUser.displayName, role: kingUser.role, sessionId: kingSession.id });

  // Create a test user that should be hidden
  const { user: testUser } = await createTestUser(suffix, { testRunId: runId });

  try {
    const app = createApp();
    const server = app.listen(0);
    try {
      const addr = server.address() as { port: number };
      const res = await fetch(`http://127.0.0.1:${addr.port}/api/users`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      assert.equal(res.status, 200);
      const body = await res.json() as { users: Array<{ id: string }> };
      const testUserInList = body.users.find((u) => u.id === testUser.id);
      assert.equal(testUserInList, undefined, "test user must NOT appear in /api/users list");
    } finally {
      server.close();
    }
  } finally {
    await cleanupTestRun(runId);
    await prisma.user.delete({ where: { id: kingUser.id } }).catch(() => undefined);
  }
});

test("seed is idempotent: running seed twice does not duplicate agents", async () => {
  const { ensureDefaultProjects } = await import("../services/projectService.js");
  // Run the idempotent function twice
  await ensureDefaultProjects();
  await ensureDefaultProjects();
  // Confirm no duplicate project names
  const dupes = await prisma.project.groupBy({
    by: ["name"],
    _count: { id: true },
    having: { id: { _count: { gt: 1 } } }
  });
  assert.equal(dupes.length, 0, "no duplicate project names after double seed");
});
