import { Router, type NextFunction, type Response } from "express";
import { z } from "zod";
import { requireRole } from "../middleware/rbac.js";
import {
  acceptAndLearnDecreeToDoneWorkflow,
  chooseWorkflowExternalAgent,
  getWorkflowForTask,
  getWorkflowRun,
  retryDecreeToDoneWorkflow,
  startOrContinueDecreeToDoneWorkflow
} from "../services/decreeToDoneWorkflowService.js";

const router = Router();
const agentChoiceSchema = z.object({ externalAgentId: z.string().trim().min(1).max(120) });

router.post("/decree-to-done/:taskId/continue", requireRole("KING", "CROWN_PRINCE"), async (req, res, next) => {
  try {
    const workflow = await startOrContinueDecreeToDoneWorkflow(req.params.taskId!, req.user!.id);
    res.status(workflow.createdAt.getTime() === workflow.updatedAt.getTime() ? 201 : 200).json({ workflow });
  } catch (error) {
    workflowError(error, res, next);
  }
});

router.get("/task/:taskId", requireRole("KING", "CROWN_PRINCE"), async (req, res, next) => {
  try {
    const workflow = await getWorkflowForTask(req.params.taskId!, req.user!.id);
    if (!workflow) return res.status(404).json({ error: "WorkflowRun not found" });
    res.json({ workflow });
  } catch (error) {
    workflowError(error, res, next);
  }
});

router.get("/:id", requireRole("KING", "CROWN_PRINCE"), async (req, res, next) => {
  try {
    res.json({ workflow: await getWorkflowRun(req.params.id!, req.user!.id) });
  } catch (error) {
    workflowError(error, res, next);
  }
});

router.post("/:id/choose-agent", requireRole("KING"), async (req, res, next) => {
  try {
    const body = agentChoiceSchema.parse(req.body);
    res.json({ workflow: await chooseWorkflowExternalAgent(req.params.id!, body.externalAgentId, req.user!.id) });
  } catch (error) {
    workflowError(error, res, next);
  }
});

router.post("/:id/retry", requireRole("KING"), async (req, res, next) => {
  try {
    res.status(201).json({ workflow: await retryDecreeToDoneWorkflow(req.params.id!, req.user!.id) });
  } catch (error) {
    workflowError(error, res, next);
  }
});

router.post("/:id/accept", requireRole("KING"), async (req, res, next) => {
  try {
    res.json({ workflow: await acceptAndLearnDecreeToDoneWorkflow(req.params.id!, req.user!.id) });
  } catch (error) {
    workflowError(error, res, next);
  }
});

function workflowError(error: unknown, res: Response, next: NextFunction) {
  if (error instanceof z.ZodError) return res.status(400).json({ error: "Invalid request", details: error.flatten() });
  if (error instanceof Error && error.name === "NotFoundError") return res.status(404).json({ error: error.message });
  if (error instanceof Error && ["ConflictError", "ContextBindingError", "BridgeDisabledError"].includes(error.name)) {
    return res.status(409).json({ error: error.message });
  }
  next(error);
}

export default router;
