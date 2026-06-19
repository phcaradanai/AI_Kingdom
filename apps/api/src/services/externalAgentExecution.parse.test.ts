import assert from "node:assert/strict";
import test from "node:test";
import { parseImplementationReportText } from "./externalAgentReportParser.js";

test("parses a well-formed numbered report into structured fields", () => {
  const text = [
    "1. Summary",
    "Implemented the dispatch button and wired it to the API.",
    "2. Files changed",
    "- apps/web/src/pages/WorkOrdersPage.tsx",
    "- apps/api/src/routes/workOrders.ts",
    "3. Commands run",
    "- npm run typecheck",
    "4. Tests run",
    "- npm run test:api",
    "5. Test result",
    "PASSED",
    "6. Decisions made",
    "- Reused buildExternalAgentPrompt instead of duplicating logic",
    "7. Issues found",
    "- None",
    "8. Remaining work",
    "- Add an integration test",
    "9. Recommended next step",
    "Review the report and approve the work order."
  ].join("\n");

  const parsed = parseImplementationReportText(text);
  assert.match(parsed.summary, /Implemented the dispatch button/);
  assert.deepEqual(parsed.filesChanged, ["apps/web/src/pages/WorkOrdersPage.tsx", "apps/api/src/routes/workOrders.ts"]);
  assert.deepEqual(parsed.commandsRun, ["npm run typecheck"]);
  assert.deepEqual(parsed.testsRun, ["npm run test:api"]);
  assert.equal(parsed.testResult, "PASSED");
  assert.deepEqual(parsed.decisionsMade, ["Reused buildExternalAgentPrompt instead of duplicating logic"]);
  assert.deepEqual(parsed.errors, []); // "None" is filtered out
  assert.deepEqual(parsed.remainingWork, ["Add an integration test"]);
  assert.match(parsed.nextRecommendedAction ?? "", /Review the report/);
});

test("handles markdown headings and detects a failing result", () => {
  const text = [
    "## Summary",
    "Attempted the migration but it failed.",
    "## Test Result",
    "FAILED — 2 tests failing",
    "## Issues found",
    "* Migration could not connect to the database"
  ].join("\n");

  const parsed = parseImplementationReportText(text);
  assert.match(parsed.summary, /Attempted the migration/);
  assert.equal(parsed.testResult, "FAILED");
  assert.deepEqual(parsed.errors, ["Migration could not connect to the database"]);
});

test("falls back to whole text as summary when unstructured", () => {
  const text = "I looked into the request and here are my thoughts without any headings.";
  const parsed = parseImplementationReportText(text);
  assert.match(parsed.summary, /I looked into the request/);
  assert.equal(parsed.testResult, "NOT_RUN");
  assert.deepEqual(parsed.filesChanged, []);
  assert.equal(parsed.nextRecommendedAction, null);
});

test("splits a single comma-joined line into list items", () => {
  const text = ["Files changed:", "a.ts, b.ts, c.ts"].join("\n");
  const parsed = parseImplementationReportText(text);
  assert.deepEqual(parsed.filesChanged, ["a.ts", "b.ts", "c.ts"]);
});
