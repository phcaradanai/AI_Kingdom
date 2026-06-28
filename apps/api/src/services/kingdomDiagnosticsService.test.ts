import assert from "node:assert/strict";
import test from "node:test";
import { computeReport, type ReportInput } from "../scripts/measure-intelligence.js";
import {
  getISOWeekLabel,
  buildModeCorrectionStats,
  buildContinuityStats,
  buildCollaborationStats
} from "./kingdomDiagnosticsService.js";

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

// ─── getISOWeekLabel ────────────────────────────────────────────────────────

test("getISOWeekLabel: 2026-01-01 is W01", () => {
  // 2026-01-01 is a Thursday — ISO week 1 of 2026
  assert.equal(getISOWeekLabel(new Date("2026-01-01T00:00:00Z")), "2026-W01");
});

test("getISOWeekLabel: 2025-12-29 belongs to 2026-W01 (ISO week year)", () => {
  // 2025-12-29 is a Monday; the Thursday of that week is 2026-01-01 → 2026-W01
  assert.equal(getISOWeekLabel(new Date("2025-12-29T00:00:00Z")), "2026-W01");
});

test("getISOWeekLabel: 2026-06-22 is W26", () => {
  // Verified with ISO 8601 calendar: 2026-06-22 (Monday) starts week 26
  assert.equal(getISOWeekLabel(new Date("2026-06-22T00:00:00Z")), "2026-W26");
});

test("getISOWeekLabel: week boundary — Sunday 2026-06-28 still W26", () => {
  assert.equal(getISOWeekLabel(new Date("2026-06-28T00:00:00Z")), "2026-W26");
});

test("getISOWeekLabel: Monday 2026-06-29 starts W27", () => {
  assert.equal(getISOWeekLabel(new Date("2026-06-29T00:00:00Z")), "2026-W27");
});

// ─── buildModeCorrectionStats ───────────────────────────────────────────────

test("buildModeCorrectionStats: empty rows produces zero stats", () => {
  const stats = buildModeCorrectionStats([], 10);
  assert.equal(stats.total, 0);
  assert.equal(stats.rate, 0);
  assert.deepEqual(stats.byCorrectedMode, {});
});

test("buildModeCorrectionStats: groups by corrected mode and computes rate", () => {
  const rows = [
    { task: { mode: "BUILD" } },
    { task: { mode: "BUILD" } },
    { task: { mode: "PLAN" } }
  ];
  const stats = buildModeCorrectionStats(rows, 10);
  assert.equal(stats.total, 3);
  assert.ok(Math.abs(stats.rate - 0.3) < 0.001);
  assert.equal(stats.byCorrectedMode["BUILD"], 2);
  assert.equal(stats.byCorrectedMode["PLAN"], 1);
});

test("buildModeCorrectionStats: rate is 0 when no decrees", () => {
  const rows = [{ task: { mode: "BUILD" } }];
  const stats = buildModeCorrectionStats(rows, 0);
  assert.equal(stats.rate, 0);
});

// ─── buildContinuityStats ───────────────────────────────────────────────────

test("buildContinuityStats: empty events produces zero stats", () => {
  const stats = buildContinuityStats([]);
  assert.equal(stats.total, 0);
  assert.deepEqual(stats.byState, {});
  assert.deepEqual(stats.byTriggeredBy, {});
  assert.deepEqual(stats.recentEvents, []);
});

test("buildContinuityStats: groups by state and triggeredBy correctly", () => {
  const now = new Date();
  const events = [
    { id: "1", workOrderId: "wo1", triggeredBy: "MANUAL", readinessState: "BLOCKED", reason: "active job", createdAt: now },
    { id: "2", workOrderId: "wo1", triggeredBy: "MANUAL", readinessState: "STALE_CONTEXT", reason: "stale", createdAt: now },
    { id: "3", workOrderId: "wo2", triggeredBy: "BRIDGE", readinessState: "BLOCKED", reason: "active run", createdAt: now }
  ];
  const stats = buildContinuityStats(events);
  assert.equal(stats.total, 3);
  assert.equal(stats.byState["BLOCKED"], 2);
  assert.equal(stats.byState["STALE_CONTEXT"], 1);
  assert.equal(stats.byTriggeredBy["MANUAL"], 2);
  assert.equal(stats.byTriggeredBy["BRIDGE"], 1);
});

test("buildContinuityStats: recentEvents capped at 10", () => {
  const now = new Date();
  const events = Array.from({ length: 15 }, (_, i) => ({
    id: String(i),
    workOrderId: null,
    triggeredBy: "MANUAL",
    readinessState: "BLOCKED",
    reason: "test",
    createdAt: now
  }));
  const stats = buildContinuityStats(events);
  assert.equal(stats.total, 15);
  assert.equal(stats.recentEvents.length, 10);
});

test("buildCollaborationStats: zero sessions produce zero rate", () => {
  const stats = buildCollaborationStats(0, 0, false);
  assert.equal(stats.total, 0);
  assert.equal(stats.rate, 0);
  assert.equal(stats.enabled, false);
});

test("buildCollaborationStats: computes rate correctly", () => {
  const stats = buildCollaborationStats(3, 10, true);
  assert.equal(stats.total, 3);
  assert.ok(Math.abs(stats.rate - 0.3) < 0.001, "rate should be 0.3");
  assert.equal(stats.enabled, true);
});

test("buildCollaborationStats: rate is 0 when total sessions is 0", () => {
  const stats = buildCollaborationStats(0, 0, true);
  assert.equal(stats.rate, 0);
});
