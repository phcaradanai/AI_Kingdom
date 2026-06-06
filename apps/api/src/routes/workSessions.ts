import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { requireRole } from "../middleware/rbac.js";

const router = Router();

const workSessionSchema = z.object({
  workOrderId: z.string().trim().min(1),
  externalAgentId: z.string().trim().min(1).optional().nullable(),
  sessionLabel: z.string().trim().min(1).max(180),
  status: z.enum(["STARTED", "IN_PROGRESS", "COMPLETED", "FAILED", "INTERRUPTED"]).default("STARTED"),
  inputPrompt: z.string().trim().min(1).max(30000),
  outputSummary: z.string().trim().max(10000).optional().nullable(),
  startedAt: z.coerce.date().optional(),
  completedAt: z.coerce.date().optional().nullable()
});

router.get("/", async (_req, res, next) => {
  try {
    const workSessions = await prisma.workSession.findMany({
      include: { workOrder: true, externalAgent: true },
      orderBy: { createdAt: "desc" }
    });
    res.json({ workSessions });
  } catch (error) {
    next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const workSession = await prisma.workSession.findUnique({
      where: { id: req.params.id },
      include: { workOrder: true, externalAgent: true, reports: true, handoffBriefs: true }
    });
    if (!workSession) {
      res.status(404).json({ error: "Work session not found" });
      return;
    }
    res.json({ workSession });
  } catch (error) {
    next(error);
  }
});

router.post("/", requireRole("KING", "CROWN_PRINCE"), async (req, res, next) => {
  try {
    const payload = workSessionSchema.parse(req.body);
    const workSession = await prisma.workSession.create({ data: payload });
    await prisma.workOrder.update({ where: { id: payload.workOrderId }, data: { status: "IN_PROGRESS" } }).catch(() => undefined);
    res.status(201).json({ workSession });
  } catch (error) {
    next(error);
  }
});

router.patch("/:id", requireRole("KING", "CROWN_PRINCE"), async (req, res, next) => {
  try {
    const existing = await prisma.workSession.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: "Work session not found" });
      return;
    }
    const payload = workSessionSchema.partial().parse(req.body);
    const workSession = await prisma.workSession.update({ where: { id: existing.id }, data: payload });
    res.json({ workSession });
  } catch (error) {
    next(error);
  }
});

export default router;
