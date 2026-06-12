/**
 * Patch artifact service.
 *
 * Manages PatchArtifact lifecycle: creation (runner-submitted), review (KING),
 * and branch/PR tracking. Server is the source of truth for risk and blocked-path detection.
 */

import { prisma } from "../db/prisma.js";
import { auditLog } from "./auditService.js";
import { detectBlockedPaths } from "./blockedPathService.js";
import { scoreRisk } from "./patchRiskService.js";
import { sanitizeLogOutput, redactSecrets } from "./secretRedactorService.js";
import { attachContextToPatchArtifact } from "./projectContextBindingService.js";

const DIFF_PREVIEW_MAX = 10_000;   // 10KB preview stored inline
const FULL_PATCH_MAX = 200_000;    // 200KB full patch stored inline

export type ValidationStatus = "PENDING" | "APPROVED" | "REJECTED" | "REVISION_REQUESTED";

export interface ValidationResult {
  command: string;
  exitCode: number;
  durationMs: number;
  output: string;
  success: boolean;
}

export interface CreatePatchArtifactInput {
  automationJobId: string;
  runnerId: string;
  title: string;
  summary: string;
  diffStat?: string | null;
  diffPreview?: string | null;
  fullPatch?: string | null;
  filesChanged: string[];
  validationResults?: ValidationResult[];
  branchName?: string | null;
}

export async function createPatchArtifact(input: CreatePatchArtifactInput) {
  const job = await prisma.automationJob.findFirst({
    where: { id: input.automationJobId, runnerId: input.runnerId }
  });
  if (!job) {
    const err = new Error("AutomationJob not found or not owned by this runner");
    err.name = "NotFoundError";
    throw err;
  }

  // Server-side blocked-path detection — never trust runner alone
  const blocked = detectBlockedPaths(input.filesChanged);
  if (blocked.length > 0) {
    await auditLog({
      action: "unsafe_patch_blocked",
      resourceType: "AutomationJob",
      resourceId: job.id,
      metadata: { runnerId: input.runnerId, blockedPaths: blocked }
    }).catch(() => undefined);
    await auditLog({
      action: "blocked_path_detected",
      resourceType: "AutomationJob",
      resourceId: job.id,
      metadata: { blockedPaths: blocked }
    }).catch(() => undefined);
    const err = new Error(`Patch rejected: blocked paths detected: ${blocked.join(", ")}`);
    err.name = "BlockedPathError";
    throw err;
  }

  // Secret redaction on diff content — never store raw output
  const sanitizedDiffPreview = input.diffPreview
    ? sanitizeAndCap(input.diffPreview, DIFF_PREVIEW_MAX)
    : null;

  const rawFull = input.fullPatch ? redactSecrets(input.fullPatch) : null;
  const fullPatchTruncated = rawFull !== null && rawFull.length > FULL_PATCH_MAX;
  const fullPatch = rawFull !== null
    ? (fullPatchTruncated ? rawFull.slice(0, FULL_PATCH_MAX) + "\n...[patch truncated]" : rawFull)
    : null;

  const riskLevel = scoreRisk(input.filesChanged);

  let artifact = await prisma.patchArtifact.create({
    data: {
      automationJobId: input.automationJobId,
      workOrderId: job.workOrderId,
      projectId: job.projectId,
      title: redactSecrets(input.title),
      summary: redactSecrets(input.summary),
      diffStat: input.diffStat ? redactSecrets(input.diffStat) : null,
      diffPreview: sanitizedDiffPreview,
      fullPatch,
      fullPatchTruncated,
      filesChanged: input.filesChanged,
      riskLevel,
      validationStatus: "PENDING",
      validationResults: input.validationResults
        ? (input.validationResults as never)
        : undefined,
      branchName: input.branchName ?? null
    },
    include: artifactInclude
  });

  // M17E-2: record exactly which snapshots this patch was built against.
  await attachContextToPatchArtifact(artifact.id, job);
  artifact = (await prisma.patchArtifact.findUniqueOrThrow({ where: { id: artifact.id }, include: artifactInclude }));

  await auditLog({
    action: "patch_artifact_created",
    resourceType: "PatchArtifact",
    resourceId: artifact.id,
    metadata: {
      automationJobId: job.id,
      workOrderId: job.workOrderId,
      riskLevel,
      filesChanged: input.filesChanged.length,
      baseContextStatus: artifact.baseContextStatus,
      localDocumentSnapshotId: artifact.localDocumentSnapshotId,
      repositorySnapshotId: artifact.repositorySnapshotId
    }
  }).catch(() => undefined);

  return artifact;
}

export async function approvePatchArtifact(artifactId: string, userId: string, reviewNote?: string) {
  const artifact = await prisma.patchArtifact.findUnique({ where: { id: artifactId } });
  if (!artifact) {
    const err = new Error("PatchArtifact not found");
    err.name = "NotFoundError";
    throw err;
  }

  const updated = await prisma.patchArtifact.update({
    where: { id: artifactId },
    data: {
      validationStatus: "APPROVED",
      reviewedByUserId: userId,
      reviewNote: reviewNote ?? null
    },
    include: artifactInclude
  });

  await auditLog({
    userId,
    action: "patch_review_approved",
    resourceType: "PatchArtifact",
    resourceId: artifactId,
    metadata: { automationJobId: artifact.automationJobId, riskLevel: artifact.riskLevel }
  }).catch(() => undefined);

  return updated;
}

export async function rejectPatchArtifact(artifactId: string, userId: string, reviewNote?: string) {
  const artifact = await prisma.patchArtifact.findUnique({ where: { id: artifactId } });
  if (!artifact) {
    const err = new Error("PatchArtifact not found");
    err.name = "NotFoundError";
    throw err;
  }

  const updated = await prisma.patchArtifact.update({
    where: { id: artifactId },
    data: {
      validationStatus: "REJECTED",
      reviewedByUserId: userId,
      reviewNote: reviewNote ?? null
    },
    include: artifactInclude
  });

  await auditLog({
    userId,
    action: "patch_review_rejected",
    resourceType: "PatchArtifact",
    resourceId: artifactId,
    metadata: { automationJobId: artifact.automationJobId, riskLevel: artifact.riskLevel }
  }).catch(() => undefined);

  return updated;
}

export async function requestRevision(artifactId: string, userId: string, reviewNote: string) {
  const artifact = await prisma.patchArtifact.findUnique({ where: { id: artifactId } });
  if (!artifact) {
    const err = new Error("PatchArtifact not found");
    err.name = "NotFoundError";
    throw err;
  }

  const updated = await prisma.patchArtifact.update({
    where: { id: artifactId },
    data: {
      validationStatus: "REVISION_REQUESTED",
      reviewedByUserId: userId,
      reviewNote
    },
    include: artifactInclude
  });

  return updated;
}

export async function markBranchPushed(artifactId: string, runnerId: string, branchName: string) {
  // Verify runner owns the job
  const artifact = await prisma.patchArtifact.findUnique({
    where: { id: artifactId },
    include: { automationJob: true }
  });
  if (!artifact || artifact.automationJob.runnerId !== runnerId) {
    const err = new Error("PatchArtifact not found or not owned by this runner");
    err.name = "NotFoundError";
    throw err;
  }

  const updated = await prisma.patchArtifact.update({
    where: { id: artifactId },
    data: { branchPushed: true, branchName },
    include: artifactInclude
  });

  await auditLog({
    action: "branch_pushed",
    resourceType: "PatchArtifact",
    resourceId: artifactId,
    metadata: { automationJobId: artifact.automationJobId, branchName, runnerId }
  }).catch(() => undefined);

  return updated;
}

export async function markPrCreated(artifactId: string, userId: string, prUrl: string) {
  const artifact = await prisma.patchArtifact.findUnique({ where: { id: artifactId } });
  if (!artifact) {
    const err = new Error("PatchArtifact not found");
    err.name = "NotFoundError";
    throw err;
  }

  const updated = await prisma.patchArtifact.update({
    where: { id: artifactId },
    data: { prUrl },
    include: artifactInclude
  });

  await auditLog({
    userId,
    action: "pr_created",
    resourceType: "PatchArtifact",
    resourceId: artifactId,
    metadata: { automationJobId: artifact.automationJobId, prUrl }
  }).catch(() => undefined);

  return updated;
}

export async function getPatchArtifact(artifactId: string) {
  return prisma.patchArtifact.findUnique({
    where: { id: artifactId },
    include: artifactInclude
  });
}

export async function listPatchArtifacts(filters?: {
  automationJobId?: string;
  workOrderId?: string;
  projectId?: string;
  validationStatus?: ValidationStatus;
}) {
  return prisma.patchArtifact.findMany({
    where: {
      ...(filters?.automationJobId ? { automationJobId: filters.automationJobId } : {}),
      ...(filters?.workOrderId ? { workOrderId: filters.workOrderId } : {}),
      ...(filters?.projectId ? { projectId: filters.projectId } : {}),
      ...(filters?.validationStatus ? { validationStatus: filters.validationStatus } : {})
    },
    include: artifactInclude,
    orderBy: { createdAt: "desc" }
  });
}

function sanitizeAndCap(text: string, max: number): string {
  const redacted = sanitizeLogOutput(text);
  if (redacted.length <= max) return redacted;
  return redacted.slice(0, max) + "\n...[diff preview truncated]";
}

const artifactInclude = {
  automationJob: { select: { id: true, status: true, workOrderId: true } },
  workOrder: { select: { id: true, title: true } },
  reviewedByUser: { select: { id: true, displayName: true } }
} as const;
