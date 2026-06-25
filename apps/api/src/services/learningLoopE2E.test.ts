import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { prisma } from "../db/prisma.js";
import { env } from "../config/env.js";
import { MockAIProvider } from "../ai/mockAIProvider.js";
import type { GenerateAgentResponseInput } from "../ai/aiProvider.js";
import { processTaskWithGrandVizier } from "./grandVizierOrchestrator.js";
import { createOrUpdateAgentReviewForJob } from "./runnerResultReviewService.js";

/**
 * End-to-end proof that the Kingdom's self-sustaining learning loop is actually wired, not just
 * green in isolation. Every lever is best-effort and gated, so a forgotten setting would not fail
 * the test — it would silently skip a feature and still pass. We therefore (1) force every gating
 * setting ON inside the test, and (2) assert on the real prompt string the provider receives — not
 * service return values — by recording every MockAIProvider call. That is the only thing that
 * proves the seeded lesson/knowledge text reached the model.
 *
 * Covered here (the decree → council path):
 *   - COUNCIL_CROSS_TASK_LEARNING: a relevant past failure becomes an "avoid" lesson in the prompt.
 *   - AGENT_KNOWLEDGE_IN_CONTEXT: APPROVED curated knowledge is injected into the prompt.
 *   - CAPTURE_LESSONS_FROM_REVIEWS: a new failed review proposes a PENDING knowledge candidate.
 * (The planner's own cross-task + knowledge consumption has dedicated unit tests.)
 */

// Distinctive markers. The shared keyword "telemetry" gives the past work order relevance to the
// decree; the detail/knowledge markers are what we assert reached the prompt verbatim.
const SHARED_KEYWORD = "telemetry";
const LESSON_DETAIL_MARKER = "flush deadlocks under concurrent writes";
const KNOWLEDGE_MARKER = "batch telemetry writes within a rolling window";

const SETTINGS_ON = ["COUNCIL_CROSS_TASK_LEARNING", "AGENT_KNOWLEDGE_IN_CONTEXT", "CAPTURE_LESSONS_FROM_REVIEWS"];
// Keep the run lean and side-effect free; these are read by the orchestrator.
const SETTINGS_OFF = ["AUTO_SAVE_MEMORY", "AUTO_GENERATE_REPORTS", "COUNCIL_PARALLEL_SPECIALISTS"];

const createdUserIds: string[] = [];
const createdProjectIds: string[] = [];
const createdTaskIds: string[] = [];
const createdAgentIds: string[] = [];
const createdWorkOrderIds: string[] = [];
const createdJobIds: string[] = [];

async function setSetting(key: string, value: string) {
  await prisma.setting.upsert({
    where: { key },
    update: { value },
    create: { key, value, category: "SYSTEM", description: "e2e test" }
  });
}

after(async () => {
  for (const key of SETTINGS_ON) await setSetting(key, "false").catch(() => undefined);
  // Restore the levers we toggled off to their default-on posture.
  for (const key of ["AUTO_SAVE_MEMORY", "AUTO_GENERATE_REPORTS"]) await setSetting(key, "true").catch(() => undefined);
  await prisma.agentKnowledgeCandidate.deleteMany({ where: { proposedByAgentId: { in: createdAgentIds } } }).catch(() => undefined);
  for (const taskId of createdTaskIds) {
    const traces = await prisma.aIUsageTrace.findMany({ where: { taskId }, select: { traceId: true } });
    if (traces.length) await prisma.aIUsageTraceStep.deleteMany({ where: { traceId: { in: traces.map((t) => t.traceId) } } }).catch(() => undefined);
    await prisma.agentActivity.deleteMany({ where: { taskId } }).catch(() => undefined);
    await prisma.usageRecord.deleteMany({ where: { taskId } }).catch(() => undefined);
    await prisma.aIUsageTrace.deleteMany({ where: { taskId } }).catch(() => undefined);
    await prisma.councilSession.deleteMany({ where: { taskId } }).catch(() => undefined);
    await prisma.task.deleteMany({ where: { id: taskId } }).catch(() => undefined);
  }
  await prisma.agentReviewSummary.deleteMany({ where: { automationJobId: { in: createdJobIds } } }).catch(() => undefined);
  await prisma.implementationReport.deleteMany({ where: { automationJobId: { in: createdJobIds } } }).catch(() => undefined);
  await prisma.automationJob.deleteMany({ where: { id: { in: createdJobIds } } }).catch(() => undefined);
  await prisma.agentKnowledgeMemory.deleteMany({ where: { projectId: { in: createdProjectIds } } }).catch(() => undefined);
  await prisma.workOrder.deleteMany({ where: { id: { in: createdWorkOrderIds } } }).catch(() => undefined);
  await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } }).catch(() => undefined);
  await prisma.agent.deleteMany({ where: { id: { in: createdAgentIds } } }).catch(() => undefined);
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } }).catch(() => undefined);
  await prisma.$disconnect();
});

test("a decree's council prompt carries past lessons + approved knowledge, and a failed review captures a new lesson", async () => {
  const suffix = randomUUID();
  for (const key of SETTINGS_ON) await setSetting(key, "true");
  for (const key of SETTINGS_OFF) await setSetting(key, "false");

  const king = await prisma.user.create({
    data: { email: `loop-king-${suffix}@aikingdom.local`, displayName: "Loop King", passwordHash: "test", role: "KING" }
  });
  createdUserIds.push(king.id);
  const project = await prisma.project.create({ data: { name: `Telemetry Platform ${Date.now()}` } });
  createdProjectIds.push(project.id);

  // ── Seed a PAST failed work order whose review becomes an "avoid" lesson for our decree. ──
  const pastWo = await prisma.workOrder.create({
    data: {
      title: `Add telemetry export endpoint ${Date.now()}`,
      objective: "Expose telemetry over an export endpoint",
      status: "NEEDS_REVIEW",
      projectId: project.id,
      isTestData: true
    }
  });
  createdWorkOrderIds.push(pastWo.id);
  const pastJob = await prisma.automationJob.create({
    data: { workOrderId: pastWo.id, projectId: project.id, status: "NEEDS_REVIEW", mode: "SANDBOX_PATCH" }
  });
  createdJobIds.push(pastJob.id);
  await prisma.agentReviewSummary.create({
    data: {
      automationJobId: pastJob.id,
      workOrderId: pastWo.id,
      projectId: project.id,
      verdict: "NEEDS_FIX",
      confidence: "MEDIUM",
      kingRecommendation: "RETRY",
      summary: "The telemetry export attempt failed under load.",
      whatFailed: [`the telemetry ${LESSON_DETAIL_MARKER}`]
    }
  });

  // ── Seed APPROVED curated knowledge (global to project, so every council agent sees it). ──
  // Direct create deliberately bypasses the propose-time value gate; we are seeding the
  // post-approval store the council reads from.
  await prisma.agentKnowledgeMemory.create({
    data: {
      agentId: null,
      projectId: project.id,
      title: "Telemetry write batching",
      content: `Always ${KNOWLEDGE_MARKER} to avoid lock contention.`,
      category: "ARCHITECTURE_DECISION",
      trustLevel: "APPROVED",
      approvedAt: new Date()
    }
  });

  // ── Run the decree through the council. ──
  const task = await prisma.task.create({
    data: {
      createdBy: king.id,
      projectId: project.id,
      title: "Improve telemetry export",
      command: "Improve the telemetry export pipeline so dashboards stay responsive.",
      mode: "PLAN",
      status: "PENDING"
    }
  });
  createdTaskIds.push(task.id);

  // Force the deterministic local sandbox provider so (a) the council runs offline/fast and
  // (b) MockAIProvider — the thing we spy on — is actually the provider invoked. Without this,
  // the test env's real OpenRouter key wins the route, succeeds, and the mock is never called
  // (captured stays empty). Each test file runs in its own process, so mutating the parsed env
  // snapshot here is isolated. hasCredentials for every non-sandbox provider derives from these
  // keys, so clearing them leaves the sandbox baseline as the only eligible route.
  const CRED_KEYS = ["OPENAI_API_KEY", "OPENAI_COMPATIBLE_API_KEY", "OPENROUTER_API_KEY", "DEEPSEEK_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY"] as const;
  const savedEnv: Record<string, string> = { AI_PROVIDER: env.AI_PROVIDER };
  for (const key of CRED_KEYS) savedEnv[key] = env[key];
  env.AI_PROVIDER = "local-sandbox-baseline";
  for (const key of CRED_KEYS) env[key] = "";

  // Record the actual input every provider call receives — the load-bearing assertion target.
  const captured: GenerateAgentResponseInput[] = [];
  const original = MockAIProvider.prototype.generateAgentResponse;
  MockAIProvider.prototype.generateAgentResponse = async function (input: GenerateAgentResponseInput) {
    captured.push(input);
    return original.call(this, input);
  };

  let session;
  try {
    session = await processTaskWithGrandVizier(task.id, king.id);
  } finally {
    MockAIProvider.prototype.generateAgentResponse = original;
    env.AI_PROVIDER = savedEnv.AI_PROVIDER;
    for (const key of CRED_KEYS) env[key] = savedEnv[key];
  }

  assert.equal(session.status, "COMPLETED");
  assert.ok(captured.length >= 5, `expected >=5 provider calls (4 specialists + synthesis), got ${captured.length}`);

  const carriesBoth = (input: GenerateAgentResponseInput) => {
    const ctx = input.kingdomMemoryContext ?? "";
    return ctx.includes(LESSON_DETAIL_MARKER) && ctx.includes(KNOWLEDGE_MARKER);
  };

  // The synthesis pass is identifiable by its system prompt; the rest are the specialists.
  const synthesis = captured.find((c) => c.systemPrompt.includes("Synthesize the council transcript"));
  const specialists = captured.filter((c) => !c.systemPrompt.includes("Synthesize the council transcript"));

  assert.ok(synthesis, "the Grand Vizier synthesis pass ran");
  assert.ok(
    specialists.some(carriesBoth),
    "at least one specialist's prompt carries BOTH the past lesson and the approved knowledge"
  );
  assert.ok(carriesBoth(synthesis), "the synthesis prompt carries BOTH the past lesson and the approved knowledge");

  // Sanity: the shared keyword that made the lesson relevant is present in the decree itself.
  assert.match(task.command, new RegExp(SHARED_KEYWORD));

  // ── Capture loop: a NEW diagnosed failed review proposes a PENDING knowledge candidate. ──
  const reviewer = await prisma.agent.create({
    data: { slug: `loop-reviewer-${suffix}`, name: `Loop Reviewer ${suffix}`, title: "Loop Reviewer", role: "MINISTER", specialty: "review", prompt: "review", isActive: true }
  });
  createdAgentIds.push(reviewer.id);
  const newWo = await prisma.workOrder.create({
    data: {
      title: `Add telemetry retention job ${Date.now()}`,
      objective: "Prune old telemetry rows",
      status: "NEEDS_REVIEW",
      projectId: project.id,
      assignedAgentId: reviewer.id,
      isTestData: true
    }
  });
  createdWorkOrderIds.push(newWo.id);
  const newJob = await prisma.automationJob.create({
    data: { workOrderId: newWo.id, projectId: project.id, status: "NEEDS_REVIEW", mode: "SANDBOX_PATCH" }
  });
  createdJobIds.push(newJob.id);
  await prisma.implementationReport.create({
    data: {
      workOrderId: newWo.id,
      automationJobId: newJob.id,
      summary: "Attempted retention job but tests fail.",
      filesChanged: ["src/retention.ts"],
      commandsRun: ["npm run test"],
      testsRun: ["npm run test"],
      testResult: "FAILED",
      errors: ["typecheck failed: missing import './prune'"],
      decisionsMade: [],
      remainingWork: ["fix the import"]
    }
  });

  const review = await createOrUpdateAgentReviewForJob(newJob.id, { useAi: false });
  assert.equal(review.verdict, "NEEDS_FIX");

  const candidate = await prisma.agentKnowledgeCandidate.findFirst({
    where: { proposedByAgentId: reviewer.id, sourceType: "AGENT_REVIEW" }
  });
  assert.ok(candidate, "the failed review proposed a knowledge candidate");
  assert.equal(candidate.status, "PENDING");
  assert.match(candidate.content, /missing import/);
});
