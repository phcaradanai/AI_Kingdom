import { type TaskMode, type WorkOrderStatus } from "@prisma/client";
import { generateWithFallback } from "../ai/generateWithFallback.js";
import { createAIProviderFromConfig } from "../ai/providerFactory.js";
import { resolveEffectiveParameters } from "../ai/modelParameterResolver.js";
import type { AIProviderConfig } from "./aiProviderRegistry.js";
import { selectAIProviderRoute } from "./aiProviderRouter.js";
import { calculateCostUSDFromRegistry } from "./modelPricingService.js";
import {
  buildTraceContext,
  completeAIUsageTrace,
  createAIUsageTrace,
  failAIUsageTrace
} from "./aiUsageTraceService.js";
import { buildUsageAttribution } from "./usageAttributionService.js";
import { prisma } from "../db/prisma.js";
import { buildProjectContext } from "./projectContextService.js";
import { formatRepositoryContextSection, getLatestSnapshot } from "./repositoryScanService.js";
import { getBooleanSetting, getNumberSetting } from "./settingsService.js";
import { assignWorkOrderAgent } from "./workOrderAssignmentService.js";

export interface PlannerDraft {
  title: string;
  objective: string;
  rationale: string;
}

export interface PlannerResult {
  drafted: number;
  skipped: number;
  sessionId: string;
}

type SessionInput = {
  id: string;
  finalSummary: string | null;
  projectId: string | null;
  taskId: string;
};

type TaskInput = {
  id: string;
  title: string;
  command: string;
  mode: TaskMode;
  projectId: string | null;
  createdBy: string;
  user?: { role: string };
};

export async function runPlannerAgent(
  session: SessionInput,
  task: TaskInput,
  userId: string
): Promise<PlannerResult> {
  const enabled = await getBooleanSetting("AUTO_PLAN_WORK_ORDERS", false);
  if (!enabled) return { drafted: 0, skipped: 0, sessionId: session.id };

  try {
    return await executePlanner(session, task, userId);
  } catch (error) {
    console.warn("[PlannerAgent] Failed to run planner agent:", error instanceof Error ? error.message : String(error));
    return { drafted: 0, skipped: 0, sessionId: session.id };
  }
}

export async function planFromSession(sessionId: string, userId: string): Promise<PlannerResult> {
  const session = await prisma.councilSession.findUnique({
    where: { id: sessionId },
    include: { task: { include: { user: { select: { role: true } } } } }
  });
  if (!session) {
    const error = new Error("Council session not found");
    error.name = "NotFoundError";
    throw error;
  }
  if (session.status !== "COMPLETED") {
    throw new Error("Council session must be COMPLETED before planning");
  }

  return executePlanner(session, session.task, userId);
}

async function executePlanner(session: SessionInput, task: TaskInput, userId: string): Promise<PlannerResult> {
  const plannerAgent = await prisma.agent.findUnique({ where: { slug: "planner" } });
  if (!plannerAgent) {
    console.warn("[PlannerAgent] No 'planner' agent found in database. Run npm run db:seed to create it.");
    return { drafted: 0, skipped: 0, sessionId: session.id };
  }

  const defaultMaxTokens = await getNumberSetting("AI_MAX_TOKENS", 700);

  // Load all Kingdom context sources in parallel
  const [projectContext, snapshot, openWorkOrders, implReports, handoffBriefs, artifacts] = await Promise.all([
    task.projectId ? buildProjectContext(task.projectId) : Promise.resolve(null),
    task.projectId ? getLatestSnapshot(task.projectId) : Promise.resolve(null),
    prisma.workOrder.findMany({
      where: task.projectId
        ? { projectId: task.projectId, status: { notIn: ["ARCHIVED", "CANCELLED", "FAILED", "COMPLETED"] } }
        : { status: { notIn: ["ARCHIVED", "CANCELLED", "FAILED", "COMPLETED"] } },
      select: { id: true, title: true, status: true, objective: true },
      orderBy: { updatedAt: "desc" },
      take: 5
    }),
    prisma.implementationReport.findMany({
      where: task.projectId ? { projectId: task.projectId } : {},
      select: { summary: true, remainingWork: true, nextRecommendedAction: true },
      orderBy: { createdAt: "desc" },
      take: 3
    }),
    prisma.handoffBrief.findMany({
      where: task.projectId ? { projectId: task.projectId } : {},
      select: { title: true, nextSteps: true, knownIssues: true },
      orderBy: { createdAt: "desc" },
      take: 3
    }),
    task.projectId
      ? prisma.artifact.findMany({
          where: { projectId: task.projectId },
          select: { type: true, title: true },
          orderBy: { updatedAt: "desc" },
          take: 5
        })
      : Promise.resolve([])
  ]);

  const planningContext = buildPlanningContext({
    session,
    task,
    projectContext,
    snapshot,
    openWorkOrders,
    implReports,
    handoffBriefs,
    artifacts
  });

  const rawResponse = await callPlannerLLM({
    plannerAgent,
    planningContext,
    session,
    task,
    userId,
    defaultMaxTokens
  });

  const drafts = parsePlannerResponse(rawResponse);
  if (drafts.length === 0) {
    return { drafted: 0, skipped: 0, sessionId: session.id };
  }

  return createDraftWorkOrders(drafts, session, task, userId);
}

function buildPlanningContext(opts: {
  session: SessionInput;
  task: TaskInput;
  projectContext: string | null;
  snapshot: Awaited<ReturnType<typeof getLatestSnapshot>>;
  openWorkOrders: Array<{ id: string; title: string; status: string; objective: string }>;
  implReports: Array<{ summary: string; remainingWork: string[]; nextRecommendedAction: string | null }>;
  handoffBriefs: Array<{ title: string; nextSteps: string[]; knownIssues: string[] }>;
  artifacts: Array<{ type: string; title: string }>;
}): string {
  const { session, task, projectContext, snapshot, openWorkOrders, implReports, handoffBriefs, artifacts } = opts;

  const sections: string[] = [
    `[TASK]\nTitle: ${task.title}\nMode: ${task.mode}\nCommand: ${task.command}`,
    `[COUNCIL SESSION SUMMARY]\n${session.finalSummary ?? "No summary available."}`,
    projectContext ? `[PROJECT CONTEXT]\n${projectContext}` : "[PROJECT CONTEXT]\nNo project assigned.",
    `[REPOSITORY SNAPSHOT]\n${formatRepositoryContextSection(snapshot)}`,
    `[OPEN WORK ORDERS (${openWorkOrders.length})]\n${
      openWorkOrders.length
        ? openWorkOrders.map((wo) => `- ${wo.title} (${wo.status}): ${wo.objective.slice(0, 120)}`).join("\n")
        : "- None."
    }`,
    `[RECENT IMPLEMENTATION REPORTS (${implReports.length})]\n${
      implReports.length
        ? implReports.map((r) => `- ${r.summary.slice(0, 150)}${r.remainingWork.length ? ` | Remaining: ${r.remainingWork[0]}` : ""}`).join("\n")
        : "- None."
    }`,
    `[RECENT HANDOFF BRIEFS (${handoffBriefs.length})]\n${
      handoffBriefs.length
        ? handoffBriefs.map((h) => `- ${h.title}${h.nextSteps.length ? `: ${h.nextSteps[0]}` : ""}`).join("\n")
        : "- None."
    }`,
    `[RELATED ARTIFACTS (${artifacts.length})]\n${
      artifacts.length
        ? artifacts.map((a) => `- [${a.type}] ${a.title}`).join("\n")
        : "- None."
    }`
  ];

  return sections.join("\n\n");
}

async function callPlannerLLM(opts: {
  plannerAgent: { id: string; slug: string; name: string; title: string; skills: string[]; systemPrompt: string | null; prompt: string | null; responseStyle: string | null; temperature: number | null; maxTokens: number | null; modelParameters: unknown };
  planningContext: string;
  session: SessionInput;
  task: TaskInput;
  userId: string;
  defaultMaxTokens: number;
}): Promise<string> {
  const { plannerAgent, planningContext, session, task, userId, defaultMaxTokens } = opts;

  const route = await selectAIProviderRoute({
    agent: plannerAgent as Parameters<typeof selectAIProviderRoute>[0]["agent"],
    taskMode: "PLAN",
    requiredCapabilities: { chat: true }
  });
  const effectiveParams = resolveEffectiveParameters(
    plannerAgent as Parameters<typeof resolveEffectiveParameters>[0],
    route.provider.type,
    defaultMaxTokens
  );
  const providerCalls = buildProviderCalls(route.provider, route.model, route.fallbackProviders);

  const actorRole = (task.user?.role as string | undefined) ?? "KING";
  const trace = await createAIUsageTrace({
    actorUserId: userId,
    actorRole,
    triggerType: "SYSTEM_ACTION",
    triggerRoute: "POST /api/council/:sessionId/plan-work-orders",
    triggerLabel: task.title,
    projectId: task.projectId,
    taskId: task.id,
    councilSessionId: session.id,
    agentId: plannerAgent.id,
    sourceType: "PLANNER_DRAFT",
    sourceId: session.id,
    operation: "planner_draft_generation",
    purpose: "Planner agent draft work order generation",
    providerId: route.provider.id,
    providerType: route.provider.type,
    providerName: route.provider.name,
    model: route.model,
    prompt: planningContext,
    metadata: { agentSlug: plannerAgent.slug, taskMode: "PLAN" },
    attributionStatus: "TRUSTED"
  });

  const traceContext = buildTraceContext({
    traceId: trace.traceId,
    sourceType: "PLANNER_DRAFT",
    sourceId: session.id,
    operation: "planner_draft_generation",
    purpose: "Planner agent draft work order generation",
    triggerType: "SYSTEM_ACTION",
    attributionStatus: "TRUSTED"
  });

  let generated: Awaited<ReturnType<typeof generateWithFallback>>;
  try {
    generated = await generateWithFallback(
      providerCalls,
      {
        command: "Review the council session and Kingdom context below. Generate 0-3 draft work orders as a JSON array. Return only the JSON array.",
        mode: "PLAN",
        agentName: plannerAgent.name,
        agentRole: plannerAgent.title,
        agentSkills: plannerAgent.skills,
        systemPrompt: plannerAgent.systemPrompt ?? plannerAgent.prompt ?? "",
        responseStyle: plannerAgent.responseStyle ?? "",
        temperature: plannerAgent.temperature ?? undefined,
        maxTokens: plannerAgent.maxTokens ?? defaultMaxTokens,
        modelParameters: effectiveParams,
        previousCouncilContext: planningContext
      },
      traceContext
    );
  } catch (error) {
    await failAIUsageTrace(trace.traceId, error).catch(() => undefined);
    throw error;
  }

  const cost = await calculateCostUSDFromRegistry(generated.providerId ?? generated.providerName, generated.modelUsed, generated.usage);

  await prisma.usageRecord.create({
    data: {
      traceId: trace.traceId,
      attributionStatus: "TRUSTED",
      taskId: task.id,
      councilSessionId: session.id,
      agentId: plannerAgent.id,
      provider: generated.providerName,
      providerId: generated.providerId ?? generated.providerName,
      model: generated.modelUsed,
      promptTokens: generated.usage.promptTokens,
      completionTokens: generated.usage.completionTokens,
      totalTokens: generated.usage.totalTokens,
      inputCacheHitTokens: generated.usage.inputCacheHitTokens ?? null,
      inputCacheMissTokens: generated.usage.inputCacheMissTokens ?? null,
      estimatedCostUSD: cost.costUSD,
      estimatedCostLocal: cost.costUSD,
      currency: "USD",
      pricingSource: cost.source,
      pricingStatus: cost.pricingStatus,
      pricingNotes: cost.pricingNotes ?? null,
      ...buildUsageAttribution({
        projectId: task.projectId,
        purpose: "Planner agent draft work order generation",
        sourceType: "PLANNER_DRAFT",
        sourceId: session.id,
        operation: "planner_draft_generation",
        requestLabel: `Planner drafts for council session ${session.id}`,
        prompt: planningContext,
        response: generated.response,
        metadata: { agentSlug: plannerAgent.slug, taskMode: "PLAN" }
      })
    }
  }).catch(() => undefined);

  await completeAIUsageTrace(trace.traceId, generated.response, {
    attributionStatus: "TRUSTED",
    tokensUsed: generated.usage.totalTokens,
    estimatedCostUSD: cost.costUSD,
    pricingStatus: cost.pricingStatus,
    fallbackNotice: generated.fallbackNotice ?? null
  }).catch(() => undefined);

  return generated.response;
}

export function parsePlannerResponse(response: string): PlannerDraft[] {
  const cleaned = response.trim();

  // Try direct parse first
  try {
    const parsed = JSON.parse(cleaned);
    return validateDrafts(parsed);
  } catch {
    // Try extracting JSON array from the response (LLM may wrap in prose)
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        return validateDrafts(parsed);
      } catch {
        // Fall through
      }
    }
  }

  return [];
}

function validateDrafts(parsed: unknown): PlannerDraft[] {
  if (!Array.isArray(parsed)) return [];

  const drafts: PlannerDraft[] = [];
  for (const item of parsed.slice(0, 3)) {
    if (typeof item !== "object" || item === null) continue;
    const obj = item as Record<string, unknown>;
    const title = typeof obj.title === "string" ? obj.title.trim().slice(0, 180) : "";
    const objective = typeof obj.objective === "string" ? obj.objective.trim().slice(0, 5000) : "";
    const rationale = typeof obj.rationale === "string" ? obj.rationale.trim().slice(0, 1000) : "";
    if (!title || !objective) continue;
    drafts.push({ title, objective, rationale });
  }

  return drafts;
}

export async function createDraftWorkOrders(
  drafts: PlannerDraft[],
  session: SessionInput,
  task: TaskInput,
  userId: string
): Promise<PlannerResult> {
  let drafted = 0;
  let skipped = 0;

  for (const draft of drafts) {
    // Cross-session dedup: skip if open work order with same normalized title exists
    const isDuplicate = await hasDuplicateWorkOrder(draft.title, task.projectId);
    if (isDuplicate) {
      skipped++;
      continue;
    }

    const context = [
      `[PLANNER RATIONALE]\n${draft.rationale || "No rationale provided."}`,
      `[ORIGINATING COUNCIL SESSION]\nSession ID: ${session.id}`,
      `[TASK]\n${task.title}: ${task.command.slice(0, 300)}`
    ].join("\n\n");

    const created = await prisma.workOrder.create({
      data: {
        title: draft.title,
        objective: draft.objective,
        context,
        instructions: "Implement the work described in the objective. Keep changes scoped, validate them, and report results in the required format.",
        constraints: [
          "AI Kingdom remains the source of truth.",
          "External agents are executors, not decision owners.",
          "Keep changes scoped to the work order.",
          "Do not expose secrets or store raw secret material.",
          "Do not run backend-initiated shell commands or call external agent APIs."
        ].join("\n"),
        acceptanceCriteria: [
          "Requested behavior is implemented.",
          "Existing Kingdom architecture and conventions are preserved.",
          "No API keys, tokens, passwords, or secrets are exposed.",
          "Validation commands are run or clearly reported as not run."
        ],
        validationCommands: ["npm run typecheck", "npm run test", "npm run build"],
        projectId: task.projectId,
        sourceType: "COUNCIL_SESSION",
        sourceId: session.id,
        status: "DRAFT",
        priority: "MEDIUM",
        createdByUserId: userId,
        createdBySystem: true,
        dataQuality: "REVIEW_REQUIRED",
        workQuality: "ACTIONABLE"
      }
    });
    // Auto-assign an internal agent; failure never blocks draft creation
    await assignWorkOrderAgent(created.id).catch((err) => {
      console.warn(`[PlannerAgent] Auto-assignment failed for work order ${created.id}:`, err instanceof Error ? err.message : String(err));
    });
    drafted++;
  }

  return { drafted, skipped, sessionId: session.id };
}

async function hasDuplicateWorkOrder(title: string, projectId: string | null): Promise<boolean> {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const titleNorm = norm(title);

  const excludedStatuses: WorkOrderStatus[] = ["ARCHIVED", "CANCELLED", "FAILED"];
  const where = projectId
    ? { projectId, status: { notIn: excludedStatuses } }
    : { status: { notIn: excludedStatuses } };

  const existing = await prisma.workOrder.findMany({
    where,
    select: { title: true }
  });

  return existing.some((wo) => norm(wo.title) === titleNorm);
}

function buildProviderCalls(primary: AIProviderConfig, primaryModel: string, fallbackProviders: AIProviderConfig[]) {
  const configs = [primary, ...fallbackProviders];
  return configs
    .map((provider, index) => {
      try {
        return {
          provider: createAIProviderFromConfig(provider),
          model: index === 0 ? primaryModel : provider.defaultModel
        };
      } catch {
        return null;
      }
    })
    .filter((call): call is NonNullable<typeof call> => Boolean(call));
}
