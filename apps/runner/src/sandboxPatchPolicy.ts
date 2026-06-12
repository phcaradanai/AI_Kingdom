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

// ── M17E-2: context binding policy ──────────────────────────────────────────────

export interface JobContextBindingInput {
  mode: string;
  requireFreshLocalContext: boolean;
  /** AutomationJob.contextValidationStatus delivered in the job payload (may be absent on legacy jobs). */
  contextValidationStatus: string | null | undefined;
  /** Legacy provenance fields, used as fallback when contextValidationStatus is absent. */
  localDocumentSnapshotId: string | null | undefined;
  localDocumentSnapshotStale: boolean | undefined;
}

export interface JobContextBindingResult {
  proceed: boolean;
  reason?: string;
  warnings: string[];
}

/**
 * M17E-2: SANDBOX_PATCH must refuse STALE/MISSING context when fresh local
 * context is required; VALIDATION_ONLY proceeds but carries warnings when the
 * context is PARTIAL, STALE, or MISSING.
 */
export function evaluateJobContextBinding(input: JobContextBindingInput): JobContextBindingResult {
  const status = input.contextValidationStatus ?? null;

  if (input.mode === "SANDBOX_PATCH") {
    if (input.requireFreshLocalContext) {
      if (status === "STALE") {
        return { proceed: false, reason: "Job context binding is STALE; the project's local docs changed or aged out since binding.", warnings: [] };
      }
      if (status === "MISSING") {
        return { proceed: false, reason: "Job context binding is MISSING; no project snapshot was bound to this job.", warnings: [] };
      }
      if (status === "PARTIAL") {
        return { proceed: false, reason: "Job context binding is PARTIAL; SANDBOX_PATCH requires FRESH project context.", warnings: [] };
      }
      if (!status || status === "NOT_REQUIRED") {
        // Legacy job payload — fall back to the M17E-1 provenance check.
        const legacy = evaluateFreshLocalContext({
          requireFreshLocalContext: input.requireFreshLocalContext,
          localDocumentSnapshotId: input.localDocumentSnapshotId,
          localDocumentSnapshotStale: input.localDocumentSnapshotStale
        });
        return { proceed: legacy.proceed, reason: legacy.reason, warnings: [] };
      }
    }
    return { proceed: true, warnings: [] };
  }

  // VALIDATION_ONLY / OBSERVE / PLAN_ONLY: never refuse, only warn.
  const warnings: string[] = [];
  if (status === "PARTIAL") warnings.push("Validation ran with PARTIAL project context; results may not reflect the full project state.");
  if (status === "STALE") warnings.push("Validation ran with STALE project context; re-scan local docs and re-validate before trusting results.");
  if (status === "MISSING") warnings.push("Validation ran without a bound project context snapshot.");
  return { proceed: true, warnings };
}

export interface ContextUsedJobFields {
  localDocumentSnapshotId?: string | null;
  repositorySnapshotId?: string | null;
  contextValidationStatus?: string | null;
  contextValidationSummary?: Record<string, unknown> | null;
}

/**
 * Builds the contextUsed payload recorded on the ImplementationReport.
 * Carries snapshot ids, status, and warnings only — never raw local root paths.
 */
export function buildContextUsed(job: ContextUsedJobFields, extraWarnings: string[] = []): Record<string, unknown> {
  const summary = job.contextValidationSummary ?? null;
  const summaryWarnings = summary && Array.isArray((summary as { warnings?: unknown }).warnings)
    ? ((summary as { warnings: unknown[] }).warnings.filter((w): w is string => typeof w === "string"))
    : [];
  return {
    localDocumentSnapshotId: job.localDocumentSnapshotId ?? null,
    repositorySnapshotId: job.repositorySnapshotId ?? null,
    contextValidationStatus: job.contextValidationStatus ?? "NOT_REQUIRED",
    warnings: [...summaryWarnings, ...extraWarnings]
  };
}
