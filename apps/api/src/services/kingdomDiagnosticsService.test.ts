import assert from "node:assert/strict";
import test from "node:test";
import { computeReport, type ReportInput } from "../scripts/measure-intelligence.js";

// Verify the pure computeReport function (already used by the diagnostics service)
// with edge-case inputs — no DB required.

const EMPTY_INPUT: ReportInput = {
  usage: [],
  sessionCount: 0,
  fallbackSessionCount: 0,
  candidatesByStatus: {},
  approvedKnowledge: { count: 0, totalUseCount: 0, neverUsed: 0 },
  verdictCounts: {},
  qualityStats: { scored: 0, avgScore: 0, highQuality: 0, lowQuality: 0 }
};

const SAMPLE_INPUT: ReportInput = {
  usage: [
    { councilSessionId: "s1", operation: "council", provider: "openrouter", model: "deepseek", promptTokens: 1000, completionTokens: 200, totalTokens: 1200, estimatedCostUSD: 0.0012, costSource: "LIVE" },
    { councilSessionId: "s1", operation: "synthesis", provider: "openrouter", model: "deepseek", promptTokens: 500, completionTokens: 100, totalTokens: 600, estimatedCostUSD: 0.0006, costSource: "LIVE" },
    { councilSessionId: "s2", operation: "council", provider: "mock", model: "mock", promptTokens: 500, completionTokens: 50, totalTokens: 550, estimatedCostUSD: 0, costSource: "MOCK" },
  ],
  sessionCount: 2,
  fallbackSessionCount: 1,
  candidatesByStatus: { PENDING: 3, APPROVED: 1 },
  approvedKnowledge: { count: 2, totalUseCount: 5, neverUsed: 1 },
  verdictCounts: { PASS: 2, NEEDS_FIX: 1 },
  qualityStats: { scored: 2, avgScore: 0.72, highQuality: 1, lowQuality: 0 }
};

test("computeReport: empty input produces zero-value report", () => {
  const r = computeReport(EMPTY_INPUT);
  assert.equal(r.decrees, 0);
  assert.equal(r.totalCostUSD, 0);
  assert.equal(r.avgCostPerDecreeUSD, 0);
  assert.equal(r.avgTokensPerDecree, 0);
  assert.equal(r.fallbackRate, 0);
  assert.deepEqual(r.byOperation, []);
  assert.deepEqual(r.providers, []);
});

test("computeReport: totals and rates are correct for sample input", () => {
  const r = computeReport(SAMPLE_INPUT);
  assert.equal(r.decrees, 2);
  assert.ok(Math.abs(r.totalCostUSD - 0.0018) < 0.0001, `totalCostUSD expected ~0.0018 got ${r.totalCostUSD}`);
  assert.equal(r.fallbackRate, 0.5, "1 fallback out of 2 sessions = 0.5");
  assert.equal(r.avgCallsPerDecree, 1.5, "3 calls / 2 sessions");
});

test("computeReport: byOperation sorted by cost descending", () => {
  const r = computeReport(SAMPLE_INPUT);
  assert.ok(r.byOperation.length >= 2);
  assert.equal(r.byOperation[0]!.operation, "council", "council has highest cost");
  for (let i = 1; i < r.byOperation.length; i++) {
    assert.ok(r.byOperation[i - 1]!.costUSD >= r.byOperation[i]!.costUSD, "byOperation must be sorted descending");
  }
});

test("computeReport: providers grouped correctly", () => {
  const r = computeReport(SAMPLE_INPUT);
  const openrouter = r.providers.find((p) => p.key === "openrouter:deepseek");
  const mock = r.providers.find((p) => p.key === "mock:mock");
  assert.ok(openrouter, "openrouter:deepseek provider entry present");
  assert.equal(openrouter!.calls, 2);
  assert.ok(mock, "mock:mock provider entry present");
  assert.equal(mock!.calls, 1);
});

test("computeReport: candidatesByStatus and approvedKnowledge passed through", () => {
  const r = computeReport(SAMPLE_INPUT);
  assert.equal(r.candidatesByStatus.PENDING, 3);
  assert.equal(r.candidatesByStatus.APPROVED, 1);
  assert.equal(r.approvedKnowledge.count, 2);
  assert.equal(r.approvedKnowledge.neverUsed, 1);
});

test("computeReport: qualityStats passed through", () => {
  const r = computeReport(SAMPLE_INPUT);
  assert.equal(r.qualityStats.scored, 2);
  assert.equal(r.qualityStats.avgScore, 0.72);
  assert.equal(r.qualityStats.highQuality, 1);
  assert.equal(r.qualityStats.lowQuality, 0);
});
