/**
 * M15F — Unit tests for routing quality gate.
 * Pure function tests — no database dependency.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  GENERIC_KEYWORD_DENYLIST,
  classifyDataQualityLabel,
  classifyRoutingQuality,
  generateHumanReason,
  generateHumanTitle,
  isGenericKeyword,
  shouldCreateInboxItem,
  type MatchSignal
} from "./routingQualityGate.js";

// ── 1. Generic keyword denylist ────────────────────────────────────────────

test("isGenericKeyword returns true for denied words", () => {
  assert.equal(isGenericKeyword("matter"), true);
  assert.equal(isGenericKeyword("Matter"), true);
  assert.equal(isGenericKeyword("MATTER"), true);
  assert.equal(isGenericKeyword("test"), true);
  assert.equal(isGenericKeyword("report"), true);
  assert.equal(isGenericKeyword("detected"), true);
  assert.equal(isGenericKeyword("inbox"), true);
  assert.equal(isGenericKeyword("source"), true);
});

test("isGenericKeyword returns false for non-denied words", () => {
  assert.equal(isGenericKeyword("kingdom"), false);
  assert.equal(isGenericKeyword("godot"), false);
  assert.equal(isGenericKeyword("tower defense"), false);
  assert.equal(isGenericKeyword("ai kingdom"), false);
});

test("multi-word keywords containing a denied word are NOT denied", () => {
  assert.equal(isGenericKeyword("critical matter"), false);
  assert.equal(isGenericKeyword("test automation"), false);
  assert.equal(isGenericKeyword("project routing"), false);
});

test("denylist contains all 18 specified words", () => {
  const expected = [
    "matter", "notice", "test", "desc", "first", "second", "critical",
    "high", "medium", "low", "general", "system", "implementation",
    "report", "work", "project", "inbox", "source", "detected"
  ];
  for (const word of expected) {
    assert.ok(GENERIC_KEYWORD_DENYLIST.has(word), `Expected "${word}" in denylist`);
  }
});

// ── 2. Quality classification ──────────────────────────────────────────────

test("confidence 18 with only generic keyword 'matter' → DEBUG_ONLY", () => {
  const signals: MatchSignal[] = [
    { type: "keyword", value: "matter", projectName: "AI Kingdom", score: 18 }
  ];
  const result = classifyRoutingQuality(18, signals);
  assert.equal(result.routingQuality, "DEBUG_ONLY");
  assert.equal(result.evidence.length, 0);
  assert.equal(result.ignoredSignals.length, 1);
});

test("confidence 18 with non-generic keyword → LOW", () => {
  const signals: MatchSignal[] = [
    { type: "keyword", value: "godot", projectName: "Godot Tower Defense", score: 18 }
  ];
  const result = classifyRoutingQuality(18, signals);
  assert.equal(result.routingQuality, "LOW");
  assert.equal(result.evidence.length, 1);
});

test("no signals at all → NO_MATCH", () => {
  const result = classifyRoutingQuality(0, []);
  assert.equal(result.routingQuality, "NO_MATCH");
});

test("exact project name at confidence 80 → HIGH", () => {
  const signals: MatchSignal[] = [
    { type: "project_name", value: "AI Kingdom", projectName: "AI Kingdom", score: 80 }
  ];
  const result = classifyRoutingQuality(80, signals);
  assert.equal(result.routingQuality, "HIGH");
});

test("alias match at confidence 50 → MEDIUM (strong signal present)", () => {
  const signals: MatchSignal[] = [
    { type: "alias", value: "tower-defense", projectName: "Godot Tower Defense", score: 50 }
  ];
  const result = classifyRoutingQuality(50, signals);
  assert.equal(result.routingQuality, "MEDIUM");
});

test("confidence 55 with only weak keyword → LOW (no strong signal)", () => {
  const signals: MatchSignal[] = [
    { type: "keyword", value: "pathing", projectName: "Godot Tower Defense", score: 18 },
    { type: "keyword", value: "wave", projectName: "Godot Tower Defense", score: 18 }
  ];
  const result = classifyRoutingQuality(55, signals);
  assert.equal(result.routingQuality, "LOW");
});

test("codename match at confidence 70 → HIGH", () => {
  const signals: MatchSignal[] = [
    { type: "codename", value: "Project Atlas", projectName: "AI Kingdom", score: 70 }
  ];
  const result = classifyRoutingQuality(70, signals);
  assert.equal(result.routingQuality, "HIGH");
});

test("source ancestry at confidence 90 → HIGH", () => {
  const signals: MatchSignal[] = [
    { type: "source_ancestry", value: "source ancestry", projectName: "AI Kingdom", score: 90 }
  ];
  const result = classifyRoutingQuality(90, signals);
  assert.equal(result.routingQuality, "HIGH");
});

// ── 3. shouldCreateInboxItem ───────────────────────────────────────────────

test("shouldCreateInboxItem returns true for HIGH and MEDIUM", () => {
  assert.equal(shouldCreateInboxItem("HIGH"), true);
  assert.equal(shouldCreateInboxItem("MEDIUM"), true);
  assert.equal(shouldCreateInboxItem("LOW"), false);
  assert.equal(shouldCreateInboxItem("DEBUG_ONLY"), false);
  assert.equal(shouldCreateInboxItem("NO_MATCH"), false);
});

// ── 4. Human-readable title ────────────────────────────────────────────────

test("generateHumanTitle strips timestamp/hash suffix", () => {
  assert.equal(
    generateHumanTitle("CRITICAL MATTER 178081648918-080902E2F65"),
    "Critical matter"
  );
  assert.equal(
    generateHumanTitle("NEW MATTER 178081648738-BC9031CE5F71"),
    "New matter"
  );
});

test("generateHumanTitle converts all-caps to sentence case", () => {
  assert.equal(generateHumanTitle("CRITICAL MATTER"), "Critical matter");
  assert.equal(generateHumanTitle("NEW MATTER"), "New matter");
});

test("generateHumanTitle preserves normal titles", () => {
  assert.equal(generateHumanTitle("Implement routing for providers"), "Implement routing for providers");
});

test("generateHumanTitle handles empty/whitespace titles", () => {
  assert.equal(generateHumanTitle(""), "Project routing review");
  assert.equal(generateHumanTitle("   "), "Project routing review");
});

// ── 5. Human-readable reason ───────────────────────────────────────────────

test("generateHumanReason for DEBUG_ONLY explains generic keywords", () => {
  const ignored: MatchSignal[] = [{ type: "keyword", value: "matter", projectName: "AI Kingdom", score: 18 }];
  const reason = generateHumanReason("DEBUG_ONLY", [], ignored, null);
  assert.match(reason, /generic wording/);
  assert.match(reason, /matter/);
  assert.match(reason, /Manual review required/);
});

test("generateHumanReason for NO_MATCH", () => {
  const reason = generateHumanReason("NO_MATCH", [], [], null);
  assert.equal(reason, "No reliable project evidence found.");
});

test("generateHumanReason for HIGH with project name match", () => {
  const evidence: MatchSignal[] = [{ type: "project_name", value: "AI Kingdom", projectName: "AI Kingdom", score: 80 }];
  const reason = generateHumanReason("HIGH", evidence, [], "AI Kingdom");
  assert.match(reason, /Matched AI Kingdom by exact project name/);
});

test("generateHumanReason for MEDIUM with alias match", () => {
  const evidence: MatchSignal[] = [{ type: "alias", value: "tower-defense", projectName: "Godot Tower Defense", score: 50 }];
  const reason = generateHumanReason("MEDIUM", evidence, [], "Godot Tower Defense");
  assert.match(reason, /Matched Godot Tower Defense by project alias/);
  assert.match(reason, /tower-defense/);
});

test("generateHumanReason for LOW with some evidence", () => {
  const evidence: MatchSignal[] = [{ type: "keyword", value: "pathing", projectName: "Godot Tower Defense", score: 18 }];
  const reason = generateHumanReason("LOW", evidence, [], "Godot Tower Defense");
  assert.match(reason, /Low-confidence match/);
  assert.match(reason, /Manual review required/);
});

// ── 6. Data quality label ──────────────────────────────────────────────────

test("classifyDataQualityLabel detects test sources", () => {
  assert.equal(classifyDataQualityLabel("test", "fixture", true), "TEST");
  assert.equal(classifyDataQualityLabel("TASK", "test", false), "TEST");
});

test("classifyDataQualityLabel returns TRUSTED_SOURCE for system-created with source", () => {
  assert.equal(classifyDataQualityLabel("TASK", "cmq123", true), "TRUSTED_SOURCE");
});

test("classifyDataQualityLabel returns REVIEW_REQUIRED for non-system with source", () => {
  assert.equal(classifyDataQualityLabel("TASK", "cmq123", false), "REVIEW_REQUIRED");
});

test("classifyDataQualityLabel returns UNKNOWN_SOURCE for no source info", () => {
  assert.equal(classifyDataQualityLabel(null, null, false), "UNKNOWN_SOURCE");
});
