import assert from "node:assert/strict";
import test from "node:test";
import {
  buildContextUsed,
  evaluateBranchPushEligibility,
  evaluateFreshLocalContext,
  evaluateJobContextBinding,
  shouldPushWithoutApproval,
  SANDBOX_PATCH_NO_PUSH,
  APPLY_APPROVED_PATCH_PUSH,
  isPreApprovedPushPolicy
} from "./sandboxPatchPolicy.js";

test("APPLY_APPROVED_PATCH_PUSH is push-eligible when branch push is enabled (not blocked like NO_PUSH)", () => {
  const result = evaluateBranchPushEligibility({
    allowBranchPush: true,
    commandPolicy: APPLY_APPROVED_PATCH_PUSH,
    branchName: "kingdom/job-abc12345-apply",
    hasArtifact: true
  });
  assert.equal(result.attemptPush, true);
});

test("APPLY_APPROVED_PATCH_PUSH still respects the ALLOW_BRANCH_PUSH master switch", () => {
  const result = evaluateBranchPushEligibility({
    allowBranchPush: false,
    commandPolicy: APPLY_APPROVED_PATCH_PUSH,
    branchName: "kingdom/job-abc12345-apply",
    hasArtifact: true
  });
  assert.equal(result.attemptPush, false);
});

test("isPreApprovedPushPolicy only matches the approved-patch push policy", () => {
  assert.equal(isPreApprovedPushPolicy(APPLY_APPROVED_PATCH_PUSH), true);
  assert.equal(isPreApprovedPushPolicy(SANDBOX_PATCH_NO_PUSH), false);
  assert.equal(isPreApprovedPushPolicy(null), false);
  assert.equal(isPreApprovedPushPolicy(undefined), false);
});

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

// ── M17E-2: evaluateJobContextBinding + buildContextUsed ─────────────────────────

test("evaluateJobContextBinding refuses SANDBOX_PATCH when context is STALE and fresh context is required", () => {
  const result = evaluateJobContextBinding({
    mode: "SANDBOX_PATCH",
    requireFreshLocalContext: true,
    contextValidationStatus: "STALE",
    localDocumentSnapshotId: "snap-1",
    localDocumentSnapshotStale: false
  });
  assert.equal(result.proceed, false);
  assert.match(result.reason ?? "", /STALE/);
});

test("evaluateJobContextBinding refuses SANDBOX_PATCH on MISSING and PARTIAL context when required", () => {
  for (const status of ["MISSING", "PARTIAL"] as const) {
    const result = evaluateJobContextBinding({
      mode: "SANDBOX_PATCH",
      requireFreshLocalContext: true,
      contextValidationStatus: status,
      localDocumentSnapshotId: null,
      localDocumentSnapshotStale: undefined
    });
    assert.equal(result.proceed, false, `expected refusal for ${status}`);
    assert.match(result.reason ?? "", new RegExp(status));
  }
});

test("evaluateJobContextBinding proceeds for FRESH context, when the policy is disabled, and falls back to legacy provenance", () => {
  assert.equal(
    evaluateJobContextBinding({ mode: "SANDBOX_PATCH", requireFreshLocalContext: true, contextValidationStatus: "FRESH", localDocumentSnapshotId: "snap-1", localDocumentSnapshotStale: false }).proceed,
    true
  );
  assert.equal(
    evaluateJobContextBinding({ mode: "SANDBOX_PATCH", requireFreshLocalContext: false, contextValidationStatus: "STALE", localDocumentSnapshotId: null, localDocumentSnapshotStale: true }).proceed,
    true,
    "policy disabled must proceed"
  );

  // Legacy job: no contextValidationStatus → M17E-1 provenance fallback applies.
  const legacyMissing = evaluateJobContextBinding({
    mode: "SANDBOX_PATCH",
    requireFreshLocalContext: true,
    contextValidationStatus: undefined,
    localDocumentSnapshotId: null,
    localDocumentSnapshotStale: undefined
  });
  assert.equal(legacyMissing.proceed, false);
  assert.equal(legacyMissing.reason, "No local document snapshot is recorded for this job's project.");

  const legacyFresh = evaluateJobContextBinding({
    mode: "SANDBOX_PATCH",
    requireFreshLocalContext: true,
    contextValidationStatus: undefined,
    localDocumentSnapshotId: "snap-1",
    localDocumentSnapshotStale: false
  });
  assert.equal(legacyFresh.proceed, true);
});

test("evaluateJobContextBinding never refuses VALIDATION_ONLY but returns warnings for degraded context", () => {
  for (const status of ["PARTIAL", "STALE", "MISSING"] as const) {
    const result = evaluateJobContextBinding({
      mode: "VALIDATION_ONLY",
      requireFreshLocalContext: true,
      contextValidationStatus: status,
      localDocumentSnapshotId: null,
      localDocumentSnapshotStale: undefined
    });
    assert.equal(result.proceed, true, `VALIDATION_ONLY must proceed with ${status}`);
    assert.equal(result.warnings.length, 1, `expected one warning for ${status}`);
  }
  const fresh = evaluateJobContextBinding({
    mode: "VALIDATION_ONLY",
    requireFreshLocalContext: true,
    contextValidationStatus: "FRESH",
    localDocumentSnapshotId: "snap-1",
    localDocumentSnapshotStale: false
  });
  assert.deepEqual(fresh.warnings, []);
});

test("buildContextUsed carries snapshot ids, status, and summary warnings only", () => {
  const contextUsed = buildContextUsed(
    {
      localDocumentSnapshotId: "snap-9",
      repositorySnapshotId: "repo-9",
      contextValidationStatus: "FRESH",
      contextValidationSummary: { warnings: ["scan was partial"], rootNames: ["main-repo"] }
    },
    ["extra warning"]
  );
  assert.equal(contextUsed.localDocumentSnapshotId, "snap-9");
  assert.equal(contextUsed.repositorySnapshotId, "repo-9");
  assert.equal(contextUsed.contextValidationStatus, "FRESH");
  assert.deepEqual(contextUsed.warnings, ["scan was partial", "extra warning"]);
  assert.equal(Object.prototype.hasOwnProperty.call(contextUsed, "rootPath"), false);

  const empty = buildContextUsed({});
  assert.equal(empty.localDocumentSnapshotId, null);
  assert.equal(empty.contextValidationStatus, "NOT_REQUIRED");
  assert.deepEqual(empty.warnings, []);
});
