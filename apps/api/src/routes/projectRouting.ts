import { Router } from "express";
import { z } from "zod";
import { requireRole } from "../middleware/rbac.js";
import { assignProjectToSource, classifyProjectForText, rejectRoutingCandidate, routeProjectForSource } from "../services/projectRoutingService.js";

const router = Router();

const classifySchema = z.object({
  title: z.string().trim().min(1).max(500),
  content: z.string().trim().min(1).max(10000),
  sourceType: z.string().trim().min(1).max(80),
  sourceId: z.string().trim().min(1).max(120),
  persist: z.boolean().default(true)
});

router.post("/classify", requireRole("KING", "CROWN_PRINCE", "MINISTER"), async (req, res, next) => {
  try {
    const payload = classifySchema.parse(req.body);
    if (payload.persist) {
      const result = await routeProjectForSource(payload);
      res.json(result);
      return;
    }
    const classification = await classifyProjectForText(payload);
    res.json({ classification });
  } catch (error) {
    next(error);
  }
});

router.post("/assign", requireRole("KING", "CROWN_PRINCE"), async (req, res, next) => {
  try {
    const payload = z.object({
      sourceType: z.string().trim().min(1),
      sourceId: z.string().trim().min(1),
      projectId: z.string().trim().min(1)
    }).parse(req.body);
    const assigned = await assignProjectToSource(payload.sourceType, payload.sourceId, payload.projectId);
    res.json({ assigned });
  } catch (error) {
    next(error);
  }
});

router.post("/reject", requireRole("KING", "CROWN_PRINCE"), async (req, res, next) => {
  try {
    const { candidateId } = z.object({ candidateId: z.string().trim().min(1) }).parse(req.body);
    const candidate = await rejectRoutingCandidate(candidateId);
    res.json({ candidate });
  } catch (error) {
    next(error);
  }
});

export default router;
