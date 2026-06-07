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
import { generateHumanTitle, generateHumanReason, classifyRoutingQuality } from "../services/routingQualityGate.js";

const router = Router();

/** Compute M15F quality gate fields at read-time for legacy rows that lack them. */
function enrichLegacyQualityFields<T extends {
  title?: string | null;
  humanTitle?: string | null;
  humanReason?: string | null;
  routingQuality?: string | null;
  reason?: string | null;
  confidenceScore?: number | null;
}>(item: T): T {
  if (!item.humanTitle && item.title) {
    (item as Record<string, unknown>).humanTitle = generateHumanTitle(item.title);
  }
  if (!item.humanReason) {
    const conf = item.confidenceScore ?? 0;
    const quality = item.routingQuality as ReturnType<typeof classifyRoutingQuality>["routingQuality"] | null;
    if (quality) {
      (item as Record<string, unknown>).humanReason = generateHumanReason(quality, [], [], null);
    } else if (conf <= 0) {
      (item as Record<string, unknown>).humanReason = "No reliable project evidence found.";
    } else if (conf < 40) {
      (item as Record<string, unknown>).humanReason = "Low-confidence match. Manual review required.";
    } else {
      (item as Record<string, unknown>).humanReason = item.reason ?? null;
    }
  }
  return item;
}

const HIDDEN_QUALITIES = new Set(["DEBUG_ONLY", "NO_MATCH"]);

router.get("/", async (req, res, next) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const includeTestData = req.query.includeTestData === "true";
    const includeDebug = req.query.includeDebug === "true";
    const dataQuality = req.query.dataQuality as DataQuality | undefined;
    const routingQualityFilter = typeof req.query.routingQuality === "string" ? req.query.routingQuality : undefined;
    const sourceType = typeof req.query.sourceType === "string" ? req.query.sourceType : undefined;
    const suggestedProjectId = typeof req.query.suggestedProjectId === "string" ? req.query.suggestedProjectId : undefined;
    const confidenceMin = req.query.confidenceMin !== undefined ? Number(req.query.confidenceMin) : undefined;
    const confidenceMax = req.query.confidenceMax !== undefined ? Number(req.query.confidenceMax) : undefined;
    const rawItems = await prisma.projectInboxItem.findMany({
      where: {
        ...(status ? { status: status as never } : {}),
        ...(sourceType ? { sourceType } : {}),
        ...(suggestedProjectId ? { candidateProjectIds: { has: suggestedProjectId } } : {}),
        ...(routingQualityFilter ? { routingQuality: routingQualityFilter } : {}),
        ...(Number.isFinite(confidenceMin) || Number.isFinite(confidenceMax) ? {
          confidenceScore: {
            ...(Number.isFinite(confidenceMin) ? { gte: confidenceMin } : {}),
            ...(Number.isFinite(confidenceMax) ? { lte: confidenceMax } : {})
          }
        } : {})
      },
      orderBy: { createdAt: "desc" }
    });

    const filtered = rawItems
      .filter((item) => shouldIncludeByQuality(item, classifyProjectInboxItem(item), { includeTestData, dataQuality }))
      .filter((item) => {
        // M15F: Hide DEBUG_ONLY and NO_MATCH unless explicitly requested
        if (!includeDebug && item.routingQuality && HIDDEN_QUALITIES.has(item.routingQuality)) return false;
        return true;
      })
      .map(enrichLegacyQualityFields);

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

// M15F: Bulk archive
router.patch("/bulk/archive", requireRole("KING", "CROWN_PRINCE"), async (req, res, next) => {
  try {
    const { ids } = z.object({ ids: z.array(z.string().trim().min(1)).min(1).max(200) }).parse(req.body);
    await prisma.projectInboxItem.updateMany({ where: { id: { in: ids }, status: "PENDING" }, data: { status: "ARCHIVED" } });
    const inboxItems = await prisma.projectInboxItem.findMany({ where: { id: { in: ids } }, orderBy: { createdAt: "desc" } });
    res.json({ inboxItems: await enrichDataQuality("projectInboxItem", inboxItems) });
  } catch (error) {
    next(error);
  }
});

router.patch("/archive-low-confidence", requireRole("KING", "CROWN_PRINCE"), async (req, res, next) => {
  try {
    const threshold = Number(req.body?.threshold ?? 0);
    const result = await prisma.projectInboxItem.updateMany({
      where: { status: "PENDING", confidenceScore: { lte: Number.isFinite(threshold) ? threshold : 0 } },
      data: { status: "ARCHIVED" }
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

// M15F: Single item archive
router.patch("/:id/archive", requireRole("KING", "CROWN_PRINCE"), async (req, res, next) => {
  try {
    const { id } = req.params as { id: string };
    const inboxItem = await prisma.projectInboxItem.update({ where: { id }, data: { status: "ARCHIVED" } });
    res.json({ inboxItem });
  } catch (error) {
    next(error);
  }
});

export default router;
