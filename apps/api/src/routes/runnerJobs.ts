import { Router } from "express";
import { z } from "zod";
import { requireRunnerToken } from "../middleware/runnerAuth.js";
import { claimJob, heartbeat, submitReport, updateJobStatus } from "../services/automationJobService.js";
import { sanitizeLogOutput } from "../services/secretRedactorService.js";
import { prisma } from "../db/prisma.js";
import { auditLog } from "../services/auditService.js";
import { validateCommand } from "../services/commandValidatorService.js";
import { createPatchArtifact, markBranchPushed, getPatchArtifact } from "../services/patchArtifactService.js";
import { getBooleanSetting } from "../services/settingsService.js";
import type { AutomationJobStatus } from "@prisma/client";

const router = Router();

// All routes in this router require RUNNER_TOKEN authentication
router.use(requireRunnerToken);

/** POST /api/runner/heartbeat — runner sends heartbeat */
router.post("/heartbeat", async (req, res, next) => {
  try {
    const runner = req.runner!;
    const meta = req.body as { version?: string; hostname?: string } | undefined;
    const updated = await heartbeat(runner.id, meta);
    const { tokenHash: _hash, ...safe } = updated;
    res.json(safe);
  } catch (err) {
    next(err);
  }
});

/** POST /api/runner/jobs/claim — runner claims the next approved job */
router.post("/jobs/claim", async (req, res, next) => {
  try {
    const runner = req.runner!;
    const job = await claimJob(runner.id);
    if (!job) {
      res.json({ job: null });
      return;
    }
    res.json({ job });
  } catch (err) {
    next(err);
  }
});

const statusSchema = z.object({
  status: z.enum(["RUNNING", "NEEDS_REVIEW", "COMPLETED", "FAILED"]),
  patchSummary: z.string().trim().max(5000).optional().nullable(),
  logsPreview: z.string().max(10000).optional().nullable()
});

/** PATCH /api/runner/jobs/:id/status — runner updates job status */
router.patch("/jobs/:id/status", async (req, res, next) => {
  try {
    const runner = req.runner!;
    const body = statusSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Invalid request", details: body.error.flatten() });
      return;
    }
    const { status, patchSummary, logsPreview } = body.data;
    const sanitizedLogs = logsPreview ? sanitizeLogOutput(logsPreview) : undefined;
    const job = await updateJobStatus(req.params.id, runner.id, status as AutomationJobStatus, {
      patchSummary: patchSummary ?? undefined,
      logsPreview: sanitizedLogs
    });
    res.json(job);
  } catch (err) {
    next(err);
  }
});

const reportSchema = z.object({
  summary: z.string().trim().min(1).max(10000),
  filesChanged: z.array(z.string().trim().min(1).max(500)).max(500).default([]),
  commandsRun: z.array(z.string().trim().min(1).max(500)).max(200).default([]),
  testsRun: z.array(z.string().trim().min(1).max(500)).max(200).default([]),
  testResult: z.enum(["NOT_RUN", "PASSED", "FAILED", "PARTIAL"]).default("NOT_RUN"),
  errors: z.array(z.string().trim().max(1000)).max(100).default([]),
  decisionsMade: z.array(z.string().trim().max(500)).max(100).default([]),
  remainingWork: z.array(z.string().trim().max(500)).max(100).default([]),
  nextRecommendedAction: z.string().trim().max(1000).optional().nullable(),
  rawOutput: z.string().max(20000).optional().nullable(),
  patchSummary: z.string().trim().max(5000).optional().nullable(),
  logsPreview: z.string().max(10000).optional().nullable()
});

/** POST /api/runner/jobs/:id/report — runner submits implementation report */
router.post("/jobs/:id/report", async (req, res, next) => {
  try {
    const runner = req.runner!;
    const body = reportSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Invalid request", details: body.error.flatten() });
      return;
    }

    // Sanitize outputs before persisting
    const sanitized = {
      ...body.data,
      rawOutput: body.data.rawOutput ? sanitizeLogOutput(body.data.rawOutput) : null,
      logsPreview: body.data.logsPreview ? sanitizeLogOutput(body.data.logsPreview) : null
    };

    const report = await submitReport(req.params.id, runner.id, sanitized);
    res.status(201).json(report);
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

const commandCheckSchema = z.object({
  command: z.string().trim().min(1),
  args: z.array(z.string()).default([])
});

/** POST /api/runner/jobs/:id/validate-command — runner pre-validates a command */
router.post("/jobs/:id/validate-command", async (req, res, next) => {
  try {
    const runner = req.runner!;
    const body = commandCheckSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Invalid request", details: body.error.flatten() });
      return;
    }

    const job = await prisma.automationJob.findFirst({
      where: { id: req.params.id, runnerId: runner.id }
    });
    if (!job) {
      res.status(404).json({ error: "Job not found or not owned by this runner" });
      return;
    }

    const result = validateCommand(body.data.command, body.data.args, job.allowedCommands);

    if (result.allowed) {
      await auditLog({
        action: "automation_command_executed",
        resourceType: "AutomationJob",
        resourceId: job.id,
        metadata: { command: body.data.command, args: body.data.args, runnerId: runner.id }
      }).catch(() => undefined);
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
});

/** POST /api/runner/jobs/:id/step — runner records a step */
router.post("/jobs/:id/step", async (req, res, next) => {
  try {
    const runner = req.runner!;

    const job = await prisma.automationJob.findFirst({
      where: { id: req.params.id, runnerId: runner.id }
    });
    if (!job) {
      res.status(404).json({ error: "Job not found or not owned by this runner" });
      return;
    }

    const stepSchema = z.object({
      sequence: z.number().int().min(0),
      stepType: z.string().trim().min(1).max(50),
      title: z.string().trim().min(1).max(300),
      detail: z.string().max(2000).optional().nullable(),
      status: z.string().default("PENDING"),
      command: z.string().max(200).optional().nullable(),
      args: z.array(z.string()).max(50).default([]),
      output: z.string().max(5000).optional().nullable(),
      exitCode: z.number().int().optional().nullable(),
      durationMs: z.number().int().optional().nullable(),
      metadata: z.record(z.unknown()).optional().nullable()
    });

    const body = stepSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Invalid request", details: body.error.flatten() });
      return;
    }

    const sanitizedOutput = body.data.output ? sanitizeLogOutput(body.data.output) : null;

    const step = await prisma.agentRunStep.create({
      data: {
        jobId: job.id,
        sequence: body.data.sequence,
        stepType: body.data.stepType,
        title: body.data.title,
        detail: body.data.detail ?? null,
        status: body.data.status,
        command: body.data.command ?? null,
        args: body.data.args,
        output: sanitizedOutput,
        exitCode: body.data.exitCode ?? null,
        durationMs: body.data.durationMs ?? null,
        metadata: body.data.metadata ? (body.data.metadata as never) : undefined
      }
    });

    res.status(201).json(step);
  } catch (err) {
    next(err);
  }
});

const validationResultSchema = z.object({
  command: z.string().trim().min(1).max(200),
  exitCode: z.number().int(),
  durationMs: z.number().int().min(0),
  output: z.string().max(5000),
  success: z.boolean()
});

const patchArtifactSchema = z.object({
  title: z.string().trim().min(1).max(300),
  summary: z.string().trim().min(1).max(5000),
  diffStat: z.string().max(5000).optional().nullable(),
  diffPreview: z.string().max(12000).optional().nullable(),
  fullPatch: z.string().max(250000).optional().nullable(),
  filesChanged: z.array(z.string().trim().min(1).max(500)).max(500).default([]),
  validationResults: z.array(validationResultSchema).max(20).optional(),
  branchName: z.string().max(100).optional().nullable()
});

/** POST /api/runner/jobs/:id/patch-artifact — runner submits patch artifact */
router.post("/jobs/:id/patch-artifact", async (req, res, next) => {
  try {
    const runner = req.runner!;
    const body = patchArtifactSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Invalid request", details: body.error.flatten() });
      return;
    }

    const artifact = await createPatchArtifact({
      automationJobId: req.params.id,
      runnerId: runner.id,
      ...body.data
    });
    res.status(201).json(artifact);
  } catch (err) {
    if (err instanceof Error) {
      if (err.name === "NotFoundError") { res.status(404).json({ error: err.message }); return; }
      if (err.name === "BlockedPathError") { res.status(422).json({ error: err.message }); return; }
    }
    next(err);
  }
});

const branchPushSchema = z.object({
  branchName: z.string().trim().min(1).max(100)
});

/** POST /api/runner/jobs/:jobId/patch-artifacts/:artifactId/branch-pushed — runner confirms push */
router.post("/jobs/:jobId/patch-artifacts/:artifactId/branch-pushed", async (req, res, next) => {
  try {
    const runner = req.runner!;
    const body = branchPushSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Invalid request", details: body.error.flatten() });
      return;
    }

    await auditLog({
      action: "branch_push_requested",
      resourceType: "PatchArtifact",
      resourceId: req.params.artifactId,
      metadata: { runnerId: runner.id, branchName: body.data.branchName }
    }).catch(() => undefined);

    const artifact = await markBranchPushed(req.params.artifactId, runner.id, body.data.branchName);
    res.json(artifact);
  } catch (err) {
    if (err instanceof Error && err.name === "NotFoundError") {
      res.status(404).json({ error: err.message });
      return;
    }
    next(err);
  }
});

/** GET /api/runner/settings — runner fetches server-side settings */
router.get("/settings", async (_req, res, next) => {
  try {
    const [allowBranchPush, allowPrCreate] = await Promise.all([
      getBooleanSetting("ALLOW_RUNNER_BRANCH_PUSH", false),
      getBooleanSetting("ALLOW_RUNNER_PR_CREATE", false)
    ]);
    res.json({ allowBranchPush, allowPrCreate });
  } catch (err) {
    next(err);
  }
});

/** GET /api/runner/patch-artifacts/:id — runner reads patch artifact status */
router.get("/patch-artifacts/:id", async (req, res, next) => {
  try {
    const { id } = req.params as { id: string };
    const artifact = await getPatchArtifact(id);
    if (!artifact) {
      res.status(404).json({ error: "PatchArtifact not found" });
      return;
    }
    res.json({ id: artifact.id, validationStatus: artifact.validationStatus, riskLevel: artifact.riskLevel });
  } catch (err) {
    next(err);
  }
});

export default router;
