import { Router } from "express";
import { z } from "zod";
import { requireRole } from "../middleware/rbac.js";
import {
  approveJob,
  cancelJob,
  createAutomationJob,
  getJob,
  listJobs
} from "../services/automationJobService.js";
import type { AutomationJobStatus } from "@prisma/client";

const router = Router();

/** GET /api/automation-jobs */
router.get("/", requireRole("KING"), async (req, res, next) => {
  try {
    const status = typeof req.query.status === "string" ? (req.query.status as AutomationJobStatus) : undefined;
    const workOrderId = typeof req.query.workOrderId === "string" ? req.query.workOrderId : undefined;
    const projectId = typeof req.query.projectId === "string" ? req.query.projectId : undefined;
    const jobs = await listJobs({ status, workOrderId, projectId });
    res.json(jobs);
  } catch (err) {
    next(err);
  }
});

/** GET /api/automation-jobs/:id */
router.get("/:id", requireRole("KING"), async (req, res, next) => {
  try {
    const { id } = req.params as { id: string };
    const job = await getJob(id);
    if (!job) {
      res.status(404).json({ error: "Automation job not found" });
      return;
    }
    res.json(job);
  } catch (err) {
    next(err);
  }
});

const createJobSchema = z.object({
  agentId: z.string().trim().optional().nullable(),
  mode: z.enum(["OBSERVE", "PLAN_ONLY", "SANDBOX_PATCH", "VALIDATION_ONLY"]).default("SANDBOX_PATCH"),
  commandPolicy: z.string().trim().max(1000).optional().nullable(),
  allowedCommands: z.array(z.string().trim().min(1).max(100)).max(50).default([])
});

/** POST /api/automation-jobs — create a job (workOrderId comes from query or body) */
router.post("/", requireRole("KING"), async (req, res, next) => {
  try {
    const workOrderId: string | undefined =
      typeof req.query.workOrderId === "string" ? req.query.workOrderId :
      typeof req.body.workOrderId === "string" ? req.body.workOrderId : undefined;
    if (!workOrderId) {
      res.status(400).json({ error: "workOrderId is required" });
      return;
    }
    const body = createJobSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Invalid request", details: body.error.flatten() });
      return;
    }
    const job = await createAutomationJob({
      workOrderId,
      agentId: body.data.agentId,
      mode: body.data.mode,
      commandPolicy: body.data.commandPolicy,
      allowedCommands: body.data.allowedCommands,
      createdByUserId: req.user!.id
    });
    res.status(201).json(job);
  } catch (err) {
    if (err instanceof Error && err.name === "NotFoundError") {
      res.status(404).json({ error: err.message });
      return;
    }
    if (err instanceof Error && err.name === "ConflictError") {
      res.status(409).json({ error: err.message });
      return;
    }
    next(err);
  }
});

const jobErrorHandler = (err: unknown, res: import("express").Response, next: import("express").NextFunction) => {
  if (err instanceof Error && err.name === "NotFoundError") {
    res.status(404).json({ error: err.message });
    return;
  }
  if (err instanceof Error && err.name === "ConflictError") {
    res.status(409).json({ error: err.message });
    return;
  }
  next(err);
};

/** POST /api/automation-jobs/:id/approve */
router.post("/:id/approve", requireRole("KING"), async (req, res, next) => {
  try {
    const { id } = req.params as { id: string };
    const job = await approveJob(id, req.user!.id);
    res.json(job);
  } catch (err) {
    jobErrorHandler(err, res, next);
  }
});

/** POST /api/automation-jobs/:id/cancel */
router.post("/:id/cancel", requireRole("KING"), async (req, res, next) => {
  try {
    const { id } = req.params as { id: string };
    const job = await cancelJob(id, req.user!.id);
    res.json(job);
  } catch (err) {
    jobErrorHandler(err, res, next);
  }
});

export default router;
