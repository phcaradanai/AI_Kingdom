import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { requireRole } from "../middleware/rbac.js";
import { auditLog } from "../services/auditService.js";
import { createHandoffBrief, createWorkOrder } from "../services/externalAgentWorkOrderService.js";
import { getTaskForUser } from "../services/orchestrator.js";
import { processTaskWithGrandVizier } from "../services/grandVizierOrchestrator.js";
import { routeProjectForSource } from "../services/projectRoutingService.js";
import { redactSecrets } from "../services/usageAttributionService.js";
import { startOrContinueDecreeToDoneWorkflow } from "../services/decreeToDoneWorkflowService.js";

const router = Router();

const commandSchema = z.object({
  title: z.string().trim().min(1).max(140).optional(),
  projectId: z.string().trim().max(120).optional().nullable(),
  command: z.string().trim().min(1, "Royal command is required").max(4000),
  mode: z.enum(["ASK", "PLAN", "RESEARCH", "BUILD"], {
    required_error: "Mode is required",
    invalid_type_error: "Mode must be ASK, PLAN, RESEARCH, or BUILD"
  })
});

const statusSchema = z.object({
  status: z.enum(["PENDING", "RUNNING", "COMPLETED", "FAILED"], {
    required_error: "Status is required",
    invalid_type_error: "Status must be PENDING, RUNNING, COMPLETED, or FAILED"
  })
});

router.post("/", async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const { command, mode, title, projectId } = commandSchema.parse(req.body);
    const taskTitle = title ?? command.split(/\s+/).slice(0, 8).join(" ");
    const task = await prisma.task.create({
      data: {
        title: taskTitle,
        projectId: projectId ?? undefined,
        command,
        mode,
        status: "PENDING",
        createdBy: userId
      },
      include: {
        sessions: {
          include: {
            responses: { include: { agent: true }, orderBy: { createdAt: "asc" } },
            reports: true
          },
          orderBy: { createdAt: "desc" }
        },
        reports: true
      }
    });
    if (!projectId) {
      await routeProjectForSource({ title: task.title, content: task.command, sourceType: "TASK", sourceId: task.id }).catch(() => undefined);
    }
    const workflow = mode === "BUILD"
      ? await startOrContinueDecreeToDoneWorkflow(task.id, userId)
      : null;
    const session = workflow
      ? await prisma.councilSession.findFirst({
          where: { taskId: task.id, status: "COMPLETED" },
          include: { task: true, responses: { include: { agent: true }, orderBy: { createdAt: "asc" } } },
          orderBy: { createdAt: "desc" }
        })
      : await processTaskWithGrandVizier(task.id, userId);
    const processedTask = await getTaskForUser(userId, task.id);
    res.status(201).json({ task: processedTask, session, workflow });
  } catch (error) {
    next(error);
  }
});

router.get("/", async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const tasks = await prisma.task.findMany({
      where: { createdBy: userId },
      include: {
        sessions: {
          include: {
            responses: { include: { agent: true }, orderBy: { createdAt: "asc" } },
            reports: true
          },
          orderBy: { createdAt: "desc" }
        },
        reports: true
      },
      orderBy: { createdAt: "desc" }
    });
    res.json({ tasks });
  } catch (error) {
    next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const task = await getTaskForUser(userId, req.params.id);
    res.json({ task });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/process", async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const sourceTask = await prisma.task.findFirst({ where: { id: req.params.id, createdBy: userId }, select: { mode: true } });
    if (!sourceTask) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    const workflow = sourceTask.mode === "BUILD"
      ? await startOrContinueDecreeToDoneWorkflow(req.params.id, userId)
      : null;
    const session = workflow
      ? await prisma.councilSession.findFirst({
          where: { taskId: req.params.id, status: "COMPLETED" },
          include: { task: true, responses: { include: { agent: true }, orderBy: { createdAt: "asc" } } },
          orderBy: { createdAt: "desc" }
        })
      : await processTaskWithGrandVizier(req.params.id, userId);
    const task = await getTaskForUser(userId, req.params.id);
    res.status(201).json({ session, task, workflow });
  } catch (error) {
    if (error instanceof Error && error.name === "NotFoundError") {
      res.status(404).json({ error: error.message });
      return;
    }
    if (error instanceof Error && error.name === "ConflictError") {
      res.status(409).json({ error: error.message });
      return;
    }
    next(error);
  }
});

router.get("/:id/council", async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const task = await prisma.task.findFirst({
      where: { id: req.params.id, createdBy: userId },
      include: {
        sessions: {
          include: {
            task: true,
            reports: true,
            responses: {
              include: { agent: true },
              orderBy: { createdAt: "asc" }
            }
          },
          orderBy: { createdAt: "desc" }
        }
      }
    });

    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    res.json({ sessions: task.sessions });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/council/:sessionId/handoff", requireRole("KING", "CROWN_PRINCE"), async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const task = await prisma.task.findFirst({
      where: { id: req.params.id, createdBy: userId },
      include: {
        sessions: {
          where: { id: req.params.sessionId },
          include: { responses: { include: { agent: true }, orderBy: { createdAt: "asc" } } }
        }
      }
    });

    const session = task?.sessions[0];
    if (!task || !session) {
      res.status(404).json({ error: "Council session not found" });
      return;
    }
    if (session.status !== "COMPLETED") {
      res.status(409).json({ error: "Council session must be completed before creating a handoff" });
      return;
    }

    const roleResponses = new Map(session.responses.map((response) => [response.role, response.response]));
    const architect = roleResponses.get("Royal Architect") ?? "";
    const general = roleResponses.get("Royal General") ?? "";
    const archivist = roleResponses.get("Royal Archivist") ?? "";
    const researcher = roleResponses.get("Royal Researcher") ?? "";
    const finalSummary = session.finalSummary ?? "";

    const context = redactPublicOutput([
      `Source Royal Command: ${task.title}`,
      `Mode: ${task.mode}`,
      `Command: ${task.command}`,
      finalSummary ? `Grand Vizier Recommendation:\n${finalSummary}` : "",
      architect ? `Architect Plan:\n${architect}` : "",
      general ? `General Roadmap:\n${general}` : "",
      archivist ? `Archivist Context:\n${archivist}` : "",
      researcher ? `Researcher Analysis:\n${researcher}` : ""
    ].filter(Boolean).join("\n\n"));

    const workOrderResult = await createWorkOrder({
      title: `External Handoff: ${task.title}`,
      objective: redactPublicOutput(task.command),
      context,
      instructions: "Manual external-agent handoff only. Use the Architect plan and General checklist to prepare scoped implementation guidance. Do not create runner jobs, patches, merges, deploys, or PRs automatically.",
      constraints: [
        "Do not expose secrets.",
        "Do not weaken runner auth.",
        "Do not weaken project context binding.",
        "Do not create SANDBOX_PATCH unless contextBindingStatus is FRESH and the King explicitly approves it later.",
        "Do not auto-merge, auto-deploy, or auto-create PRs.",
        "Keep all work manual-review first."
      ].join("\n"),
      acceptanceCriteria: [
        "Handoff includes evidence, hypotheses, patch plan, execution checklist, and final recommendation.",
        "No AutomationJob, patch, merge, deploy, or PR is created by this action.",
        "Validation commands are listed for a future manual implementation pass.",
        "Secrets and raw local root paths are not included."
      ],
      validationCommands: [
        "npm run typecheck",
        "npm run test --workspace @ai-kingdom/api",
        "npm run test --workspace @ai-kingdom/runner",
        "npm run test --workspace @ai-kingdom/web",
        "npm run build"
      ],
      projectId: task.projectId,
      targetProject: task.projectId ? null : "AI Kingdom",
      sourceType: "COUNCIL_HANDOFF",
      sourceId: task.id,
      status: "READY",
      priority: task.mode === "BUILD" ? "HIGH" : "MEDIUM",
      createdByUserId: userId,
      provenance: { source: "ROYAL_COMMAND_COUNCIL_HANDOFF", taskId: task.id, councilSessionId: session.id }
    }, true);

    if (!workOrderResult.workOrder) {
      res.status(409).json({ status: workOrderResult.status, reason: workOrderResult.reason ?? "Work order could not be created" });
      return;
    }

    if (workOrderResult.status === "EXISTING") {
      const existingBrief = await prisma.handoffBrief.findFirst({
        where: { workOrderId: workOrderResult.workOrder.id },
        orderBy: { createdAt: "desc" }
      });
      res.status(200).json({ workOrder: workOrderResult.workOrder, handoffBrief: existingBrief ?? null });
      return;
    }

    const handoffBrief = await createHandoffBrief(workOrderResult.workOrder.id);
    await auditLog({
      userId,
      action: "create_royal_command_handoff",
      resourceType: "handoff_brief",
      resourceId: handoffBrief.id,
      metadata: { taskId: task.id, councilSessionId: session.id, workOrderId: workOrderResult.workOrder.id }
    });
    res.status(201).json({ workOrder: workOrderResult.workOrder, handoffBrief });
  } catch (error) {
    next(error);
  }
});

router.patch("/:id/status", async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const { status } = statusSchema.parse(req.body);
    const existingTask = await prisma.task.findFirst({
      where: { id: req.params.id, createdBy: userId }
    });

    if (!existingTask) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    const task = await prisma.task.update({
      where: { id: existingTask.id },
      data: { status },
      include: {
        sessions: {
          include: {
            responses: { include: { agent: true }, orderBy: { createdAt: "asc" } },
            reports: true
          },
          orderBy: { createdAt: "desc" }
        },
        reports: true
      }
    });
    res.json({ task });
  } catch (error) {
    next(error);
  }
});

export default router;

function redactPublicOutput(value: string): string {
  return redactSecrets(value)
    .replace(/\/Users\/[^\s"'`),;]+/g, "[LOCAL_PATH_REDACTED]")
    .replace(/\/private\/(?:tmp|var)\/[^\s"'`),;]+/g, "[LOCAL_PATH_REDACTED]");
}
