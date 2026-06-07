import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { requireRole } from "../middleware/rbac.js";
import {
  type DataQuality,
  classifyProjectInboxItem,
  enrichDataQuality,
  shouldIncludeByQuality
} from "../services/dataQualityService.js";
import { confirmInboxAssignment } from "../services/projectRoutingService.js";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const includeTestData = req.query.includeTestData === "true";
    const dataQuality = req.query.dataQuality as DataQuality | undefined;
    const sourceType = typeof req.query.sourceType === "string" ? req.query.sourceType : undefined;
    const suggestedProjectId = typeof req.query.suggestedProjectId === "string" ? req.query.suggestedProjectId : undefined;
    const confidenceMin = req.query.confidenceMin !== undefined ? Number(req.query.confidenceMin) : undefined;
    const confidenceMax = req.query.confidenceMax !== undefined ? Number(req.query.confidenceMax) : undefined;
    const rawItems = await prisma.projectInboxItem.findMany({
      where: {
        ...(status ? { status: status as never } : {}),
        ...(sourceType ? { sourceType } : {}),
        ...(suggestedProjectId ? { candidateProjectIds: { has: suggestedProjectId } } : {}),
        ...(Number.isFinite(confidenceMin) || Number.isFinite(confidenceMax) ? {
          confidenceScore: {
            ...(Number.isFinite(confidenceMin) ? { gte: confidenceMin } : {}),
            ...(Number.isFinite(confidenceMax) ? { lte: confidenceMax } : {})
          }
        } : {})
      },
      orderBy: { createdAt: "desc" }
    });
    const filtered = rawItems.filter((item) => shouldIncludeByQuality(item, classifyProjectInboxItem(item), { includeTestData, dataQuality }));
    const inboxItems = await enrichDataQuality("projectInboxItem", filtered);
    res.json({ inboxItems });
  } catch (error) {
    next(error);
  }
});

router.patch("/bulk/dismiss", requireRole("KING", "CROWN_PRINCE"), async (req, res, next) => {
  try {
    const { ids } = z.object({ ids: z.array(z.string().trim().min(1)).min(1).max(200) }).parse(req.body);
    await prisma.projectInboxItem.updateMany({ where: { id: { in: ids }, status: "PENDING" }, data: { status: "DISMISSED" } });
    const inboxItems = await prisma.projectInboxItem.findMany({ where: { id: { in: ids } }, orderBy: { createdAt: "desc" } });
    res.json({ inboxItems: await enrichDataQuality("projectInboxItem", inboxItems) });
  } catch (error) {
    next(error);
  }
});

router.patch("/bulk/assign", requireRole("KING", "CROWN_PRINCE"), async (req, res, next) => {
  try {
    const { ids, projectId } = z.object({
      ids: z.array(z.string().trim().min(1)).min(1).max(100),
      projectId: z.string().trim().min(1)
    }).parse(req.body);
    const assigned = [];
    for (const id of ids) {
      assigned.push(await confirmInboxAssignment(id, projectId));
    }
    res.json({ inboxItems: await enrichDataQuality("projectInboxItem", assigned) });
  } catch (error) {
    next(error);
  }
});

router.patch("/archive-low-confidence", requireRole("KING", "CROWN_PRINCE"), async (req, res, next) => {
  try {
    const threshold = Number(req.body?.threshold ?? 0);
    const result = await prisma.projectInboxItem.updateMany({
      where: { status: "PENDING", confidenceScore: { lte: Number.isFinite(threshold) ? threshold : 0 } },
      data: { status: "DISMISSED" }
    });
    res.json({ archived: result.count });
  } catch (error) {
    next(error);
  }
});

router.patch("/:id/assign", requireRole("KING", "CROWN_PRINCE"), async (req, res, next) => {
  try {
    const { id } = req.params as { id: string };
    const { projectId } = z.object({ projectId: z.string().trim().min(1) }).parse(req.body);
    const inboxItem = await confirmInboxAssignment(id, projectId);
    res.json({ inboxItem });
  } catch (error) {
    if (error instanceof Error && error.name === "NotFoundError") {
      res.status(404).json({ error: error.message });
      return;
    }
    next(error);
  }
});

router.patch("/:id/dismiss", requireRole("KING", "CROWN_PRINCE"), async (req, res, next) => {
  try {
    const { id } = req.params as { id: string };
    const inboxItem = await prisma.projectInboxItem.update({ where: { id }, data: { status: "DISMISSED" } });
    res.json({ inboxItem });
  } catch (error) {
    next(error);
  }
});

export default router;
