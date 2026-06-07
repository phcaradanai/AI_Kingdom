import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import {
  approveKnowledgeCandidate,
  extractKnowledgeCandidatesFromTrace,
  findSimilarKnowledge,
  mergeKnowledgeCandidate,
  proposeKnowledgeCandidate,
  rejectKnowledgeCandidate
} from "../services/agentKnowledgeService.js";

const router = Router();

const CATEGORIES = [
  "PROJECT_FACT", "ARCHITECTURE_DECISION", "USER_PREFERENCE", "PROVIDER_BEHAVIOR",
  "WORKFLOW_RULE", "BUG_LEARNING", "PROMPT_PATTERN", "COST_LEARNING", "RISK", "UNKNOWN"
] as const;

const proposeSchema = z.object({
  agentId: z.string().min(1),
  projectId: z.string().optional().nullable(),
  taskId: z.string().optional().nullable(),
  councilSessionId: z.string().optional().nullable(),
  traceId: z.string().min(1),
  sourceType: z.string().min(1),
  sourceId: z.string().optional().nullable(),
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(2000),
  summary: z.string().optional().nullable(),
  category: z.enum(CATEGORIES).optional(),
  confidence: z.number().min(0).max(1).optional().nullable(),
  proposedByAgentId: z.string().optional().nullable(),
  tags: z.array(z.string().trim().min(1).max(40)).max(12).optional(),
  metadata: z.record(z.unknown()).optional()
});

// GET /api/knowledge-candidates
router.get("/", async (req, res, next) => {
  try {
    const { status, agentId, projectId, category, limit = "50", offset = "0" } = req.query as Record<string, string>;

    const candidates = await prisma.agentKnowledgeCandidate.findMany({
      where: {
        ...(status ? { status: status as "PENDING" } : {}),
        ...(agentId ? { agentId } : {}),
        ...(projectId ? { projectId } : {}),
        ...(category ? { category: category as "UNKNOWN" } : {})
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(Number(limit), 100),
      skip: Number(offset)
    });

    res.json({ candidates });
  } catch (error) {
    next(error);
  }
});

// GET /api/knowledge-candidates/:id
router.get("/:id", async (req, res, next) => {
  try {
    const candidate = await prisma.agentKnowledgeCandidate.findUnique({
      where: { id: req.params.id }
    });
    if (!candidate) {
      res.status(404).json({ error: "Candidate not found" });
      return;
    }
    res.json({ candidate });
  } catch (error) {
    next(error);
  }
});

// POST /api/knowledge-candidates
router.post("/", async (req, res, next) => {
  try {
    const payload = proposeSchema.parse(req.body);
    const candidate = await proposeKnowledgeCandidate(payload);
    if (!candidate) {
      res.status(409).json({ error: "Duplicate candidate or sensitive content detected" });
      return;
    }
    res.status(201).json({ candidate });
  } catch (error) {
    next(error);
  }
});

// POST /api/knowledge-candidates/extract-from-trace/:traceId
router.post("/extract-from-trace/:traceId", async (req, res, next) => {
  try {
    const candidates = await extractKnowledgeCandidatesFromTrace(req.params.traceId);
    res.json({ candidates, count: candidates.length });
  } catch (error) {
    next(error);
  }
});

// POST /api/knowledge-candidates/:id/approve
router.post("/:id/approve", async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const memory = await approveKnowledgeCandidate(req.params.id, userId);
    if (!memory) {
      res.status(404).json({ error: "Candidate not found or already reviewed" });
      return;
    }
    res.json({ memory });
  } catch (error) {
    next(error);
  }
});

// POST /api/knowledge-candidates/:id/reject
router.post("/:id/reject", async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const { reason = "Rejected by reviewer" } = req.body as { reason?: string };
    const candidate = await rejectKnowledgeCandidate(req.params.id, userId, reason);
    if (!candidate) {
      res.status(404).json({ error: "Candidate not found or already reviewed" });
      return;
    }
    res.json({ candidate });
  } catch (error) {
    next(error);
  }
});

// POST /api/knowledge-candidates/:id/merge
router.post("/:id/merge", async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const { targetMemoryId } = req.body as { targetMemoryId: string };
    if (!targetMemoryId) {
      res.status(400).json({ error: "targetMemoryId required" });
      return;
    }
    const memory = await mergeKnowledgeCandidate(req.params.id, targetMemoryId, userId);
    if (!memory) {
      res.status(404).json({ error: "Candidate or target memory not found" });
      return;
    }
    res.json({ memory });
  } catch (error) {
    next(error);
  }
});

// POST /api/knowledge-candidates/similar
router.post("/similar", async (req, res, next) => {
  try {
    const { title, content, agentId, projectId } = req.body as {
      title: string;
      content: string;
      agentId?: string;
      projectId?: string;
    };
    const similar = await findSimilarKnowledge({ title, content, agentId, projectId });
    res.json({ similar });
  } catch (error) {
    next(error);
  }
});

export default router;
