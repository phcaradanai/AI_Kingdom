import assert from "node:assert/strict";
import { test } from "node:test";
import { prisma } from "../db/prisma.js";
import { assertSafeTestDatabase } from "../test/testDb.js";
import { getWorkOrderRecommendations, scoreAgentsForWorkOrder } from "./externalAgentRecommendationService.js";
import type { ExternalAgent } from "@prisma/client";

const s = Date.now();
assertSafeTestDatabase();

// ──────────────────────────────────────────────
// Pure scoring tests (no DB)
// ──────────────────────────────────────────────

function makeAgent(id: string, type: string, name: string): Pick<ExternalAgent, "id" | "name" | "type" | "roleTitle" | "capabilities"> {
  return { id, name, type: type as ExternalAgent["type"], roleTitle: `${name} Role`, capabilities: [] };
}

const allTypeAgents = [
  makeAgent("a1", "CLAUDE_CODE", "Claude Code"),
  makeAgent("a2", "CODEX", "Codex"),
  makeAgent("a3", "CLINE", "Cline"),
  makeAgent("a4", "ANTIGRAVITY", "Antigravity"),
  makeAgent("a5", "HERMES", "Hermes"),
  makeAgent("a6", "KILO", "Kilo")
];

test("scoreAgentsForWorkOrder — architecture/refactor work recommends Claude Code at top", () => {
  const wo = {
    title: "Refactor the backend architecture for the codebase",
    objective: "Redesign the system design to improve service layer modularity",
    context: "",
    instructions: "",
    priority: "HIGH"
  };
  const results = scoreAgentsForWorkOrder(allTypeAgents, wo);
  assert.equal(results[0]!.type, "CLAUDE_CODE", `expected CLAUDE_CODE first, got ${results[0]!.type} (score=${results[0]!.score})`);
  assert.ok(results[0]!.score >= 65, `expected HIGH confidence score, got ${results[0]!.score}`);
  assert.equal(results[0]!.confidence, "HIGH");
  assert.ok(results[0]!.reasons.length > 0, "should have reasons");
});

test("scoreAgentsForWorkOrder — bugfix/unit test work recommends Codex at top", () => {
  const wo = {
    title: "Fix the bugfix in the authentication module",
    objective: "Unit test generation for regression fix in the login handler",
    context: "",
    instructions: "",
    priority: "MEDIUM"
  };
  const results = scoreAgentsForWorkOrder(allTypeAgents, wo);
  assert.equal(results[0]!.type, "CODEX", `expected CODEX first, got ${results[0]!.type} (score=${results[0]!.score})`);
  assert.ok(results[0]!.score >= 35, `expected at least MEDIUM confidence, got ${results[0]!.score}`);
});

test("scoreAgentsForWorkOrder — exploratory UI/browser prototype recommends Antigravity at top", () => {
  const wo = {
    title: "Exploratory browser prototype for the new visual dashboard",
    objective: "Build a rapid UI component prototype with screenshot review",
    context: "",
    instructions: "",
    priority: "MEDIUM"
  };
  const results = scoreAgentsForWorkOrder(allTypeAgents, wo);
  assert.equal(results[0]!.type, "ANTIGRAVITY", `expected ANTIGRAVITY first, got ${results[0]!.type} (score=${results[0]!.score})`);
  assert.ok(results[0]!.score >= 65, `expected HIGH confidence, got ${results[0]!.score}`);
});

test("scoreAgentsForWorkOrder — handoff/coordination work recommends Hermes at top", () => {
  const wo = {
    title: "Status report handoff coordination for the release",
    objective: "Relay the status report and delegate coordination tasks between teams",
    context: "",
    instructions: "",
    priority: "MEDIUM"
  };
  const results = scoreAgentsForWorkOrder(allTypeAgents, wo);
  assert.equal(results[0]!.type, "HERMES", `expected HERMES first, got ${results[0]!.type} (score=${results[0]!.score})`);
});

test("scoreAgentsForWorkOrder — multi-model work recommends Kilo (against subset)", () => {
  const agents = [makeAgent("a6", "KILO", "Kilo"), makeAgent("a5", "HERMES", "Hermes")];
  const wo = {
    title: "Multi-model engineering support workflow",
    objective: "Leverage multi-model IDE support and CLI support for the build",
    context: "",
    instructions: "",
    priority: "LOW"
  };
  const results = scoreAgentsForWorkOrder(agents, wo);
  assert.equal(results[0]!.type, "KILO", `expected KILO first, got ${results[0]!.type}`);
});

test("scoreAgentsForWorkOrder — empty agent list returns empty array", () => {
  const wo = { title: "Anything", objective: "Anything", context: "", instructions: "", priority: "MEDIUM" };
  const results = scoreAgentsForWorkOrder([], wo);
  assert.deepEqual(results, []);
});

test("scoreAgentsForWorkOrder — unmatched work order still returns results with reasons", () => {
  const wo = {
    title: "Miscellaneous work",
    objective: "General task with no strong signal keywords",
    context: "",
    instructions: "",
    priority: "LOW"
  };
  const results = scoreAgentsForWorkOrder(allTypeAgents, wo);
  assert.equal(results.length, allTypeAgents.length, "should return all agents");
  for (const r of results) {
    assert.ok(["HIGH", "MEDIUM", "LOW"].includes(r.confidence));
    assert.ok(r.reasons.length > 0, "each result should have at least one reason");
  }
});

test("scoreAgentsForWorkOrder — boilerplate context/instructions do not inflate CODEX above CLAUDE_CODE for architecture work", () => {
  const wo = {
    title: "Refactor the codebase architecture and system design",
    objective: "Redesign backend service layer with migration support",
    context: "Validation commands are run or clearly reported as not run.",
    instructions: "npm run typecheck\nnpm run test\nnpm run build",
    priority: "HIGH"
  };
  const results = scoreAgentsForWorkOrder(allTypeAgents, wo);
  const cc = results.find((r) => r.type === "CLAUDE_CODE")!;
  const codex = results.find((r) => r.type === "CODEX")!;
  assert.ok(cc.score > codex.score, `CLAUDE_CODE (${cc.score}) should beat CODEX (${codex.score}) for architecture work`);
});

test("scoreAgentsForWorkOrder — results sorted by score descending", () => {
  const wo = { title: "Refactor architecture", objective: "Redesign", context: "", instructions: "", priority: "MEDIUM" };
  const results = scoreAgentsForWorkOrder(allTypeAgents, wo);
  for (let i = 0; i < results.length - 1; i++) {
    assert.ok(results[i]!.score >= results[i + 1]!.score, `index ${i} score (${results[i]!.score}) < index ${i + 1} (${results[i + 1]!.score})`);
  }
});

test("scoreAgentsForWorkOrder — score is bounded 0-100", () => {
  const wo = {
    title: "architecture refactor system design codebase migration redesign complex backend complex frontend test fixing large context database schema service layer backend service",
    objective: "architecture refactor system design codebase migration redesign",
    context: "",
    instructions: "",
    priority: "HIGH"
  };
  const results = scoreAgentsForWorkOrder(allTypeAgents, wo);
  for (const r of results) {
    assert.ok(r.score >= 0 && r.score <= 100, `score ${r.score} out of range for ${r.name}`);
  }
});

// ──────────────────────────────────────────────
// Integration tests (DB)
// ──────────────────────────────────────────────

test("getWorkOrderRecommendations — excludes inactive agents", async () => {
  const active = await prisma.externalAgent.create({
    data: {
      name: `Active Agent M18A-${s}`,
      type: "CODEX",
      roleTitle: "Active Engineer",
      description: "",
      capabilities: [],
      executionMode: "MANUAL_COPY_PASTE",
      safetyLevel: "MEDIUM_RISK",
      isActive: true
    }
  });
  const inactive = await prisma.externalAgent.create({
    data: {
      name: `Inactive Agent M18A-${s}`,
      type: "HERMES",
      roleTitle: "Inactive Messenger",
      description: "",
      capabilities: [],
      executionMode: "MANUAL_COPY_PASTE",
      safetyLevel: "LOW_RISK",
      isActive: false
    }
  });
  const wo = await prisma.workOrder.create({
    data: {
      title: `M18A Inactive Exclusion Test ${s}`,
      objective: "Test that inactive agents are excluded from recommendations",
      isTestData: true
    }
  });

  try {
    const recs = await getWorkOrderRecommendations(wo.id);
    const ids = recs.map((r) => r.externalAgentId);
    assert.ok(ids.includes(active.id), "active agent should appear");
    assert.ok(!ids.includes(inactive.id), "inactive agent must not appear");
  } finally {
    await prisma.workOrder.delete({ where: { id: wo.id } }).catch(() => undefined);
    await prisma.externalAgent.delete({ where: { id: active.id } }).catch(() => undefined);
    await prisma.externalAgent.delete({ where: { id: inactive.id } }).catch(() => undefined);
  }
});

test("getWorkOrderRecommendations — throws NotFoundError for unknown work order", async () => {
  await assert.rejects(
    () => getWorkOrderRecommendations("nonexistent-id-m18a"),
    (err: Error) => {
      assert.equal(err.name, "NotFoundError");
      return true;
    }
  );
});

test("getWorkOrderRecommendations — recommendation has required shape", async () => {
  const wo = await prisma.workOrder.create({
    data: {
      title: `M18A Shape Test ${s}`,
      objective: "Verify recommendation shape has all required fields",
      isTestData: true
    }
  });

  try {
    const recs = await getWorkOrderRecommendations(wo.id);
    if (recs.length > 0) {
      const rec = recs[0]!;
      assert.ok(typeof rec.externalAgentId === "string");
      assert.ok(typeof rec.name === "string");
      assert.ok(typeof rec.type === "string");
      assert.ok(typeof rec.roleTitle === "string");
      assert.ok(typeof rec.score === "number");
      assert.ok(rec.score >= 0 && rec.score <= 100);
      assert.ok(["HIGH", "MEDIUM", "LOW"].includes(rec.confidence));
      assert.ok(Array.isArray(rec.reasons));
      assert.ok(Array.isArray(rec.risks));
    }
  } finally {
    await prisma.workOrder.delete({ where: { id: wo.id } }).catch(() => undefined);
  }
});

// ──────────────────────────────────────────────
// Outcome-based performance modifier (unit tests)
// ──────────────────────────────────────────────

test("scoreAgentsForWorkOrder — strong track record boosts score and adds reason", () => {
  const agents = [makeAgent("boost-a", "CODEX", "Codex"), makeAgent("boost-b", "CLAUDE_CODE", "Claude Code")];
  const wo = {
    title: "Fix the bugfix in auth",
    objective: "Unit test generation for regression fix",
    context: "",
    instructions: "",
    priority: "MEDIUM"
  };
  const baseResults = scoreAgentsForWorkOrder(agents, wo);
  const baseCodex = baseResults.find((r) => r.type === "CODEX")!;

  // 4/4 PASS → passRate = 1.0 → performanceMod = +10
  const statsWithTrackRecord = new Map([["boost-a", { passCount: 4, totalCount: 4 }]]);
  const boostedResults = scoreAgentsForWorkOrder(agents, wo, statsWithTrackRecord);
  const boostedCodex = boostedResults.find((r) => r.type === "CODEX")!;

  assert.ok(boostedCodex.score > baseCodex.score, `boosted score (${boostedCodex.score}) should exceed base (${baseCodex.score})`);
  assert.ok(boostedCodex.reasons.some((r) => r.includes("recent runs passed")), "should mention track record in reasons");
});

test("scoreAgentsForWorkOrder — poor track record penalises score and adds risk", () => {
  const agents = [makeAgent("pen-a", "CODEX", "Codex")];
  const wo = {
    title: "Fix the bugfix in auth",
    objective: "Unit test generation for regression fix",
    context: "",
    instructions: "",
    priority: "MEDIUM"
  };
  const baseResults = scoreAgentsForWorkOrder(agents, wo);
  const baseScore = baseResults[0]!.score;

  // 1/5 PASS → passRate = 0.2 → performanceMod = Math.round((0.2-0.5)*20) = -6
  const statsLow = new Map([["pen-a", { passCount: 1, totalCount: 5 }]]);
  const penalised = scoreAgentsForWorkOrder(agents, wo, statsLow);
  const penScore = penalised[0]!.score;

  assert.ok(penScore < baseScore, `penalised score (${penScore}) should be below base (${baseScore})`);
  assert.ok(penalised[0]!.risks.some((r) => r.includes("recent runs passed")), "should mention poor pass rate in risks");
});

test("scoreAgentsForWorkOrder — fewer than 3 reviewed runs applies no modifier", () => {
  const agents = [makeAgent("guard-a", "CODEX", "Codex")];
  const wo = { title: "Fix the bugfix", objective: "Unit test generation", context: "", instructions: "", priority: "MEDIUM" };
  const base = scoreAgentsForWorkOrder(agents, wo);

  // Only 2 samples — below the minimum guard
  const statsTiny = new Map([["guard-a", { passCount: 0, totalCount: 2 }]]);
  const withTiny = scoreAgentsForWorkOrder(agents, wo, statsTiny);

  assert.equal(withTiny[0]!.score, base[0]!.score, "score must not change with <3 samples");
  assert.ok(!withTiny[0]!.risks.some((r) => r.includes("recent runs passed")), "no pass-rate risk label for small sample");
});

// ──────────────────────────────────────────────
// Integration test: outcome stats shift recommendation order
// ──────────────────────────────────────────────

test("getWorkOrderRecommendations — outcome history shifts ordering when one agent has poor track record", async () => {
  const ts = Date.now();
  // Create two CODEX-type agents with identical keyword profile; only track record differs.
  const goodAgent = await prisma.externalAgent.create({
    data: {
      name: `Good Codex ${ts}`,
      type: "CODEX",
      roleTitle: "Good Codex Role",
      description: "",
      capabilities: [],
      executionMode: "MANUAL_COPY_PASTE",
      safetyLevel: "MEDIUM_RISK",
      isActive: true
    }
  });
  const badAgent = await prisma.externalAgent.create({
    data: {
      name: `Bad Codex ${ts}`,
      type: "CODEX",
      roleTitle: "Bad Codex Role",
      description: "",
      capabilities: [],
      executionMode: "MANUAL_COPY_PASTE",
      safetyLevel: "MEDIUM_RISK",
      isActive: true
    }
  });
  const wo = await prisma.workOrder.create({
    data: { title: `Outcome Order Test ${ts}`, objective: "bugfix unit test", isTestData: true }
  });

  // Seed fake automation jobs + ExternalAgentRun + AgentReviewSummary for the bad agent (all NEEDS_FIX).
  async function seedRun(agentId: string, verdict: string, i: number) {
    const job = await prisma.automationJob.create({
      data: {
        workOrderId: wo.id,
        mode: "EXTERNAL_AGENT",
        status: "COMPLETED",
        commandPolicy: "EXTERNAL_AGENT_NO_PUSH",
        allowedCommands: []
      }
    });
    await prisma.externalAgentRun.create({
      data: {
        externalAgentId: agentId,
        workOrderId: wo.id,
        automationJobId: job.id,
        status: "NEEDS_REVIEW",
        inputPrompt: `Prompt ${i}`,
        attemptNumber: i
      }
    });
    await prisma.agentReviewSummary.create({
      data: {
        automationJobId: job.id,
        workOrderId: wo.id,
        verdict,
        confidence: "HIGH",
        kingRecommendation: verdict === "PASS" ? "APPROVE" : "REQUEST_REVISION",
        summary: `Review ${i}`
      }
    });
    return job;
  }

  const jobs: { id: string }[] = [];
  try {
    // goodAgent: 3 PASSes
    for (let i = 0; i < 3; i++) jobs.push(await seedRun(goodAgent.id, "PASS", i + 1));
    // badAgent: 3 NEEDS_FIX
    for (let i = 0; i < 3; i++) jobs.push(await seedRun(badAgent.id, "NEEDS_FIX", i + 1));

    const recs = await getWorkOrderRecommendations(wo.id);
    const goodRec = recs.find((r) => r.externalAgentId === goodAgent.id);
    const badRec = recs.find((r) => r.externalAgentId === badAgent.id);

    assert.ok(goodRec && badRec, "both agents should appear in recommendations");
    assert.ok(
      goodRec!.score > badRec!.score,
      `good agent (${goodRec!.score}) should score higher than bad agent (${badRec!.score}) after outcome blending`
    );
    assert.ok(goodRec!.reasons.some((r) => r.includes("recent runs passed")), "good agent reason should mention track record");
    assert.ok(badRec!.risks.some((r) => r.includes("recent runs passed")), "bad agent risk should mention poor pass rate");
  } finally {
    for (const j of jobs) {
      await prisma.agentReviewSummary.deleteMany({ where: { automationJobId: j.id } }).catch(() => undefined);
      await prisma.externalAgentRun.deleteMany({ where: { automationJobId: j.id } }).catch(() => undefined);
      await prisma.automationJob.delete({ where: { id: j.id } }).catch(() => undefined);
    }
    await prisma.workOrder.delete({ where: { id: wo.id } }).catch(() => undefined);
    await prisma.externalAgent.delete({ where: { id: goodAgent.id } }).catch(() => undefined);
    await prisma.externalAgent.delete({ where: { id: badAgent.id } }).catch(() => undefined);
  }
});
