import { Router } from "express";
import { requireRole } from "../middleware/rbac.js";
import { computeNextActions } from "../services/nextActionService.js";

const router = Router();

router.get("/", requireRole("KING", "CROWN_PRINCE"), async (req, res, next) => {
  try {
    const rawLimit = req.query.limit !== undefined ? parseInt(String(req.query.limit), 10) : undefined;
    const limit = rawLimit !== undefined && !Number.isNaN(rawLimit) ? rawLimit : undefined;
    const entityTypes = req.query.entityTypes
      ? String(req.query.entityTypes)
          .split(",")
          .map(s => s.trim())
          .filter(Boolean)
      : undefined;
    const minRisk = req.query.minRisk ? String(req.query.minRisk) : undefined;
    const result = await computeNextActions({ limit, entityTypes, minRisk });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
