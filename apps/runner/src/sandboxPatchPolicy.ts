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
