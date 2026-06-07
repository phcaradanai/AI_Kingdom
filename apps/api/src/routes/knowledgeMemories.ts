import { Router } from "express";
import { prisma } from "../db/prisma.js";
import { buildAgentKnowledgeContext } from "../services/agentKnowledgeService.js";

const router = Router();

// GET /api/knowledge-memories
router.get("/", async (req, res, next) => {
  try {
    const { agentId, projectId, category, tag, trustLevel, limit = "50", offset = "0" } = req.query as Record<string, string>;

    const memories = await prisma.agentKnowledgeMemory.findMany({
      where: {
        ...(agentId ? { agentId } : {}),
        ...(projectId ? { projectId } : {}),
        ...(category ? { category: category as "UNKNOWN" } : {}),
        ...(trustLevel ? { trustLevel } : {}),
        ...(tag ? { tags: { has: tag } } : {})
      },
      orderBy: [{ useCount: "desc" }, { approvedAt: "desc" }],
      take: Math.min(Number(limit), 100),
      skip: Number(offset)
    });

    res.json({ memories });
  } catch (error) {
    next(error);
  }
});

// GET /api/knowledge-memories/:id
router.get("/:id", async (req, res, next) => {
  try {
    const memory = await prisma.agentKnowledgeMemory.findUnique({
      where: { id: req.params.id }
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

// POST /api/knowledge-memories/:id/archive
router.post("/:id/archive", async (req, res, next) => {
  try {
    const memory = await prisma.agentKnowledgeMemory.update({
      where: { id: req.params.id },
      data: { trustLevel: "ARCHIVED" }
    });
    res.json({ memory });
  } catch (error) {
    next(error);
  }
});

// GET /api/knowledge-memories/context
router.get("/context/:agentId", async (req, res, next) => {
  try {
    const { projectId, taskId } = req.query as { projectId?: string; taskId?: string };
    const result = await buildAgentKnowledgeContext(req.params.agentId, projectId, taskId);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// GET /api/knowledge-memories/agent/:agentId
router.get("/agent/:agentId", async (req, res, next) => {
  try {
    const memories = await prisma.agentKnowledgeMemory.findMany({
      where: { agentId: req.params.agentId },
      orderBy: [{ useCount: "desc" }, { approvedAt: "desc" }],
      take: 50
    });
    res.json({ memories });
  } catch (error) {
    next(error);
  }
});

export default router;
