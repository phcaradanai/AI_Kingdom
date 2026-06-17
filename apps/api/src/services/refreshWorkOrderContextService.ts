import { prisma } from "../db/prisma.js";
import { listLocalDocumentRoots, scanLocalDocumentRoot } from "./localDocumentAccessService.js";
import { bindFreshContextToWorkOrder } from "./projectContextBindingService.js";

export type RefreshWorkOrderContextResult = {
  workOrderId: string;
  status: "REFRESHED" | "SKIPPED";
  oldStatus: string;
  newStatus: string | null;
  scanRan: boolean;
  scanFailures: string[];
  warnings: string[];
  skipReason?: "no_project";
};

/**
 * Scans all active local document roots for the work order's project, then
 * rebinds the work order to the freshest available snapshots.
 *
 * This is the single safe action that repairs STALE/MISSING context without
 * requiring the King to manually trigger a local docs scan first.
 */
export async function refreshWorkOrderContext(
  workOrderId: string,
  options: { userId?: string | null } = {}
): Promise<RefreshWorkOrderContextResult> {
  const workOrder = await prisma.workOrder.findUnique({
    where: { id: workOrderId },
    select: { id: true, projectId: true, contextBindingStatus: true }
  });
  if (!workOrder) {
    const err = new Error("WorkOrder not found");
    err.name = "NotFoundError";
    throw err;
  }

  const oldStatus = workOrder.contextBindingStatus;

  if (!workOrder.projectId) {
    return {
      workOrderId,
      status: "SKIPPED",
      oldStatus,
      newStatus: null,
      scanRan: false,
      scanFailures: [],
      warnings: ["Work order has no linked project; cannot refresh context."],
      skipReason: "no_project"
    };
  }

  const roots = await listLocalDocumentRoots(workOrder.projectId);
  const activeRoots = roots.filter((r) => r.isActive);
  const scanFailures: string[] = [];
  let scanRan = false;

  for (const root of activeRoots) {
    try {
      const snapshot = await scanLocalDocumentRoot(root.id);
      scanRan = true;
      if (snapshot.scanStatus === "FAILED") {
        scanFailures.push(`Scan failed for root "${root.name}": ${snapshot.summary ?? "unknown error"}`);
      }
    } catch (err) {
      scanFailures.push(`Scan error for root "${root.name}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const { workOrder: updated, binding } = await bindFreshContextToWorkOrder(workOrderId, options);

  const warnings = [...scanFailures, ...(binding?.warnings ?? [])];

  return {
    workOrderId,
    status: "REFRESHED",
    oldStatus,
    newStatus: updated.contextBindingStatus,
    scanRan,
    scanFailures,
    warnings
  };
}
