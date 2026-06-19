import { Router } from "express";
import { z } from "zod";
import { auditLog } from "../services/auditService.js";
import {
  getDirectAgentSession,
  listAvailableDirectAgents,
  listDirectAgentSessions,
  sendDirectAgentMessage
} from "../services/directAgentConversationService.js";

const router = Router();

const requestTypes = ["GENERAL_QUESTION", "RESEARCH_ASSIGNMENT", "SUMMARY_ASSIGNMENT", "PERSONAL_TASK"] as const;
const saveModes = ["NONE", "ARTIFACT", "KNOWLEDGE_CANDIDATE", "BOTH"] as const;

const createSessionSchema = z.object({
  agentId: z.string().trim().min(1),
  projectId: z.string().trim().min(1).optional().nullable(),
  title: z.string().trim().max(140).optional().nullable(),
  prompt: z.string().trim().min(1, "Prompt is required").max(8000),
  requestType: z.enum(requestTypes).default("GENERAL_QUESTION"),
  saveMode: z.enum(saveModes).default("NONE")
});

const messageSchema = z.object({
  prompt: z.string().trim().min(1, "Prompt is required").max(8000),
  requestType: z.enum(requestTypes).default("GENERAL_QUESTION"),
  saveMode: z.enum(saveModes).default("NONE")
});

router.get("/agents", async (_req, res, next) => {
  try {
    const agents = await listAvailableDirectAgents();
    res.json({ agents });
  } catch (error) {
    next(error);
  }
});

router.get("/", async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const sessions = await listDirectAgentSessions(userId);
    res.json({ sessions });
  } catch (error) {
    next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const session = await getDirectAgentSession(userId, req.params.id);
    res.json({ session });
  } catch (error) {
    handleServiceError(error, res, next);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role;
    if (!userId || !userRole) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const payload = createSessionSchema.parse(req.body);
    const session = await sendDirectAgentMessage({
      userId,
      userRole,
      agentId: payload.agentId,
      projectId: payload.projectId,
      title: payload.title,
      prompt: payload.prompt,
      requestType: payload.requestType,
      saveMode: payload.saveMode
    });
    await auditLog({
      userId,
      action: "create_direct_agent_session",
      resourceType: "direct_agent_session",
      resourceId: session.id,
      metadata: { agentId: payload.agentId, requestType: payload.requestType, saveMode: payload.saveMode }
    });
    res.status(201).json({ session });
  } catch (error) {
    handleServiceError(error, res, next);
  }
});

router.post("/:id/messages", async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role;
    if (!userId || !userRole) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const payload = messageSchema.parse(req.body);
    const session = await sendDirectAgentMessage({
      userId,
      userRole,
      sessionId: req.params.id,
      prompt: payload.prompt,
      requestType: payload.requestType,
      saveMode: payload.saveMode
    });
    await auditLog({
      userId,
      action: "send_direct_agent_message",
      resourceType: "direct_agent_session",
      resourceId: session.id,
      metadata: { requestType: payload.requestType, saveMode: payload.saveMode }
    });
    res.status(201).json({ session });
  } catch (error) {
    handleServiceError(error, res, next);
  }
});

function handleServiceError(error: unknown, res: { status: (code: number) => { json: (body: unknown) => void } }, next: (error: unknown) => void) {
  if (error instanceof Error && error.name === "NotFoundError") {
    res.status(404).json({ error: error.message });
    return;
  }
  if (error instanceof Error && error.name === "ConflictError") {
    res.status(409).json({ error: error.message });
    return;
  }
  next(error);
}

export default router;
