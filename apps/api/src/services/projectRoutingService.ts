import type { Project, ProjectRoutingStatus } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { classifyProjectInboxItem } from "./dataQualityService.js";

export type ProjectClassificationInput = {
  title: string;
  content: string;
  sourceType: string;
  sourceId: string;
};

export type ProjectClassificationResult = {
  suggestedProjectId: string | null;
  confidenceScore: number;
  reason: string;
  candidateProjects: Array<{ project: Project; score: number; matches: string[] }>;
};

export async function classifyProjectForText(input: ProjectClassificationInput): Promise<ProjectClassificationResult> {
  const projects = await prisma.project.findMany({ where: { status: { not: "ARCHIVED" } } });
  const text = normalize(`${input.title} ${input.content}`);
  const sourceProject = await findSourceAncestryProject(input.sourceType, input.sourceId);

  const scored = projects
    .map((project) => scoreProject(project, text, sourceProject?.id))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best) {
    return {
      suggestedProjectId: null,
      confidenceScore: 0,
      reason: "No project keywords, aliases, names, codenames, or source ancestry matched.",
      candidateProjects: []
    };
  }

  return {
    suggestedProjectId: best.project.id,
    confidenceScore: Math.min(best.score, 100),
    reason: `Matched ${best.project.name} because ${best.matches.join(", ")}.`,
    candidateProjects: scored.slice(0, 5).map((item) => ({ ...item, score: Math.min(item.score, 100) }))
  };
}

export async function routeProjectForSource(input: ProjectClassificationInput) {
  const classification = await classifyProjectForText(input);
  const status: ProjectRoutingStatus = classification.confidenceScore >= 80
    ? "CONFIRMED"
    : classification.confidenceScore >= 50
      ? "SUGGESTED"
      : "NEEDS_REVIEW";

  const candidate = await prisma.projectRoutingCandidate.create({
    data: {
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      suggestedProjectId: classification.suggestedProjectId,
      confidenceScore: classification.confidenceScore,
      reason: classification.reason,
      status
    }
  });

  if (classification.confidenceScore >= 80 && classification.suggestedProjectId) {
    await assignProjectToSource(input.sourceType, input.sourceId, classification.suggestedProjectId);
    return { classification, candidate, inboxItem: null };
  }

  const inboxData = {
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    title: input.title,
    summary: trim(input.content, 800),
    candidateProjectIds: classification.candidateProjects.map((item) => item.project.id),
    confidenceScore: classification.confidenceScore,
    reason: classification.reason,
    status: "PENDING" as const,
    dataSource: input.sourceType,
    dataQuality: classifyProjectInboxItem({
      title: input.title,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      confidenceScore: classification.confidenceScore,
      createdBySystem: true,
      dataSource: input.sourceType
    }),
    createdBySystem: true,
    provenance: {
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      routingStatus: status,
      reason: classification.reason
    }
  };
  const existingInboxItem = await prisma.projectInboxItem.findFirst({
    where: { sourceType: input.sourceType, sourceId: input.sourceId, status: "PENDING" }
  });
  const inboxItem = existingInboxItem
    ? await prisma.projectInboxItem.update({ where: { id: existingInboxItem.id }, data: inboxData })
    : await prisma.projectInboxItem.create({ data: inboxData });

  return { classification, candidate, inboxItem };
}

export async function assignProjectToSource(sourceType: string, sourceId: string, projectId: string) {
  switch (sourceType.toUpperCase()) {
    case "TASK":
      return prisma.task.update({ where: { id: sourceId }, data: { projectId } });
    case "MATTER":
      return prisma.matter.update({ where: { id: sourceId }, data: { projectId } });
    case "NOTICE":
      return prisma.notice.update({ where: { id: sourceId }, data: { projectId } });
    case "COUNCIL_SESSION":
      return prisma.councilSession.update({ where: { id: sourceId }, data: { projectId } });
    case "REPORT":
      return prisma.report.update({ where: { id: sourceId }, data: { projectId } });
    case "MEMORY":
      return prisma.memory.update({ where: { id: sourceId }, data: { projectId } });
    case "WORK_ORDER":
      return prisma.workOrder.update({ where: { id: sourceId }, data: { projectId } });
    case "IMPLEMENTATION_REPORT":
      return prisma.implementationReport.update({ where: { id: sourceId }, data: { projectId } });
    case "HANDOFF_BRIEF":
      return prisma.handoffBrief.update({ where: { id: sourceId }, data: { projectId } });
    case "ARTIFACT":
      return prisma.artifact.update({ where: { id: sourceId }, data: { projectId } });
    default:
      throw new Error(`Unsupported project routing source type: ${sourceType}`);
  }
}

export async function confirmInboxAssignment(inboxItemId: string, projectId: string) {
  const inboxItem = await prisma.projectInboxItem.findUnique({ where: { id: inboxItemId } });
  if (!inboxItem) throw notFound("Project inbox item not found");
  await assignProjectToSource(inboxItem.sourceType, inboxItem.sourceId, projectId);
  await prisma.projectRoutingCandidate.updateMany({
    where: { sourceType: inboxItem.sourceType, sourceId: inboxItem.sourceId },
    data: { status: "CONFIRMED", suggestedProjectId: projectId }
  });
  return prisma.projectInboxItem.update({
    where: { id: inboxItem.id },
    data: { status: "ASSIGNED", assignedProjectId: projectId }
  });
}

export async function rejectRoutingCandidate(candidateId: string) {
  return prisma.projectRoutingCandidate.update({
    where: { id: candidateId },
    data: { status: "REJECTED" }
  });
}

async function findSourceAncestryProject(sourceType: string, sourceId: string) {
  if (sourceType.toUpperCase() === "WORK_ORDER") {
    const workOrder = await prisma.workOrder.findUnique({ where: { id: sourceId }, select: { projectId: true, sourceType: true, sourceId: true } });
    if (workOrder?.projectId) return prisma.project.findUnique({ where: { id: workOrder.projectId } });
    if (workOrder?.sourceType && workOrder.sourceId) return findSourceAncestryProject(workOrder.sourceType, workOrder.sourceId);
  }
  if (sourceType.toUpperCase() === "IMPLEMENTATION_REPORT") {
    const report = await prisma.implementationReport.findUnique({ where: { id: sourceId }, include: { workOrder: true } });
    if (report?.projectId) return prisma.project.findUnique({ where: { id: report.projectId } });
    if (report?.workOrder.projectId) return prisma.project.findUnique({ where: { id: report.workOrder.projectId } });
  }
  if (sourceType.toUpperCase() === "HANDOFF_BRIEF") {
    const handoff = await prisma.handoffBrief.findUnique({ where: { id: sourceId }, include: { workOrder: true } });
    if (handoff?.projectId) return prisma.project.findUnique({ where: { id: handoff.projectId } });
    if (handoff?.workOrder.projectId) return prisma.project.findUnique({ where: { id: handoff.workOrder.projectId } });
  }
  return null;
}

function scoreProject(project: Project, text: string, ancestryProjectId?: string | null) {
  const matches: string[] = [];
  let score = 0;
  if (ancestryProjectId === project.id) {
    score += 90;
    matches.push("source ancestry already links to this project");
  }
  const name = normalize(project.name);
  if (text.includes(name)) {
    score += 80;
    matches.push(`project name '${project.name}'`);
  }
  if (project.codename && text.includes(normalize(project.codename))) {
    score += 70;
    matches.push(`codename '${project.codename}'`);
  }
  for (const alias of project.aliases) {
    if (text.includes(normalize(alias))) {
      score += 50;
      matches.push(`alias '${alias}'`);
    }
  }
  for (const keyword of project.keywords) {
    if (text.includes(normalize(keyword))) {
      score += keyword.includes(" ") ? 28 : 18;
      matches.push(`keyword '${keyword}'`);
    }
  }
  return { project, score, matches };
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9.#+]+/g, " ").replace(/\s+/g, " ").trim();
}

function trim(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}

function notFound(message: string) {
  const error = new Error(message);
  error.name = "NotFoundError";
  return error;
}
