import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { requireRole } from "../middleware/rbac.js";
import { auditLog } from "../services/auditService.js";
import { createImplementationReport } from "../services/externalAgentWorkOrderService.js";

const router = Router();

const implementationReportSchema = z.object({
  workOrderId: z.string().trim().min(1),
  workSessionId: z.string().trim().min(1).optional().nullable(),
  externalAgentId: z.string().trim().min(1).optional().nullable(),
  summary: z.string().trim().min(1).max(8000),
  filesChanged: z.array(z.string().trim().min(1).max(300)).max(200).default([]),
  commandsRun: z.array(z.string().trim().min(1).max(300)).max(100).default([]),
  testsRun: z.array(z.string().trim().min(1).max(300)).max(100).default([]),
  testResult: z.enum(["NOT_RUN", "PASSED", "FAILED", "PARTIAL"]).default("NOT_RUN"),
  errors: z.array(z.string().trim().min(1).max(1000)).max(100).default([]),
  decisionsMade: z.array(z.string().trim().min(1).max(1000)).max(100).default([]),
  remainingWork: z.array(z.string().trim().min(1).max(1000)).max(100).default([]),
  nextRecommendedAction: z.string().trim().max(1000).optional().nullable(),
  rawOutput: z.string().trim().max(20000).optional().nullable()
});

router.get("/", async (_req, res, next) => {
  try {
    const implementationReports = await prisma.implementationReport.findMany({
      include: { workOrder: true, workSession: true, externalAgent: true },
      orderBy: { createdAt: "desc" }
    });
    res.json({ implementationReports });
  } catch (error) {
    next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const implementationReport = await prisma.implementationReport.findUnique({
      where: { id: req.params.id },
      include: { workOrder: true, workSession: true, externalAgent: true }
    });
    if (!implementationReport) {
      res.status(404).json({ error: "Implementation report not found" });
      return;
    }
    res.json({ implementationReport });
  } catch (error) {
    next(error);
  }
});

router.post("/", requireRole("KING", "CROWN_PRINCE", "MINISTER"), async (req, res, next) => {
  try {
    const payload = implementationReportSchema.parse(req.body);
    const implementationReport = await createImplementationReport(payload);
    await auditLog({
      userId: req.user?.id,
      action: "submit_implementation_report",
      resourceType: "implementation_report",
      resourceId: implementationReport.id,
      metadata: { workOrderId: implementationReport.workOrderId, testResult: implementationReport.testResult }
    });
    res.status(201).json({ implementationReport });
  } catch (error) {
    next(error);
  }
});

router.patch("/:id", requireRole("KING", "CROWN_PRINCE"), async (req, res, next) => {
  try {
    const existing = await prisma.implementationReport.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: "Implementation report not found" });
      return;
    }
    const payload = implementationReportSchema.partial().parse(req.body);
    const implementationReport = await prisma.implementationReport.update({ where: { id: existing.id }, data: payload });
    res.json({ implementationReport });
  } catch (error) {
    next(error);
  }
});

export default router;
