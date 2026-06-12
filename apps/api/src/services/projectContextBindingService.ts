/**
 * Project context binding service (M17E-2).
 *
 * Binds WorkOrders, AutomationJobs, and PatchArtifacts to the exact local document
 * snapshot and repository snapshot they used, so agents never plan or patch against
 * unknown project state. Binding summaries carry snapshot ids and content hashes only —
 * never raw secrets and never raw local root paths.
 */

import type { AutomationJobMode, ContextValidationStatus, Prisma, WorkOrder } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { auditLog } from "./auditService.js";
import {
  detectLocalDocsChangedSinceSnapshot,
  getLatestLocalDocumentSnapshot,
  listLocalDocumentRoots
} from "./localDocumentAccessService.js";
import { getLatestSnapshot as getLatestRepositorySnapshot } from "./repositoryScanService.js";

export type ContextBindingStatusValue = "FRESH" | "STALE" | "MISSING" | "PARTIAL";

export type ContextSkipToken = "missing" | "stale" | "partial" | "project_missing" | "local_docs_changed";

export type ProjectContextBinding = {
  status: ContextBindingStatusValue;
  projectId: string;
  localDocumentSnapshotId: string | null;
  repositorySnapshotId: string | null;
  localSnapshotScannedAt: string | null;
  repositoryCommitSha: string | null;
  repositoryBranch: string | null;
  detectedStack: string[];
  packageScripts: Record<string, string>;
  riskZones: { relativePath: string; riskLevel: string; reason: string }[];
  importantDocs: string[];
  rootIds: string[];
  rootNames: string[];
  rootPathHashes: string[];
  localDocsChanged: boolean;
  warnings: string[];
};

function toMeta(o: Record<string, unknown>): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(o));
}

/**
 * Computes the current context binding for a project. Read-only — never mutates
 * snapshots or work orders, so it is safe to call from GET routes.
 */
export async function getProjectContextBinding(projectId: string): Promise<ProjectContextBinding> {
  const [roots, snapshot, repoSnapshot] = await Promise.all([
    listLocalDocumentRoots(projectId),
    getLatestLocalDocumentSnapshot(projectId),
    getLatestRepositorySnapshot(projectId)
  ]);

  const warnings: string[] = [];
  let status: ContextBindingStatusValue;
  let localDocsChanged = false;

  if (roots.length === 0) {
    status = "PARTIAL";
    warnings.push("No Local Document Root is configured for this project; only partial context is available.");
  } else if (!snapshot) {
    status = "MISSING";
    warnings.push("No local docs snapshot has been scanned yet. Run a local docs scan.");
  } else if (snapshot.scanStatus === "FAILED") {
    status = "MISSING";
    warnings.push("The most recent local docs scan failed. Fix the root and re-scan.");
  } else if (snapshot.isStale) {
    status = "STALE";
    warnings.push("The local docs snapshot is stale. Run a fresh scan before patching.");
  } else {
    const changed = await detectLocalDocsChangedSinceSnapshot(projectId).catch(() => ({ changed: false as const }));
    if (changed.changed) {
      status = "STALE";
      localDocsChanged = true;
      warnings.push(
        `Local docs changed since the last scan (${"relativePath" in changed && changed.relativePath ? changed.relativePath : "a tracked file"}). Re-scan before patching.`
      );
    } else if (snapshot.scanStatus === "PARTIAL") {
      status = "PARTIAL";
      warnings.push("The local docs snapshot is partial (scan hit size limits); context may be incomplete.");
    } else {
      status = "FRESH";
    }
  }

  if (!repoSnapshot) {
    warnings.push("No repository snapshot is available for this project.");
  }

  return {
    status,
    projectId,
    localDocumentSnapshotId: snapshot?.id ?? null,
    repositorySnapshotId: repoSnapshot?.id ?? null,
    localSnapshotScannedAt: snapshot?.scannedAt ?? null,
    repositoryCommitSha: null,
    repositoryBranch: repoSnapshot?.branch ?? null,
    detectedStack: snapshot?.detectedStack ?? [],
    packageScripts: snapshot?.packageScripts ?? {},
    riskZones: snapshot?.riskZones ?? [],
    importantDocs: (snapshot?.importantFiles ?? []).map((f) => f.relativePath),
    rootIds: roots.map((r) => r.id),
    rootNames: roots.map((r) => r.name),
    rootPathHashes: roots.map((r) => r.rootPathHash),
    localDocsChanged,
    warnings
  };
}

/** Spec-shaped binding summary stored on WorkOrder.contextBindingSummary. */
export function buildContextBindingSummary(binding: ProjectContextBinding): Record<string, unknown> {
  return {
    projectId: binding.projectId,
    localDocumentSnapshotId: binding.localDocumentSnapshotId,
    repositorySnapshotId: binding.repositorySnapshotId,
    localSnapshotScannedAt: binding.localSnapshotScannedAt,
    repositoryCommitSha: binding.repositoryCommitSha,
    repositoryBranch: binding.repositoryBranch,
    detectedStack: binding.detectedStack,
    packageScripts: binding.packageScripts,
    riskZones: binding.riskZones,
    importantDocs: binding.importantDocs,
    rootNames: binding.rootNames,
    warnings: binding.warnings
  };
}

/** Provenance: snapshot/root ids and path hashes only — no raw root paths, no secrets. */
export function buildContextBindingProvenance(binding: ProjectContextBinding, boundAt: Date): Record<string, unknown> {
  return {
    source: "PROJECT_CONTEXT_BINDING",
    boundAt: boundAt.toISOString(),
    rootIds: binding.rootIds,
    rootNames: binding.rootNames,
    rootPathHashes: binding.rootPathHashes,
    snapshotIds: {
      localDocumentSnapshotId: binding.localDocumentSnapshotId,
      repositorySnapshotId: binding.repositorySnapshotId
    }
  };
}

export type BindContextResult = {
  workOrder: WorkOrder;
  binding: ProjectContextBinding | null;
};

/**
 * Binds the latest local document + repository snapshots to a work order and
 * records status, summary, and provenance. Safe to call on create/update —
 * a work order without a project is bound as MISSING with a warning.
 */
export async function bindFreshContextToWorkOrder(
  workOrderId: string,
  options: { userId?: string | null } = {}
): Promise<BindContextResult> {
  const workOrder = await prisma.workOrder.findUnique({ where: { id: workOrderId } });
  if (!workOrder) {
    const err = new Error("WorkOrder not found");
    err.name = "NotFoundError";
    throw err;
  }

  const boundAt = new Date();

  if (!workOrder.projectId) {
    const updated = await prisma.workOrder.update({
      where: { id: workOrderId },
      data: {
        localDocumentSnapshotId: null,
        repositorySnapshotId: null,
        contextBoundAt: boundAt,
        contextBindingStatus: "MISSING",
        contextBindingSummary: toMeta({ warnings: ["Work order has no linked project; context cannot be bound."] }),
        contextBindingProvenance: toMeta({ source: "PROJECT_CONTEXT_BINDING", boundAt: boundAt.toISOString(), rootIds: [], snapshotIds: {} })
      }
    });
    await auditLog({
      userId: options.userId ?? null,
      action: "work_order_context_bound",
      resourceType: "work_order",
      resourceId: workOrderId,
      metadata: toMeta({ status: "MISSING", reason: "no_project" })
    }).catch(() => undefined);
    return { workOrder: updated, binding: null };
  }

  const binding = await getProjectContextBinding(workOrder.projectId);

  const updated = await prisma.workOrder.update({
    where: { id: workOrderId },
    data: {
      localDocumentSnapshotId: binding.localDocumentSnapshotId,
      repositorySnapshotId: binding.repositorySnapshotId,
      contextBoundAt: boundAt,
      contextBindingStatus: binding.status,
      contextBindingSummary: toMeta(buildContextBindingSummary(binding)),
      contextBindingProvenance: toMeta(buildContextBindingProvenance(binding, boundAt))
    }
  });

  await auditLog({
    userId: options.userId ?? null,
    action: "work_order_context_bound",
    resourceType: "work_order",
    resourceId: workOrderId,
    metadata: toMeta({
      status: binding.status,
      projectId: binding.projectId,
      localDocumentSnapshotId: binding.localDocumentSnapshotId,
      repositorySnapshotId: binding.repositorySnapshotId,
      rootPathHashes: binding.rootPathHashes
    })
  }).catch(() => undefined);

  return { workOrder: updated, binding };
}

/** Marks a work order's bound context STALE (e.g. local docs changed after binding). */
export async function markWorkOrderContextStale(workOrderId: string, reason: string, userId?: string | null): Promise<WorkOrder> {
  const workOrder = await prisma.workOrder.findUnique({ where: { id: workOrderId } });
  if (!workOrder) {
    const err = new Error("WorkOrder not found");
    err.name = "NotFoundError";
    throw err;
  }

  const existingSummary =
    workOrder.contextBindingSummary && typeof workOrder.contextBindingSummary === "object" && !Array.isArray(workOrder.contextBindingSummary)
      ? (workOrder.contextBindingSummary as Record<string, unknown>)
      : {};

  const updated = await prisma.workOrder.update({
    where: { id: workOrderId },
    data: {
      contextBindingStatus: "STALE",
      contextBindingSummary: toMeta({ ...existingSummary, staleReason: reason, markedStaleAt: new Date().toISOString() })
    }
  });

  await auditLog({
    userId: userId ?? null,
    action: "work_order_context_marked_stale",
    resourceType: "work_order",
    resourceId: workOrderId,
    metadata: toMeta({ reason })
  }).catch(() => undefined);

  return updated;
}

export type ContextValidationOutcome = {
  ok: boolean;
  status: ContextValidationStatus;
  contextRequired: boolean;
  reason?: string;
  skipToken?: ContextSkipToken;
  warnings: string[];
  binding: ProjectContextBinding | null;
  workOrderId: string;
  projectId: string | null;
};

/**
 * Validates project context before an automation job is created.
 *
 * - SANDBOX_PATCH requires a project linkage and FRESH local context; STALE,
 *   MISSING, or PARTIAL context refuses the job.
 * - VALIDATION_ONLY (and OBSERVE/PLAN_ONLY) may proceed with PARTIAL/STALE/MISSING
 *   context, but the outcome carries warnings that must be surfaced.
 */
export async function validateContextForAutomationJob(workOrderId: string, mode: AutomationJobMode): Promise<ContextValidationOutcome> {
  const workOrder = await prisma.workOrder.findUnique({ where: { id: workOrderId }, select: { id: true, projectId: true } });
  if (!workOrder) {
    const err = new Error("WorkOrder not found");
    err.name = "NotFoundError";
    throw err;
  }

  const contextRequired = mode === "SANDBOX_PATCH";

  if (!workOrder.projectId) {
    if (contextRequired) {
      return {
        ok: false,
        status: "MISSING",
        contextRequired,
        reason: "SANDBOX_PATCH requires the work order to be linked to a project with fresh local document context.",
        skipToken: "project_missing",
        warnings: [],
        binding: null,
        workOrderId,
        projectId: null
      };
    }
    return {
      ok: true,
      status: "NOT_REQUIRED",
      contextRequired,
      warnings: ["Work order has no linked project; no local context was attached."],
      binding: null,
      workOrderId,
      projectId: null
    };
  }

  const binding = await getProjectContextBinding(workOrder.projectId);

  if (contextRequired && binding.status !== "FRESH") {
    const skipToken: ContextSkipToken = binding.localDocsChanged
      ? "local_docs_changed"
      : binding.status === "STALE"
        ? "stale"
        : binding.status === "PARTIAL"
          ? "partial"
          : "missing";
    return {
      ok: false,
      status: binding.status,
      contextRequired,
      reason: `SANDBOX_PATCH refused: project context is ${binding.status}. ${binding.warnings.join(" ")}`.trim(),
      skipToken,
      warnings: binding.warnings,
      binding,
      workOrderId,
      projectId: workOrder.projectId
    };
  }

  return {
    ok: true,
    status: binding.status,
    contextRequired,
    warnings: binding.warnings,
    binding,
    workOrderId,
    projectId: workOrder.projectId
  };
}

/** Builds the contextValidationSummary JSON stored on AutomationJob. */
export function buildContextValidationSummary(outcome: ContextValidationOutcome): Record<string, unknown> {
  return {
    status: outcome.status,
    contextRequired: outcome.contextRequired,
    warnings: outcome.warnings,
    validatedAt: new Date().toISOString(),
    ...(outcome.binding ? buildContextBindingSummary(outcome.binding) : { projectId: outcome.projectId })
  };
}

/** Attaches a validated context binding to an automation job. */
export async function attachContextToAutomationJob(automationJobId: string, outcome: ContextValidationOutcome) {
  return prisma.automationJob.update({
    where: { id: automationJobId },
    data: {
      localDocumentSnapshotId: outcome.binding?.localDocumentSnapshotId ?? null,
      repositorySnapshotId: outcome.binding?.repositorySnapshotId ?? null,
      contextRequired: outcome.contextRequired,
      contextValidationStatus: outcome.status,
      contextValidationSummary: toMeta(buildContextValidationSummary(outcome))
    }
  });
}

function mapValidationToBindingStatus(status: ContextValidationStatus): ContextBindingStatusValue {
  if (status === "NOT_REQUIRED") return "MISSING";
  return status;
}

/**
 * Attaches base context to a patch artifact from its automation job's recorded
 * context binding. Called server-side when the runner submits a patch.
 */
export async function attachContextToPatchArtifact(
  patchArtifactId: string,
  job: {
    id: string;
    localDocumentSnapshotId: string | null;
    repositorySnapshotId: string | null;
    contextValidationStatus: ContextValidationStatus;
    contextValidationSummary: Prisma.JsonValue;
  }
) {
  const baseContextStatus = mapValidationToBindingStatus(job.contextValidationStatus);
  return prisma.patchArtifact.update({
    where: { id: patchArtifactId },
    data: {
      localDocumentSnapshotId: job.localDocumentSnapshotId,
      repositorySnapshotId: job.repositorySnapshotId,
      baseContextStatus,
      baseContextProvenance: toMeta({
        source: "PROJECT_CONTEXT_BINDING",
        automationJobId: job.id,
        localDocumentSnapshotId: job.localDocumentSnapshotId,
        repositorySnapshotId: job.repositorySnapshotId,
        contextValidationStatus: job.contextValidationStatus,
        contextValidationSummary: job.contextValidationSummary ?? null,
        attachedAt: new Date().toISOString()
      })
    }
  });
}

/**
 * Human-readable explanation of a project's (and optionally a work order's)
 * context binding state. Read-only.
 */
export async function explainContextBindingStatus(
  projectId: string,
  workOrderId?: string
): Promise<{ status: ContextBindingStatusValue; lines: string[]; binding: ProjectContextBinding }> {
  const binding = await getProjectContextBinding(projectId);
  const lines: string[] = [];

  lines.push(`Project context is ${binding.status}.`);
  if (binding.localDocumentSnapshotId) {
    lines.push(`Latest local docs snapshot: ${binding.localDocumentSnapshotId} (scanned ${binding.localSnapshotScannedAt ?? "unknown"}).`);
  } else {
    lines.push("No local docs snapshot is available.");
  }
  if (binding.repositorySnapshotId) {
    lines.push(`Latest repository snapshot: ${binding.repositorySnapshotId}.`);
  } else {
    lines.push("No repository snapshot is available.");
  }
  for (const warning of binding.warnings) lines.push(`Warning: ${warning}`);

  if (workOrderId) {
    const workOrder = await prisma.workOrder.findUnique({
      where: { id: workOrderId },
      select: { contextBindingStatus: true, contextBoundAt: true, localDocumentSnapshotId: true }
    });
    if (workOrder) {
      lines.push(
        `Work order binding is ${workOrder.contextBindingStatus}${workOrder.contextBoundAt ? ` (bound ${workOrder.contextBoundAt.toISOString()})` : " (never bound)"}.`
      );
      if (workOrder.localDocumentSnapshotId && binding.localDocumentSnapshotId && workOrder.localDocumentSnapshotId !== binding.localDocumentSnapshotId) {
        lines.push("Work order is bound to an older local docs snapshot than the latest scan; rebind to refresh.");
      }
    }
  }

  return { status: binding.status, lines, binding };
}
