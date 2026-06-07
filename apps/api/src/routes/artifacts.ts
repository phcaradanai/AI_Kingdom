import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { requireRole } from "../middleware/rbac.js";
import {
  type DataQuality,
  classifyArtifact,
  enrichDataQuality,
  normalizeTitle,
  shouldIncludeByQuality
} from "../services/dataQualityService.js";
import { createArtifact } from "../services/projectService.js";

const router = Router();

const artifactSchema = z.object({
  projectId: z.string().trim().max(120).optional().nullable(),
  title: z.string().trim().min(1).max(200),
  type: z.enum(["PROMPT", "SPEC", "DECISION", "IMPLEMENTATION_REPORT", "HANDOFF_BRIEF", "ARCHITECTURE_NOTE", "MARKET_RESEARCH", "CODE_PLAN", "ROYAL_DECREE", "GENERAL_NOTE"]).default("GENERAL_NOTE"),
  content: z.string().trim().min(1).max(20000),
  sourceType: z.string().trim().max(80).optional().nullable(),
  sourceId: z.string().trim().max(120).optional().nullable(),
  traceId: z.string().trim().max(160).optional().nullable(),
  tags: z.array(z.string().trim().min(1).max(80)).max(50).default([])
});

router.get("/", async (req, res, next) => {
  try {
    const projectId = typeof req.query.projectId === "string" ? req.query.projectId : undefined;
    const type = typeof req.query.type === "string" ? req.query.type : undefined;
    const tag = typeof req.query.tag === "string" ? req.query.tag : undefined;
    const includeTestData = req.query.includeTestData === "true";
    const dataQuality = req.query.dataQuality as DataQuality | undefined;
    const rawArtifacts = await prisma.artifact.findMany({
      where: {
        ...(projectId ? { projectId } : {}),
        ...(type ? { type: type as never } : {}),
        ...(tag ? { tags: { has: tag.toLowerCase() } } : {})
      },
      include: { project: true },
      orderBy: { updatedAt: "desc" }
    });
    const filtered = rawArtifacts.filter((artifact) => shouldIncludeByQuality(artifact, classifyArtifact(artifact), { includeTestData, dataQuality }));
    const duplicateKeys = findDuplicateKeys(filtered);
    const artifacts = (await enrichDataQuality("artifact", filtered)).map((artifact) => ({
      ...artifact,
      duplicateKey: getArtifactDuplicateKey(artifact),
      isDuplicate: duplicateKeys.has(getArtifactDuplicateKey(artifact))
    }));
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
    const rawArtifact = await prisma.artifact.findUnique({ where: { id: req.params.id }, include: { project: true } });
    const artifact = rawArtifact ? (await enrichDataQuality("artifact", [rawArtifact]))[0] : null;
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

router.patch("/:id/archive-duplicate", requireRole("KING", "CROWN_PRINCE"), async (req, res, next) => {
  try {
    const existing = await prisma.artifact.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: "Artifact not found" });
      return;
    }
    const artifact = await prisma.artifact.update({
      where: { id: existing.id },
      data: { tags: [...new Set([...existing.tags, "archived-duplicate"])] },
      include: { project: true }
    });
    res.json({ artifact: (await enrichDataQuality("artifact", [artifact]))[0] });
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

function getArtifactDuplicateKey(artifact: { title: string; type: string; sourceType?: string | null; sourceId?: string | null }) {
  return [normalizeTitle(artifact.title), artifact.type, artifact.sourceType ?? "", artifact.sourceId ?? ""].join("|");
}

function findDuplicateKeys(artifacts: Array<{ title: string; type: string; sourceType?: string | null; sourceId?: string | null }>) {
  const counts = new Map<string, number>();
  for (const artifact of artifacts) {
    const key = getArtifactDuplicateKey(artifact);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([key]) => key));
}
