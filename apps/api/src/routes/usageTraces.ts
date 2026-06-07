import { Router } from "express";
import { getAIUsageTraceDetails } from "../services/aiUsageTraceService.js";

const router = Router();

router.get("/:traceId", async (req, res, next) => {
  try {
    const details = await getAIUsageTraceDetails(req.params.traceId);
    if (!details) {
      res.status(404).json({ error: "Usage trace not found" });
      return;
    }
    res.json(details);
  } catch (error) {
    next(error);
  }
});

export default router;
