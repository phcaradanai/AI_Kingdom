import assert from "node:assert/strict";
import test from "node:test";
import { computeReport, type ReportInput, type UsageRow } from "./measure-intelligence.js";

function usage(partial: Partial<UsageRow>): UsageRow {
  return {
    councilSessionId: "s1",
    operation: "council_agent_response",
    provider: "openrouter",
    model: "free",
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    estimatedCostUSD: 0,
    costSource: "FREE",
    ...partial
  };
}

test("computeReport aggregates cost/tokens per decree and splits by operation", () => {
  const input: ReportInput = {
    usage: [
      usage({ councilSessionId: "s1", operation: "council_agent_response", totalTokens: 100, estimatedCostUSD: 0.01 }),
      usage({ councilSessionId: "s1", operation: "council_agent_response", totalTokens: 100, estimatedCostUSD: 0.01 }),
      usage({ councilSessionId: "s1", operation: "final_counsel", totalTokens: 200, estimatedCostUSD: 0.02 }),
      usage({ councilSessionId: "s2", operation: "council_agent_response", totalTokens: 100, estimatedCostUSD: 0.01 }),
      usage({ councilSessionId: "s2", operation: "final_counsel", totalTokens: 200, estimatedCostUSD: 0.05, costSource: "ESTIMATED" })
    ],
    sessionCount: 2,
    fallbackSessionCount: 1,
    candidatesByStatus: { PENDING: 9, APPROVED: 1 },
    approvedKnowledge: { count: 3, totalUseCount: 0, neverUsed: 3 },
    verdictCounts: { PASS: 2, NEEDS_FIX: 1 }
  };

  const r = computeReport(input);

  assert.equal(r.decrees, 2);
  assert.equal(r.totalCostUSD, 0.1); // 0.01*3 + 0.02 + 0.05
  assert.equal(r.avgCostPerDecreeUSD, 0.05);
  assert.equal(r.avgTokensPerDecree, 350); // 700 total / 2
  assert.equal(r.avgCallsPerDecree, 2.5); // 5 calls / 2
  assert.equal(r.fallbackRate, 0.5);

  // Operation split: final_counsel cost = 0.07, council = 0.03 → final_counsel ranks first.
  const topOp = r.byOperation[0];
  assert.ok(topOp, "byOperation should be non-empty");
  assert.equal(topOp.operation, "final_counsel");
  assert.equal(topOp.costUSD, 0.07);
  assert.equal(topOp.costShare, 0.7);
  const council = r.byOperation.find((o) => o.operation === "council_agent_response");
  assert.equal(council?.calls, 3);
  assert.equal(council?.totalTokens, 300);

  assert.deepEqual(r.byCostSource, { FREE: 4, ESTIMATED: 1 });
  const topProv = r.providers[0];
  assert.ok(topProv, "providers should be non-empty");
  assert.equal(topProv.key, "openrouter:free");
  assert.equal(topProv.calls, 5);

  // Learning-loop signals pass through unchanged for the renderer's flags.
  assert.deepEqual(r.candidatesByStatus, { PENDING: 9, APPROVED: 1 });
  assert.equal(r.approvedKnowledge.neverUsed, 3);
  assert.deepEqual(r.verdictCounts, { PASS: 2, NEEDS_FIX: 1 });
});

test("computeReport is safe on empty data (no division by zero)", () => {
  const r = computeReport({
    usage: [],
    sessionCount: 0,
    fallbackSessionCount: 0,
    candidatesByStatus: {},
    approvedKnowledge: { count: 0, totalUseCount: 0, neverUsed: 0 },
    verdictCounts: {}
  });
  assert.equal(r.decrees, 0);
  assert.equal(r.totalCostUSD, 0);
  assert.equal(r.avgCostPerDecreeUSD, 0);
  assert.equal(r.avgTokensPerDecree, 0);
  assert.equal(r.avgCallsPerDecree, 0);
  assert.equal(r.fallbackRate, 0);
  assert.deepEqual(r.byOperation, []);
});
