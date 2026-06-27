import assert from "node:assert/strict";
import { test } from "node:test";
import { adviseModeCorrection } from "./decreeModeAdvisorService.js";

// ── Core correction cases ────────────────────────────────────────────────────

test("Thai planning decree corrects ASK → PLAN", () => {
  const advice = adviseModeCorrection("วางแผนขั้นตอนต่อไปของโปรเจ็ค", "ASK");
  assert.ok(advice, "should return advice");
  assert.equal(advice.correctedMode, "PLAN");
  assert.equal(advice.originalMode, "ASK");
  assert.ok(advice.reason.includes("PLAN"), "reason should mention PLAN");
});

test("English planning decree corrects ASK → PLAN", () => {
  const advice = adviseModeCorrection("Plan the next steps for the project roadmap", "ASK");
  assert.ok(advice, "should return advice");
  assert.equal(advice.correctedMode, "PLAN");
});

test("Bug fix decree corrects ASK → BUILD", () => {
  const advice = adviseModeCorrection("Fix the authentication bug where JWT tokens expire too early", "ASK");
  assert.ok(advice, "should return advice");
  assert.equal(advice.correctedMode, "BUILD");
});

test("Feature addition decree corrects ASK → BUILD", () => {
  const advice = adviseModeCorrection("Add rate limiting to all API endpoints", "ASK");
  assert.ok(advice, "should return advice");
  assert.equal(advice.correctedMode, "BUILD");
});

test("Diagnosis decree corrects ASK → RESEARCH", () => {
  const advice = adviseModeCorrection("Investigate why the living loop is creating duplicate candidates", "ASK");
  assert.ok(advice, "should return advice");
  assert.equal(advice.correctedMode, "RESEARCH");
});

// ── Question framing veto ────────────────────────────────────────────────────

test("'อธิบายว่าควรวางแผนอย่างไร' stays ASK — question framing vetoes planning keyword", () => {
  // Critical false-positive case: "อธิบาย" (explain) and "อย่างไร" (how) are question
  // markers even though "วางแผน" (plan) appears as the topic.
  const advice = adviseModeCorrection("อธิบายว่าควรวางแผน deployment อย่างไร", "ASK");
  assert.equal(advice, null, "should not correct — this is an explanation request");
});

test("'Explain how to plan the next steps' stays ASK — 'explain' vetoes", () => {
  const advice = adviseModeCorrection("Explain how to plan the next steps for authentication", "ASK");
  assert.equal(advice, null, "should not correct — explanation request");
});

test("'what is the roadmap' stays ASK — 'what is' vetoes", () => {
  const advice = adviseModeCorrection("What is the roadmap for this project?", "ASK");
  assert.equal(advice, null, "should not correct — question framing");
});

test("'how do we fix the bug' stays ASK — 'how do' vetoes", () => {
  const advice = adviseModeCorrection("How do we fix the authentication bug?", "ASK");
  assert.equal(advice, null, "should not correct — question framing");
});

// ── Non-ASK modes are never corrected ────────────────────────────────────────

test("PLAN mode is never corrected — explicit King choice", () => {
  const advice = adviseModeCorrection("วางแผนขั้นตอนต่อไปของโปรเจ็ค", "PLAN");
  assert.equal(advice, null);
});

test("BUILD mode is never corrected — explicit King choice", () => {
  const advice = adviseModeCorrection("What is the current status?", "BUILD");
  assert.equal(advice, null);
});

test("RESEARCH mode is never corrected — explicit King choice", () => {
  const advice = adviseModeCorrection("Plan the architecture redesign", "RESEARCH");
  assert.equal(advice, null);
});

// ── Ambiguous decrees stay ASK ────────────────────────────────────────────────

test("Vague decree with no strong intent signal stays ASK", () => {
  const advice = adviseModeCorrection("Improve kingdom performance", "ASK");
  assert.equal(advice, null, "GENERAL_TASK has no clear mode signal");
});
