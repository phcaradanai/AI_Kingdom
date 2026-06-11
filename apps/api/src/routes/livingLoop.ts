import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";
import {
  runLivingLoopOnce,
  getLivingLoopStatus,
  listLivingLoopRuns
} from "../services/livingLoopService.js";

const router = Router();

// ── Living Loop Status ──────────────────────────────────────────────────────────

/** GET /api/living-loop/status — returns loop status (creates NO candidates) */
router.get("/status", requireAuth, requireRole("KING", "CROWN_PRINCE"), async (_req, res, next) => {
  try {
    const status = await getLivingLoopStatus();
    res.json({ status });
  } catch (error) {
    next(error);
  }
});

/** GET /api/living-loop/runs — lists recent loop runs */
router.get("/runs", requireAuth, requireRole("KING", "CROWN_PRINCE"), async (req, res, next) => {
  try {
    const limit = Number(req.query.limit) || 20;
    const runs = await listLivingLoopRuns(limit);
    res.json({ runs });
  } catch (error) {
    next(error);
  }
});

/** POST /api/living-loop/run — manually trigger a living loop run (KING only) */
router.post("/run", requireAuth, requireRole("KING"), async (req, res, next) => {
  try {
    const result = await runLivingLoopOnce("MANUAL", req.user?.id);
    res.json({ run: result.run, candidates: result.candidates, autoValidation: result.autoValidation });
  } catch (error) {
    next(error);
  }
});

export default router;
