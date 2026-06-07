import { Router } from "express";
import {
  getLivingAgentProfile,
  getLivingAgentRelations,
  getLivingAgents,
  getLivingAgentTimeline
} from "../services/livingAgentsService.js";

const router = Router();

router.get("/", async (_req, res, next) => {
  try {
    const agents = await getLivingAgents();
    res.json({ agents });
  } catch (error) {
    next(error);
  }
});

router.get("/:agentId", async (req, res, next) => {
  try {
    const profile = await getLivingAgentProfile(req.params.agentId);
    if (!profile) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    res.json({ profile });
  } catch (error) {
    next(error);
  }
});

router.get("/:agentId/timeline", async (req, res, next) => {
  try {
    const { sourceType, operation, projectId, attributionStatus, from, to, limit, cursor } = req.query as Record<string, string>;
    const result = await getLivingAgentTimeline(req.params.agentId, {
      sourceType,
      operation,
      projectId,
      attributionStatus,
      from,
      to,
      limit: limit ? Number(limit) : undefined,
      cursor
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get("/:agentId/relations", async (req, res, next) => {
  try {
    const relations = await getLivingAgentRelations(req.params.agentId);
    if (!relations) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    res.json({ relations });
  } catch (error) {
    next(error);
  }
});

export default router;
