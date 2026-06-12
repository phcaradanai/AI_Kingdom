import { prisma } from "../db/prisma.js";
import { getLocalProjectContextForAgent } from "./localDocumentAccessService.js";

export async function buildProjectContext(projectId: string): Promise<string> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return "";

  const localDocsContext = await getLocalProjectContextForAgent(projectId).catch(() => null);

  const [decisions, reports, matters, workOrders, memories, artifacts] = await Promise.all([
    prisma.memory.findMany({ where: { projectId, type: "DECISION" }, orderBy: { updatedAt: "desc" }, take: 5 }),
    prisma.report.findMany({ where: { projectId }, orderBy: { updatedAt: "desc" }, take: 3 }),
    prisma.matter.findMany({ where: { projectId, status: { notIn: ["REJECTED", "COMPLETED"] } }, orderBy: { updatedAt: "desc" }, take: 5 }),
    prisma.workOrder.findMany({ where: { projectId, status: { in: ["READY", "IN_PROGRESS", "NEEDS_REVIEW"] } }, orderBy: { updatedAt: "desc" }, take: 5 }),
    prisma.memory.findMany({ where: { projectId }, orderBy: { updatedAt: "desc" }, take: 5 }),
    prisma.artifact.findMany({ where: { projectId }, orderBy: { updatedAt: "desc" }, take: 5 })
  ]);

  return [
    `[PROJECT CONTEXT]`,
    `Project: ${project.name}${project.codename ? ` (${project.codename})` : ""}`,
    `Status: ${project.status}`,
    `Priority: ${project.priority}`,
    `Active milestone: ${project.activeMilestone ?? "None"}`,
    `Goals:\n${formatList(project.goals)}`,
    `Recent decisions:\n${formatList(decisions.map((item) => `${item.title}: ${item.content}`))}`,
    `Recent reports:\n${formatList(reports.map((item) => `${item.title}: ${item.summary}`))}`,
    `Open matters:\n${formatList(matters.map((item) => `${item.title} (${item.priority}/${item.status})`))}`,
    `Active work orders:\n${formatList(workOrders.map((item) => `${item.title} (${item.status})`))}`,
    `Linked memories:\n${formatList(memories.map((item) => `${item.title}: ${item.content}`))}`,
    `Linked artifacts:\n${formatList(artifacts.map((item) => `[${item.type}] ${item.title}`))}`,
    localDocsContext ? localDocsContext.contextText : "## Local Document Context\n\nNot available."
  ].join("\n\n").slice(0, 5000);
}

function formatList(values: string[]): string {
  return values.length ? values.map((value) => `- ${value}`).join("\n") : "- None recorded.";
}
