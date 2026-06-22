import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { requireRole } from "../middleware/rbac.js";
import { auditLog } from "../services/auditService.js";
import { createAutomationJob } from "../services/automationJobService.js";
import { enrichDataQuality } from "../services/dataQualityService.js";
import {
  buildExternalAgentPrompt,
  createHandoffBrief,
  createWorkOrderCompletionReport,
  dispatchWorkOrder,
  generateWorkOrderFromMatter,
  generateWorkOrderFromTask,
  createWorkOrder
} from "../services/externalAgentWorkOrderService.js";
import { executeWorkOrderViaProvider } from "../services/externalAgentExecutionService.js";
import { getWorkOrderRecommendations } from "../services/externalAgentRecommendationService.js";
import { routeProjectForSource } from "../services/projectRoutingService.js";
import {
  bindFreshContextToWorkOrder,
  explainContextBindingStatus,
  markWorkOrderContextStale,
  repairWorkOrderContext
} from "../services/projectContextBindingService.js";
import { reconcileContextWarnings } from "../services/workOrderLifecycleReconcileService.js";
import { refreshWorkOrderContext } from "../services/refreshWorkOrderContextService.js";
import { createExternalAgentBridgeJob } from "../services/externalAgentBridgeService.js";
import { resolveExternalAgentChoiceMatter } from "../services/externalAgentReadinessService.js";

const router = Router();

const workOrderSchema = z.object({
  title: z.string().trim().min(1).max(180),
  objective: z.string().trim().min(1).max(5000),
  context: z.string().trim().max(10000).default(""),
  instructions: z.string().trim().max(10000).default(""),
  constraints: z.string().trim().max(5000).default(""),
  acceptanceCriteria: z.array(z.string().trim().min(1).max(500)).max(500).default([]),
  validationCommands: z.array(z.string().trim().min(1).max(300)).max(250).default([]),
  projectId: z.string().trim().max(120).optional().nullable(),
  targetProject: z.string().trim().max(200).optional().nullable(),
  targetRepository: z.string().trim().max(500).optional().nullable(),
  sourceType: z.string().trim().max(80).optional().nullable(),
  sourceId: z.string().trim().max(120).optional().nullable(),
  assignedExternalAgentId: z.string().trim().max(120).optional().nullable(),
  assignedAgentId: z.string().trim().max(120).optional().nullable(),
  assignedAgentReason: z.string().trim().max(500).optional().nullable(),
  assignedAgentConfidence: z.number().min(0).max(1).optional().nullable(),
  executionTarget: z.enum(["AUTO", "INTERNAL_AGENT", "RUNNER_VALIDATION", "RUNNER_PATCH", "EXTERNAL_AGENT"]).default("AUTO"),
  maxAutoRetries: z.number().int().min(0).max(5).optional(),
  status: z.enum(["DRAFT", "READY", "IN_PROGRESS", "NEEDS_REVIEW", "COMPLETED", "FAILED", "CANCELLED", "ARCHIVED"]).default("DRAFT"),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
  dataQuality: z.string().trim().max(80).optional().nullable(),
  workQuality: z.string().trim().max(80).optional().nullable(),
  archiveReason: z.string().trim().max(500).optional().nullable(),
  archivedAt: z.string().trim().optional().nullable()
});

const include = {
  assignedExternalAgent: true,
  assignedAgent: { select: { id: true, slug: true, name: true, title: true } },
  workSessions: { orderBy: { createdAt: "desc" } as const },
  implementationReports: { orderBy: { createdAt: "desc" } as const },
  handoffBriefs: { orderBy: { createdAt: "desc" } as const },
  externalAgentRuns: { orderBy: { createdAt: "desc" } as const, take: 3 }
};

router.get("/", async (req, res, next) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const priority = typeof req.query.priority === "string" ? req.query.priority : undefined;
    const assignedExternalAgentId = typeof req.query.externalAgentId === "string" ? req.query.externalAgentId : undefined;
    const includeArchived = req.query.includeArchived === "true";
    const includeLegacy = req.query.includeLegacy === "true";
    const includeTestData = req.query.includeTestData === "true";
    const qualityFilter = typeof req.query.quality === "string" ? req.query.quality : undefined;

    const rawWorkOrders = await prisma.workOrder.findMany({
      where: {
        ...(status ? { status: status as never } : {}),
        ...(priority ? { priority: priority as never } : {}),
        ...(assignedExternalAgentId ? { assignedExternalAgentId } : {})
      },
      include,
      orderBy: [{ updatedAt: "desc" }]
    });

    const filtered = rawWorkOrders.filter((order) => {
      if (qualityFilter) {
        if (order.dataQuality !== qualityFilter && order.workQuality !== qualityFilter) {
          return false;
        }
      }

      // Default hides
      if (!includeTestData && (order.isTestData || order.dataQuality === "TEST" || order.workQuality === "TEST" || order.workQuality === "JUNK" || order.workQuality === "DEBUG_ONLY")) {
        return false;
      }
      if (!includeArchived && order.status === "ARCHIVED" && !status) {
        return false;
      }
      if (!includeLegacy && (order.dataQuality === "LEGACY" || order.workQuality === "LEGACY" || order.workQuality === "COMPLETED_ARCHIVE")) {
        return false;
      }

      return true;
    });

    const hiddenCount = rawWorkOrders.length - filtered.length;
    const enriched = await enrichDataQuality("workOrder", filtered);

    res.json({ workOrders: enriched, hiddenCount });
  } catch (error) {
    next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const workOrder = await prisma.workOrder.findUnique({ where: { id: req.params.id }, include });
    if (!workOrder) {
      res.status(404).json({ error: "Work order not found" });
      return;
    }
    const enriched = (await enrichDataQuality("workOrder", [workOrder]))[0];
    res.json({ workOrder: enriched });
  } catch (error) {
    next(error);
  }
});

router.post("/", requireRole("KING", "CROWN_PRINCE"), async (req, res, next) => {
  try {
    const payload = workOrderSchema.parse(req.body);
    const result = await createWorkOrder({ ...payload, createdByUserId: req.user?.id }, true);
    if (result.status === "REJECTED") {
      res.status(400).json({ error: result.reason, status: "REJECTED" });
      return;
    }
    if (result.status === "PREVIEW_ONLY") {
      res.status(200).json({ status: "PREVIEW_ONLY", reason: result.reason });
      return;
    }
    const workOrder = result.workOrder;
    if (workOrder && !payload.projectId) {
      await routeProjectForSource({
        title: workOrder.title,
        content: `${workOrder.objective}\n${workOrder.context}\n${workOrder.instructions}`,
        sourceType: "WORK_ORDER",
        sourceId: workOrder.id
      }).catch(() => undefined);
    }
    if (workOrder) {
      await auditLog({ userId: req.user?.id, action: "create_work_order", resourceType: "work_order", resourceId: workOrder.id, metadata: { status: workOrder.status } });
    }
    const routedWorkOrder = workOrder ? await prisma.workOrder.findUnique({ where: { id: workOrder.id }, include }) : null;
    res.status(201).json({ workOrder: routedWorkOrder ?? workOrder });
  } catch (error) {
    next(error);
  }
});

router.patch("/:id", requireRole("KING", "CROWN_PRINCE"), async (req, res, next) => {
  try {
    const existing = await prisma.workOrder.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: "Work order not found" });
      return;
    }
    const payload = workOrderSchema.partial().parse(req.body);

    // Update dataQuality and workQuality concepts, archive properties if marked ARCHIVED
    const finalStatus = payload.status ?? existing.status;
    const archivedAt = finalStatus === "ARCHIVED" ? (existing.archivedAt ?? new Date()) : existing.archivedAt;
    const archiveReason = finalStatus === "ARCHIVED" ? (payload.constraints || existing.archiveReason || "Manually archived") : existing.archiveReason;
    const workQuality = finalStatus === "ARCHIVED" ? "COMPLETED_ARCHIVE" : existing.workQuality;

    let workOrder = await prisma.workOrder.update({
      where: { id: existing.id },
      data: {
        ...payload,
        archivedAt,
        archiveReason,
        workQuality
      },
      include
    });
    if ("projectId" in payload && payload.projectId !== existing.projectId) {
      await bindFreshContextToWorkOrder(workOrder.id, { userId: req.user?.id }).catch(() => undefined);
      workOrder = (await prisma.workOrder.findUnique({ where: { id: workOrder.id }, include })) ?? workOrder;
    }
    if (payload.status === "COMPLETED") {
      await createWorkOrderCompletionReport(workOrder.id);
    }
    if ("assignedAgentId" in payload) {
      await auditLog({
        userId: req.user?.id,
        action: "override_work_order_assignment",
        resourceType: "work_order",
        resourceId: workOrder.id,
        metadata: {
          previousAgentId: existing.assignedAgentId,
          newAgentId: payload.assignedAgentId ?? null,
          reason: payload.assignedAgentReason ?? "Manual override"
        }
      });
    }
    await auditLog({ userId: req.user?.id, action: "update_work_order", resourceType: "work_order", resourceId: workOrder.id, metadata: { status: workOrder.status } });
    res.json({ workOrder });
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", requireRole("KING"), async (req, res, next) => {
  try {
    const existing = await prisma.workOrder.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: "Work order not found" });
      return;
    }
    await prisma.workOrder.delete({ where: { id: existing.id } });
    await auditLog({ userId: req.user?.id, action: "delete_work_order", resourceType: "work_order", resourceId: existing.id, metadata: { title: existing.title } });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.post("/from-task/:taskId", requireRole("KING", "CROWN_PRINCE"), async (req, res, next) => {
  try {
    const { taskId } = req.params as { taskId: string };
    const result = await generateWorkOrderFromTask(taskId, req.user?.id);
    if (result.status === "REJECTED") {
      res.status(400).json({ error: result.reason, status: "REJECTED" });
      return;
    }
    if (result.status === "PREVIEW_ONLY") {
      res.status(200).json({ status: "PREVIEW_ONLY", reason: result.reason });
      return;
    }
    const workOrder = result.workOrder;
    if (workOrder) {
      await auditLog({ userId: req.user?.id, action: "create_work_order_from_task", resourceType: "work_order", resourceId: workOrder.id, metadata: { taskId } });
    }
    res.status(201).json({ workOrder });
  } catch (error) {
    if (error instanceof Error && error.name === "NotFoundError") {
      res.status(404).json({ error: error.message });
      return;
    }
    next(error);
  }
});

router.post("/from-matter/:matterId", requireRole("KING", "CROWN_PRINCE"), async (req, res, next) => {
  try {
    const { matterId } = req.params as { matterId: string };
    const result = await generateWorkOrderFromMatter(matterId, req.user?.id);
    if (result.status === "REJECTED") {
      res.status(400).json({ error: result.reason, status: "REJECTED" });
      return;
    }
    if (result.status === "PREVIEW_ONLY") {
      res.status(200).json({ status: "PREVIEW_ONLY", reason: result.reason });
      return;
    }
    const workOrder = result.workOrder;
    if (workOrder) {
      await auditLog({ userId: req.user?.id, action: "create_work_order_from_matter", resourceType: "work_order", resourceId: workOrder.id, metadata: { matterId } });
    }
    res.status(201).json({ workOrder });
  } catch (error) {
    if (error instanceof Error && error.name === "NotFoundError") {
      res.status(404).json({ error: error.message });
      return;
    }
    next(error);
  }
});

/** POST /api/work-orders/reconcile-context-warnings — bulk-reconcile active WOs with stale/missing context (KING/CROWN_PRINCE). */
router.post("/reconcile-context-warnings", requireRole("KING", "CROWN_PRINCE"), async (req, res, next) => {
  try {
    const result = await reconcileContextWarnings({ userId: req.user?.id });
    res.json({ result });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/build-prompt/:externalAgentId", requireRole("KING", "CROWN_PRINCE"), async (req, res, next) => {
  try {
    const { id, externalAgentId } = req.params as { id: string; externalAgentId: string };
    const prompt = await buildExternalAgentPrompt(id, externalAgentId);
    res.json({ prompt });
  } catch (error) {
    if (error instanceof Error && error.name === "NotFoundError") {
      res.status(404).json({ error: error.message });
      return;
    }
    next(error);
  }
});

/** POST /api/work-orders/:id/dispatch/:externalAgentId — one-step: assign agent, build prompt, move to IN_PROGRESS. */
router.post("/:id/dispatch/:externalAgentId", requireRole("KING", "CROWN_PRINCE"), async (req, res, next) => {
  try {
    const { id, externalAgentId } = req.params as { id: string; externalAgentId: string };
    const result = await dispatchWorkOrder(id, externalAgentId);

    // When the agent is configured for API execution, run it now and store the report automatically.
    let autoExecuted = false;
    let executionError: string | null = null;
    if (result.externalAgent.executionMode === "API") {
      try {
        await executeWorkOrderViaProvider(id, externalAgentId, { userId: req.user?.id, actorRole: req.user?.role });
        autoExecuted = true;
      } catch (execErr) {
        executionError = execErr instanceof Error ? execErr.message : "Auto-execution failed";
      }
    }

    await auditLog({
      userId: req.user?.id,
      action: "dispatch_work_order",
      resourceType: "work_order",
      resourceId: id,
      metadata: { externalAgentId, externalAgentName: result.externalAgent.name, status: result.workOrder.status, executionMode: result.externalAgent.executionMode, autoExecuted }
    });
    const workOrder = await prisma.workOrder.findUnique({ where: { id }, include });
    res.json({ workOrder, prompt: result.prompt, autoExecuted, executionError });
  } catch (error) {
    if (error instanceof Error && error.name === "NotFoundError") {
      res.status(404).json({ error: error.message });
      return;
    }
    next(error);
  }
});

/** GET /api/work-orders/:id/external-agent-recommendations — ranked agent suggestions (any authenticated role). */
router.get("/:id/external-agent-recommendations", async (req, res, next) => {
  try {
    const recommendations = await getWorkOrderRecommendations(req.params.id);
    res.json({ recommendations });
  } catch (error) {
    if (error instanceof Error && error.name === "NotFoundError") {
      res.status(404).json({ error: error.message });
      return;
    }
    next(error);
  }
});

/** GET /api/work-orders/:id/context — read-only context binding view (any authenticated role). */
router.get("/:id/context", async (req, res, next) => {
  try {
    const workOrder = await prisma.workOrder.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        projectId: true,
        contextBindingStatus: true,
        contextBoundAt: true,
        localDocumentSnapshotId: true,
        repositorySnapshotId: true,
        contextBindingSummary: true,
        contextBindingProvenance: true
      }
    });
    if (!workOrder) {
      res.status(404).json({ error: "Work order not found" });
      return;
    }
    const current = workOrder.projectId ? await explainContextBindingStatus(workOrder.projectId, workOrder.id) : null;
    res.json({ context: { ...workOrder, current } });
  } catch (error) {
    next(error);
  }
});

/** POST /api/work-orders/:id/bind-context — bind/rebind latest snapshots (KING/CROWN_PRINCE). */
router.post("/:id/bind-context", requireRole("KING", "CROWN_PRINCE"), async (req, res, next) => {
  try {
    const { workOrder, binding } = await bindFreshContextToWorkOrder(req.params.id as string, { userId: req.user?.id });
    res.json({ workOrder, binding });
  } catch (error) {
    if (error instanceof Error && error.name === "NotFoundError") {
      res.status(404).json({ error: error.message });
      return;
    }
    next(error);
  }
});

const markStaleSchema = z.object({ reason: z.string().trim().min(1).max(500).default("Manually marked stale") });

/** POST /api/work-orders/:id/rebind-context — repair stale or missing context binding (KING/CROWN_PRINCE). */
router.post("/:id/rebind-context", requireRole("KING", "CROWN_PRINCE"), async (req, res, next) => {
  try {
    const result = await repairWorkOrderContext(req.params.id as string, { userId: req.user?.id });
    res.json({ result });
  } catch (error) {
    if (error instanceof Error && error.name === "NotFoundError") {
      res.status(404).json({ error: error.message });
      return;
    }
    next(error);
  }
});

/** POST /api/work-orders/:id/refresh-context — scan local docs then rebind context (KING/CROWN_PRINCE). */
router.post("/:id/refresh-context", requireRole("KING", "CROWN_PRINCE"), async (req, res, next) => {
  try {
    const result = await refreshWorkOrderContext(req.params.id as string, { userId: req.user?.id });
    res.json({ result });
  } catch (error) {
    if (error instanceof Error && error.name === "NotFoundError") {
      res.status(404).json({ error: error.message });
      return;
    }
    next(error);
  }
});

/** POST /api/work-orders/:id/mark-context-stale — KING/CROWN_PRINCE. */
router.post("/:id/mark-context-stale", requireRole("KING", "CROWN_PRINCE"), async (req, res, next) => {
  try {
    const { reason } = markStaleSchema.parse(req.body ?? {});
    const workOrder = await markWorkOrderContextStale(req.params.id as string, reason, req.user?.id);
    res.json({ workOrder });
  } catch (error) {
    if (error instanceof Error && error.name === "NotFoundError") {
      res.status(404).json({ error: error.message });
      return;
    }
    next(error);
  }
});

const automationJobCreateSchema = z.object({
  agentId: z.string().trim().optional().nullable(),
  externalAgentId: z.string().trim().optional().nullable(),
  mode: z.enum(["OBSERVE", "PLAN_ONLY", "SANDBOX_PATCH", "VALIDATION_ONLY", "EXTERNAL_AGENT"]).default("SANDBOX_PATCH"),
  commandPolicy: z.string().trim().max(1000).optional().nullable(),
  allowedCommands: z.array(z.string().trim().min(1).max(100)).max(50).default([]),
  useAssignedAgentCli: z.boolean().optional()
});

router.post("/:id/automation-job", requireRole("KING"), async (req, res, next) => {
  try {
    const { id } = req.params as { id: string };
    const body = automationJobCreateSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Invalid request", details: body.error.flatten() });
      return;
    }
    if (body.data.mode === "EXTERNAL_AGENT") {
      const result = await createExternalAgentBridgeJob({
        workOrderId: id,
        externalAgentId: body.data.externalAgentId,
        createdByUserId: req.user!.id
      });
      res.status(201).json(result);
      return;
    }
    const job = await createAutomationJob({
      workOrderId: id,
      agentId: body.data.agentId,
      mode: body.data.mode,
      commandPolicy: body.data.commandPolicy,
      allowedCommands: body.data.allowedCommands,
      useAssignedAgentCli: body.data.useAssignedAgentCli,
      createdByUserId: req.user!.id
    });
    res.status(201).json({ job });
  } catch (error) {
    if (error instanceof Error && error.name === "NotFoundError") {
      res.status(404).json({ error: error.message });
      return;
    }
    if (error instanceof Error && error.name === "ConflictError") {
      res.status(409).json({ error: error.message });
      return;
    }
    if (error instanceof Error && error.name === "ContextBindingError") {
      res.status(409).json({ error: error.message, code: "CONTEXT_BINDING" });
      return;
    }
    if (error instanceof Error && error.name === "BridgeDisabledError") {
      res.status(409).json({ error: error.message, code: "BRIDGE_DISABLED" });
      return;
    }
    next(error);
  }
});

router.post("/:id/handoff", requireRole("KING", "CROWN_PRINCE"), async (req, res, next) => {
  try {
    const { id } = req.params as { id: string };
    const handoffBrief = await createHandoffBrief(id);
    await auditLog({ userId: req.user?.id, action: "generate_handoff_brief", resourceType: "handoff_brief", resourceId: handoffBrief.id, metadata: { workOrderId: id } });
    res.status(201).json({ handoffBrief });
  } catch (error) {
    if (error instanceof Error && error.name === "NotFoundError") {
      res.status(404).json({ error: error.message });
      return;
    }
    next(error);
  }
});

/** POST /api/work-orders/:id/assign-external-agent — persist external agent assignment (KING/CROWN_PRINCE). */
const assignExternalAgentSchema = z.object({
  externalAgentId: z.string().trim().min(1).max(120).nullable()
});

router.post("/:id/assign-external-agent", requireRole("KING", "CROWN_PRINCE"), async (req, res, next) => {
  try {
    const { id } = req.params as { id: string };
    const { externalAgentId } = assignExternalAgentSchema.parse(req.body);
    const existing = await prisma.workOrder.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: "Work order not found" });
      return;
    }
    const workOrder = await prisma.workOrder.update({
      where: { id },
      data: { assignedExternalAgentId: externalAgentId },
      include
    });
    // The King has made the agent decision — close any open external-agent-choice
    // Matter so it stops nagging in the decision queue.
    if (externalAgentId) {
      await resolveExternalAgentChoiceMatter(id).catch(() => undefined);
    }
    await auditLog({
      userId: req.user?.id,
      action: "assign_external_agent",
      resourceType: "work_order",
      resourceId: id,
      metadata: { previousAgentId: existing.assignedExternalAgentId, newAgentId: externalAgentId }
    });
    res.json({ workOrder });
  } catch (error) {
    if (error instanceof Error && error.name === "NotFoundError") {
      res.status(404).json({ error: error.message });
      return;
    }
    next(error);
  }
});

/** POST /api/work-orders/:id/archive-completed — explicitly archive a completed work order (KING/CROWN_PRINCE). */
router.post("/:id/archive-completed", requireRole("KING", "CROWN_PRINCE"), async (req, res, next) => {
  try {
    const { id } = req.params as { id: string };
    const existing = await prisma.workOrder.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: "Work order not found" });
      return;
    }
    const workOrder = await prisma.workOrder.update({
      where: { id },
      data: {
        status: "ARCHIVED",
        workQuality: "COMPLETED_ARCHIVE",
        archiveReason: "Manually archived as completed by King",
        archivedAt: new Date()
      },
      include
    });
    await auditLog({
      userId: req.user?.id,
      action: "archive_completed_work_order",
      resourceType: "work_order",
      resourceId: id,
      metadata: { previousStatus: existing.status, title: existing.title }
    });
    res.json({ workOrder });
  } catch (error) {
    next(error);
  }
});

export default router;
