/**
 * Server-side validation and storage for externally-imported unified diffs.
 *
 * Security invariants:
 * - Secrets detected in the patch text are a hard rejection (not silently
 *   redacted), because applying a redacted patch would corrupt the code.
 *   The display copy stored separately can be redacted; the apply copy must
 *   be clean or refused.
 * - Every file path mentioned in the diff is extracted and run through the
 *   blocked-path rules.
 * - Paths containing ".." (traversal) or leading "/" (absolute) are rejected.
 * - Symlink-creating hunks (new mode 120000) are rejected.
 * - Patch is subject to a hard size cap before any parse work.
 */

import { prisma } from "../db/prisma.js";
import { auditLog } from "./auditService.js";
import { detectBlockedPaths } from "./blockedPathService.js";
import { containsSecrets } from "./secretRedactorService.js";

const MAX_PATCH_BYTES = 256_000; // 250 KB
const MAX_FILES_CHANGED = 50;

export const IMPORTED_PATCH_STATUSES = [
  "PENDING",
  "CHECK_FAILED",
  "APPLIED_IN_SANDBOX",
  "VALIDATED",
  "VALIDATION_FAILED",
  "NO_CHANGES"
] as const;

export type ImportedPatchStatus = typeof IMPORTED_PATCH_STATUSES[number];

export type PatchValidationErrorCode = "INVALID_PATCH" | "UNSAFE_PATCH";

export interface PatchValidationResult {
  valid: boolean;
  reason?: PatchValidationErrorCode;
  error?: string;
  paths?: string[];
}

export type ImportPatchErrorCode = "NOT_FOUND" | "INVALID_STATUS" | "INVALID_PATCH" | "UNSAFE_PATCH";

export type ImportPatchResult =
  | { success: true }
  | { success: false; code: ImportPatchErrorCode; error: string };

/**
 * Extracts every affected file path from a unified diff.
 *
 * Covers all path-bearing line types:
 *   diff --git a/X b/Y
 *   --- a/X
 *   +++ b/X
 *   rename from X / rename to Y
 *   copy from X / copy to Y
 *
 * Returns de-duplicated list of unique paths (stripping a/ b/ prefixes).
 */
export function extractPathsFromPatch(patchText: string): string[] {
  const paths = new Set<string>();

  const stripPrefix = (p: string): string => {
    if (p.startsWith("a/") || p.startsWith("b/")) return p.slice(2);
    return p;
  };

  for (const line of patchText.split("\n")) {
    // diff --git a/X b/Y
    const gitDiff = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (gitDiff) {
      if (gitDiff[1]) paths.add(stripPrefix(`a/${gitDiff[1]}`));
      if (gitDiff[2]) paths.add(stripPrefix(`b/${gitDiff[2]}`));
      continue;
    }
    // --- a/X or --- /dev/null
    const minus = line.match(/^--- (.+)$/);
    if (minus && minus[1] && minus[1] !== "/dev/null") {
      paths.add(stripPrefix(minus[1]));
      continue;
    }
    // +++ b/X or +++ /dev/null
    const plus = line.match(/^\+\+\+ (.+)$/);
    if (plus && plus[1] && plus[1] !== "/dev/null") {
      paths.add(stripPrefix(plus[1]));
      continue;
    }
    // rename from X / rename to Y
    const renameFrom = line.match(/^rename from (.+)$/);
    if (renameFrom && renameFrom[1]) { paths.add(renameFrom[1]); continue; }
    const renameTo = line.match(/^rename to (.+)$/);
    if (renameTo && renameTo[1]) { paths.add(renameTo[1]); continue; }
    // copy from X / copy to Y
    const copyFrom = line.match(/^copy from (.+)$/);
    if (copyFrom && copyFrom[1]) { paths.add(copyFrom[1]); continue; }
    const copyTo = line.match(/^copy to (.+)$/);
    if (copyTo && copyTo[1]) { paths.add(copyTo[1]); }
  }

  return [...paths];
}

export function validateImportedPatch(patchText: string): PatchValidationResult {
  if (!patchText || !patchText.trim()) {
    return { valid: false, reason: "INVALID_PATCH", error: "Patch text is empty" };
  }

  if (Buffer.byteLength(patchText, "utf8") > MAX_PATCH_BYTES) {
    return { valid: false, reason: "INVALID_PATCH", error: `Patch exceeds maximum size (${MAX_PATCH_BYTES} bytes)` };
  }

  // Reject symlink-creating hunks
  if (/^new mode 120000$/m.test(patchText)) {
    return { valid: false, reason: "UNSAFE_PATCH", error: "Patch contains a symlink-creating hunk (new mode 120000) — rejected" };
  }

  const paths = extractPathsFromPatch(patchText);

  // Reject path traversal or absolute paths
  for (const p of paths) {
    if (p.includes("..") || p.startsWith("/")) {
      return { valid: false, reason: "UNSAFE_PATCH", error: `Patch contains an unsafe path: ${p}` };
    }
  }

  if (paths.length > MAX_FILES_CHANGED) {
    return { valid: false, reason: "INVALID_PATCH", error: `Patch touches too many files (${paths.length} > ${MAX_FILES_CHANGED})` };
  }

  const blocked = detectBlockedPaths(paths);
  if (blocked.length > 0) {
    return { valid: false, reason: "UNSAFE_PATCH", error: `Patch touches blocked paths: ${blocked.join(", ")}` };
  }

  // Reject patches that appear to contain secrets (applying a redacted patch would corrupt code)
  if (containsSecrets(patchText)) {
    return { valid: false, reason: "UNSAFE_PATCH", error: "Patch appears to contain secrets or credentials — remove them and re-import" };
  }

  return { valid: true, paths };
}

export async function importPatch(
  jobId: string,
  patchText: string,
  userId: string
): Promise<ImportPatchResult> {
  // Gate on job status — only QUEUED jobs can accept a patch
  const job = await prisma.automationJob.findUnique({ where: { id: jobId } });
  if (!job) {
    return { success: false, code: "NOT_FOUND", error: "Automation job not found" };
  }
  if (job.status !== "QUEUED") {
    return {
      success: false,
      code: "INVALID_STATUS",
      error: "Patch can only be imported before approval. Cancel/recreate the job or import the patch before approving."
    };
  }

  const validation = validateImportedPatch(patchText);
  if (!validation.valid) {
    return { success: false, code: validation.reason ?? "INVALID_PATCH", error: validation.error ?? "Invalid patch" };
  }

  await prisma.automationJob.update({
    where: { id: jobId },
    data: {
      importedPatch: patchText,
      importedPatchStatus: "PENDING"
    }
  });

  await auditLog({
    action: "automation_job_patch_imported",
    resourceType: "AutomationJob",
    resourceId: jobId,
    userId,
    metadata: {
      filesCount: validation.paths?.length ?? 0,
      patchBytes: Buffer.byteLength(patchText, "utf8")
    }
  }).catch(() => undefined);

  return { success: true };
}
