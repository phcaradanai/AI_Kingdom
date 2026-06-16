export const IMPORTED_PATCH_STATUSES = [
  "PENDING",
  "CHECK_FAILED",
  "APPLIED_IN_SANDBOX",
  "VALIDATED",
  "VALIDATION_FAILED",
  "NO_CHANGES"
] as const;

export type ImportedPatchStatus = typeof IMPORTED_PATCH_STATUSES[number];

/**
 * Determines the terminal importedPatchStatus after sandbox execution.
 *
 * - applied=false  → CHECK_FAILED (git apply failed; call at the failure point, not here)
 * - emptyPatch     → NO_CHANGES   (patch applied but produced no file diff)
 * - allValidationPassed → VALIDATED or VALIDATION_FAILED based on runValidation() results
 */
export function decideImportedPatchStatus(opts: {
  applied: boolean;
  emptyPatch: boolean;
  allValidationPassed: boolean;
}): ImportedPatchStatus {
  if (!opts.applied) return "CHECK_FAILED";
  if (opts.emptyPatch) return "NO_CHANGES";
  return opts.allValidationPassed ? "VALIDATED" : "VALIDATION_FAILED";
}
