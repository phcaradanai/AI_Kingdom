import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assessDecreeComplexity,
  assessExecutionComplexity,
  escalationFor
} from "./complexityAssessor.js";

test("assessDecreeComplexity flags a complex English code-fix decree", () => {
  const r = assessDecreeComplexity({
    text: "Refactor the auth module and debug the race condition causing data loss",
    mode: "BUILD"
  });
  assert.equal(r.level, "COMPLEX");
  assert.ok(r.score >= 2);
});

test("assessDecreeComplexity flags a complex Thai decree", () => {
  const r = assessDecreeComplexity({
    text: "ช่วยแก้บัคในระบบใหญ่ที่ทำให้ข้อมูลผิดพลาด วิเคราะห์หาสาเหตุให้ด้วย",
    mode: "BUILD"
  });
  assert.equal(r.level, "COMPLEX");
});

test("assessDecreeComplexity keeps a simple ASK decree STANDARD", () => {
  const r = assessDecreeComplexity({ text: "What is the project status?", mode: "ASK" });
  assert.equal(r.level, "STANDARD");
});

test("assessDecreeComplexity: a single keyword alone is not enough", () => {
  // one keyword (score 1) in a non-complex-leaning mode stays STANDARD
  const r = assessDecreeComplexity({ text: "small security note", mode: "ASK" });
  assert.equal(r.level, "STANDARD");
});

test("assessExecutionComplexity flags high-risk patch", () => {
  const r = assessExecutionComplexity({ riskLevel: "HIGH" });
  assert.equal(r.level, "COMPLEX");
  assert.ok(r.signals.some((s) => s.startsWith("risk:")));
});

test("assessExecutionComplexity flags a failed verdict (bug analysis)", () => {
  const r = assessExecutionComplexity({ verdict: "PATCH_FAILED" });
  assert.equal(r.level, "COMPLEX");
});

test("assessExecutionComplexity keeps a clean low-risk PASS STANDARD", () => {
  const r = assessExecutionComplexity({ riskLevel: "LOW", verdict: "PASS", acceptanceCriteriaCount: 2 });
  assert.equal(r.level, "STANDARD");
});

test("escalationFor maps COMPLEX to high-effort reasoning, STANDARD to off", () => {
  assert.deepEqual(escalationFor("COMPLEX"), { reasoning: true, reasoningEffort: "high" });
  assert.deepEqual(escalationFor("STANDARD"), { reasoning: false });
});
