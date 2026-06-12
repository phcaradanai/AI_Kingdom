import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";
import { auditLog } from "../services/auditService.js";
import {
  generateDailyRoyalBrief,
  getLatestRoyalBrief,
  listRoyalBriefs,
  getRoyalBrief,
  archiveRoyalBrief
} from "../services/royalBriefService.js";

const router = Router();

/** GET /api/royal-brief/latest — most recent Royal Brief */
router.get("/latest", requireAuth, async (_req, res, next) => {
  try {
    const brief = await getLatestRoyalBrief();
    res.json({ brief });
  } catch (error) {
    next(error);
  }
});

/** GET /api/royal-brief — list recent Royal Briefs */
router.get("/", requireAuth, async (req, res, next) => {
  try {
    const limit = Number(req.query.limit) || 20;
    const briefs = await listRoyalBriefs(limit);
    res.json({ briefs });
  } catch (error) {
    next(error);
  }
});

/** GET /api/royal-brief/:id — full brief detail */
router.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const brief = await getRoyalBrief(req.params.id!);
    if (!brief) return res.status(404).json({ error: "Royal Brief not found" });
    await auditLog({ userId: req.user?.id, action: "royal_brief_viewed", resourceType: "royal_brief", resourceId: brief.id, metadata: { briefDate: brief.briefDate.toISOString() } });
    res.json({ brief });
  } catch (error) {
    next(error);
  }
});

/** POST /api/royal-brief/generate — generate a new Royal Brief (KING only) */
router.post("/generate", requireAuth, requireRole("KING"), async (req, res, next) => {
  try {
    const brief = await generateDailyRoyalBrief(new Date(), req.user?.id);
    res.json({ brief });
  } catch (error) {
    next(error);
  }
});

/** POST /api/royal-brief/:id/archive — archive a Royal Brief (KING only) */
router.post("/:id/archive", requireAuth, requireRole("KING"), async (req, res, next) => {
  try {
    const brief = await archiveRoyalBrief(req.params.id!, req.user!.id);
    res.json({ brief });
  } catch (error) {
    next(error);
  }
});

export default router;
