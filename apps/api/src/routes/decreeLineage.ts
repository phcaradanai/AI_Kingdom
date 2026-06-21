import { Router } from "express";
import { requireRole } from "../middleware/rbac.js";
import { getDecreeLineage } from "../services/decreeLineageService.js";

const router = Router();

/**
 * GET /api/decree-lineage?workOrderId=...  (or ?taskId=...)
 *
 * Read-only ordered trace of one command: decree → council → owner →
 * external-agent prompt → external-agent result → review/knowledge →
 * secretary summary. King-facing inspection view.
 */
router.get("/", requireRole("KING", "CROWN_PRINCE"), async (req, res, next) => {
  try {
    const workOrderId = typeof req.query.workOrderId === "string" ? req.query.workOrderId : undefined;
    const taskId = typeof req.query.taskId === "string" ? req.query.taskId : undefined;
    if (!workOrderId && !taskId) {
      res.status(400).json({ error: "Provide workOrderId or taskId" });
      return;
    }
    const lineage = await getDecreeLineage({ workOrderId, taskId });
    res.json({ lineage });
  } catch (error) {
    next(error);
  }
});

export default router;
