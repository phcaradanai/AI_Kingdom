import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { getTaskForUser } from "../services/orchestrator.js";
import { processTaskWithGrandVizier } from "../services/grandVizierOrchestrator.js";
import { routeProjectForSource } from "../services/projectRoutingService.js";

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
    const session = await processTaskWithGrandVizier(task.id, userId);
    const processedTask = await getTaskForUser(userId, task.id);
    res.status(201).json({ task: processedTask, session });
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
    const session = await processTaskWithGrandVizier(req.params.id, userId);
    const task = await getTaskForUser(userId, req.params.id);
    res.status(201).json({ session, task });
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
