import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { requireRole } from "../middleware/rbac.js";
import { createArtifact } from "../services/projectService.js";

const router = Router();

const artifactSchema = z.object({
  projectId: z.string().trim().max(120).optional().nullable(),
  title: z.string().trim().min(1).max(200),
  type: z.enum(["PROMPT", "SPEC", "DECISION", "IMPLEMENTATION_REPORT", "HANDOFF_BRIEF", "ARCHITECTURE_NOTE", "MARKET_RESEARCH", "CODE_PLAN", "ROYAL_DECREE", "GENERAL_NOTE"]).default("GENERAL_NOTE"),
  content: z.string().trim().min(1).max(20000),
  sourceType: z.string().trim().max(80).optional().nullable(),
  sourceId: z.string().trim().max(120).optional().nullable(),
  tags: z.array(z.string().trim().min(1).max(80)).max(50).default([])
});

router.get("/", async (req, res, next) => {
  try {
    const projectId = typeof req.query.projectId === "string" ? req.query.projectId : undefined;
    const type = typeof req.query.type === "string" ? req.query.type : undefined;
    const tag = typeof req.query.tag === "string" ? req.query.tag : undefined;
    const artifacts = await prisma.artifact.findMany({
      where: {
        ...(projectId ? { projectId } : {}),
        ...(type ? { type: type as never } : {}),
        ...(tag ? { tags: { has: tag.toLowerCase() } } : {})
      },
      include: { project: true },
      orderBy: { updatedAt: "desc" }
    });
    res.json({ artifacts });
  } catch (error) {
    next(error);
  }
});

router.post("/", requireRole("KING", "CROWN_PRINCE", "MINISTER"), async (req, res, next) => {
  try {
    const payload = artifactSchema.parse(req.body);
    const artifact = await createArtifact(payload);
    res.status(201).json({ artifact });
  } catch (error) {
    next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const artifact = await prisma.artifact.findUnique({ where: { id: req.params.id }, include: { project: true } });
    if (!artifact) {
      res.status(404).json({ error: "Artifact not found" });
      return;
    }
    res.json({ artifact });
  } catch (error) {
    next(error);
  }
});

router.patch("/:id", requireRole("KING", "CROWN_PRINCE"), async (req, res, next) => {
  try {
    const payload = artifactSchema.partial().parse(req.body);
    const artifact = await prisma.artifact.update({ where: { id: req.params.id }, data: payload });
    res.json({ artifact });
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", requireRole("KING"), async (req, res, next) => {
  try {
    await prisma.artifact.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
