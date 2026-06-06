import { Router } from "express";
import { getCurrentAgentActivities } from "../services/agentActivityService.js";

const router = Router();

router.get("/current", async (_req, res, next) => {
  try {
    const activities = await getCurrentAgentActivities();
    res.json({ activities });
  } catch (error) {
    next(error);
  }
});

export default router;
