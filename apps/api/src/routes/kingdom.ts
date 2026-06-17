import { Router } from "express";
import { requireRole } from "../middleware/rbac.js";
import { getKingdomPresence } from "../services/kingdomPresenceService.js";
import { getKingdomActivity } from "../services/kingdomActivityService.js";
import { getKingdomHealth } from "../services/kingdomHealthService.js";

const router = Router();

router.get("/presence", requireRole("KING", "CROWN_PRINCE"), async (_req, res, next) => {
  try {
    const data = await getKingdomPresence();
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.get("/activity", requireRole("KING", "CROWN_PRINCE"), async (req, res, next) => {
  try {
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const data = await getKingdomActivity(limit);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.get("/health", requireRole("KING", "CROWN_PRINCE"), async (_req, res, next) => {
  try {
    const data = await getKingdomHealth();
    res.json(data);
  } catch (err) {
    next(err);
  }
});

export default router;
