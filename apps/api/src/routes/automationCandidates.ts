import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";
import {
  getAutomationCandidates,
  approveCandidate,
  rejectCandidate,
  archiveCandidate,
  applyCandidate
} from "../services/livingLoopService.js";

const router = Router();

/** GET /api/automation-candidates — list candidates (creates NO candidates) */
router.get("/", requireAuth, requireRole("KING", "CROWN_PRINCE"), async (req, res, next) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const kind = typeof req.query.kind === "string" ? req.query.kind : undefined;
    const limit = Number(req.query.limit) || 50;
    const offset = Number(req.query.offset) || 0;
    const result = await getAutomationCandidates({ status, kind, limit, offset });
    res.json({ candidates: result.candidates, total: result.total });
  } catch (error) {
    next(error);
  }
});

/** POST /api/automation-candidates/:id/approve — approve candidate (KING only) */
router.post("/:id/approve", requireAuth, requireRole("KING"), async (req, res, next) => {
  try {
    const candidate = await approveCandidate(req.params.id!, req.user!.id);
    res.json({ candidate });
  } catch (error) {
    next(error);
  }
});

/** POST /api/automation-candidates/:id/reject — reject candidate (KING only) */
router.post("/:id/reject", requireAuth, requireRole("KING"), async (req, res, next) => {
  try {
    const candidate = await rejectCandidate(req.params.id!, req.user!.id);
    res.json({ candidate });
  } catch (error) {
    next(error);
  }
});

/** POST /api/automation-candidates/:id/archive — archive candidate (KING only) */
router.post("/:id/archive", requireAuth, requireRole("KING"), async (req, res, next) => {
  try {
    const candidate = await archiveCandidate(req.params.id!, req.user!.id);
    res.json({ candidate });
  } catch (error) {
    next(error);
  }
});

/** POST /api/automation-candidates/:id/apply — apply candidate action (KING only) */
router.post("/:id/apply", requireAuth, requireRole("KING"), async (req, res, next) => {
  try {
    const candidate = await applyCandidate(req.params.id!, req.user!.id);
    res.json({ candidate });
  } catch (error) {
    next(error);
  }
});

export default router;
