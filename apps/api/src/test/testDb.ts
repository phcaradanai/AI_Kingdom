import crypto from "node:crypto";
import { prisma } from "../db/prisma.js";
import { signAccessToken, type AuthUser } from "../middleware/auth.js";

/**
 * Verifies that the current DATABASE_URL points to a test database.
 * Throws if NODE_ENV !== "test" or the DB name doesn't include "test"/"ci".
 * Call this at the top of test setup to prevent accidental dev-DB writes.
 */
export function assertSafeTestDatabase(): void {
  const url = process.env.DATABASE_URL ?? "";
  const withoutQuery = url.split("?")[0] ?? "";
  const dbName = withoutQuery.split("/").pop() ?? "";

  if (process.env.NODE_ENV !== "test") {
    throw new Error(
      `assertSafeTestDatabase: NODE_ENV is "${process.env.NODE_ENV}", expected "test". ` +
      `Use "npm run test:api" to run tests safely.`
    );
  }
  if (!dbName.includes("test") && !dbName.includes("ci")) {
    throw new Error(
      `assertSafeTestDatabase: DATABASE_URL points to "${dbName}" — ` +
      `database name must contain "test" or "ci". ` +
      `Run "npm run test:db:prepare && npm run test:db:migrate" to set up the test database.`
    );
  }
}

export function generateTestRunId(): string {
  return crypto.randomUUID();
}

export async function createTestUser(
  suffix: string,
  opts: { role?: "KING" | "CROWN_PRINCE" | "MINISTER" | "SCRIBE"; testRunId?: string } = {}
) {
  const { role = "KING", testRunId } = opts;
  const user = await prisma.user.create({
    data: {
      email: `test-${suffix}@aikingdom.local`,
      displayName: `Test User ${suffix}`,
      passwordHash: "test",
      role,
      isTestData: true,
      testRunId: testRunId ?? null
    }
  });
  const session = await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: `test-session-${suffix}`,
      expiresAt: new Date(Date.now() + 3_600_000)
    }
  });
  const authUser: AuthUser = {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    sessionId: session.id
  };
  return { user, session, token: signAccessToken(authUser) };
}

export async function createTestAgent(
  suffix: string,
  opts: { testRunId?: string; title?: string; role?: string } = {}
) {
  const { testRunId, title = "Test Agent", role = "Tester" } = opts;
  return prisma.agent.create({
    data: {
      slug: `test-agent-${suffix}`,
      name: `Test Agent ${suffix}`,
      title,
      role,
      specialty: "testing",
      prompt: "test",
      systemPrompt: "test",
      skills: [],
      responseStyle: "concise",
      priority: 999,
      isTestData: true,
      testRunId: testRunId ?? null
    }
  });
}

export async function createTestMatter(
  suffix: string,
  opts: { testRunId?: string; projectId?: string } = {}
) {
  const { testRunId, projectId } = opts;
  return prisma.matter.create({
    data: {
      title: `Test Matter ${suffix}`,
      description: `Test matter created for run ${suffix}`,
      projectId: projectId ?? null,
      isTestData: true,
      testRunId: testRunId ?? null
    }
  });
}

export async function createTestNotice(
  suffix: string,
  opts: { testRunId?: string; projectId?: string } = {}
) {
  const { testRunId, projectId } = opts;
  return prisma.notice.create({
    data: {
      title: `Test Notice ${suffix}`,
      content: `Test notice content for run ${suffix}`,
      projectId: projectId ?? null,
      isTestData: true,
      testRunId: testRunId ?? null
    }
  });
}

export async function createTestProject(
  suffix: string,
  opts: { testRunId?: string } = {}
) {
  const { testRunId } = opts;
  return prisma.project.create({
    data: {
      name: `Test Project ${suffix}`,
      description: `Test project for run ${suffix}`,
      keywords: ["test"],
      aliases: [],
      goals: []
    }
  });
}

/**
 * Deletes all records marked isTestData=true for the given testRunId.
 * Safe — only deletes records explicitly tagged for this run.
 */
export async function cleanupTestRun(testRunId: string): Promise<void> {
  await Promise.all([
    prisma.notice.deleteMany({ where: { testRunId } }),
    prisma.matter.deleteMany({ where: { testRunId } }),
    prisma.projectInboxItem.deleteMany({ where: { testRunId } }),
    prisma.artifact.deleteMany({ where: { testRunId } })
  ]);
  // Agents and users last (cascade deletes linked records)
  await prisma.agent.deleteMany({ where: { testRunId } });
  await prisma.user.deleteMany({ where: { testRunId } });
}
