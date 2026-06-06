import type { AgentResponse, CouncilSession, Memory, ReportCategory, ReportImportance, Task } from "@prisma/client";
import { prisma } from "../db/prisma.js";

type SessionForReport = CouncilSession & {
  task: Task;
  responses: AgentResponse[];
};

export function categoryForTask(task: Task): ReportCategory {
  if (task.mode === "RESEARCH") return "RESEARCH";
  if (task.mode === "BUILD") return "ARCHITECTURE";
  if (task.mode === "PLAN") return "STRATEGY";
  return "GENERAL";
}

export function importanceForSession(session: CouncilSession): ReportImportance {
  if (session.autoSavedMemoryIds.length >= 3) return "HIGH";
  if (session.consultedMemoryIds.length >= 3) return "HIGH";
  return "MEDIUM";
}

export async function generateRoyalReport(input: {
  userId: string;
  session: SessionForReport;
  consultedMemories: Memory[];
}) {
  const existing = await prisma.report.findFirst({
    where: { sourceCouncilSessionId: input.session.id }
  });

  if (existing) {
    return existing;
  }

  const task = input.session.task;
  const contributors = input.session.responses.map((response) => response.role);
  const finalSummary = input.session.finalSummary ?? "The council did not produce final counsel.";
  const content = buildReportContent({
    task,
    session: input.session,
    contributors,
    consultedMemories: input.consultedMemories
  });

  return prisma.report.create({
    data: {
      title: `Royal Report: ${task.title}`,
      summary: finalSummary,
      content,
      sourceTaskId: task.id,
      sourceCouncilSessionId: input.session.id,
      category: categoryForTask(task),
      importance: importanceForSession(input.session),
      tags: [...new Set([task.mode.toLowerCase(), "council", ...contributors.map((role) => role.toLowerCase().replace(/\s+/g, "-"))])],
      createdBy: input.userId
    }
  });
}

function buildReportContent(input: {
  task: Task;
  session: SessionForReport;
  contributors: string[];
  consultedMemories: Memory[];
}): string {
  const agentAdvice = input.session.responses
    .map((response) => `### ${response.role}\n${response.response}`)
    .join("\n\n");
  const memories = input.consultedMemories.length
    ? input.consultedMemories.map((memory) => `- [${memory.type}/${memory.importance}] ${memory.title}: ${memory.content}`).join("\n")
    : "- No Kingdom Memories were consulted.";

  return [
    `## Source Decree\n${input.task.command}`,
    `## Council Contributors\n${input.contributors.map((role) => `- ${role}`).join("\n")}`,
    `## Kingdom Memory Used\n${memories}`,
    `## Agent Counsel\n${agentAdvice}`,
    `## Final Counsel\n${input.session.finalSummary ?? "No final counsel was recorded."}`
  ].join("\n\n");
}
