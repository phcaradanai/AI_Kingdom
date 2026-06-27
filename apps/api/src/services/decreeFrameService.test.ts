import assert from "node:assert/strict";
import { test } from "node:test";
import { buildDecreeFrameSection, extractDecreeFrame } from "./decreeFrameService.js";

test("extractDecreeFrame — bug fix decree detects BUG_FIX with relevant domain", () => {
  const frame = extractDecreeFrame(
    "Fix the bug in the authentication middleware where JWT tokens are not being validated correctly",
    "BUILD"
  );
  assert.equal(frame.problemType, "BUG_FIX");
  assert.ok(frame.domainSignals.includes("auth"), "should detect auth domain");
  assert.ok(frame.domainSignals.includes("api-routes"), "should detect api-routes domain");
  assert.equal(frame.keyQuestions.length, 3);
  assert.ok(
    frame.keyQuestions[0]!.toLowerCase().includes("file") || frame.keyQuestions[0]!.toLowerCase().includes("function") || frame.keyQuestions[0]!.toLowerCase().includes("root cause"),
    "first question should target location of failure"
  );
});

test("extractDecreeFrame — feature addition decree detects FEATURE_ADDITION in BUILD mode", () => {
  const frame = extractDecreeFrame(
    "Add a rate limiting system to all API endpoints to protect against abuse",
    "BUILD"
  );
  assert.equal(frame.problemType, "FEATURE_ADDITION");
  assert.ok(frame.domainSignals.includes("security"), "should detect security domain");
  assert.ok(frame.domainSignals.includes("api-routes"), "should detect api-routes domain");
  assert.equal(frame.keyQuestions.length, 3);
  // BUILD FEATURE_ADDITION questions focus on existing interfaces, edge cases, change set
  assert.ok(
    frame.keyQuestions.some((q) => q.toLowerCase().includes("existing") || q.toLowerCase().includes("interface") || q.toLowerCase().includes("extend")),
    "at least one question should probe existing code"
  );
});

test("extractDecreeFrame — Thai decree detects correct type (FEATURE_ADDITION)", () => {
  const frame = extractDecreeFrame(
    "เพิ่มระบบ rate limiting ให้กับ API endpoints ทั้งหมด เพื่อป้องกัน security ช่องโหว่",
    "BUILD"
  );
  assert.equal(frame.problemType, "FEATURE_ADDITION");
  assert.ok(frame.domainSignals.length > 0, "should detect at least one domain from Thai text");
});

test("extractDecreeFrame — refactor decree detects ARCHITECTURE_CHANGE", () => {
  const frame = extractDecreeFrame(
    "Refactor the auth service to restructure the session token storage using prisma model changes",
    "BUILD"
  );
  assert.equal(frame.problemType, "ARCHITECTURE_CHANGE");
  assert.ok(frame.domainSignals.includes("auth"), "should detect auth domain");
  assert.ok(frame.domainSignals.includes("database"), "should detect database domain");
});

test("extractDecreeFrame — question decree detects INFORMATION_REQUEST in ASK mode", () => {
  const frame = extractDecreeFrame(
    "How does the API route authorization work and what is the RBAC permission model?",
    "ASK"
  );
  assert.equal(frame.problemType, "INFORMATION_REQUEST");
  assert.ok(frame.domainSignals.includes("auth"), "should detect auth domain from rbac/permission");
  // ASK mode INFORMATION_REQUEST questions focus on the decision/concern and tradeoffs
  assert.ok(
    frame.keyQuestions.some((q) => q.toLowerCase().includes("decision") || q.toLowerCase().includes("constraint") || q.toLowerCase().includes("tradeoff")),
    "at least one question should probe the underlying concern"
  );
});

test("extractDecreeFrame — unrecognized decree defaults to GENERAL_TASK", () => {
  const frame = extractDecreeFrame("Improve the overall kingdom performance", "RESEARCH");
  assert.equal(frame.problemType, "GENERAL_TASK");
  assert.equal(frame.keyQuestions.length, 3);
});

test("buildDecreeFrameSection — produces well-formatted output with all sections", () => {
  const frame = extractDecreeFrame(
    "Fix the bug in the authentication JWT validation in the API middleware",
    "BUILD"
  );
  const section = buildDecreeFrameSection(frame);

  assert.ok(section.startsWith("## Decree Analysis"), "should start with header");
  assert.ok(section.includes("Problem type: BUG FIX"), "should include readable problem type");
  assert.ok(section.includes("Domain signals:"), "should include domain signals");
  assert.ok(section.includes("Key council questions:"), "should include key questions header");
  assert.ok(section.includes("1."), "should number the questions");
  assert.ok(section.includes("2."), "should have at least 2 questions");
  assert.ok(section.includes("3."), "should have at least 3 questions");
});

test("buildDecreeFrameSection — domain signals capped at 4 when many match", () => {
  // This decree hits: auth, api-routes, database, frontend-ui, testing, security
  const frame = extractDecreeFrame(
    "Add authentication to the api route with database schema migration and frontend component and unit test for security",
    "BUILD"
  );
  assert.ok(frame.domainSignals.length <= 4, `domain signals should be capped at 4, got ${frame.domainSignals.length}`);
});

test("extractDecreeFrame — Thai planning decree detects PLAN_REQUEST", () => {
  const frame = extractDecreeFrame("วางแผนขั้นตอนต่อไปของโปรเจ็ค", "ASK");
  assert.equal(frame.problemType, "PLAN_REQUEST");
  assert.equal(frame.keyQuestions.length, 3);
});

test("extractDecreeFrame — English planning decree detects PLAN_REQUEST", () => {
  const frame = extractDecreeFrame("Plan the next steps for the project roadmap", "PLAN");
  assert.equal(frame.problemType, "PLAN_REQUEST");
  // PLAN mode questions focus on end state, phases, risks
  assert.ok(
    frame.keyQuestions.some((q) => q.toLowerCase().includes("end state") || q.toLowerCase().includes("phase") || q.toLowerCase().includes("milestone")),
    "PLAN mode questions should address phases/milestones"
  );
});

test("buildDecreeFrameSection — includes mode correction note when provided", () => {
  const frame = extractDecreeFrame("วางแผนขั้นตอนต่อไปของโปรเจ็ค", "PLAN");
  const section = buildDecreeFrameSection(frame, "decree signals planning intent — switched to PLAN mode");
  assert.ok(section.includes("Mode auto-corrected:"), "should include mode correction line");
  assert.ok(section.includes("switched to PLAN mode"), "should include the reason");
});

test("buildDecreeFrameSection — underscores replaced in problem type label", () => {
  const frame = extractDecreeFrame("Refactor and rewrite the architecture", "PLAN");
  const section = buildDecreeFrameSection(frame);
  assert.ok(!section.includes("_"), "underscores should be replaced with spaces in problem type label");
  assert.ok(section.includes("ARCHITECTURE CHANGE"), "should show readable label");
});
