import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { requireRole } from "../middleware/rbac.js";
import { auditLog } from "../services/auditService.js";
import { ensureDefaultProjects, exportProjectObsidian, getProjectOverview } from "../services/projectService.js";
import { getLatestSnapshot, scanAndSaveSnapshot } from "../services/repositoryScanService.js";
import {
  createLocalDocumentRoot,
  listLocalDocumentRoots,
  updateLocalDocumentRoot,
  scanLocalDocumentRoot,
  getLatestLocalDocumentSnapshot,
  listLocalDocumentInsights,
  readLocalDocumentFile
} from "../services/localDocumentAccessService.js";
import { explainContextBindingStatus, repairProjectWorkOrderContexts } from "../services/projectContextBindingService.js";

const router = Router();

const projectSchema = z.object({
  name: z.string().trim().min(1).max(160),
  codename: z.string().trim().max(120).optional().nullable(),
  description: z.string().trim().max(4000).default(""),
  status: z.enum(["ACTIVE", "PAUSED", "COMPLETED", "ARCHIVED"]).default("ACTIVE"),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
  goals: z.array(z.string().trim().min(1).max(300)).max(50).default([]),
  keywords: z.array(z.string().trim().min(1).max(100)).max(100).default([]),
  aliases: z.array(z.string().trim().min(1).max(100)).max(50).default([]),
  repositoryUrl: z.string().trim().max(500).optional().nullable(),
  localPath: z.string().trim().max(500).optional().nullable(),
  activeMilestone: z.string().trim().max(200).optional().nullable(),
  ownerUserId: z.string().trim().max(120).optional().nullable()
});

router.get("/", async (req, res, next) => {
  try {
    await ensureDefaultProjects();
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const priority = typeof req.query.priority === "string" ? req.query.priority : undefined;
    const projects = await prisma.project.findMany({
      where: {
        ...(status ? { status: status as never } : {}),
        ...(priority ? { priority: priority as never } : {}),
        ...(q ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { codename: { contains: q, mode: "insensitive" } },
            { description: { contains: q, mode: "insensitive" } },
            { keywords: { hasSome: q.toLowerCase().split(/\W+/).filter(Boolean) } }
          ]
        } : {})
      },
      orderBy: [{ status: "asc" }, { priority: "desc" }, { updatedAt: "desc" }]
    });
    res.json({ projects });
  } catch (error) {
    next(error);
  }
});

router.post("/", requireRole("KING", "CROWN_PRINCE"), async (req, res, next) => {
  try {
    const payload = projectSchema.parse(req.body);
    const project = await prisma.project.create({
      data: { ...payload, keywords: uniqueLower(payload.keywords), aliases: uniqueLower(payload.aliases) }
    });
    await auditLog({ userId: req.user?.id, action: "create_project", resourceType: "project", resourceId: project.id, metadata: { name: project.name } });
    res.status(201).json({ project });
  } catch (error) {
    next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const project = await prisma.project.findUnique({ where: { id: req.params.id } });
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    res.json({ project });
  } catch (error) {
    next(error);
  }
});

router.patch("/:id", requireRole("KING", "CROWN_PRINCE"), async (req, res, next) => {
  try {
    const existing = await prisma.project.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    const payload = projectSchema.partial().parse(req.body);
    const project = await prisma.project.update({
      where: { id: existing.id },
      data: {
        ...payload,
        ...(payload.keywords ? { keywords: uniqueLower(payload.keywords) } : {}),
        ...(payload.aliases ? { aliases: uniqueLower(payload.aliases) } : {})
      }
    });
    await auditLog({ userId: req.user?.id, action: "update_project", resourceType: "project", resourceId: project.id, metadata: { status: project.status } });
    res.json({ project });
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", requireRole("KING"), async (req, res, next) => {
  try {
    const existing = await prisma.project.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    await prisma.project.update({ where: { id: existing.id }, data: { status: "ARCHIVED" } });
    await auditLog({ userId: req.user?.id, action: "delete_project", resourceType: "project", resourceId: existing.id, metadata: { archived: true } });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.get("/:id/overview", async (req, res, next) => {
  try {
    res.json(await getProjectOverview(req.params.id));
  } catch (error) {
    if (error instanceof Error && error.name === "NotFoundError") {
      res.status(404).json({ error: error.message });
      return;
    }
    next(error);
  }
});

router.get("/:id/tasks", listProjectRows("task", "tasks"));
router.get("/:id/matters", listProjectRows("matter", "matters"));
router.get("/:id/work-orders", listProjectRows("workOrder", "workOrders"));
router.get("/:id/reports", listProjectRows("report", "reports"));
router.get("/:id/memories", listProjectRows("memory", "memories"));
router.get("/:id/artifacts", listProjectRows("artifact", "artifacts"));

router.get("/:id/repository", async (req, res, next) => {
  try {
    const snapshot = await getLatestSnapshot(req.params.id);
    res.json({ snapshot });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/repository/scan", async (req, res, next) => {
  try {
    const snapshot = await scanAndSaveSnapshot(req.params.id);
    await auditLog({ userId: req.user?.id, action: "scan_repository", resourceType: "project", resourceId: req.params.id });
    res.status(201).json({ snapshot });
  } catch (error) {
    if (error instanceof Error && error.name === "NotFoundError") {
      res.status(404).json({ error: error.message });
      return;
    }
    next(error);
  }
});

router.post("/:id/export/obsidian", async (req, res, next) => {
  try {
    const exportPayload = await exportProjectObsidian(req.params.id);
    res.json(exportPayload);
  } catch (error) {
    if (error instanceof Error && error.name === "NotFoundError") {
      res.status(404).json({ error: error.message });
      return;
    }
    next(error);
  }
});

const createRootSchema = z.object({
  name: z.string().trim().min(1).max(200),
  rootPath: z.string().trim().min(1).max(1000),
  allowedGlobs: z.array(z.string()).optional(),
  blockedGlobs: z.array(z.string()).optional(),
  maxFileBytes: z.number().int().positive().optional(),
  maxTotalBytes: z.number().int().positive().optional(),
  isActive: z.boolean().optional()
});

const updateRootSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  isActive: z.boolean().optional(),
  allowedGlobs: z.array(z.string()).optional(),
  blockedGlobs: z.array(z.string()).optional(),
  maxFileBytes: z.number().int().positive().optional(),
  maxTotalBytes: z.number().int().positive().optional()
});

const readFileSchema = z.object({
  rootId: z.string().min(1),
  relativePath: z.string().min(1)
});

/** GET /api/projects/:id/context-health — read-only project context binding health */
router.get("/:id/context-health", async (req, res, next) => {
  try {
    const projectId = req.params.id;
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, name: true } });
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    const explanation = await explainContextBindingStatus(projectId);
    const openWorkOrders = await prisma.workOrder.findMany({
      where: { projectId, status: { in: ["DRAFT", "READY", "IN_PROGRESS", "NEEDS_REVIEW"] } },
      select: { id: true, title: true, status: true, contextBindingStatus: true, contextBoundAt: true, localDocumentSnapshotId: true },
      orderBy: { updatedAt: "desc" },
      take: 50
    });
    const latestSnapshotId = explanation.binding.localDocumentSnapshotId;
    res.json({
      status: explanation.status,
      lines: explanation.lines,
      binding: explanation.binding,
      openWorkOrders: openWorkOrders.map((w) => ({
        ...w,
        boundToLatestSnapshot: Boolean(latestSnapshotId && w.localDocumentSnapshotId === latestSnapshotId)
      }))
    });
  } catch (error) {
    next(error);
  }
});

/** GET /api/projects/:id/local-docs — roots + latest snapshot summary (no scan) */
router.get("/:id/local-docs", async (req, res, next) => {
  try {
    const projectId = req.params.id;
    const [roots, snapshot] = await Promise.all([
      listLocalDocumentRoots(projectId),
      getLatestLocalDocumentSnapshot(projectId)
    ]);
    res.json({ roots, snapshot });
  } catch (error) {
    next(error);
  }
});

/** POST /api/projects/:id/local-docs/roots — KING/CROWN_PRINCE add a local document root */
router.post("/:id/local-docs/roots", requireRole("KING", "CROWN_PRINCE"), async (req, res, next) => {
  try {
    const body = createRootSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Invalid request", details: body.error.flatten() });
      return;
    }
    const root = await createLocalDocumentRoot(req.params.id as string, body.data);
    res.status(201).json(root);
  } catch (error) {
    if (error instanceof Error && error.name === "NotFoundError") {
      res.status(404).json({ error: error.message });
      return;
    }
    next(error);
  }
});

/** PATCH /api/projects/:id/local-docs/roots/:rootId — KING/CROWN_PRINCE update a root */
router.patch("/:id/local-docs/roots/:rootId", requireRole("KING", "CROWN_PRINCE"), async (req, res, next) => {
  try {
    const body = updateRootSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Invalid request", details: body.error.flatten() });
      return;
    }
    const root = await updateLocalDocumentRoot(req.params.rootId as string, body.data);
    res.json(root);
  } catch (error) {
    if (error instanceof Error && error.name === "NotFoundError") {
      res.status(404).json({ error: error.message });
      return;
    }
    next(error);
  }
});

/** POST /api/projects/:id/local-docs/roots/:rootId/scan — KING/CROWN_PRINCE trigger a scan */
router.post("/:id/local-docs/roots/:rootId/scan", requireRole("KING", "CROWN_PRINCE"), async (req, res, next) => {
  try {
    const snapshot = await scanLocalDocumentRoot(req.params.rootId as string);
    res.status(201).json(snapshot);
  } catch (error) {
    if (error instanceof Error && error.name === "NotFoundError") {
      res.status(404).json({ error: error.message });
      return;
    }
    next(error);
  }
});

/** GET /api/projects/:id/local-docs/snapshots/latest — latest snapshot (no scan) */
router.get("/:id/local-docs/snapshots/latest", async (req, res, next) => {
  try {
    const snapshot = await getLatestLocalDocumentSnapshot(req.params.id);
    res.json({ snapshot });
  } catch (error) {
    next(error);
  }
});

/** GET /api/projects/:id/local-docs/insights — insights for latest (or given) snapshot */
router.get("/:id/local-docs/insights", async (req, res, next) => {
  try {
    const snapshotId = typeof req.query.snapshotId === "string" ? req.query.snapshotId : undefined;
    const insights = await listLocalDocumentInsights(req.params.id, snapshotId);
    res.json({ insights });
  } catch (error) {
    next(error);
  }
});

/** POST /api/projects/:id/local-docs/read-file — KING only, guarded full-content read */
router.post("/:id/local-docs/read-file", requireRole("KING"), async (req, res, next) => {
  try {
    const body = readFileSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Invalid request", details: body.error.flatten() });
      return;
    }

    const root = await prisma.localDocumentRoot.findFirst({ where: { id: body.data.rootId, projectId: req.params.id } });
    if (!root) {
      res.status(404).json({ error: "LocalDocumentRoot not found" });
      return;
    }

    const result = await readLocalDocumentFile(body.data.rootId, body.data.relativePath);
    if (!result.ok) {
      await auditLog({
        userId: req.user?.id,
        action: "local_document_file_read_blocked",
        resourceType: "LocalDocumentRoot",
        resourceId: body.data.rootId,
        metadata: { projectId: req.params.id, relativePath: body.data.relativePath, reason: result.reason }
      }).catch(() => undefined);
      res.status(403).json({ error: result.reason });
      return;
    }

    await auditLog({
      userId: req.user?.id,
      action: "local_document_file_read",
      resourceType: "LocalDocumentRoot",
      resourceId: body.data.rootId,
      metadata: { projectId: req.params.id, relativePath: body.data.relativePath, sizeBytes: result.sizeBytes }
    }).catch(() => undefined);

    res.json({ relativePath: result.relativePath, content: result.content, sizeBytes: result.sizeBytes });
  } catch (error) {
    next(error);
  }
});

function listProjectRows(model: "task" | "matter" | "workOrder" | "report" | "memory" | "artifact", key: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const projectId = req.params.id;
      const query = { where: { projectId }, orderBy: { updatedAt: "desc" as const }, take: 100 };
      const rows =
        model === "task" ? await prisma.task.findMany(query) :
        model === "matter" ? await prisma.matter.findMany(query) :
        model === "workOrder" ? await prisma.workOrder.findMany(query) :
        model === "report" ? await prisma.report.findMany(query) :
        model === "memory" ? await prisma.memory.findMany(query) :
        await prisma.artifact.findMany(query);
      res.json({ [key]: rows });
    } catch (error) {
      next(error);
    }
  };
}

/** POST /api/projects/:id/rebind-contexts — bulk-repair MISSING/STALE work order context bindings (KING/CROWN_PRINCE). */
router.post("/:id/rebind-contexts", requireRole("KING", "CROWN_PRINCE"), async (req, res, next) => {
  try {
    const result = await repairProjectWorkOrderContexts(req.params.id as string, { userId: req.user?.id });
    res.json({ result });
  } catch (error) {
    if (error instanceof Error && error.name === "NotFoundError") {
      res.status(404).json({ error: error.message });
      return;
    }
    next(error);
  }
});

function uniqueLower(values: string[]) {
  return [...new Set(values.map((value) => value.toLowerCase()))];
}

export default router;
