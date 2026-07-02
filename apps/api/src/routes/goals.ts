import express from "express";
import { buildExecutionPlan } from "../services/goalDecompositionService.js";
import type { AnalyzeGoalRequest, GoalExecutionPlanDto } from "../types/api.js";

const router = express.Router();

/**
 * POST /api/goals/analyze
 *
 * Pure, zero-DB-mutation endpoint. Takes a goal description and returns a
 * deterministic execution plan: phases, deliverables, dependencies, and
 * Work Order templates. No AI provider is called.
 *
 * Role: any authenticated user (requireAuth is applied in app.ts)
 */
router.post("/analyze", (req, res) => {
  const body = req.body as AnalyzeGoalRequest;

  if (!body?.title || typeof body.title !== "string" || body.title.trim().length === 0) {
    res.status(400).json({ error: "title is required" });
    return;
  }
  if (!body?.objective || typeof body.objective !== "string" || body.objective.trim().length === 0) {
    res.status(400).json({ error: "objective is required" });
    return;
  }

  const plan = buildExecutionPlan({
    title: body.title.trim(),
    objective: body.objective.trim(),
    successCriteria: Array.isArray(body.successCriteria) ? body.successCriteria : [],
    constraints: Array.isArray(body.constraints) ? body.constraints : [],
    priority: body.priority ?? "MEDIUM",
    projectId: body.projectId ?? null,
  });

  const response: { plan: GoalExecutionPlanDto } = { plan: plan as GoalExecutionPlanDto };
  res.json(response);
});

export default router;
