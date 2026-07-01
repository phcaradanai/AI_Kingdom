import { Router } from "express";
import {
  getLivingAgentProfile,
  getLivingAgentRelations,
  getLivingAgents,
  getLivingAgentTimeline
} from "../services/livingAgentsService.js";
import { deriveLivingAgentStates, deriveSingleAgentState } from "../services/livingAgentStateService.js";

const router = Router();

router.get("/state", async (req, res, next) => {
  try {
    const { agentId, projectId, includeInactive } = req.query as Record<string, string | undefined>;
    const states = await deriveLivingAgentStates({
      agentId,
      projectId,
      includeInactive: includeInactive === "true",
    });
    res.json({ states });
  } catch (error) {
    next(error);
  }
});

router.get("/:agentId/state", async (req, res, next) => {
  try {
    const state = await deriveSingleAgentState(req.params.agentId);
    if (!state) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    res.json({ state });
  } catch (error) {
    next(error);
  }
});

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
