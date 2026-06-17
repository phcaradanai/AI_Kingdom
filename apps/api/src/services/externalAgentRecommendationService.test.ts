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
