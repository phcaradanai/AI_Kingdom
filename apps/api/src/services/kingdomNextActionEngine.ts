import type { KingdomNextExecutableAction, Prisma, TaskMode } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { getSettingValue } from "./settingsService.js";

type CouncilNextActionInput = {
  sessionId: string;
  sessionStatus: string;
  finalSummary: string | null;
  taskMode: TaskMode;
  projectId: string | null;
  createdWorkOrderId?: string | null;
};

export type CouncilNextActionDecision = {
  action: KingdomNextExecutableAction;
  reason: string;
  plannerMode: string;
};

export async function computeCouncilNextExecutableAction(input: CouncilNextActionInput): Promise<CouncilNextActionDecision> {
  const plannerMode = await getSettingValue("COUNCIL_AUTO_WORK_ORDER_MODE", "OFF");
  if (input.sessionStatus !== "COMPLETED") {
    return { action: "NONE", reason: "Council session is not completed.", plannerMode };
  }
  if (input.createdWorkOrderId) {
    return { action: "RUN_VALIDATION", reason: "A Work Order exists; validation is the next executable gate.", plannerMode };
  }

  const warning = extractContextWarning(input.finalSummary);
  if (warning) {
    if (!input.projectId || /No project is assigned/i.test(warning)) {
      return { action: "BIND_CONTEXT", reason: "Project context must be linked before executable work is created.", plannerMode };
    }
    return { action: "SCAN_LOCAL_DOCS", reason: "Local docs or project context are stale; refresh context before executable work.", plannerMode };
  }

  if (plannerMode !== "READY") {
    return {
      action: "CREATE_WORK_ORDER",
      reason: "This council recommendation does not generate executable work orders.",
      plannerMode
    };
  }

  if (input.taskMode === "BUILD" || input.taskMode === "PLAN") {
    return { action: "CREATE_WORK_ORDER", reason: "Planner mode is READY and the council recommendation can create executable work.", plannerMode };
  }

  return { action: "CREATE_EXTERNAL_HANDOFF", reason: "Council output should be handed off for review instead of becoming an executable work order.", plannerMode };
}

export async function refreshCouncilNextExecutableAction(sessionId: string): Promise<CouncilNextActionDecision> {
  const session = await prisma.councilSession.findUnique({
    where: { id: sessionId },
    include: { task: true }
  });
  if (!session) {
    const error = new Error("Council session not found");
    error.name = "NotFoundError";
    throw error;
  }
  const decision = await computeCouncilNextExecutableAction({
    sessionId: session.id,
    sessionStatus: session.status,
    finalSummary: session.finalSummary,
    taskMode: session.task.mode,
    projectId: session.projectId ?? session.task.projectId,
    createdWorkOrderId: session.createdWorkOrderId
  });
  await prisma.councilSession.update({
    where: { id: session.id },
    data: buildNextActionUpdate(decision)
  });
  return decision;
}

export function buildNextActionUpdate(decision: CouncilNextActionDecision): Prisma.CouncilSessionUpdateInput {
  return {
    nextExecutableAction: decision.action,
    nextExecutableActionReason: decision.reason,
    nextExecutableActionComputedAt: new Date()
  };
}

function extractContextWarning(summary: string | null | undefined): string | null {
  if (!summary?.includes("[CONTEXT WARNING]")) return null;
  const [, rest = ""] = summary.split("[CONTEXT WARNING]");
  const [warning = ""] = rest.split(/\n\n(?=\S)/);
  return warning.trim() ? warning.trim() : null;
}
