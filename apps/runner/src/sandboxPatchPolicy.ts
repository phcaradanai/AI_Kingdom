/**
 * Pure policy helpers for the SANDBOX_PATCH no-push safety net (M17D-3).
 *
 * Auto-created Living Loop SANDBOX_PATCH jobs are tagged with
 * commandPolicy "SANDBOX_PATCH_NO_PUSH". This policy must block branch
 * push regardless of the server's ALLOW_BRANCH_PUSH setting.
 */

export const SANDBOX_PATCH_NO_PUSH = "SANDBOX_PATCH_NO_PUSH";

export interface BranchPushEligibilityInput {
  allowBranchPush: boolean;
  commandPolicy: string | null;
  branchName: string | null;
  hasArtifact: boolean;
}

export interface BranchPushEligibilityResult {
  attemptPush: boolean;
  reason?: string;
}

/** Decide whether the runner should even attempt a branch push for a job. */
export function evaluateBranchPushEligibility(input: BranchPushEligibilityInput): BranchPushEligibilityResult {
  if (!input.allowBranchPush) return { attemptPush: false, reason: "Branch push disabled" };
  if (!input.hasArtifact) return { attemptPush: false, reason: "No patch artifact" };
  if (!input.branchName) return { attemptPush: false, reason: "No branch name" };
  if (input.commandPolicy === SANDBOX_PATCH_NO_PUSH) {
    return { attemptPush: false, reason: "commandPolicy restricts branch push" };
  }
  return { attemptPush: true };
}

export interface ApprovalArtifactState {
  validationStatus: string;
  riskLevel: string;
}

/** Decide whether a patch can be pushed without explicit King approval. */
export function shouldPushWithoutApproval(artifact: ApprovalArtifactState): boolean {
  return artifact.riskLevel === "LOW" && artifact.validationStatus === "PENDING";
}

export interface FreshLocalContextInput {
  requireFreshLocalContext: boolean;
  localDocumentSnapshotId: string | null | undefined;
  localDocumentSnapshotStale: boolean | undefined;
}

export interface FreshLocalContextResult {
  proceed: boolean;
  reason?: string;
}

/**
 * M17E-1: when REQUIRE_FRESH_LOCAL_CONTEXT is enabled, a SANDBOX_PATCH job may
 * only run if its provenance carries a non-stale local document snapshot id.
 */
export function evaluateFreshLocalContext(input: FreshLocalContextInput): FreshLocalContextResult {
  if (!input.requireFreshLocalContext) return { proceed: true };
  if (!input.localDocumentSnapshotId) {
    return { proceed: false, reason: "No local document snapshot is recorded for this job's project." };
  }
  if (input.localDocumentSnapshotStale) {
    return { proceed: false, reason: "The local document snapshot for this job's project is stale." };
  }
  return { proceed: true };
}
