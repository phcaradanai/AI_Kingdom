import assert from "node:assert/strict";
import test from "node:test";
import { evaluateBranchPushEligibility, evaluateFreshLocalContext, shouldPushWithoutApproval, SANDBOX_PATCH_NO_PUSH } from "./sandboxPatchPolicy.js";

test("M17D-3: SANDBOX_PATCH_NO_PUSH blocks branch push even if branch push is enabled", () => {
  const result = evaluateBranchPushEligibility({
    allowBranchPush: true,
    commandPolicy: SANDBOX_PATCH_NO_PUSH,
    branchName: "kingdom/job-abc12345-fix-typo",
    hasArtifact: true
  });
  assert.equal(result.attemptPush, false);
  assert.equal(result.reason, "commandPolicy restricts branch push");
});

test("branch push proceeds when allowed, no restrictive policy, artifact and branch exist", () => {
  const result = evaluateBranchPushEligibility({
    allowBranchPush: true,
    commandPolicy: null,
    branchName: "kingdom/job-abc12345-fix-typo",
    hasArtifact: true
  });
  assert.equal(result.attemptPush, true);
});

test("branch push does not proceed when branch push is disabled", () => {
  const result = evaluateBranchPushEligibility({
    allowBranchPush: false,
    commandPolicy: null,
    branchName: "kingdom/job-abc12345-fix-typo",
    hasArtifact: true
  });
  assert.equal(result.attemptPush, false);
  assert.equal(result.reason, "Branch push disabled");
});

test("branch push does not proceed without an artifact or branch name", () => {
  assert.equal(evaluateBranchPushEligibility({ allowBranchPush: true, commandPolicy: null, branchName: null, hasArtifact: true }).attemptPush, false);
  assert.equal(evaluateBranchPushEligibility({ allowBranchPush: true, commandPolicy: null, branchName: "kingdom/job-abc12345-x", hasArtifact: false }).attemptPush, false);
});

test("M17D-3: a patch that escalates to MEDIUM/HIGH/CRITICAL risk requires King approval (no auto push)", () => {
  assert.equal(shouldPushWithoutApproval({ riskLevel: "MEDIUM", validationStatus: "PENDING" }), false);
  assert.equal(shouldPushWithoutApproval({ riskLevel: "HIGH", validationStatus: "PENDING" }), false);
  assert.equal(shouldPushWithoutApproval({ riskLevel: "CRITICAL", validationStatus: "PENDING" }), false);
});

test("LOW risk PENDING patches may push without waiting for explicit approval", () => {
  assert.equal(shouldPushWithoutApproval({ riskLevel: "LOW", validationStatus: "PENDING" }), true);
});

test("M17E-1: SANDBOX_PATCH is refused when fresh local context is required but no snapshot id is in provenance", () => {
  const result = evaluateFreshLocalContext({
    requireFreshLocalContext: true,
    localDocumentSnapshotId: null,
    localDocumentSnapshotStale: undefined
  });
  assert.equal(result.proceed, false);
  assert.equal(result.reason, "No local document snapshot is recorded for this job's project.");
});

test("M17E-1: SANDBOX_PATCH is refused when fresh local context is required and the snapshot is stale", () => {
  const result = evaluateFreshLocalContext({
    requireFreshLocalContext: true,
    localDocumentSnapshotId: "snapshot-123",
    localDocumentSnapshotStale: true
  });
  assert.equal(result.proceed, false);
  assert.equal(result.reason, "The local document snapshot for this job's project is stale.");
});

test("M17E-1: SANDBOX_PATCH proceeds with a fresh snapshot, and always proceeds when the flag is disabled", () => {
  assert.equal(
    evaluateFreshLocalContext({ requireFreshLocalContext: true, localDocumentSnapshotId: "snapshot-123", localDocumentSnapshotStale: false }).proceed,
    true
  );
  assert.equal(
    evaluateFreshLocalContext({ requireFreshLocalContext: false, localDocumentSnapshotId: null, localDocumentSnapshotStale: undefined }).proceed,
    true
  );
});
