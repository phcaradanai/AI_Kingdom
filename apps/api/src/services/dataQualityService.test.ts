import assert from "node:assert/strict";
import test from "node:test";
import { classifyArtifact, classifyMatter, classifyNotice, classifyProjectInboxItem } from "./dataQualityService.js";

test("data quality classification marks source=test as TEST", () => {
  assert.equal(classifyMatter({ title: "Operational item", sourceType: "test", sourceId: "fixture" }), "TEST");
  assert.equal(classifyNotice({ title: "Operational item", sourceType: "NOTICE", sourceId: "test" }), "TEST");
  assert.equal(classifyArtifact({ title: "Operational item", dataSource: "test" }), "TEST");
});

test("confidence 0 inbox item is REVIEW_REQUIRED unless source is test", () => {
  assert.equal(classifyProjectInboxItem({ title: "Ambiguous note", sourceType: "TASK", sourceId: "cmq123456789", confidenceScore: 0 }), "REVIEW_REQUIRED");
  assert.equal(classifyProjectInboxItem({ title: "Ambiguous note", sourceType: "test", sourceId: "cmq123456789", confidenceScore: 0 }), "TEST");
});

test("generated implementation report titles are TEST", () => {
  assert.equal(classifyArtifact({ title: "Implementation Report: M13 RBAC", sourceType: "WORK_ORDER", sourceId: "wo1" }), "TEST");
  assert.equal(classifyArtifact({ title: "Implementation Report: M14 Report Work", sourceType: "WORK_ORDER", sourceId: "wo1" }), "TEST");
});
