import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";

const router = Router();

const reportSchema = z.object({
  title: z.string().trim().min(1, "Report title is required").max(180),
  summary: z.string().trim().min(1, "Report summary is required").max(2000),
  content: z.string().trim().min(1, "Report content is required").max(12000),
  projectId: z.string().optional().nullable(),
  sourceTaskId: z.string().optional().nullable(),
  sourceCouncilSessionId: z.string().optional().nullable(),
  category: z.enum(["STRATEGY", "RESEARCH", "ARCHITECTURE", "FINANCE", "GENERAL", "OTHER"]).default("GENERAL"),
  importance: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
  tags: z.array(z.string().trim().min(1).max(32)).max(16).default([])
});

const reportPatchSchema = reportSchema.partial();

const includeReportRelations = {
  task: {
    select: {
      id: true,
      command: true,
      status: true,
      mode: true,
      createdAt: true
    }
  },
  councilSession: {
    include: {
      responses: {
        include: { agent: true },
        orderBy: { createdAt: "asc" as const }
      }
    }
  }
};

router.get("/", async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const category = typeof req.query.category === "string" ? req.query.category : undefined;
    const importance = typeof req.query.importance === "string" ? req.query.importance : undefined;
    const reports = await prisma.report.findMany({
      where: {
        createdBy: userId,
        ...(category ? { category: category as never } : {}),
        ...(importance ? { importance: importance as never } : {})
      },
      include: includeReportRelations,
      orderBy: [{ importance: "desc" }, { updatedAt: "desc" }]
    });
    res.json({ reports });
  } catch (error) {
    next(error);
  }
});

router.get("/search", async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (!q) {
      res.json({ reports: [] });
      return;
    }

    const tokens = [...new Set(q.toLowerCase().split(/\W+/).filter((token) => token.length > 2))];
    const reports = await prisma.report.findMany({
      where: {
        createdBy: userId,
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { summary: { contains: q, mode: "insensitive" } },
          { content: { contains: q, mode: "insensitive" } },
          { tags: { hasSome: tokens } }
        ]
      },
      include: includeReportRelations,
      orderBy: [{ importance: "desc" }, { updatedAt: "desc" }],
      take: 50
    });
    res.json({ reports });
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const payload = reportSchema.parse(req.body);
    const report = await prisma.report.create({
      data: {
        ...payload,
        tags: [...new Set(payload.tags.map((tag) => tag.toLowerCase()))],
        createdBy: userId
      },
      include: includeReportRelations
    });
    res.status(201).json({ report });
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

    const report = await prisma.report.findFirst({
      where: { id: req.params.id, createdBy: userId },
      include: includeReportRelations
    });
    if (!report) {
      res.status(404).json({ error: "Report not found" });
      return;
    }
    res.json({ report });
  } catch (error) {
    next(error);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const existing = await prisma.report.findFirst({
      where: { id: req.params.id, createdBy: userId }
    });
    if (!existing) {
      res.status(404).json({ error: "Report not found" });
      return;
    }

    const payload = reportPatchSchema.parse(req.body);
    const report = await prisma.report.update({
      where: { id: existing.id },
      data: {
        ...payload,
        ...(payload.tags ? { tags: [...new Set(payload.tags.map((tag) => tag.toLowerCase()))] } : {})
      },
      include: includeReportRelations
    });
    res.json({ report });
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const existing = await prisma.report.findFirst({
      where: { id: req.params.id, createdBy: userId }
    });
    if (!existing) {
      res.status(404).json({ error: "Report not found" });
      return;
    }

    await prisma.report.delete({ where: { id: existing.id } });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
