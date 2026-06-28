import assert from "node:assert/strict";
import test from "node:test";
import {
  hasUncertaintySignal,
  extractResearcherUncertainty,
  buildCollaborationQuestion,
  detectCollaborationGap,
} from "./agentCollaborationService.js";

test("hasUncertaintySignal: returns true for INCONCLUSIVE marker", () => {
  assert.equal(hasUncertaintySignal("INCONCLUSIVE: need more data to confirm."), true);
});

test("hasUncertaintySignal: returns true for 'insufficient evidence'", () => {
  assert.equal(hasUncertaintySignal("Insufficient evidence to identify root cause."), true);
});

test("hasUncertaintySignal: returns true for 'unclear' in any case", () => {
  assert.equal(hasUncertaintySignal("The failure point is UNCLEAR from available logs."), true);
});

test("hasUncertaintySignal: returns false when researcher is confident", () => {
  assert.equal(hasUncertaintySignal("The root cause is the missing null check in authMiddleware.ts."), false);
});

test("extractResearcherUncertainty: extracts body after section header", () => {
  const response =
    "Researcher Hypotheses\n\nTop hypothesis: auth bug. INCONCLUSIVE: logs not available.";
  const snippet = extractResearcherUncertainty(response);
  assert.ok(snippet.includes("Top hypothesis"), "should include section body");
  assert.ok(snippet.includes("INCONCLUSIVE"), "should include uncertainty text");
});

test("extractResearcherUncertainty: works for ASK-mode section header variant", () => {
  const response =
    "Researcher Options Analysis\n\nOption A looks promising but unclear tradeoffs exist.";
  const snippet = extractResearcherUncertainty(response);
  assert.ok(snippet.includes("Option A"), "should extract ASK-mode section body");
});

test("extractResearcherUncertainty: falls back to first 300 chars when no header", () => {
  const text = "a".repeat(500);
  const snippet = extractResearcherUncertainty(text);
  assert.ok(snippet.length <= 400, "should cap at 400 chars");
});

test("buildCollaborationQuestion: includes COLLABORATION REQUEST header", () => {
  const q = buildCollaborationQuestion("The auth layer is unclear.");
  assert.ok(q.startsWith("COLLABORATION REQUEST"), "must start with request header");
  assert.ok(q.includes("The auth layer is unclear."), "must embed the snippet");
  assert.ok(q.includes("3–5 concrete evidence items"), "must include focus instruction");
});

test("detectCollaborationGap: returns needed:false when researcher has no uncertainty", () => {
  const result = detectCollaborationGap(
    "Archivist Evidence Report\n\nFound: auth.ts line 47.",
    "Researcher Hypotheses\n\nRoot cause confirmed: null check missing."
  );
  assert.equal(result.needed, false);
});

test("detectCollaborationGap: returns needed:true for INCONCLUSIVE researcher output", () => {
  const researcher =
    "Researcher Hypotheses\n\nTop hypothesis: X (LOW confidence)\nINCONCLUSIVE: insufficient evidence to confirm the auth path.";
  const archivist =
    "Archivist Evidence Report\n\nFound auth.ts and middleware logs. No obvious error.";
  const result = detectCollaborationGap(archivist, researcher);
  assert.equal(result.needed, true);
  if (result.needed) {
    assert.ok(result.question.startsWith("COLLABORATION REQUEST"));
    assert.ok(result.researcherSnippet.length > 0);
    assert.ok(result.researcherSnippet.length <= 400);
  }
});

test("detectCollaborationGap: returns needed:false for empty responses", () => {
  assert.equal(detectCollaborationGap("", "").needed, false);
  assert.equal(detectCollaborationGap("archivist content", "").needed, false);
  assert.equal(detectCollaborationGap("", "researcher content").needed, false);
});

test("detectCollaborationGap: researcherSnippet is capped at 400 chars", () => {
  const longSection = "Researcher Hypotheses\n\n" + "x".repeat(600) + " INCONCLUSIVE: unclear.";
  const result = detectCollaborationGap("some archivist content", longSection);
  if (result.needed) {
    assert.ok(result.researcherSnippet.length <= 400);
  }
});
