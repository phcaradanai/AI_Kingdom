import { type Prisma, type TaskMode, type WorkOrder, type WorkOrderStatus } from "@prisma/client";
import { generateWithFallback } from "../ai/generateWithFallback.js";
import { buildAIProviderCallsFromRoute } from "../ai/providerCallPlanner.js";
import { resolveEffectiveParameters } from "../ai/modelParameterResolver.js";
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
import { getBooleanSetting, getNumberSetting, getSettingValue } from "./settingsService.js";
import { assessDecreeComplexity, escalationFor } from "./complexityAssessor.js";
import { maybeGrowAgentMaxTokens } from "./maxTokensAutoGrowService.js";
import { assignWorkOrderAgent } from "./workOrderAssignmentService.js";
import { maybeAutoExecuteBuildWorkOrder } from "./buildDecreeAutoExecutionService.js";
import { createWorkOrder } from "./externalAgentWorkOrderService.js";
import { getWorkOrderRecommendations } from "./externalAgentRecommendationService.js";
import { auditLog } from "./auditService.js";
import { buildNextActionUpdate, computeCouncilNextExecutableAction } from "./kingdomNextActionEngine.js";
import { buildCrossTaskLessons } from "./crossTaskLearningService.js";
import { buildAgentKnowledgeContext } from "./agentKnowledgeService.js";

export type PlannerRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface PlannerDraft {
  title: string;
  objective: string;
  rationale: string;
  // M23 (Decree → Execution): BUILD councils emit an execution risk level and the
  // files they expect to touch. These feed the downstream risk policy
  // (isAutoPatchEligible) so a LOW-risk, fresh-context BUILD work order can be
  // auto-executed as a sandbox patch, while anything higher pauses for King approval.
  riskLevel?: PlannerRiskLevel;
  fileHints?: string[];
  // M24 Phase A: concrete, decree-specific acceptance criteria the council derived
  // for THIS work — replaces the generic boilerplate so the external-agent prompt and
  // the reviewer have real, checkable criteria. Optional/tolerant; absent ⇒ boilerplate.
  acceptanceCriteria?: string[];
}

const PLANNER_RISK_LEVELS: readonly PlannerRiskLevel[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

export interface PlannerResult {
  drafted: number;
  skipped: number;
  sessionId: string;
  draftedWorkOrderIds: string[];
  createdWorkOrder: WorkOrder | null;
  skipReason?: string;
  traceId?: string;
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
  const mode = await getSettingValue("COUNCIL_AUTO_WORK_ORDER_MODE", "OFF");
  if (mode === "OFF") {
    return { drafted: 0, skipped: 0, sessionId: session.id, draftedWorkOrderIds: [], createdWorkOrder: null, skipReason: "COUNCIL_AUTO_WORK_ORDER_MODE is OFF" };
  }
  const targetStatus: "DRAFT" | "READY" = mode === "READY" ? "READY" : "DRAFT";

  try {
    return await executePlanner(session, task, userId, targetStatus, true, "SYSTEM_ACTION: grandVizierOrchestrator (auto-planner)");
  } catch (error) {
    console.warn("[PlannerAgent] Failed to run planner agent:", error instanceof Error ? error.message : String(error));
    return { drafted: 0, skipped: 0, sessionId: session.id, draftedWorkOrderIds: [], createdWorkOrder: null, skipReason: error instanceof Error ? error.message : "Planner agent failed" };
  }
}

export async function planFromSession(
  sessionId: string,
  userId: string,
  triggerRoute = "POST /api/council/:sessionId/plan-work-orders"
): Promise<PlannerResult> {
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
  const plannerMode = await getSettingValue("COUNCIL_AUTO_WORK_ORDER_MODE", "OFF");
  if (plannerMode !== "READY") {
    const error = new Error("This council recommendation does not generate executable work orders.");
    error.name = "PlannerModeDisabledError";
    throw error;
  }

  return executePlanner(session, session.task, userId, "READY", true, triggerRoute);
}

async function executePlanner(
  session: SessionInput,
  task: TaskInput,
  userId: string,
  targetStatus: "DRAFT" | "READY" = "DRAFT",
  explicitUserAction = true,
  triggerRoute = "POST /api/council/:sessionId/plan-work-orders"
): Promise<PlannerResult> {
  const traceId = `council-work-order:${session.id}:${Date.now()}`;
  traceCouncilWorkOrderStep(traceId, "API Request", { triggerRoute, sessionId: session.id, taskId: task.id, userId, targetStatus });
  const plannerAgent = await prisma.agent.findUnique({ where: { slug: "planner" } });
  if (!plannerAgent) {
    console.warn("[PlannerAgent] No 'planner' agent found in database. Run npm run db:seed to create it.");
    return { drafted: 0, skipped: 0, sessionId: session.id, draftedWorkOrderIds: [], createdWorkOrder: null, skipReason: "Planner agent is not seeded.", traceId };
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

  // Cross-task learning (opt-in): inject outcome lessons from similar past work so the
  // planner reuses what worked and avoids repeating past failures. Default OFF — relevance-
  // and outcome-gated, deterministic, no extra provider call.
  const crossTaskLearningEnabled = await getBooleanSetting("PLANNER_CROSS_TASK_LEARNING", false);
  const crossTaskLessons = crossTaskLearningEnabled
    ? await buildCrossTaskLessons({
        decreeText: `${task.title}\n${task.command}\n${session.finalSummary ?? ""}`,
        projectId: task.projectId
      }).catch((err) => {
        console.warn("[PlannerAgent] cross-task lessons failed (continuing without):", err instanceof Error ? err.message : String(err));
        return "";
      })
    : "";

  // Curated knowledge (M16, opt-in): inject the planner agent's APPROVED knowledge memories
  // so planning uses the lessons the King vetted — same loop now closed for the council.
  const knowledgeInContext = await getBooleanSetting("AGENT_KNOWLEDGE_IN_CONTEXT", true);
  const agentKnowledge = knowledgeInContext
    ? await buildAgentKnowledgeContext(plannerAgent.id, task.projectId, task.id)
        .then((r) => r.context)
        .catch((err) => {
          console.warn("[PlannerAgent] knowledge context failed (continuing without):", err instanceof Error ? err.message : String(err));
          return "";
        })
    : "";

  const planningContext = buildPlanningContext({
    session,
    task,
    projectContext,
    snapshot,
    openWorkOrders,
    implReports,
    handoffBriefs,
    artifacts,
    crossTaskLessons,
    agentKnowledge
  });

  const rawResponse = await callPlannerLLM({
    plannerAgent,
    planningContext,
    session,
    task,
    userId,
    defaultMaxTokens,
    triggerRoute
  });

  const drafts = parsePlannerResponse(rawResponse);
  if (drafts.length === 0) {
    traceCouncilWorkOrderStep(traceId, "API Response", { sessionId: session.id, drafted: 0, skipped: 0, reason: "Planner produced no valid drafts." });
    return { drafted: 0, skipped: 0, sessionId: session.id, draftedWorkOrderIds: [], createdWorkOrder: null, skipReason: "Planner produced no valid drafts.", traceId };
  }

  const result = await createDraftWorkOrders(
    drafts,
    session,
    task,
    userId,
    targetStatus,
    explicitUserAction,
    traceId,
    triggerRoute.includes("/:sessionId/work-order")
  );
  traceCouncilWorkOrderStep(traceId, "API Response", {
    sessionId: session.id,
    drafted: result.drafted,
    skipped: result.skipped,
    draftedWorkOrderIds: result.draftedWorkOrderIds,
    createdWorkOrderId: result.createdWorkOrder?.id ?? null,
    skipReason: result.skipReason ?? null
  });
  return { ...result, traceId };
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
  crossTaskLessons?: string;
  agentKnowledge?: string;
}): string {
  const { session, task, projectContext, snapshot, openWorkOrders, implReports, handoffBriefs, artifacts, crossTaskLessons, agentKnowledge } = opts;

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

  // Curated knowledge (opt-in): the King-approved lessons for the planner agent.
  if (agentKnowledge && agentKnowledge.trim()) {
    sections.push(`[APPROVED KNOWLEDGE]\n${agentKnowledge}`);
  }

  // Cross-task learning: outcome lessons from similar past work (opt-in). Placed last so it
  // is the freshest guidance the planner reads before producing drafts.
  if (crossTaskLessons && crossTaskLessons.trim()) {
    sections.push(crossTaskLessons);
  }

  return sections.join("\n\n");
}

async function callPlannerLLM(opts: {
  plannerAgent: { id: string; slug: string; name: string; title: string; skills: string[]; systemPrompt: string | null; prompt: string | null; responseStyle: string | null; temperature: number | null; maxTokens: number | null; modelParameters: unknown };
  planningContext: string;
  session: SessionInput;
  task: TaskInput;
  userId: string;
  defaultMaxTokens: number;
  triggerRoute: string;
}): Promise<string> {
  const { plannerAgent, planningContext, session, task, userId, defaultMaxTokens, triggerRoute } = opts;

  const route = await selectAIProviderRoute({
    agent: plannerAgent as Parameters<typeof selectAIProviderRoute>[0]["agent"],
    taskMode: "PLAN",
    requiredCapabilities: { chat: true }
  });
  // Adaptive reasoning: a complex BUILD decree deserves a deeper plan. Assess the
  // decree text + mode; when complex and the kill-switch is on, the planner thinks
  // harder. No-op on providers that don't support reasoning (e.g. sandbox fallback).
  const adaptiveReasoning = await getBooleanSetting("ADAPTIVE_REASONING_ENABLED", true);
  const complexity = assessDecreeComplexity({ text: task.command, mode: task.mode });
  const escalation = adaptiveReasoning ? escalationFor(complexity.level) : undefined;
  const effectiveParams = resolveEffectiveParameters(
    plannerAgent as Parameters<typeof resolveEffectiveParameters>[0],
    route.provider.type,
    defaultMaxTokens,
    escalation
  );
  // plannerAgent uses a narrowed select without routing fields; the route already encodes
  // the full ordered attempts (primary + fallbacks + sandbox), so no agent override is needed.
  const providerCalls = buildAIProviderCallsFromRoute(route);

  const actorRole = (task.user?.role as string | undefined) ?? "KING";
  const trace = await createAIUsageTrace({
    actorUserId: userId,
    actorRole,
    triggerType: "SYSTEM_ACTION",
    triggerRoute,
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
    metadata: {
      agentSlug: plannerAgent.slug,
      taskMode: "PLAN",
      complexityLevel: complexity.level,
      complexitySignals: complexity.signals,
      reasoningEscalated: !!escalation?.reasoning,
      reasoningEnabled: effectiveParams.reasoning?.enabled ?? false,
      reasoningEffort: effectiveParams.reasoning?.effort ?? null
    },
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
        command: task.mode === "BUILD"
          ? "Review the BUILD council session and Kingdom context below. Generate 0-3 execution-ready draft work orders as a JSON array. Each object must include: title, objective, rationale, riskLevel (one of LOW/MEDIUM/HIGH/CRITICAL based on the council's Execution Decision), fileHints (array of repo-relative file paths the work expects to touch), and acceptanceCriteria (array of 2-5 concrete, verifiable conditions specific to THIS decree that prove the work is done correctly — e.g. exact behavior, the file/function changed, the test that must pass; avoid generic boilerplate like 'no secrets exposed'). Use LOW only for small, well-scoped, low-blast-radius changes. Return only the JSON array."
          : "Review the council session and Kingdom context below. Generate 0-3 draft work orders as a JSON array. Return only the JSON array.",
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

  // Self-growing budget: if a real provider truncated the plan, grow the planner's
  // stored max_tokens so the next run has room (content budget = effectiveParams.max_tokens).
  await maybeGrowAgentMaxTokens({
    agentId: plannerAgent.id,
    agentSlug: plannerAgent.slug,
    contentBudgetUsed: effectiveParams.max_tokens,
    finishReason: generated.finishReason,
    providerType: generated.finalProviderType,
    model: generated.modelUsed,
    userId
  }).catch(() => undefined);

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

    // M23: optional BUILD execution metadata. Tolerant — absent/invalid fields are dropped,
    // never throwing, so non-BUILD planner output is unaffected.
    const riskRaw = typeof obj.riskLevel === "string" ? obj.riskLevel.trim().toUpperCase() : "";
    const riskLevel = (PLANNER_RISK_LEVELS as readonly string[]).includes(riskRaw)
      ? (riskRaw as PlannerRiskLevel)
      : undefined;
    const fileHints = Array.isArray(obj.fileHints)
      ? obj.fileHints
          .filter((h): h is string => typeof h === "string" && h.trim().length > 0)
          .map((h) => h.trim().slice(0, 200))
          .slice(0, 20)
      : undefined;
    const acceptanceCriteria = Array.isArray(obj.acceptanceCriteria)
      ? obj.acceptanceCriteria
          .filter((c): c is string => typeof c === "string" && c.trim().length > 0)
          .map((c) => c.trim().slice(0, 500))
          .slice(0, 10)
      : undefined;

    drafts.push({
      title,
      objective,
      rationale,
      ...(riskLevel ? { riskLevel } : {}),
      ...(fileHints && fileHints.length > 0 ? { fileHints } : {}),
      ...(acceptanceCriteria && acceptanceCriteria.length > 0 ? { acceptanceCriteria } : {})
    });
  }

  return drafts;
}

export async function createDraftWorkOrders(
  drafts: PlannerDraft[],
  session: SessionInput,
  task: TaskInput,
  userId: string,
  targetStatus: "DRAFT" | "READY" = "DRAFT",
  explicitUserAction = true,
  traceId = `council-work-order:${session.id}:${Date.now()}`,
  limitToOne = false
): Promise<PlannerResult> {
  let drafted = 0;
  let skipped = 0;
  const draftedWorkOrderIds: string[] = [];
  let createdWorkOrder: WorkOrder | null = null;
  let skipReason: string | undefined;

  for (const draft of drafts) {
    // Cross-session dedup: skip if open work order with same normalized title exists
    const isDuplicate = await hasDuplicateWorkOrder(draft.title, task.projectId);
    if (isDuplicate) {
      skipped++;
      skipReason = "A matching open work order already exists.";
      traceCouncilWorkOrderStep(traceId, "DB Insert", { sessionId: session.id, title: draft.title, status: "SKIPPED_DUPLICATE" });
      continue;
    }

    const context = [
      `[PLANNER RATIONALE]\n${draft.rationale || "No rationale provided."}`,
      `[ORIGINATING COUNCIL SESSION]\nSession ID: ${session.id}`,
      `[TASK]\n${task.title}: ${task.command.slice(0, 300)}`
    ].join("\n\n");

    const result = await createWorkOrder({
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
      // M24 Phase A: prefer the council's decree-specific criteria; fall back to the
      // generic baseline only when the planner did not emit any (e.g. advisory modes).
      acceptanceCriteria: draft.acceptanceCriteria && draft.acceptanceCriteria.length > 0
        ? draft.acceptanceCriteria
        : [
            "Requested behavior is implemented.",
            "Existing Kingdom architecture and conventions are preserved.",
            "No API keys, tokens, passwords, or secrets are exposed.",
            "Validation commands are run or clearly reported as not run."
          ],
      validationCommands: [
        "npm run typecheck",
        "npm run test --workspace @ai-kingdom/api",
        "npm run test --workspace @ai-kingdom/runner",
        "npm run test --workspace @ai-kingdom/web",
        "npm run build"
      ],
      projectId: task.projectId,
      sourceType: "COUNCIL_SESSION",
      sourceId: session.id,
      status: targetStatus,
      priority: "MEDIUM",
      createdByUserId: userId,
      provenance: buildCouncilWorkOrderProvenance(session, task, draft)
    }, explicitUserAction);

    if (result.status === "CREATED" && result.workOrder) {
      draftedWorkOrderIds.push(result.workOrder.id);
      traceCouncilWorkOrderStep(traceId, "DB Insert", { sessionId: session.id, workOrderId: result.workOrder.id, status: result.workOrder.status });
      // Auto-assign an internal agent; failure never blocks draft creation
      await assignWorkOrderAgent(result.workOrder.id).catch((err) => {
        console.warn(`[PlannerAgent] Auto-assignment failed for work order ${result.workOrder!.id}:`, err instanceof Error ? err.message : String(err));
      });
      createdWorkOrder = await applyExecutableRoutes(result.workOrder.id, session, task, draft, userId).catch((err) => {
        console.warn(`[PlannerAgent] Route generation failed for work order ${result.workOrder!.id}:`, err instanceof Error ? err.message : String(err));
        return result.workOrder!;
      });
      const queried = await prisma.workOrder.findUnique({ where: { id: result.workOrder.id } });
      traceCouncilWorkOrderStep(traceId, "WorkOrder Query Result", {
        sessionId: session.id,
        workOrderId: result.workOrder.id,
        found: Boolean(queried),
        status: queried?.status ?? null,
        projectId: queried?.projectId ?? null
      });
      const decision = await computeCouncilNextExecutableAction({
        sessionId: session.id,
        sessionStatus: "COMPLETED",
        finalSummary: session.finalSummary,
        taskMode: task.mode,
        projectId: task.projectId,
        createdWorkOrderId: result.workOrder.id
      });
      await prisma.councilSession.update({
        where: { id: session.id },
        data: {
          ...buildNextActionUpdate(decision),
          createdWorkOrderId: result.workOrder.id,
          createdWorkOrderAt: new Date(),
          createdWorkOrderBy: userId
        }
      });
      await auditLog({
        userId,
        action: "create_work_order_from_council",
        resourceType: "work_order",
        resourceId: result.workOrder.id,
        metadata: {
          councilSessionId: session.id,
          taskId: task.id,
          projectId: task.projectId,
          createdWorkOrderId: result.workOrder.id,
          createdAt: new Date().toISOString(),
          creator: userId,
          traceId
        }
      }).catch(() => undefined);
      drafted++;

      // M23 C-2: for a LOW-risk BUILD work order with fresh context, auto-dispatch to
      // the external-agent (Claude Code) bridge so the King's decree runs end-to-end.
      // Gated + guardrailed inside the service; never throws, only traces its outcome.
      const autoExec = await maybeAutoExecuteBuildWorkOrder({
        workOrderId: result.workOrder.id,
        taskMode: task.mode,
        riskLevel: draft.riskLevel,
        fileHints: draft.fileHints,
        projectId: task.projectId,
        userId
      });
      traceCouncilWorkOrderStep(traceId, "Auto Execute", {
        sessionId: session.id,
        workOrderId: result.workOrder.id,
        executed: autoExec.executed,
        jobId: autoExec.jobId ?? null,
        skipReason: autoExec.skipReason ?? null
      });

      if (limitToOne) break;
    } else {
      skipped++;
      skipReason = result.reason ?? `Work order creation returned ${result.status}.`;
      traceCouncilWorkOrderStep(traceId, "DB Insert", { sessionId: session.id, title: draft.title, status: result.status, reason: result.reason ?? null });
    }
  }

  return { drafted, skipped, sessionId: session.id, draftedWorkOrderIds, createdWorkOrder, skipReason };
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

function buildCouncilWorkOrderProvenance(session: SessionInput, task: TaskInput, draft: PlannerDraft): Prisma.InputJsonObject {
  return {
    source: "COUNCIL_SESSION",
    councilSessionId: session.id,
    taskId: task.id,
    projectId: task.projectId,
    executionPlan: [
      "Confirm the work order scope and context binding.",
      "Implement the objective in the linked project.",
      "Run the listed validation commands.",
      "Submit an implementation report for King review."
    ],
    externalAgentAssignment: {
      status: "PENDING_RECOMMENDATION",
      reason: "Generated during council work-order creation."
    },
    reviewRoute: {
      reviewer: "KING",
      requiredState: "NEEDS_REVIEW",
      instructions: "King reviews implementation report, validation output, and patch artifacts before completion."
    },
    knowledgeCaptureRoute: {
      source: "IMPLEMENTATION_REPORT",
      categories: ["ARCHITECTURE_DECISION", "BUG_LEARNING", "WORKFLOW_RULE"],
      requiresReview: true
    },
    plannerRationale: draft.rationale,
    taskMode: task.mode,
    // M23: execution metadata carried for the downstream risk policy. Present only when
    // the (BUILD) planner emitted it; absent for advisory modes.
    ...(draft.riskLevel || (draft.fileHints && draft.fileHints.length > 0)
      ? {
          executionMetadata: {
            ...(draft.riskLevel ? { riskLevel: draft.riskLevel } : {}),
            ...(draft.fileHints && draft.fileHints.length > 0 ? { fileHints: draft.fileHints } : {})
          }
        }
      : {})
  };
}

async function applyExecutableRoutes(workOrderId: string, session: SessionInput, task: TaskInput, draft: PlannerDraft, userId: string): Promise<WorkOrder> {
  const recommendations = await getWorkOrderRecommendations(workOrderId).catch(() => []);
  const recommendation = recommendations[0] ?? null;
  const existing = await prisma.workOrder.findUniqueOrThrow({ where: { id: workOrderId } });
  const baseProvenance = (typeof existing.provenance === "object" && existing.provenance !== null && !Array.isArray(existing.provenance))
    ? existing.provenance as Prisma.JsonObject
    : {};

  const updated = await prisma.workOrder.update({
    where: { id: workOrderId },
    data: {
      assignedExternalAgentId: recommendation?.externalAgentId ?? existing.assignedExternalAgentId,
      provenance: {
        ...baseProvenance,
        ...buildCouncilWorkOrderProvenance(session, task, draft),
        externalAgentAssignment: recommendation
          ? {
              status: "RECOMMENDED",
              externalAgentId: recommendation.externalAgentId,
              name: recommendation.name,
              type: recommendation.type,
              confidence: recommendation.confidence,
              score: recommendation.score,
              reasons: recommendation.reasons,
              risks: recommendation.risks
            }
          : {
              status: "UNASSIGNED",
              reason: "No active external agent recommendation was available."
            },
        generatedAt: new Date().toISOString(),
        generatedBy: userId
      } satisfies Prisma.InputJsonObject
    }
  });

  return updated;
}

function traceCouncilWorkOrderStep(traceId: string, step: string, details: Record<string, unknown>) {
  console.info(`[CouncilWorkOrderTrace] ${step}`, { traceId, ...details });
}
