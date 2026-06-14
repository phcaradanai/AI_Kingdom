import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeLogOutput, tailLines, truncateOutput } from "./secretRedactor.js";

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
