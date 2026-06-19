import type { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { auditLog } from "./auditService.js";
import { createWorkOrder } from "./externalAgentWorkOrderService.js";
import { redactSecrets } from "./usageAttributionService.js";

type Actor = { userId?: string | null };

export async function getStrategyOverview() {
  const [
    objectiveCounts,
    opportunityCounts,
    assetCounts,
    revenueCounts,
    revenueAgg,
    assetAgg,
    atRiskMetrics,
    topOpportunities,
    activeRevenueStreams,
    activeObjectives
  ] = await Promise.all([
    prisma.kingdomObjective.groupBy({ by: ["status"], _count: { id: true } }),
    prisma.kingdomOpportunity.groupBy({ by: ["status"], _count: { id: true } }),
    prisma.kingdomAsset.groupBy({ by: ["status"], _count: { id: true } }),
    prisma.revenueStream.groupBy({ by: ["status"], _count: { id: true } }),
    prisma.revenueStream.aggregate({
      where: { status: { in: ["TESTING", "ACTIVE"] } },
      _sum: { monthlyRevenue: true, monthlyCost: true }
    }),
    prisma.kingdomAsset.aggregate({
      _sum: { monthlyRevenueEstimate: true, monthlyCostEstimate: true }
    }),
    prisma.successMetric.findMany({
      where: { status: { in: ["AT_RISK", "OFF_TRACK"] } },
      include: { objective: { select: { id: true, title: true, status: true } }, project: { select: { id: true, name: true, codename: true } } },
      orderBy: [{ status: "desc" }, { updatedAt: "desc" }],
      take: 8
    }),
    prisma.kingdomOpportunity.findMany({
      where: { status: { in: ["INBOX", "REVIEWING", "VALIDATING", "APPROVED"] } },
      include: {
        project: { select: { id: true, name: true, codename: true } },
        objective: { select: { id: true, title: true, status: true } },
        asset: { select: { id: true, name: true, status: true, type: true } },
        experiments: { orderBy: { updatedAt: "desc" }, take: 3 }
      },
      orderBy: [{ score: "desc" }, { estimatedMonthlyRevenue: "desc" }, { updatedAt: "desc" }],
      take: 8
    }),
    prisma.revenueStream.findMany({
      where: { status: { in: ["TESTING", "ACTIVE"] } },
      include: { project: { select: { id: true, name: true, codename: true } }, asset: { select: { id: true, name: true, status: true, type: true } } },
      orderBy: [{ monthlyRevenue: "desc" }, { updatedAt: "desc" }],
      take: 8
    }),
    prisma.kingdomObjective.findMany({
      where: { status: "ACTIVE" },
      include: { project: { select: { id: true, name: true, codename: true } }, metrics: true },
      orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
      take: 8
    })
  ]);

  const monthlyRevenue = revenueAgg._sum.monthlyRevenue ?? 0;
  const monthlyCost = revenueAgg._sum.monthlyCost ?? 0;
  const objectiveStatusCounts = countByStatus(objectiveCounts);
  const opportunityStatusCounts = countByStatus(opportunityCounts);
  const assetStatusCounts = countByStatus(assetCounts);
  const revenueStatusCounts = countByStatus(revenueCounts);

  return {
    computedAt: new Date(),
    objectives: {
      active: objectiveStatusCounts.ACTIVE ?? 0,
      atRiskMetrics: atRiskMetrics.length,
      achieved: objectiveStatusCounts.ACHIEVED ?? 0,
      archived: objectiveStatusCounts.ARCHIVED ?? 0
    },
    assets: {
      active: assetStatusCounts.ACTIVE ?? 0,
      monetizing: assetStatusCounts.MONETIZING ?? 0,
      ideas: assetStatusCounts.IDEA ?? 0,
      totalEstimatedMonthlyRevenue: assetAgg._sum.monthlyRevenueEstimate ?? 0,
      totalEstimatedMonthlyCost: assetAgg._sum.monthlyCostEstimate ?? 0
    },
    revenue: {
      activeStreams: revenueStatusCounts.ACTIVE ?? 0,
      testingStreams: revenueStatusCounts.TESTING ?? 0,
      monthlyRevenue,
      monthlyCost,
      monthlyNet: monthlyRevenue - monthlyCost
    },
    opportunities: {
      inbox: opportunityStatusCounts.INBOX ?? 0,
      reviewing: opportunityStatusCounts.REVIEWING ?? 0,
      validating: opportunityStatusCounts.VALIDATING ?? 0,
      approved: opportunityStatusCounts.APPROVED ?? 0,
      rejected: opportunityStatusCounts.REJECTED ?? 0,
      top: topOpportunities
    },
    activeObjectives,
    atRiskMetrics,
    activeRevenueStreams
  };
}

export async function listObjectives() {
  return prisma.kingdomObjective.findMany({
    include: { project: { select: { id: true, name: true, codename: true } }, metrics: true },
    orderBy: [{ status: "asc" }, { priority: "desc" }, { updatedAt: "desc" }]
  });
}

export async function createObjective(input: Prisma.KingdomObjectiveUncheckedCreateInput, actor: Actor) {
  const objective = await prisma.kingdomObjective.create({
    data: normalizeObjective(input, actor.userId)
  });
  await auditLog({ userId: actor.userId ?? undefined, action: "create_strategy_objective", resourceType: "kingdom_objective", resourceId: objective.id, metadata: { title: objective.title } });
  return objective;
}

export async function updateObjective(id: string, input: Prisma.KingdomObjectiveUncheckedUpdateInput, actor: Actor) {
  const objective = await prisma.kingdomObjective.update({
    where: { id },
    data: normalizeObjectiveUpdate(input)
  });
  await auditLog({ userId: actor.userId ?? undefined, action: "update_strategy_objective", resourceType: "kingdom_objective", resourceId: objective.id, metadata: { status: objective.status } });
  return objective;
}

export async function listMetrics() {
  return prisma.successMetric.findMany({
    include: { objective: { select: { id: true, title: true, status: true } }, project: { select: { id: true, name: true, codename: true } } },
    orderBy: [{ status: "desc" }, { updatedAt: "desc" }]
  });
}

export async function createMetric(input: Prisma.SuccessMetricUncheckedCreateInput, actor: Actor) {
  const metric = await prisma.successMetric.create({ data: normalizeMetric(input) });
  await auditLog({ userId: actor.userId ?? undefined, action: "create_success_metric", resourceType: "success_metric", resourceId: metric.id, metadata: { name: metric.name } });
  return metric;
}

export async function updateMetric(id: string, input: Prisma.SuccessMetricUncheckedUpdateInput, actor: Actor) {
  const metric = await prisma.successMetric.update({ where: { id }, data: normalizeMetricUpdate(input) });
  await auditLog({ userId: actor.userId ?? undefined, action: "update_success_metric", resourceType: "success_metric", resourceId: metric.id, metadata: { status: metric.status } });
  return metric;
}

export async function listAssets() {
  return prisma.kingdomAsset.findMany({
    include: { project: { select: { id: true, name: true, codename: true } }, revenueStreams: true, opportunities: true },
    orderBy: [{ status: "asc" }, { monthlyRevenueEstimate: "desc" }, { updatedAt: "desc" }]
  });
}

export async function createAsset(input: Prisma.KingdomAssetUncheckedCreateInput, actor: Actor) {
  const asset = await prisma.kingdomAsset.create({ data: normalizeAsset(input) });
  await auditLog({ userId: actor.userId ?? undefined, action: "create_kingdom_asset", resourceType: "kingdom_asset", resourceId: asset.id, metadata: { name: asset.name, status: asset.status } });
  return asset;
}

export async function updateAsset(id: string, input: Prisma.KingdomAssetUncheckedUpdateInput, actor: Actor) {
  const asset = await prisma.kingdomAsset.update({ where: { id }, data: normalizeAssetUpdate(input) });
  await auditLog({ userId: actor.userId ?? undefined, action: "update_kingdom_asset", resourceType: "kingdom_asset", resourceId: asset.id, metadata: { status: asset.status } });
  return asset;
}

export async function listRevenueStreams() {
  return prisma.revenueStream.findMany({
    include: { project: { select: { id: true, name: true, codename: true } }, asset: { select: { id: true, name: true, status: true, type: true } } },
    orderBy: [{ status: "asc" }, { monthlyRevenue: "desc" }, { updatedAt: "desc" }]
  });
}

export async function createRevenueStream(input: Prisma.RevenueStreamUncheckedCreateInput, actor: Actor) {
  const stream = await prisma.revenueStream.create({ data: normalizeRevenueStream(input) });
  await auditLog({ userId: actor.userId ?? undefined, action: "create_revenue_stream", resourceType: "revenue_stream", resourceId: stream.id, metadata: { name: stream.name, status: stream.status } });
  return stream;
}

export async function updateRevenueStream(id: string, input: Prisma.RevenueStreamUncheckedUpdateInput, actor: Actor) {
  const stream = await prisma.revenueStream.update({ where: { id }, data: normalizeRevenueStreamUpdate(input) });
  await auditLog({ userId: actor.userId ?? undefined, action: "update_revenue_stream", resourceType: "revenue_stream", resourceId: stream.id, metadata: { status: stream.status } });
  return stream;
}

export async function listOpportunities() {
  return prisma.kingdomOpportunity.findMany({
    include: {
      project: { select: { id: true, name: true, codename: true } },
      objective: { select: { id: true, title: true, status: true } },
      asset: { select: { id: true, name: true, status: true, type: true } },
      experiments: { orderBy: { updatedAt: "desc" } }
    },
    orderBy: [{ status: "asc" }, { score: "desc" }, { estimatedMonthlyRevenue: "desc" }, { updatedAt: "desc" }]
  });
}

export async function createOpportunity(input: Prisma.KingdomOpportunityUncheckedCreateInput, actor: Actor) {
  const opportunity = await prisma.kingdomOpportunity.create({
    data: normalizeOpportunity(input, actor.userId)
  });
  await auditLog({ userId: actor.userId ?? undefined, action: "create_kingdom_opportunity", resourceType: "kingdom_opportunity", resourceId: opportunity.id, metadata: { title: opportunity.title, score: opportunity.score } });
  return opportunity;
}

export async function createOpportunityFromArtifact(artifactId: string, actor: Actor) {
  const artifact = await prisma.artifact.findUnique({
    where: { id: artifactId },
    include: { project: { select: { id: true, name: true, codename: true } } }
  });
  if (!artifact) throw notFound("Artifact not found");

  const existing = await prisma.kingdomOpportunity.findFirst({
    where: { sourceType: "ARTIFACT", sourceId: artifact.id },
    include: {
      project: { select: { id: true, name: true, codename: true } },
      objective: { select: { id: true, title: true, status: true } },
      asset: { select: { id: true, name: true, status: true, type: true } },
      experiments: { orderBy: { updatedAt: "desc" }, take: 3 }
    }
  });
  if (existing) return { status: "EXISTING" as const, opportunity: existing };

  const opportunity = await prisma.kingdomOpportunity.create({
    data: normalizeOpportunity({
      projectId: artifact.projectId,
      title: trimText(`Review research: ${artifact.title}`, 180),
      problem: trimText(artifact.content, 4000),
      proposedValue: trimText(`Turn this ${artifact.type.toLowerCase().replace(/_/g, " ")} into a validated kingdom opportunity: ${artifact.title}`, 4000),
      targetCustomer: "",
      status: "INBOX",
      priority: artifact.type === "MARKET_RESEARCH" ? "HIGH" : "MEDIUM",
      confidence: 0.5,
      score: artifact.type === "MARKET_RESEARCH" ? 60 : 45,
      estimatedMonthlyRevenue: 0,
      estimatedEffort: "Needs validation",
      riskLevel: "MEDIUM",
      nextAction: "Review the source artifact, identify the target customer, and define the first validation experiment.",
      sourceType: "ARTIFACT",
      sourceId: artifact.id,
      traceId: artifact.traceId,
      tags: [...new Set(["strategy-intake", "artifact", artifact.type.toLowerCase(), ...artifact.tags])]
    }, actor.userId)
  });

  await auditLog({
    userId: actor.userId ?? undefined,
    action: "create_opportunity_from_artifact",
    resourceType: "kingdom_opportunity",
    resourceId: opportunity.id,
    metadata: { artifactId: artifact.id, artifactType: artifact.type, title: opportunity.title }
  });
  return { status: "CREATED" as const, opportunity };
}

export async function updateOpportunity(id: string, input: Prisma.KingdomOpportunityUncheckedUpdateInput, actor: Actor) {
  const opportunity = await prisma.kingdomOpportunity.update({
    where: { id },
    data: normalizeOpportunityUpdate(input)
  });
  await auditLog({ userId: actor.userId ?? undefined, action: "update_kingdom_opportunity", resourceType: "kingdom_opportunity", resourceId: opportunity.id, metadata: { status: opportunity.status, score: opportunity.score } });
  return opportunity;
}

export async function createOpportunityWorkOrder(opportunityId: string, actor: Actor) {
  const opportunity = await prisma.kingdomOpportunity.findUnique({
    where: { id: opportunityId },
    include: { project: true, objective: true, asset: true }
  });
  if (!opportunity) throw notFound("Opportunity not found");

  const result = await createWorkOrder({
    title: `Opportunity Validation: ${opportunity.title}`,
    objective: opportunity.proposedValue || opportunity.problem || opportunity.title,
    context: [
      `Opportunity: ${opportunity.title}`,
      opportunity.project ? `Project: ${opportunity.project.name}` : "",
      opportunity.objective ? `Objective: ${opportunity.objective.title}` : "",
      opportunity.asset ? `Asset: ${opportunity.asset.name}` : "",
      opportunity.targetCustomer ? `Target customer: ${opportunity.targetCustomer}` : "",
      opportunity.estimatedMonthlyRevenue ? `Estimated monthly revenue: $${opportunity.estimatedMonthlyRevenue}` : "",
      opportunity.estimatedEffort ? `Estimated effort: ${opportunity.estimatedEffort}` : "",
      opportunity.nextAction ? `Next action: ${opportunity.nextAction}` : "",
      opportunity.problem ? `Problem:\n${opportunity.problem}` : "",
      opportunity.proposedValue ? `Proposed value:\n${opportunity.proposedValue}` : ""
    ].filter(Boolean).join("\n\n"),
    instructions: "Validate this opportunity before implementation. Produce evidence, risks, next experiment, and a clear go/no-go recommendation. Do not auto-patch, auto-merge, auto-deploy, or auto-create PRs.",
    constraints: [
      "Keep validation manual-review first.",
      "Do not expose secrets.",
      "Do not create SANDBOX_PATCH until project context is FRESH and the King explicitly approves it.",
      "Separate evidence from assumptions."
    ].join("\n"),
    acceptanceCriteria: [
      "Opportunity has a clear target customer and value hypothesis.",
      "Validation experiment is defined with success criteria.",
      "Revenue, effort, and risk assumptions are explicit.",
      "King can decide approve, reject, or run another experiment."
    ],
    validationCommands: [],
    projectId: opportunity.projectId,
    sourceType: "KINGDOM_OPPORTUNITY",
    sourceId: opportunity.id,
    priority: opportunity.priority,
    createdByUserId: actor.userId ?? null
  }, true);

  await auditLog({ userId: actor.userId ?? undefined, action: "create_opportunity_work_order", resourceType: "kingdom_opportunity", resourceId: opportunity.id, metadata: { workOrderId: result.workOrder?.id, status: result.status } });
  return result;
}

export async function listExperiments() {
  return prisma.opportunityExperiment.findMany({
    include: { opportunity: { select: { id: true, title: true, status: true } } },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }]
  });
}

export async function createExperiment(input: Prisma.OpportunityExperimentUncheckedCreateInput, actor: Actor) {
  const experiment = await prisma.opportunityExperiment.create({
    data: normalizeExperiment(input, actor.userId)
  });
  await auditLog({ userId: actor.userId ?? undefined, action: "create_opportunity_experiment", resourceType: "opportunity_experiment", resourceId: experiment.id, metadata: { opportunityId: experiment.opportunityId, status: experiment.status } });
  return experiment;
}

export async function updateExperiment(id: string, input: Prisma.OpportunityExperimentUncheckedUpdateInput, actor: Actor) {
  const experiment = await prisma.opportunityExperiment.update({ where: { id }, data: normalizeExperimentUpdate(input) });
  await auditLog({ userId: actor.userId ?? undefined, action: "update_opportunity_experiment", resourceType: "opportunity_experiment", resourceId: experiment.id, metadata: { status: experiment.status } });
  return experiment;
}

function countByStatus(rows: Array<{ [key: string]: unknown; _count: { id: number } }>) {
  const output: Record<string, number> = {};
  for (const row of rows) {
    const status = String(row.status);
    output[status] = row._count.id;
  }
  return output;
}

function normalizeObjective(input: Prisma.KingdomObjectiveUncheckedCreateInput, userId?: string | null): Prisma.KingdomObjectiveUncheckedCreateInput {
  return {
    ...input,
    createdByUserId: input.createdByUserId ?? userId ?? null,
    title: cleanText(input.title),
    description: cleanText(input.description ?? ""),
    tags: normalizeTags(input.tags)
  };
}

function normalizeObjectiveUpdate(input: Prisma.KingdomObjectiveUncheckedUpdateInput): Prisma.KingdomObjectiveUncheckedUpdateInput {
  return cleanUpdate(input, ["title", "description", "sourceType", "sourceId"], ["tags"]);
}

function normalizeMetric(input: Prisma.SuccessMetricUncheckedCreateInput): Prisma.SuccessMetricUncheckedCreateInput {
  return {
    ...input,
    name: cleanText(input.name),
    description: cleanText(input.description ?? ""),
    unit: cleanText(input.unit ?? ""),
    lastMeasuredAt: input.lastMeasuredAt ?? new Date()
  };
}

function normalizeMetricUpdate(input: Prisma.SuccessMetricUncheckedUpdateInput): Prisma.SuccessMetricUncheckedUpdateInput {
  const cleaned = cleanUpdate(input, ["name", "description", "unit", "sourceType", "sourceId"], []);
  if ("currentValue" in input && !("lastMeasuredAt" in input)) cleaned.lastMeasuredAt = new Date();
  return cleaned;
}

function normalizeAsset(input: Prisma.KingdomAssetUncheckedCreateInput): Prisma.KingdomAssetUncheckedCreateInput {
  return {
    ...input,
    name: cleanText(input.name),
    description: cleanText(input.description ?? ""),
    valueHypothesis: cleanText(input.valueHypothesis ?? ""),
    targetCustomer: cleanText(input.targetCustomer ?? ""),
    tags: normalizeTags(input.tags)
  };
}

function normalizeAssetUpdate(input: Prisma.KingdomAssetUncheckedUpdateInput): Prisma.KingdomAssetUncheckedUpdateInput {
  return cleanUpdate(input, ["name", "description", "valueHypothesis", "targetCustomer", "sourceType", "sourceId"], ["tags"]);
}

function normalizeRevenueStream(input: Prisma.RevenueStreamUncheckedCreateInput): Prisma.RevenueStreamUncheckedCreateInput {
  return {
    ...input,
    name: cleanText(input.name),
    notes: cleanText(input.notes ?? ""),
    currency: cleanText(input.currency ?? "USD").toUpperCase()
  };
}

function normalizeRevenueStreamUpdate(input: Prisma.RevenueStreamUncheckedUpdateInput): Prisma.RevenueStreamUncheckedUpdateInput {
  const cleaned = cleanUpdate(input, ["name", "notes", "sourceType", "sourceId", "currency"], []);
  if (typeof cleaned.currency === "string") cleaned.currency = cleaned.currency.toUpperCase();
  return cleaned;
}

function normalizeOpportunity(input: Prisma.KingdomOpportunityUncheckedCreateInput, userId?: string | null): Prisma.KingdomOpportunityUncheckedCreateInput {
  return {
    ...input,
    createdByUserId: input.createdByUserId ?? userId ?? null,
    title: cleanText(input.title),
    problem: cleanText(input.problem ?? ""),
    proposedValue: cleanText(input.proposedValue ?? ""),
    targetCustomer: cleanText(input.targetCustomer ?? ""),
    estimatedEffort: cleanText(input.estimatedEffort ?? ""),
    nextAction: cleanText(input.nextAction ?? ""),
    tags: normalizeTags(input.tags),
    reviewedAt: ["APPROVED", "REJECTED", "ARCHIVED"].includes(String(input.status)) ? new Date() : input.reviewedAt
  };
}

function normalizeOpportunityUpdate(input: Prisma.KingdomOpportunityUncheckedUpdateInput): Prisma.KingdomOpportunityUncheckedUpdateInput {
  const cleaned = cleanUpdate(input, ["title", "problem", "proposedValue", "targetCustomer", "estimatedEffort", "nextAction", "sourceType", "sourceId", "traceId"], ["tags"]);
  const status = "status" in input ? String(input.status) : "";
  if (["APPROVED", "REJECTED", "ARCHIVED"].includes(status) && !("reviewedAt" in input)) cleaned.reviewedAt = new Date();
  return cleaned;
}

function normalizeExperiment(input: Prisma.OpportunityExperimentUncheckedCreateInput, userId?: string | null): Prisma.OpportunityExperimentUncheckedCreateInput {
  return {
    ...input,
    createdByUserId: input.createdByUserId ?? userId ?? null,
    title: cleanText(input.title),
    hypothesis: cleanText(input.hypothesis ?? ""),
    validationMethod: cleanText(input.validationMethod ?? ""),
    successCriteria: cleanText(input.successCriteria ?? "")
  };
}

function normalizeExperimentUpdate(input: Prisma.OpportunityExperimentUncheckedUpdateInput): Prisma.OpportunityExperimentUncheckedUpdateInput {
  const cleaned = cleanUpdate(input, ["title", "hypothesis", "validationMethod", "successCriteria", "resultSummary"], []);
  const status = "status" in input ? String(input.status) : "";
  if (["COMPLETED", "FAILED", "CANCELLED"].includes(status) && !("completedAt" in input)) cleaned.completedAt = new Date();
  if (status === "RUNNING" && !("startedAt" in input)) cleaned.startedAt = new Date();
  return cleaned;
}

function cleanUpdate<T extends Record<string, unknown>>(input: T, textFields: string[], tagFields: string[]): T {
  const output: Record<string, unknown> = { ...input };
  for (const field of textFields) {
    if (typeof output[field] === "string") output[field] = cleanText(output[field] as string);
  }
  for (const field of tagFields) {
    if (field in output) output[field] = normalizeTags(output[field] as unknown);
  }
  return output as T;
}

function cleanText(value: string): string {
  return redactSecrets(value).trim();
}

function trimText(value: string, maxLength: number): string {
  const cleaned = cleanText(value);
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string").map((item) => cleanText(item).toLowerCase()).filter(Boolean))];
}

function notFound(message: string) {
  const error = new Error(message);
  error.name = "NotFoundError";
  return error;
}
