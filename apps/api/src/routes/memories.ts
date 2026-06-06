import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { auditLog } from "../services/auditService.js";

const router = Router();

const memorySchema = z.object({
  type: z.enum(["DECISION", "FACT", "PREFERENCE", "CONSTRAINT", "PROJECT_NOTE", "LESSON"]).default("PROJECT_NOTE"),
  title: z.string().trim().min(1, "Memory title is required").max(160),
  content: z.string().trim().min(1, "Memory content is required").max(1200),
  projectId: z.string().optional().nullable(),
  sourceTaskId: z.string().optional().nullable(),
  sourceCouncilSessionId: z.string().optional().nullable(),
  tags: z.array(z.string().trim().min(1).max(32)).max(12).default([]),
  importance: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM")
});

const memoryPatchSchema = memorySchema.partial();

router.post("/", async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const payload = memorySchema.parse(req.body);
    const memory = await prisma.memory.create({
      data: {
        ...payload,
        tags: [...new Set(payload.tags.map((tag) => tag.toLowerCase()))],
        createdBy: userId
      }
    });
    res.status(201).json({ memory });
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

    const type = typeof req.query.type === "string" ? req.query.type : undefined;
    const memories = await prisma.memory.findMany({
      where: {
        createdBy: userId,
        ...(type ? { type: type as never } : {})
      },
      orderBy: [{ importance: "desc" }, { updatedAt: "desc" }]
    });
    res.json({ memories });
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
      res.json({ memories: [] });
      return;
    }

    const tokens = [...new Set(q.toLowerCase().split(/\W+/).filter((token) => token.length > 2))];
    const memories = await prisma.memory.findMany({
      where: {
        createdBy: userId,
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { content: { contains: q, mode: "insensitive" } },
          { tags: { hasSome: tokens } }
        ]
      },
      orderBy: [{ importance: "desc" }, { updatedAt: "desc" }],
      take: 50
    });
    res.json({ memories });
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

    const memory = await prisma.memory.findFirst({
      where: { id: req.params.id, createdBy: userId }
    });
    if (!memory) {
      res.status(404).json({ error: "Memory not found" });
      return;
    }
    res.json({ memory });
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

    const existing = await prisma.memory.findFirst({
      where: { id: req.params.id, createdBy: userId }
    });
    if (!existing) {
      res.status(404).json({ error: "Memory not found" });
      return;
    }

    const payload = memoryPatchSchema.parse(req.body);
    const memory = await prisma.memory.update({
      where: { id: existing.id },
      data: {
        ...payload,
        ...(payload.tags ? { tags: [...new Set(payload.tags.map((tag) => tag.toLowerCase()))] } : {})
      }
    });
    res.json({ memory });
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

    const existing = await prisma.memory.findFirst({
      where: { id: req.params.id, createdBy: userId }
    });
    if (!existing) {
      res.status(404).json({ error: "Memory not found" });
      return;
    }

    await prisma.memory.delete({ where: { id: existing.id } });
    await auditLog({
      userId,
      action: "delete_memory",
      resourceType: "memory",
      resourceId: existing.id,
      metadata: { title: existing.title, type: existing.type }
    });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
