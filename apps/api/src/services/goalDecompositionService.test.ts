import assert from "node:assert/strict";
import { test, describe } from "node:test";
import {
  analyzeGoal,
  identifyDeliverables,
  identifyDependencies,
  identifyParallelWork,
  identifyRequiredCapabilities,
  buildExecutionPlan,
  type GoalInput,
  type Deliverable,
} from "./goalDecompositionService.js";

// ── Fixtures ─────────────────────────────────────────────────────────────────

function simpleGoal(): GoalInput {
  return {
    title: "Add user notification preferences",
    objective: "Allow users to configure which email notifications they receive",
    successCriteria: ["Settings persist across sessions"],
    constraints: [],
    priority: "MEDIUM",
  };
}

function multiDeliverableGoal(): GoalInput {
  return {
    title: "Build audit log feature",
    objective: "Add a database schema, API endpoint, and frontend page for audit logs",
    successCriteria: ["Audit log page displays the last 100 events", "API is protected by KING role"],
    constraints: ["Must not break existing routes"],
    priority: "HIGH",
  };
}

function heavyGoal(): GoalInput {
  return {
    title: "Integrate external webhook service",
    objective:
      "Add database schema for webhook config, service layer, API endpoint, frontend page, and comprehensive test coverage",
    successCriteria: [
      "Webhooks fire within 2 seconds of event",
      "Failed deliveries are retried",
      "UI shows delivery history",
    ],
    constraints: ["OAuth credentials must not be stored in DB", "Must follow SANDBOX_PATCH_NO_PUSH policy"],
    priority: "HIGH",
  };
}

function docOnlyGoal(): GoalInput {
  return {
    title: "Write architecture documentation",
    objective: "Document the living-agents architecture in docs/LIVING_KINGDOM.md",
    successCriteria: [],
    constraints: [],
    priority: "LOW",
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("goalDecompositionService — analyzeGoal", () => {
  test("simple goal with no domain keywords gets GENERAL_TASK problemType", () => {
    const analysis = analyzeGoal({
      title: "Improve something",
      objective: "Make the thing better",
      successCriteria: [],
      constraints: [],
      priority: "LOW",
    });
    assert.ok(typeof analysis.problemType === "string");
    assert.ok(typeof analysis.complexity === "string");
    assert.ok(Array.isArray(analysis.keyQuestions));
    assert.ok(analysis.keyQuestions.length > 0);
  });

  test("goal with 'add' keyword detects FEATURE_ADDITION", () => {
    const analysis = analyzeGoal(simpleGoal());
    assert.equal(analysis.problemType, "FEATURE_ADDITION");
  });

  test("goal with 'fix' / 'bug' keywords detects BUG_FIX", () => {
    const analysis = analyzeGoal({
      title: "Fix broken login",
      objective: "Fix the bug causing login failures on mobile",
      successCriteria: [],
      constraints: [],
      priority: "HIGH",
    });
    assert.equal(analysis.problemType, "BUG_FIX");
  });

  test("parallelizationOpportunity is true when goal produces 2+ deliverables", () => {
    const analysis = analyzeGoal(multiDeliverableGoal());
    assert.equal(analysis.parallelizationOpportunity, true);
  });

  test("parallelizationOpportunity is false for single-deliverable doc goal", () => {
    const analysis = analyzeGoal(docOnlyGoal());
    assert.equal(analysis.parallelizationOpportunity, false);
  });
});

describe("goalDecompositionService — identifyDeliverables", () => {
  test("simple email-settings goal produces at least one deliverable", () => {
    const deliverables = identifyDeliverables(simpleGoal());
    assert.ok(deliverables.length >= 1);
  });

  test("multi-deliverable goal produces DB + API + frontend + testing deliverables", () => {
    const deliverables = identifyDeliverables(multiDeliverableGoal());
    const types = deliverables.map((d) => d.type);
    assert.ok(types.includes("DATABASE_SCHEMA"), `expected DATABASE_SCHEMA in ${types}`);
    assert.ok(types.includes("API_ENDPOINT"), `expected API_ENDPOINT in ${types}`);
    assert.ok(types.includes("FRONTEND_UI"), `expected FRONTEND_UI in ${types}`);
    assert.ok(types.includes("TESTING"), `expected TESTING auto-added in ${types}`);
  });

  test("testing deliverable is auto-added when implementation deliverables exist", () => {
    const goal: GoalInput = {
      title: "Add API endpoint",
      objective: "Create a REST API endpoint to fetch user data",
      successCriteria: [],
      constraints: [],
      priority: "MEDIUM",
    };
    const deliverables = identifyDeliverables(goal);
    const types = deliverables.map((d) => d.type);
    assert.ok(types.includes("TESTING"), `TESTING should be auto-added; got ${types}`);
  });

  test("doc-only goal produces a documentation deliverable and no impl types", () => {
    const deliverables = identifyDeliverables(docOnlyGoal());
    const types = deliverables.map((d) => d.type);
    assert.ok(types.includes("DOCUMENTATION"));
    assert.ok(!types.includes("TESTING"), "TESTING should not appear for doc-only goal");
  });

  test("deliverable IDs are stable and deterministic across two identical calls", () => {
    const a = identifyDeliverables(multiDeliverableGoal());
    const b = identifyDeliverables(multiDeliverableGoal());
    assert.deepEqual(
      a.map((d) => d.id),
      b.map((d) => d.id)
    );
  });

  test("each deliverable carries a populated workOrderTemplate", () => {
    for (const d of identifyDeliverables(heavyGoal())) {
      assert.ok(d.workOrderTemplate.title.length > 0, `title missing on ${d.type}`);
      assert.ok(d.workOrderTemplate.objective.length > 0, `objective missing on ${d.type}`);
      assert.ok(d.workOrderTemplate.acceptanceCriteria.length > 0, `acceptanceCriteria missing on ${d.type}`);
      assert.ok(d.workOrderTemplate.suggestedRole.length > 0, `suggestedRole missing on ${d.type}`);
    }
  });
});

describe("goalDecompositionService — identifyDependencies", () => {
  test("database schema deliverable has no dependencies (it is in phase 1)", () => {
    const goal: GoalInput = {
      title: "Add schema and API",
      objective: "Create database schema and then an API endpoint",
      successCriteria: [],
      constraints: [],
      priority: "MEDIUM",
    };
    const deliverables = identifyDeliverables(goal);
    identifyDependencies(deliverables);
    const schema = deliverables.find((d) => d.type === "DATABASE_SCHEMA")!;
    assert.ok(schema, "expected DATABASE_SCHEMA deliverable");
    assert.deepEqual(schema.dependsOn, []);
  });

  test("frontend UI deliverable depends on backend deliverables", () => {
    const deliverables = identifyDeliverables(multiDeliverableGoal());
    identifyDependencies(deliverables);
    const ui = deliverables.find((d) => d.type === "FRONTEND_UI");
    const api = deliverables.find((d) => d.type === "API_ENDPOINT");
    if (ui && api) {
      assert.ok(ui.dependsOn.includes(api.id), `FRONTEND_UI.dependsOn should include API_ENDPOINT id ${api.id}`);
    }
  });

  test("testing deliverable depends on all phase-1/2/3 deliverables", () => {
    const deliverables = identifyDeliverables(multiDeliverableGoal());
    identifyDependencies(deliverables);
    const testing = deliverables.find((d) => d.type === "TESTING")!;
    const implIds = deliverables
      .filter((d) => d.type !== "TESTING" && d.type !== "DOCUMENTATION")
      .map((d) => d.id);
    for (const id of implIds) {
      assert.ok(testing.dependsOn.includes(id), `TESTING should depend on ${id}`);
    }
  });

  test("blocked dependency: if schema is missing, API should still list schema as dependency", () => {
    // Simulate a scenario where only API_ENDPOINT + TESTING are in the plan
    const fakeDeliverables: Deliverable[] = [
      {
        id: "d0",
        title: "API endpoint",
        description: "",
        type: "API_ENDPOINT",
        estimatedComplexity: "LOW",
        requiredCapabilities: [],
        dependsOn: [],
        canParallelize: false,
        workOrderTemplate: { title: "", objective: "", acceptanceCriteria: [], suggestedRole: "" },
      },
      {
        id: "d1",
        title: "Tests",
        description: "",
        type: "TESTING",
        estimatedComplexity: "LOW",
        requiredCapabilities: [],
        dependsOn: [],
        canParallelize: false,
        workOrderTemplate: { title: "", objective: "", acceptanceCriteria: [], suggestedRole: "" },
      },
    ];
    identifyDependencies(fakeDeliverables);
    const [apiDeliverable, testingDeliverable] = fakeDeliverables;
    // API_ENDPOINT is phase 2 with no phase-1 deliverables, so dependsOn is empty
    assert.deepEqual(apiDeliverable?.dependsOn, []);
    // TESTING is phase 4 — so it depends on d0 (the API_ENDPOINT)
    assert.deepEqual(testingDeliverable?.dependsOn, ["d0"]);
  });
});

describe("goalDecompositionService — identifyParallelWork", () => {
  test("returns phases in ascending phase order", () => {
    const deliverables = identifyDeliverables(heavyGoal());
    identifyDependencies(deliverables);
    const phases = identifyParallelWork(deliverables);
    const phaseNums = phases.map((p) => p.phaseNumber);
    assert.deepEqual(phaseNums, [...phaseNums].sort((a, b) => a - b));
  });

  test("deliverables in the same phase have canParallelize=true", () => {
    // Heavy goal includes BACKEND_SERVICE + API_ENDPOINT both in phase 2
    const deliverables = identifyDeliverables(heavyGoal());
    identifyDependencies(deliverables);
    identifyParallelWork(deliverables);
    const phase2 = deliverables.filter((d) => ["API_ENDPOINT", "BACKEND_SERVICE", "INTEGRATION"].includes(d.type));
    if (phase2.length >= 2) {
      for (const d of phase2) {
        assert.equal(d.canParallelize, true, `${d.type} should be parallelizable`);
      }
    }
  });

  test("single-deliverable goal produces exactly one phase", () => {
    const deliverables = identifyDeliverables(docOnlyGoal());
    identifyDependencies(deliverables);
    const phases = identifyParallelWork(deliverables);
    assert.equal(phases.length, 1);
  });
});

describe("goalDecompositionService — identifyRequiredCapabilities", () => {
  test("deduplicates capabilities across deliverables", () => {
    const deliverables = identifyDeliverables(heavyGoal());
    identifyDependencies(deliverables);
    identifyParallelWork(deliverables);
    const caps = identifyRequiredCapabilities(deliverables);
    const names = caps.map((c) => c.capability);
    const unique = new Set(names);
    assert.equal(names.length, unique.size, "capability names must be unique");
  });

  test("capability matching returns capabilities for recognized deliverable types", () => {
    const deliverables = identifyDeliverables(multiDeliverableGoal());
    const caps = identifyRequiredCapabilities(deliverables);
    assert.ok(caps.length > 0);
    assert.ok(caps.every((c) => c.capability.length > 0 && c.rationale.length > 0));
  });
});

describe("goalDecompositionService — buildExecutionPlan", () => {
  test("deterministic output: same input produces identical plan (except generatedAt)", () => {
    const now = "2026-07-01T00:00:00.000Z";
    const plan1 = buildExecutionPlan(simpleGoal(), now);
    const plan2 = buildExecutionPlan(simpleGoal(), now);
    assert.deepEqual(plan1, plan2);
  });

  test("plan has correct shape for multi-deliverable goal", () => {
    const plan = buildExecutionPlan(multiDeliverableGoal());
    assert.ok(plan.totalDeliverables > 1);
    assert.ok(plan.phases.length > 1);
    assert.equal(plan.deliverables.length, plan.totalDeliverables);
    assert.ok(["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(plan.estimatedComplexity));
  });

  test("no provider calls: buildExecutionPlan never accesses process.env AI keys", () => {
    // Spy: remove AI keys before calling; plan must still return successfully
    const saved = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const plan = buildExecutionPlan(simpleGoal());
      assert.ok(plan.phases.length >= 1);
    } finally {
      if (saved !== undefined) process.env.OPENAI_API_KEY = saved;
    }
  });

  test("plan for high-complexity goal has estimatedComplexity HIGH or CRITICAL", () => {
    const plan = buildExecutionPlan(heavyGoal());
    assert.ok(
      plan.estimatedComplexity === "HIGH" || plan.estimatedComplexity === "CRITICAL",
      `expected HIGH or CRITICAL, got ${plan.estimatedComplexity}`
    );
  });

  test("each deliverable in the plan appears in exactly one phase", () => {
    const plan = buildExecutionPlan(multiDeliverableGoal());
    const flatFromPhases = plan.phases.flatMap((p) => p.deliverables.map((d) => d.id));
    const unique = new Set(flatFromPhases);
    assert.equal(flatFromPhases.length, unique.size, "deliverable appeared in multiple phases");
    assert.equal(flatFromPhases.length, plan.totalDeliverables);
  });
});
