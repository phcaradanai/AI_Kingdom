import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { requireRole } from "../middleware/rbac.js";
import { auditLog } from "../services/auditService.js";
import {
  buildExternalAgentPrompt,
  createHandoffBrief,
  createWorkOrderCompletionReport,
  generateWorkOrderFromMatter,
  generateWorkOrderFromTask
} from "../services/externalAgentWorkOrderService.js";
import { routeProjectForSource } from "../services/projectRoutingService.js";

const router = Router();

const workOrderSchema = z.object({
  title: z.string().trim().min(1).max(180),
  objective: z.string().trim().min(1).max(5000),
  context: z.string().trim().max(10000).default(""),
  instructions: z.string().trim().max(10000).default(""),
  constraints: z.string().trim().max(5000).default(""),
  acceptanceCriteria: z.array(z.string().trim().min(1).max(500)).max(50).default([]),
  validationCommands: z.array(z.string().trim().min(1).max(300)).max(20).default([]),
  projectId: z.string().trim().max(120).optional().nullable(),
  targetProject: z.string().trim().max(200).optional().nullable(),
  targetRepository: z.string().trim().max(500).optional().nullable(),
  sourceType: z.string().trim().max(80).optional().nullable(),
  sourceId: z.string().trim().max(120).optional().nullable(),
  assignedExternalAgentId: z.string().trim().max(120).optional().nullable(),
  status: z.enum(["DRAFT", "READY", "IN_PROGRESS", "NEEDS_REVIEW", "COMPLETED", "FAILED", "CANCELLED"]).default("DRAFT"),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM")
});

const include = {
  assignedExternalAgent: true,
  workSessions: { orderBy: { createdAt: "desc" } as const },
  implementationReports: { orderBy: { createdAt: "desc" } as const },
  handoffBriefs: { orderBy: { createdAt: "desc" } as const }
};

router.get("/", async (req, res, next) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const priority = typeof req.query.priority === "string" ? req.query.priority : undefined;
    const assignedExternalAgentId = typeof req.query.externalAgentId === "string" ? req.query.externalAgentId : undefined;
    const workOrders = await prisma.workOrder.findMany({
      where: {
        ...(status ? { status: status as never } : {}),
        ...(priority ? { priority: priority as never } : {}),
        ...(assignedExternalAgentId ? { assignedExternalAgentId } : {})
      },
      include,
      orderBy: [{ updatedAt: "desc" }]
    });
    res.json({ workOrders });
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
    res.json({ workOrder });
  } catch (error) {
    next(error);
  }
});

router.post("/", requireRole("KING", "CROWN_PRINCE"), async (req, res, next) => {
  try {
    const payload = workOrderSchema.parse(req.body);
    const workOrder = await prisma.workOrder.create({
      data: { ...payload, createdByUserId: req.user?.id },
      include
    });
    if (!payload.projectId) {
      await routeProjectForSource({
        title: workOrder.title,
        content: `${workOrder.objective}\n${workOrder.context}\n${workOrder.instructions}`,
        sourceType: "WORK_ORDER",
        sourceId: workOrder.id
      }).catch(() => undefined);
    }
    await auditLog({ userId: req.user?.id, action: "create_work_order", resourceType: "work_order", resourceId: workOrder.id, metadata: { status: workOrder.status } });
    const routedWorkOrder = await prisma.workOrder.findUnique({ where: { id: workOrder.id }, include });
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
    const workOrder = await prisma.workOrder.update({ where: { id: existing.id }, data: payload, include });
    if (payload.status === "COMPLETED") {
      await createWorkOrderCompletionReport(workOrder.id);
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
    const workOrder = await generateWorkOrderFromTask(taskId, req.user?.id);
    await auditLog({ userId: req.user?.id, action: "create_work_order_from_task", resourceType: "work_order", resourceId: workOrder.id, metadata: { taskId } });
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
    const workOrder = await generateWorkOrderFromMatter(matterId, req.user?.id);
    await auditLog({ userId: req.user?.id, action: "create_work_order_from_matter", resourceType: "work_order", resourceId: workOrder.id, metadata: { matterId } });
    res.status(201).json({ workOrder });
  } catch (error) {
    if (error instanceof Error && error.name === "NotFoundError") {
      res.status(404).json({ error: error.message });
      return;
    }
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

export default router;
