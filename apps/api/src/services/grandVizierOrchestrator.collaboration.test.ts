import assert from "node:assert/strict";
import { after, test } from "node:test";
import { prisma } from "../db/prisma.js";
import { env } from "../config/env.js";
import { MockAIProvider } from "../ai/mockAIProvider.js";
import type { GenerateAgentResponseInput, AgentResponseResult } from "../ai/aiProvider.js";
import { processTaskWithGrandVizier } from "./grandVizierOrchestrator.js";

/**
 * E2E wiring proof for M25-C Agent Collaboration Protocol.
 *
 * Proves that when:
 *   - COUNCIL_PARALLEL_SPECIALISTS = true
 *   - COUNCIL_COLLABORATION_ENABLED = true
 *   - Royal Researcher emits an uncertainty-carrying response
 *
 * ...the orchestrator fires a targeted Archivist sub-query and writes
 * collaborationNotes to the CouncilSession record.
 *
 * Uses the same sandbox-provider + MockAIProvider spy pattern as learningLoopE2E.test.ts.
 * The Researcher response is injected by intercepting MockAIProvider before the run.
 */

// Injected into the Royal Researcher's response — matches both "ambiguous" and "difficult to determine"
const RESEARCHER_UNCERTAINTY_SNIPPET =
  "Researcher Hypotheses\n\nPrimary hypothesis: auth timing issue.\n" +
  "However, it is difficult to determine the exact failure path without access to production logs. " +
  "The evidence is ambiguous — the stack traces do not pinpoint the specific call site.";

const CRED_KEYS = [
  "OPENAI_API_KEY",
  "OPENAI_COMPATIBLE_API_KEY",
  "OPENROUTER_API_KEY",
  "DEEPSEEK_API_KEY",
  "ANTHROPIC_API_KEY",
  "GEMINI_API_KEY",
] as const;

const createdUserIds: string[] = [];
const createdTaskIds: string[] = [];

async function setSetting(key: string, value: string) {
  await prisma.setting.upsert({
    where: { key },
    update: { value },
    create: { key, value, category: "SYSTEM", description: "collab e2e test" },
  });
}

async function cleanup() {
  for (const taskId of createdTaskIds) {
    const traces = await prisma.aIUsageTrace.findMany({ where: { taskId }, select: { traceId: true } });
    if (traces.length) {
      await prisma.aIUsageTraceStep.deleteMany({ where: { traceId: { in: traces.map((t) => t.traceId) } } }).catch(() => undefined);
    }
    const sessions = await prisma.councilSession.findMany({ where: { taskId }, select: { id: true } });
    if (sessions.length) {
      await prisma.treasuryLedger.deleteMany({ where: { source: { in: sessions.map((s) => `council:${s.id}`) } } }).catch(() => undefined);
    }
    await prisma.agentKnowledgeCandidate.deleteMany({ where: { taskId } }).catch(() => undefined);
    await prisma.agentActivity.deleteMany({ where: { taskId } }).catch(() => undefined);
    await prisma.usageRecord.deleteMany({ where: { taskId } }).catch(() => undefined);
    await prisma.aIUsageTrace.deleteMany({ where: { taskId } }).catch(() => undefined);
    await prisma.memory.deleteMany({ where: { sourceTaskId: taskId } }).catch(() => undefined);
    await prisma.report.deleteMany({ where: { sourceTaskId: taskId } }).catch(() => undefined);
    await prisma.councilSession.deleteMany({ where: { taskId } }).catch(() => undefined);
    await prisma.task.deleteMany({ where: { id: taskId } }).catch(() => undefined);
  }
  for (const userId of createdUserIds) {
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
  }
  await prisma.$disconnect();
}

after(cleanup);

test("collaboration protocol: Researcher uncertainty fires Archivist sub-query and writes collaborationNotes", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

  const user = await prisma.user.create({
    data: {
      email: `collab-king-${suffix}@aikingdom.local`,
      displayName: "Collab King",
      passwordHash: "test",
      role: "KING",
    },
  });
  createdUserIds.push(user.id);

  const task = await prisma.task.create({
    data: {
      createdBy: user.id,
      title: "Investigate auth failures",
      command: "Why is the auth module failing intermittently in production? Investigate and propose a fix.",
      mode: "RESEARCH",
      status: "PENDING",
    },
  });
  createdTaskIds.push(task.id);

  // Enable collaboration + parallel mode; disable noisy side-effects
  await setSetting("COUNCIL_PARALLEL_SPECIALISTS", "true");
  await setSetting("COUNCIL_COLLABORATION_ENABLED", "true");
  await setSetting("AUTO_SAVE_MEMORY", "false");
  await setSetting("AUTO_GENERATE_REPORTS", "false");

  // Force sandbox provider so MockAIProvider is always invoked (same pattern as learningLoopE2E)
  const savedEnv: Record<string, string> = { AI_PROVIDER: env.AI_PROVIDER };
  for (const key of CRED_KEYS) savedEnv[key] = env[key];
  env.AI_PROVIDER = "local-sandbox-baseline";
  for (const key of CRED_KEYS) env[key] = "";

  // Intercept MockAIProvider:
  //   - Researcher gets the uncertainty-carrying response
  //   - Track how many times the collaboration pass fires (previousCouncilContext starts with "COLLABORATION REQUEST")
  const captured: GenerateAgentResponseInput[] = [];
  let collaborationPassCount = 0;
  const original = MockAIProvider.prototype.generateAgentResponse;

  MockAIProvider.prototype.generateAgentResponse = async function (
    input: GenerateAgentResponseInput
  ): Promise<AgentResponseResult> {
    captured.push(input);
    if (input.previousCouncilContext?.startsWith("COLLABORATION REQUEST")) {
      collaborationPassCount++;
    }
    // Inject uncertainty into the Researcher's response (agentRole = agent.title = "Royal Researcher")
    if (input.agentRole?.includes("Researcher")) {
      return {
        response: RESEARCHER_UNCERTAINTY_SNIPPET,
        usage: { promptTokens: 80, completionTokens: 40, totalTokens: 120 },
      };
    }
    return original.call(this, input);
  };

  let session: Awaited<ReturnType<typeof processTaskWithGrandVizier>>;
  try {
    session = await processTaskWithGrandVizier(task.id, user.id);
  } finally {
    MockAIProvider.prototype.generateAgentResponse = original;
    env.AI_PROVIDER = savedEnv["AI_PROVIDER"] ?? env.AI_PROVIDER;
    for (const key of CRED_KEYS) env[key] = savedEnv[key] ?? "";
    await setSetting("COUNCIL_PARALLEL_SPECIALISTS", "true");
    await setSetting("COUNCIL_COLLABORATION_ENABLED", "true");
    await setSetting("AUTO_SAVE_MEMORY", "true");
    await setSetting("AUTO_GENERATE_REPORTS", "true");
  }

  assert.equal(session.status, "COMPLETED", "session must complete");

  // Collaboration sub-query must have fired exactly once
  assert.equal(
    collaborationPassCount,
    1,
    `expected exactly 1 collaboration pass (Archivist sub-query), got ${collaborationPassCount}`
  );

  // Grand Vizier synthesis + 4 specialists + 1 collaboration = at least 6 provider calls
  assert.ok(
    captured.length >= 6,
    `expected >=6 provider calls (4 specialists + synthesis + 1 collab), got ${captured.length}`
  );

  // collaborationNotes must be persisted to the DB
  const dbSession = await prisma.councilSession.findUniqueOrThrow({
    where: { id: session.id },
    select: { collaborationNotes: true },
  });
  const notes = dbSession.collaborationNotes as Array<{ researcherSnippet: string; question: string; answer: string }> | null;
  assert.ok(Array.isArray(notes) && notes.length > 0, "collaborationNotes must be a non-empty array");
  const note = notes![0]!;
  assert.ok(note.researcherSnippet.length > 0, "researcherSnippet must be non-empty");
  assert.ok(note.question.startsWith("COLLABORATION REQUEST"), "question must start with COLLABORATION REQUEST header");
  assert.ok(note.answer.length > 0, "answer (Archivist sub-query response) must be non-empty");
});
