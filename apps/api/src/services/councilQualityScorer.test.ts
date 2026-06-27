import assert from "node:assert/strict";
import test from "node:test";
import { scoreCouncilSynthesis, QUALITY_GATE_THRESHOLD } from "./councilQualityScorer.js";

const GOOD_SYNTHESIS = `
Grand Vizier Final Decision

The Archivist confirmed the route exists. The Researcher identified the root cause: the
authentication middleware skips the token refresh check on POST /api/tasks.
The Architect named the exact fix: update apps/api/src/middleware/auth.ts line 42 to call
refreshTokenIfNeeded() before the RBAC check. The General assessed risk as LOW.

My recommendation: patch apps/api/src/middleware/auth.ts — add refreshTokenIfNeeded() before the RBAC check.
`;

const VAGUE_SYNTHESIS = `
Looking at the situation, there are several possibilities to consider. The issue might be
related to how the system handles requests. You should update the relevant files and check
if that resolves the problem. It depends on many factors.

Possibly the fix involves modifying the authentication flow.
`;

test("scores a well-formed synthesis highly", () => {
  const result = scoreCouncilSynthesis(GOOD_SYNTHESIS, "RESEARCH");
  assert.ok(result.score >= 0.8, `expected score >= 0.8 but got ${result.score}`);
  assert.ok(result.flags.hasRecommendation, "should detect 'My recommendation:'");
  assert.ok(result.flags.hasVerdict, "should detect verdict section");
  assert.ok(result.flags.citesRoles, "should detect ≥2 role names");
  assert.ok(result.flags.hasSpecificPaths, "should detect file path in synthesis");
  assert.ok(result.passed.includes("hasRecommendation"), "hasRecommendation in passed");
});

test("scores a vague synthesis below the gate threshold", () => {
  const result = scoreCouncilSynthesis(VAGUE_SYNTHESIS, "RESEARCH");
  assert.ok(result.score < QUALITY_GATE_THRESHOLD, `expected score < ${QUALITY_GATE_THRESHOLD} but got ${result.score}`);
  assert.ok(!result.flags.hasRecommendation, "should not detect 'My recommendation:'");
  assert.ok(!result.flags.noVagueFileRefs, "should flag vague file references");
  assert.ok(!result.flags.noUnresolvedHedge, "should flag unresolved 'it depends'");
  assert.ok(result.failed.includes("hasRecommendation"), "hasRecommendation in failed");
});

test("hasSpecificPaths carries no weight for ASK mode", () => {
  const counselWithoutPaths = `
Grand Vizier Counsel

The Archivist found no blocking constraints. The Researcher assessed the tradeoff clearly.
The Architect confirmed the approach is sound. The General sees no blockers.

My recommendation: proceed with the incremental migration strategy.
  `;
  const resultAsk = scoreCouncilSynthesis(counselWithoutPaths, "ASK");
  const resultBuild = scoreCouncilSynthesis(counselWithoutPaths, "BUILD");
  // ASK mode: paths not required — should score higher than BUILD for same text
  assert.ok(resultAsk.score >= resultBuild.score, "ASK should score >= BUILD when paths are missing");
  assert.ok(resultAsk.score >= QUALITY_GATE_THRESHOLD, "Good ASK synthesis should pass the gate");
});

test("QUALITY_GATE_THRESHOLD is 0.5", () => {
  assert.equal(QUALITY_GATE_THRESHOLD, 0.5);
});
