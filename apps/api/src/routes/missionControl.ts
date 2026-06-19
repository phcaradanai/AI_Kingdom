import { Router } from "express";
import { requireRole } from "../middleware/rbac.js";
import { getMissionControl } from "../services/missionControlService.js";

const router = Router();

router.get("/", requireRole("KING", "CROWN_PRINCE"), async (_req, res, next) => {
  try {
    res.json(await getMissionControl());
  } catch (err) {
    next(err);
  }
});

export default router;
