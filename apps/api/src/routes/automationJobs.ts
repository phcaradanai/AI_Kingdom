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
import { importPatch } from "../services/importedPatchService.js";
import { getAgentReviewForJob, regenerateAgentReviewForJob } from "../services/runnerResultReviewService.js";
import type { AutomationJobStatus } from "@prisma/client";
import { createExternalAgentBridgeJob } from "../services/externalAgentBridgeService.js";
import { dispatchRetry } from "../services/supervisedRetryService.js";

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

/** GET /api/automation-jobs/:id/agent-review */
router.get("/:id/agent-review", requireRole("KING"), async (req, res, next) => {
  try {
    const { id } = req.params as { id: string };
    const job = await getJob(id);
    if (!job) {
      res.status(404).json({ error: "Automation job not found" });
      return;
    }
    const agentReview = await getAgentReviewForJob(id);
    res.json({ agentReview: agentReview ?? null });
  } catch (err) {
    next(err);
  }
});

const createJobSchema = z.object({
  agentId: z.string().trim().optional().nullable(),
  externalAgentId: z.string().trim().optional().nullable(),
  mode: z.enum(["OBSERVE", "PLAN_ONLY", "SANDBOX_PATCH", "VALIDATION_ONLY", "EXTERNAL_AGENT"]).default("SANDBOX_PATCH"),
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
    if (body.data.mode === "EXTERNAL_AGENT") {
      const result = await createExternalAgentBridgeJob({
        workOrderId,
        externalAgentId: body.data.externalAgentId,
        createdByUserId: req.user!.id
      });
      res.status(201).json(result.job);
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
    if (err instanceof Error && err.name === "ContextBindingError") {
      res.status(409).json({ error: err.message, code: "CONTEXT_BINDING" });
      return;
    }
    if (err instanceof Error && err.name === "BridgeDisabledError") {
      res.status(409).json({ error: err.message, code: "BRIDGE_DISABLED" });
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

const importPatchSchema = z.object({
  patchText: z.string().trim().min(1, "Patch text is required")
});

/** POST /api/automation-jobs/:id/import-patch — store a unified diff for sandbox apply */
router.post("/:id/import-patch", requireRole("KING"), async (req, res, next) => {
  try {
    const { id } = req.params as { id: string };
    const body = importPatchSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Invalid request", details: body.error.flatten() });
      return;
    }
    const result = await importPatch(id, body.data.patchText, req.user!.id);
    if (!result.success) {
      const status = result.code === "NOT_FOUND" ? 404
        : result.code === "INVALID_STATUS" ? 409
        : result.code === "UNSAFE_PATCH" ? 422
        : 400;
      res.status(status).json({ error: result.error });
      return;
    }
    const job = await getJob(id);
    res.json(job);
  } catch (err) {
    next(err);
  }
});

/** POST /api/automation-jobs/:id/agent-review/regenerate */
router.post("/:id/agent-review/regenerate", requireRole("KING"), async (req, res, next) => {
  try {
    const { id } = req.params as { id: string };
    const agentReview = await regenerateAgentReviewForJob(id, { useAi: true });
    res.json({ agentReview });
  } catch (err) {
    jobErrorHandler(err, res, next);
  }
});

/** POST /api/automation-jobs/:id/retry — King-triggered supervised retry of a failed job.
 *  Re-dispatches with the reviewer's feedback threaded in; capped at the work order's
 *  maxAutoRetries. Returns the new job, or 409 with a reason when retry is not available. */
router.post("/:id/retry", requireRole("KING"), async (req, res, next) => {
  try {
    const { id } = req.params as { id: string };
    const result = await dispatchRetry({ jobId: id, triggeredBy: "KING", userId: req.user!.id });
    if (!result.retried) {
      res.status(409).json({ error: "Retry not available", reason: result.reason });
      return;
    }
    const job = await getJob(result.newJobId);
    res.status(201).json({ retried: true, attempt: result.attempt, job });
  } catch (err) {
    jobErrorHandler(err, res, next);
  }
});

export default router;
