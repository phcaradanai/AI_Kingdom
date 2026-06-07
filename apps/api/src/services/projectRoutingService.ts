import type { Project, ProjectRoutingStatus } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { classifyProjectInboxItem } from "./dataQualityService.js";
import {
  type MatchSignal,
  classifyDataQualityLabel,
  classifyRoutingQuality,
  generateHumanReason,
  generateHumanTitle,
  isGenericKeyword,
  shouldCreateInboxItem
} from "./routingQualityGate.js";
import { getBooleanSetting } from "./settingsService.js";
import { evaluateRecordValue, shouldPersistRecord } from "./dataValueGateService.js";

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
  candidateProjects: Array<{ project: Project; score: number; matches: string[]; signals: MatchSignal[] }>;
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

export async function analyzeProjectRoutingForSource(input: ProjectClassificationInput) {
  const classification = await classifyProjectForText(input);
  const bestCandidate = classification.candidateProjects[0];
  const allSignals: MatchSignal[] = bestCandidate?.signals ?? [];
  const { routingQuality, evidence, ignoredSignals } = classifyRoutingQuality(
    classification.confidenceScore,
    allSignals
  );

  const suggestedProjectName = bestCandidate?.project.name ?? null;
  const humanTitle = generateHumanTitle(input.title);
  const humanReason = generateHumanReason(routingQuality, evidence, ignoredSignals, suggestedProjectName);
  const dataQualityLabel = classifyDataQualityLabel(input.sourceType, input.sourceId, true);

  const gateDecision = await evaluateRecordValue({
    recordType: "projectInboxItem",
    origin: input.sourceType?.toLowerCase().includes("test") ? "TEST" : "SYSTEM_GENERATED",
    title: input.title,
    content: input.content,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    confidence: classification.confidenceScore,
    projectId: classification.suggestedProjectId,
    metadata: {
      evidence,
      ignoredSignals,
      candidateProjectIds: classification.candidateProjects.map((item) => item.project.id)
    }
  });

  return {
    classification,
    routingQuality,
    evidence,
    ignoredSignals,
    humanTitle,
    humanReason,
    dataQualityLabel,
    gateDecision
  };
}

export async function createProjectInboxItemFromRoutingDecision(
  input: ProjectClassificationInput,
  analysis: any,
  explicitUserAction = false
) {
  const status: ProjectRoutingStatus = analysis.classification.confidenceScore >= 80
    ? "CONFIRMED"
    : analysis.classification.confidenceScore >= 50
      ? "SUGGESTED"
      : "NEEDS_REVIEW";

  const candidate = await prisma.projectRoutingCandidate.create({
    data: {
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      suggestedProjectId: analysis.classification.suggestedProjectId,
      confidenceScore: analysis.classification.confidenceScore,
      reason: analysis.classification.reason,
      status
    }
  });

  if (analysis.classification.confidenceScore >= 80 && analysis.classification.suggestedProjectId) {
    await assignProjectToSource(input.sourceType, input.sourceId, analysis.classification.suggestedProjectId);
    return { candidate, inboxItem: null };
  }

  // Dedup: same sourceType + sourceId + PENDING
  const existingInboxItem = await prisma.projectInboxItem.findFirst({
    where: { sourceType: input.sourceType, sourceId: input.sourceId, status: "PENDING" }
  });

  // Dedup: same normalizedTitle + sourceType within 5-minute window
  const normalizedTitle = normalizeTitle(input.title);
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  const recentDuplicate = !existingInboxItem ? await prisma.projectInboxItem.findFirst({
    where: {
      sourceType: input.sourceType,
      status: "PENDING",
      createdAt: { gte: fiveMinutesAgo },
      title: { equals: normalizedTitle, mode: "insensitive" }
    }
  }) : null;

  const duplicateItem = existingInboxItem ?? recentDuplicate;
  if (duplicateItem) {
    return { candidate, inboxItem: duplicateItem };
  }

  // Value Gate check
  const persist = shouldPersistRecord(analysis.gateDecision, {
    recordType: "projectInboxItem",
    origin: "SYSTEM_GENERATED",
    explicitUserAction
  });

  // If explicitUserAction is false, and decision is REJECT or PREVIEW_ONLY, skip inbox creation
  if (!explicitUserAction && (analysis.gateDecision.decision === "REJECT" || analysis.gateDecision.decision === "PREVIEW_ONLY")) {
    return { candidate, inboxItem: null };
  }

  if (!persist) {
    return { candidate, inboxItem: null };
  }

  const inboxData = {
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    title: input.title,
    summary: trim(input.content, 800),
    candidateProjectIds: analysis.classification.candidateProjects.map((item: any) => item.project.id),
    confidenceScore: analysis.classification.confidenceScore,
    reason: analysis.classification.reason,
    status: "PENDING" as const,
    dataSource: input.sourceType,
    dataQuality: classifyProjectInboxItem({
      title: input.title,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      confidenceScore: analysis.classification.confidenceScore,
      createdBySystem: true,
      dataSource: input.sourceType
    }),
    createdBySystem: true,
    provenance: {
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      routingStatus: status,
      reason: analysis.classification.reason
    },
    routingConfidence: analysis.classification.confidenceScore,
    routingQuality: analysis.gateDecision.decision === "PREVIEW_ONLY" ? "DEBUG_ONLY" : analysis.routingQuality,
    dataQualityLabel: analysis.gateDecision.sourceTrust === "TRUSTED" ? "TRUSTED_SOURCE" : analysis.dataQualityLabel,
    humanTitle: analysis.humanTitle,
    humanReason: analysis.humanReason,
    evidence: analysis.evidence.length > 0 ? analysis.evidence : undefined,
    ignoredSignals: analysis.ignoredSignals.length > 0 ? analysis.ignoredSignals : undefined
  };

  const inboxItem = await prisma.projectInboxItem.create({ data: inboxData });

  return { candidate, inboxItem };
}

export async function routeProjectForSource(input: ProjectClassificationInput) {
  const analysis = await analyzeProjectRoutingForSource(input);
  const { candidate, inboxItem } = await createProjectInboxItemFromRoutingDecision(input, analysis, false);
  return { classification: analysis.classification, candidate, inboxItem };
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
  const signals: MatchSignal[] = [];
  let score = 0;
  if (ancestryProjectId === project.id) {
    score += 90;
    matches.push("source ancestry already links to this project");
    signals.push({ type: "source_ancestry", value: "source ancestry", projectName: project.name, score: 90 });
  }
  const name = normalize(project.name);
  if (text.includes(name)) {
    score += 80;
    matches.push(`project name '${project.name}'`);
    signals.push({ type: "project_name", value: project.name, projectName: project.name, score: 80 });
  }
  if (project.codename && text.includes(normalize(project.codename))) {
    score += 70;
    matches.push(`codename '${project.codename}'`);
    signals.push({ type: "codename", value: project.codename, projectName: project.name, score: 70 });
  }
  for (const alias of project.aliases) {
    if (text.includes(normalize(alias))) {
      score += 50;
      matches.push(`alias '${alias}'`);
      signals.push({ type: "alias", value: alias, projectName: project.name, score: 50 });
    }
  }
  for (const keyword of project.keywords) {
    if (text.includes(normalize(keyword))) {
      const keywordScore = keyword.includes(" ") ? 28 : 18;
      // M15F: generic keywords still score for legacy compatibility but are
      // classified as ignoredSignals by the quality gate.
      score += keywordScore;
      matches.push(`keyword '${keyword}'`);
      signals.push({ type: "keyword", value: keyword, projectName: project.name, score: keywordScore });
    }
  }
  return { project, score, matches, signals };
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9.#+]+/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeTitle(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function trim(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}

function notFound(message: string) {
  const error = new Error(message);
  error.name = "NotFoundError";
  return error;
}
