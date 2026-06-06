import type { Agent, CouncilSession, AgentResponse, Report, Task } from "@prisma/client";
import { prisma } from "../db/prisma.js";

export type OrchestratedTask = Task & {
  sessions: Array<CouncilSession & { responses: Array<AgentResponse & { agent: Agent }> }>;
  reports: Report[];
};

export async function getTaskForUser(userId: string, taskId: string): Promise<OrchestratedTask> {
  const task = await prisma.task.findFirst({
    where: { id: taskId, createdBy: userId },
    include: {
      sessions: {
        include: {
          responses: {
            include: {
              agent: true
            },
            orderBy: { createdAt: "asc" }
          },
          reports: true
        },
        orderBy: { createdAt: "desc" }
      },
      reports: true
    }
  });

  if (!task) {
    throw new Error("Task not found");
  }

  return task;
}
