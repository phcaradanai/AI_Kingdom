import type { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { auditLog } from "./auditService.js";
import { ACTIVE_JOB_STATUSES } from "./automationJobService.js";

/**
 * commandPolicy that tells the runner to re-apply an already-approved patch and push it
 * to a safe `kingdom/job-*` branch without waiting for a second approval. Mirrors the
 * runner-side constant in apps/runner/src/sandboxPatchPolicy.ts.
 */
export const APPLY_APPROVED_PATCH_PUSH = "APPLY_APPROVED_PATCH_PUSH";

function err(message: string, name: string) {
  const e = new Error(message);
  e.name = name;
  return e;
}

/**
 * King-initiated, decoupled push of an ALREADY-APPROVED PatchArtifact.
 *
 * Creates a SANDBOX_PATCH automation job that carries the approved diff as an imported
 * patch and the APPLY_APPROVED_PATCH_PUSH policy, so a runner re-applies it to a fresh
 * safe branch and pushes it — but only when the server's ALLOW_BRANCH_PUSH setting is on.
 * Never merges, opens a PR, or deploys; PR creation remains a separate explicit action.
 */
export async function createApprovedPatchPushJob(patchArtifactId: string, userId: string) {
  const artifact = await prisma.patchArtifact.findUnique({
    where: { id: patchArtifactId },
    include: { workOrder: true }
  });
  if (!artifact) throw err("Patch artifact not found", "NotFoundError");

  if (artifact.validationStatus !== "APPROVED") {
    throw err("Only an APPROVED patch artifact can be pushed to a branch.", "ConflictError");
  }
  if (artifact.branchPushed) {
    throw err("This patch has already been pushed to a branch.", "ConflictError");
  }
  if (!artifact.fullPatch || !artifact.fullPatch.trim()) {
    throw err("This patch artifact has no stored diff to apply.", "ConflictError");
  }
  if (artifact.fullPatchTruncated) {
    throw err("The stored diff was truncated and cannot be safely re-applied. Re-run the patch job to regenerate a full diff.", "ConflictError");
  }

  // Dedupe: don't queue a second apply-push job for the same artifact while one is active.
  const existing = await prisma.automationJob.findFirst({
    where: {
      workOrderId: artifact.workOrderId,
      commandPolicy: APPLY_APPROVED_PATCH_PUSH,
      status: { in: ACTIVE_JOB_STATUSES }
    }
  });
  if (existing) {
    throw err("An apply-and-push job for this work order is already active.", "ConflictError");
  }

  const job = await prisma.automationJob.create({
    data: {
      workOrderId: artifact.workOrderId,
      projectId: artifact.projectId,
      status: "QUEUED",
      mode: "SANDBOX_PATCH",
      commandPolicy: APPLY_APPROVED_PATCH_PUSH,
      importedPatch: artifact.fullPatch,
      importedPatchStatus: "PENDING",
      // The diff was already reviewed and approved; context re-validation is not required
      // to re-apply the exact approved bytes.
      contextRequired: false,
      contextValidationStatus: "NOT_REQUIRED",
      localDocumentSnapshotId: artifact.localDocumentSnapshotId,
      repositorySnapshotId: artifact.repositorySnapshotId,
      provenance: {
        source: "APPROVED_PATCH_PUSH",
        sourcePatchArtifactId: artifact.id,
        sourceBranchName: artifact.branchName ?? null
      } as Prisma.InputJsonValue,
      createdByUserId: userId
    }
  });

  await auditLog({
    userId,
    action: "approved_patch_push_queued",
    resourceType: "patch_artifact",
    resourceId: artifact.id,
    metadata: { jobId: job.id, workOrderId: artifact.workOrderId, riskLevel: artifact.riskLevel }
  }).catch(() => undefined);

  return job;
}
