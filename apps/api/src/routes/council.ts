import { Router } from "express";
import { prisma } from "../db/prisma.js";
import { requireRole } from "../middleware/rbac.js";
import { planFromSession } from "../services/plannerAgentService.js";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const sessions = await prisma.councilSession.findMany({
      where: {
        task: {
          createdBy: userId
        }
      },
      include: {
        task: true,
        reports: true,
        responses: {
          include: { agent: true },
          orderBy: { createdAt: "asc" }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    res.json({ sessions: await attachCouncilTraceLinks(sessions) });
  } catch (error) {
    next(error);
  }
});

router.get("/:sessionId", async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const session = await prisma.councilSession.findFirst({
      where: {
        id: req.params.sessionId,
        task: {
          createdBy: userId
        }
      },
      include: {
        task: true,
        reports: true,
        responses: {
          include: { agent: true },
          orderBy: { createdAt: "asc" }
        }
      }
    });

    if (!session) {
      res.status(404).json({ error: "Council session not found" });
      return;
    }

    const [sessionWithTraceLinks] = await attachCouncilTraceLinks([session]);
    res.json({ session: sessionWithTraceLinks });
  } catch (error) {
    next(error);
  }
});

router.post("/:sessionId/plan-work-orders", requireRole("KING", "CROWN_PRINCE"), async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const { sessionId } = req.params as { sessionId: string };
    const result = await planFromSession(sessionId, userId, "POST /api/council/:sessionId/plan-work-orders");
    res.json(formatPlannerResult(result));
  } catch (error) {
    if (error instanceof Error && error.name === "NotFoundError") {
      res.status(404).json({ error: error.message });
      return;
    }
    if (error instanceof Error && error.name === "PlannerModeDisabledError") {
      res.status(409).json({ error: error.message });
      return;
    }
    next(error);
  }
});

router.post("/:sessionId/work-order", requireRole("KING", "CROWN_PRINCE"), async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const { sessionId } = req.params as { sessionId: string };
    const result = await planFromSession(sessionId, userId, "POST /api/council/:sessionId/work-order");
    if (!result.createdWorkOrder) {
      res.status(409).json({ error: result.skipReason ?? "Work order creation failed: no Work Order was created", ...formatPlannerResult(result) });
      return;
    }
    res.status(201).json(formatPlannerResult(result));
  } catch (error) {
    if (error instanceof Error && error.name === "NotFoundError") {
      res.status(404).json({ error: error.message });
      return;
    }
    if (error instanceof Error && error.name === "PlannerModeDisabledError") {
      res.status(409).json({ error: error.message });
      return;
    }
    next(error);
  }
});

export default router;

type CouncilSessionWithResponses = Awaited<ReturnType<typeof prisma.councilSession.findMany>>[number] & {
  responses: Array<{ id: string }>;
};

async function attachCouncilTraceLinks<T extends CouncilSessionWithResponses>(sessions: T[]) {
  const responseIds = sessions.flatMap((session) => session.responses.map((response) => response.id));
  const sessionIds = sessions.map((session) => session.id);
  const usageRecords = await prisma.usageRecord.findMany({
    where: {
      traceId: { not: null },
      OR: [
        { sourceType: "AGENT_RESPONSE", sourceId: { in: responseIds } },
        { sourceType: "FINAL_COUNSEL", councilSessionId: { in: sessionIds } }
      ]
    },
    select: { traceId: true, sourceType: true, sourceId: true, councilSessionId: true },
    orderBy: { createdAt: "desc" }
  });
  const traceByResponse = new Map<string, string>();
  const finalTraceBySession = new Map<string, string>();

  for (const record of usageRecords) {
    if (record.traceId && record.sourceType === "AGENT_RESPONSE" && record.sourceId && !traceByResponse.has(record.sourceId)) {
      traceByResponse.set(record.sourceId, record.traceId);
    }
    if (record.traceId && record.sourceType === "FINAL_COUNSEL" && record.councilSessionId && !finalTraceBySession.has(record.councilSessionId)) {
      finalTraceBySession.set(record.councilSessionId, record.traceId);
    }
  }

  return sessions.map((session) => ({
    ...session,
    finalTraceId: finalTraceBySession.get(session.id) ?? null,
    responses: session.responses.map((response) => ({
      ...response,
      traceId: traceByResponse.get(response.id) ?? null
    }))
  }));
}

function formatPlannerResult(result: Awaited<ReturnType<typeof planFromSession>>) {
  return {
    drafted: result.drafted,
    skipped: result.skipped,
    sessionId: result.sessionId,
    draftedWorkOrderIds: result.draftedWorkOrderIds,
    createdWorkOrder: result.createdWorkOrder,
    skipReason: result.skipReason,
    traceId: result.traceId
  };
}
