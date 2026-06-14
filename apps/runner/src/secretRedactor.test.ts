import assert from "node:assert/strict";
import test from "node:test";
import { extractFailureSummary, sanitizeLogOutput, tailLines, truncateOutput } from "./secretRedactor.js";

test("tailLines returns text unchanged when within the line limit", () => {
  const text = "line1\nline2\nline3";
  assert.equal(tailLines(text, 5), text);
});

test("tailLines keeps only the last N lines and notes how many were omitted", () => {
  const lines = Array.from({ length: 10 }, (_, i) => `line${i}`);
  const result = tailLines(lines.join("\n"), 3);

  assert.match(result, /truncated 7 earlier lines/);
  assert.match(result, /line7\nline8\nline9$/);
  assert.doesNotMatch(result, /line0/);
});

test("tailLines preserves a failure line near the end of a large output", () => {
  const lines = Array.from({ length: 1000 }, (_, i) => `# pass ${i}`);
  lines.push("not ok 1 - some test");
  lines.push("# fail 1");
  const result = tailLines(lines.join("\n"), 300);

  assert.match(result, /not ok 1 - some test/);
  assert.match(result, /# fail 1$/);
});

test("sanitizeLogOutput accepts a custom max length", () => {
  const text = "a".repeat(100);
  const result = sanitizeLogOutput(text, 20);
  assert.ok(result.length <= 60); // head + marker + tail
});

test("truncateOutput leaves short text untouched", () => {
  assert.equal(truncateOutput("short", 100), "short");
});

test("extractFailureSummary returns null when no failure indicators are present", () => {
  const text = Array.from({ length: 50 }, (_, i) => `ok ${i + 1} - test ${i}`).join("\n");
  assert.equal(extractFailureSummary(text), null);
});

test("extractFailureSummary captures a TAP 'not ok' block with its YAML diagnostics", () => {
  const text = [
    "ok 1 - some passing test",
    "not ok 2 - addition is correct",
    "  ---",
    "  duration_ms: 1.234",
    "  failureType: 'testCodeFailure'",
    "  error: |-",
    "    Expected values to be strictly equal:",
    "    1 !== 2",
    "  code: 'ERR_ASSERTION'",
    "  ...",
    "ok 3 - another passing test"
  ].join("\n");

  const summary = extractFailureSummary(text);
  assert.ok(summary);
  assert.match(summary!, /not ok 2 - addition is correct/);
  assert.match(summary!, /ERR_ASSERTION/);
  assert.match(summary!, /Expected values to be strictly equal/);
  assert.doesNotMatch(summary!, /another passing test/);
});

test("extractFailureSummary caps very long failure blocks from the tail", () => {
  const longBlock = Array.from({ length: 200 }, (_, i) => `  line ${i}`).join("\n");
  const text = `not ok 1 - big failure\n${longBlock}`;

  const summary = extractFailureSummary(text, 100);
  assert.ok(summary);
  assert.ok(summary!.length <= 100 + 50);
  assert.match(summary!, /truncated \d+ earlier chars/);
});
