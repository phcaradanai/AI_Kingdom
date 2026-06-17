/**
 * WorkOrder lifecycle reconciliation service (M18A-2).
 *
 * Detects active WorkOrders that are already completed by evidence (implementation
 * reports, handoff briefs, automation jobs, PROJECT_STATUS.md) and archives them,
 * or repairs their context binding when evidence is inconclusive but a project is
 * linked. Work orders with no project and no evidence are returned as SKIPPED.
 *
 * Safety: no runner execution, no automation job creation, no patch execution,
 * no branch push, no PR creation, no merge or deploy.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "../db/prisma.js";
import { repairWorkOrderContext } from "./projectContextBindingService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// apps/api/src/services → apps/api/src → apps/api → apps → repo root
const DEFAULT_PROJECT_STATUS_PATH = path.resolve(__dirname, "../../../../PROJECT_STATUS.md");

export type ReconcileAction = "ARCHIVED" | "CONTEXT_REPAIRED" | "SKIPPED";

export type ReconcileWorkOrderResult = {
  workOrderId: string;
  title: string;
  action: ReconcileAction;
  reason: string;
  evidenceFound: string[];
  previousStatus: string;
  newStatus: string | null;
};

export type ReconcileContextWarningsResult = {
  totalInspected: number;
  archived: number;
  contextRepaired: number;
  skipped: number;
  results: ReconcileWorkOrderResult[];
};

/** Extract the leading milestone code from a title. E.g., "M16B Planner Agent" → "M16B" */
export function extractMilestoneCode(title: string): string | null {
  const match = title.match(/\bM(\d+)([A-Z])?(?:-(\d+))?\b/i);
  return match ? match[0].toUpperCase() : null;
}

/**
 * Check whether PROJECT_STATUS.md confirms a milestone code is complete.
 * Uses word boundary + negative lookahead to avoid substring false positives:
 * "M17E" won't match "M17E-2 (complete)" since -2 follows.
 */
export function isMilestoneConfirmedInStatus(code: string, statusContent: string): boolean {
  const escaped = code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`\\b${escaped}(?!-\\d).*\\(complete\\)`, "im");
  return pattern.test(statusContent);
}

async function readProjectStatusContent(overridePath?: string): Promise<string | null> {
  try {
    return await fs.readFile(overridePath ?? DEFAULT_PROJECT_STATUS_PATH, "utf8");
  } catch {
    return null;
  }
}

function buildEvidenceList(
  hasPassedReport: boolean,
  hasCompletionHandoff: boolean,
  hasCompletedJob: boolean,
  isMilestoneConfirmed: boolean
): string[] {
  const evidence: string[] = [];
  if (isMilestoneConfirmed) evidence.push("PROJECT_STATUS.md confirms milestone complete");
  if (hasPassedReport) evidence.push("ImplementationReport with no remaining work and PASSED tests");
  if (hasCompletionHandoff) evidence.push("HandoffBrief with completion status and no remaining steps");
  if (hasCompletedJob) evidence.push("AutomationJob completed (non-validation)");
  return evidence;
}

export async function reconcileContextWarnings(options?: {
  /** Override for testing — pass PROJECT_STATUS.md content directly */
  projectStatusContent?: string;
  /** Override for testing — path to PROJECT_STATUS.md */
  projectStatusPath?: string;
}): Promise<ReconcileContextWarningsResult> {
  const statusContent =
    options?.projectStatusContent ??
    (await readProjectStatusContent(options?.projectStatusPath));

  // Only inspect READY/IN_PROGRESS WOs with MISSING/STALE context — same scope as context health warnings
  const workOrders = await prisma.workOrder.findMany({
    where: {
      status: { in: ["READY", "IN_PROGRESS"] },
      contextBindingStatus: { in: ["MISSING", "STALE"] }
    },
    select: {
      id: true,
      title: true,
      status: true,
      projectId: true,
      contextBindingStatus: true,
      implementationReports: {
        select: { remainingWork: true, testResult: true }
      },
      handoffBriefs: {
        select: { currentStatus: true, nextSteps: true }
      },
      automationJobs: {
        select: { status: true, mode: true }
      }
    }
  });

  const results: ReconcileWorkOrderResult[] = [];
  let archived = 0;
  let contextRepaired = 0;
  let skipped = 0;

  for (const wo of workOrders) {
    const milestoneCode = extractMilestoneCode(wo.title);
    const isMilestoneConfirmed =
      milestoneCode != null && statusContent != null
        ? isMilestoneConfirmedInStatus(milestoneCode, statusContent)
        : false;

    const hasPassedReport = wo.implementationReports.some(
      (r) => r.testResult === "PASSED" && r.remainingWork.length === 0
    );

    const hasCompletionHandoff = wo.handoffBriefs.some((h) => {
      const completionSignal = /\b(complete|done|finished|delivered)\b/i.test(h.currentStatus ?? "");
      const noRemainingSteps = h.nextSteps.length === 0;
      return completionSignal && noRemainingSteps;
    });

    const hasCompletedJob = wo.automationJobs.some(
      (j) => j.status === "COMPLETED" && j.mode !== "VALIDATION_ONLY"
    );

    const evidence = buildEvidenceList(
      hasPassedReport,
      hasCompletionHandoff,
      hasCompletedJob,
      isMilestoneConfirmed
    );

    if (evidence.length > 0) {
      const archiveReason = `Archived by lifecycle reconciliation. Evidence: ${evidence.join("; ")}`;
      await prisma.workOrder.update({
        where: { id: wo.id },
        data: {
          status: "ARCHIVED",
          archiveReason,
          archivedAt: new Date(),
          workQuality: "COMPLETED_ARCHIVE"
        }
      });
      archived++;
      results.push({
        workOrderId: wo.id,
        title: wo.title,
        action: "ARCHIVED",
        reason: archiveReason,
        evidenceFound: evidence,
        previousStatus: wo.status,
        newStatus: "ARCHIVED"
      });
      continue;
    }

    if (!wo.projectId) {
      skipped++;
      results.push({
        workOrderId: wo.id,
        title: wo.title,
        action: "SKIPPED",
        reason: "No linked project and no completion evidence found",
        evidenceFound: [],
        previousStatus: wo.status,
        newStatus: null
      });
      continue;
    }

    // Try context repair as fallback
    const repair = await repairWorkOrderContext(wo.id).catch(() => null);
    if (repair && repair.status === "BOUND") {
      contextRepaired++;
      results.push({
        workOrderId: wo.id,
        title: wo.title,
        action: "CONTEXT_REPAIRED",
        reason: `Context rebound: ${repair.previousStatus} → ${repair.newStatus ?? "—"}`,
        evidenceFound: [],
        previousStatus: wo.status,
        newStatus: wo.status // status unchanged, only contextBindingStatus updated
      });
    } else {
      skipped++;
      results.push({
        workOrderId: wo.id,
        title: wo.title,
        action: "SKIPPED",
        reason: repair?.skipReason === "no_project"
          ? "No linked project"
          : "No completion evidence and context repair unavailable (no local docs snapshot — scan the project first)",
        evidenceFound: [],
        previousStatus: wo.status,
        newStatus: null
      });
    }
  }

  return {
    totalInspected: workOrders.length,
    archived,
    contextRepaired,
    skipped,
    results
  };
}
