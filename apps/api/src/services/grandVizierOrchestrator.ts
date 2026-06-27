import type { Agent, AgentResponse, CouncilSession, Task, TaskMode } from "@prisma/client";
import { generateWithFallback } from "../ai/generateWithFallback.js";
import { buildAIProviderCallsFromRoute } from "../ai/providerCallPlanner.js";
import { resolveEffectiveParameters } from "../ai/modelParameterResolver.js";
import { prisma } from "../db/prisma.js";
import { calculateCostUSDFromRegistry } from "./modelPricingService.js";
import { selectAIProviderRoute } from "./aiProviderRouter.js";
import { getKingdomContext } from "./kingdomComplianceService.js";
import { autoSaveMemories, findRelevantMemories, formatMemoryContext } from "./memoryService.js";
import { buildProjectContext } from "./projectContextService.js";
import { generateRoyalReport } from "./reportService.js";
import { getBooleanSetting, getNumberSetting } from "./settingsService.js";
import { assessDecreeComplexity, escalationFor } from "./complexityAssessor.js";
import { buildDecreeFrameSection, extractDecreeFrame } from "./decreeFrameService.js";
import { maybeGrowAgentMaxTokens } from "./maxTokensAutoGrowService.js";
import { runPlannerAgent } from "./plannerAgentService.js";
import { buildCrossTaskLessons } from "./crossTaskLearningService.js";
import { refreshCouncilNextExecutableAction } from "./kingdomNextActionEngine.js";
import { buildUsageAttribution, redactSecrets } from "./usageAttributionService.js";
import { completeAgentActivity, failAgentActivity, startAgentActivity, updateAgentActivity } from "./agentActivityService.js";
import { buildAgentKnowledgeContext, proposeKnowledgeCandidate } from "./agentKnowledgeService.js";
import { scoreCouncilSynthesis, QUALITY_GATE_THRESHOLD } from "./councilQualityScorer.js";
import {
  addTraceStep,
  attachUsageRecordStep,
  buildTraceContext,
  completeAIUsageTrace,
  completeTraceStep,
  createAIUsageTrace,
  failAIUsageTrace,
  failTraceStep,
  startTraceStep,
  updateTraceSource
} from "./aiUsageTraceService.js";

const AGENTS_BY_MODE: Record<TaskMode, string[]> = {
  ASK: ["royal-archivist", "royal-researcher", "royal-architect", "royal-general", "grand-vizier"],
  PLAN: ["royal-archivist", "royal-researcher", "royal-architect", "royal-general", "grand-vizier"],
  RESEARCH: ["royal-archivist", "royal-researcher", "royal-architect", "royal-general", "grand-vizier"],
  BUILD: ["royal-archivist", "royal-researcher", "royal-architect", "royal-general", "grand-vizier"]
};

// RESEARCH / fallback — investigation and root-cause framing; appropriate when the King is
// diagnosing a failure, tracing a bug, or doing deep technical analysis.
const ROLE_RESPONSE_CONTRACTS: Record<string, string> = {
  "royal-archivist": [
    "Return a section titled 'Archivist Evidence Report'.",
    "Include: evidence summary; cited logs/artifacts/context; exact failing item or observed event; candidate lesson/memory.",
    "Use only provided Project Context, Kingdom Memory Context, and prior council context. Do not expose secrets or raw local root paths."
  ].join("\n"),
  "royal-researcher": [
    "Return a section titled 'Researcher Hypotheses'.",
    "State your TOP hypothesis with a confidence level (HIGH/MEDIUM/LOW) and the specific evidence that supports it. List at most 2 alternatives.",
    "If evidence is insufficient to identify a primary hypothesis, write 'INCONCLUSIVE: [exact information needed to diagnose]' — do not guess.",
    "Clearly separate confirmed evidence from assumptions. Do not restate facts the Archivist already surfaced."
  ].join("\n"),
  "royal-architect": [
    "Return a section titled 'Architect Patch Plan'.",
    "Name exact file paths (relative to project root) for each change. Do not say 'update the relevant files' — commit to specific paths or write 'PATH UNKNOWN: [what needs inspection first]'.",
    "Include: the specific code change at function/block level; risk level (LOW/MEDIUM/HIGH/CRITICAL); validation commands; rollback step.",
    "Do not create a patch. Do not suggest merge, deploy, push, or PR automation."
  ].join("\n"),
  "royal-general": [
    "Return a section titled 'General Execution Checklist'.",
    "Include: execution checklist; external-agent handoff checklist; acceptance criteria; do-not-cross constraints.",
    "Keep handoff manual-review only. Do not create runner jobs or automation."
  ].join("\n"),
  "grand-vizier": [
    "Return a section titled 'Grand Vizier Final Decision'.",
    "Synthesize the council into ONE verdict: name the most likely root cause (citing the Researcher's top hypothesis), the exact fix (citing the Architect's plan), and the single next action.",
    "If specialists conflict, pick a side and state why in one sentence. If the council cannot diagnose without more data, write 'BLOCKED: [what is missing]' — do not guess.",
    "Reference the Archivist, Researcher, Architect, and General outputs by role. Do not add unsupported facts. Do not summarize all views — make a judgment call.",
    "End your response with: 'My recommendation: [one specific action sentence].'"
  ].join("\n")
};

// ASK mode — advisory / counseling framing for open questions where the King wants
// recommendations, not investigation of a failure.
const ASK_ROLE_CONTRACTS: Record<string, string> = {
  "royal-archivist": [
    "Return a section titled 'Archivist Context Briefing'.",
    "Surface relevant Kingdom memories, prior decisions, documented patterns, and constraints that bear on this question. Frame this as briefing material for a decision — not as evidence for a failure.",
    "Use only provided Project Context, Kingdom Memory Context, and prior council context. Do not expose secrets or raw local root paths."
  ].join("\n"),
  "royal-researcher": [
    "Return a section titled 'Researcher Options Analysis'.",
    "Analyze the question from multiple angles: what approaches exist, their key tradeoffs, and what comparable situations suggest. Separate confirmed facts from inferences. Present options — do not pick one.",
    "Clearly identify what is known, what is uncertain, and what the King would need to resolve before deciding."
  ].join("\n"),
  "royal-architect": [
    "Return a section titled 'Architect Technical Assessment'.",
    "Provide a technical perspective on the question: what the system currently supports, what the options would require, and where technical risk or complexity lies. Do not propose a patch plan — assess feasibility and implications.",
    "Flag cross-cutting concerns (auth, RBAC, type safety, DB, API stability) that constrain the options."
  ].join("\n"),
  "royal-general": [
    "Return a section titled 'General Practical Counsel'.",
    "Address operational, resourcing, and risk considerations: what decisions need to be made, who would be affected, what constraints apply, and what the practical path forward looks like for each option.",
    "Provide judgment, not an execution checklist. Keep it advisory — no runner jobs or automation."
  ].join("\n"),
  "grand-vizier": [
    "Return a section titled 'Grand Vizier Counsel'.",
    "Give ONE preferred answer with the key tradeoff and the single concern the King should weigh. Do not present a menu of options.",
    "If you write 'it depends', you must name the specific decision variable and give a concrete recommendation for each branch (maximum 2). 'It depends' without a resolution is not a verdict.",
    "Reference the Archivist, Researcher, Architect, and General outputs by role. Do not add unsupported facts.",
    "End your response with: 'My recommendation: [one specific action sentence].'"
  ].join("\n")
};

// PLAN mode — strategic planning and roadmap framing for decrees that ask the
// Kingdom to design an approach, not diagnose a problem.
const PLAN_ROLE_CONTRACTS: Record<string, string> = {
  "royal-archivist": [
    "Return a section titled 'Archivist Planning Context'.",
    "Map the existing landscape this plan will operate in: relevant codebase areas, existing patterns and conventions, current capabilities, historical attempts at similar efforts, and documented constraints. Arm the Architect with what already exists.",
    "Use only provided Project Context, Kingdom Memory Context, and prior council context. Do not expose secrets or raw local root paths."
  ].join("\n"),
  "royal-researcher": [
    "Return a section titled 'Researcher Requirements Analysis'.",
    "Decompose the objective into requirements: what must be achieved, what dependencies exist, what success looks like, and what assumptions are embedded in the decree. Separate musts from nice-to-haves. Surface unknowns that the plan must resolve.",
    "Clearly identify what is confirmed vs inferred."
  ].join("\n"),
  "royal-architect": [
    "Return a section titled 'Architect Technical Roadmap'.",
    "Design the technical approach: sequencing, key architectural decisions, what to build vs reuse, migration or schema considerations, and how components fit together. Include a risk assessment and what validation would confirm the plan succeeded.",
    "Do not produce a file-level patch plan — produce a design-level roadmap."
  ].join("\n"),
  "royal-general": [
    "Return a section titled 'General Execution Roadmap'.",
    "Translate the Architect's plan into an actionable roadmap: phases, milestones, owners, timeline considerations, and go/no-go criteria. Identify dependencies between steps and what could block or delay the plan.",
    "Provide a planning perspective — no runner jobs or automation."
  ].join("\n"),
  "grand-vizier": [
    "Return a section titled 'Grand Vizier Strategic Recommendation'.",
    "Pick ONE recommended approach from the council's options. State the key decision the King must make to start, and the single factor that will determine success or failure.",
    "Do not present a menu of approaches — commit to the best one and state what new information would cause you to change that recommendation.",
    "Reference the Archivist, Researcher, Architect, and General outputs by role. Do not add unsupported facts.",
    "End your response with: 'My recommendation: [one specific action sentence].'"
  ].join("\n")
};

const MANUAL_ONLY_GUARDRAILS = [
  "M17F-1 guardrail: do not auto-patch.",
  "M17F-1 guardrail: do not auto-merge.",
  "M17F-1 guardrail: do not auto-deploy.",
  "M17F-1 guardrail: do not auto-create PRs.",
  "M17F-1 guardrail: do not weaken runner auth or context binding.",
  "M17F-1 guardrail: do not expose secrets.",
  "Precision: commit to specific facts, file paths, and actions. Hedging terms (may, might, consider, perhaps) are only permitted when followed by a concrete resolution. Do not speculate beyond available evidence."
].join("\n");

// M23 (Decree → Execution): in BUILD mode the council is asked to produce an
// EXECUTION-READY plan — file-level changes, acceptance criteria, and validation
// commands — that the planner can turn directly into a Work Order and the
// runner/agent-CLI can carry out. The Architect and General stop "advising about"
// the change and start specifying it. Execution still happens only through the
// downstream gated path (planner → Work Order → King-authorized SANDBOX_PATCH /
// external-agent job → runner → NEEDS_REVIEW); the council itself never creates a
// job. ASK / PLAN / RESEARCH keep the advisory contracts above.
const BUILD_ROLE_CONTRACTS: Record<string, string> = {
  "royal-archivist": [
    "Return a section titled 'Archivist Implementation Evidence'.",
    "Survey what currently exists in the codebase that the build plan will touch: relevant file paths, current interfaces/types, existing test coverage of the area, and any recent change history visible in the project context.",
    "Flag risk signals: missing tests for affected code, stale or absent local docs, conflicting conventions, migration dependencies. Do not propose the fix — the Architect will plan it; your job is to arm them with what is already there.",
    "Use only provided Project Context, Kingdom Memory, and local document context. Do not expose secrets or raw local root paths."
  ].join("\n"),
  "royal-researcher": [
    "Return a section titled 'Researcher Implementation Validation'.",
    "Validate and challenge the proposed build approach: identify existing patterns in the codebase for this type of change, surface viable alternatives, and state why the council's apparent direction is preferred (or flag if a better approach exists).",
    "Include: edge cases the Archivist's evidence reveals; cross-cutting concerns (auth, RBAC, type safety, DB migration safety, API contract stability); and any unknowns that must be resolved before the runner executes.",
    "Clearly separate confirmed facts from inferences. Do not propose the implementation plan — that belongs to the Architect."
  ].join("\n"),
  "royal-architect": [
    "Return a section titled 'Architect Execution Plan'.",
    "Specify an execution-ready plan the runner can follow: exact files to create or change (by path), the concrete edit for each (function/behavior level, not vague advice), new/changed interfaces, and migration/test files if needed.",
    "Include: ordered implementation steps; validation commands (typecheck/test/build) that must pass; acceptance criteria; rollback strategy; and a risk level (LOW/MEDIUM/HIGH/CRITICAL) with justification.",
    "Use only provided Project Context and local document context. Scope the plan to the linked project; if no project or fresh context is present, say so and mark risk HIGH."
  ].join("\n"),
  "royal-general": [
    "Return a section titled 'General Execution Handoff'.",
    "Turn the Architect Execution Plan into a runner-ready handoff: a single clear objective, the concrete change set, acceptance criteria, and the validation commands that gate completion.",
    "Include: do-not-cross constraints (no push, no merge, no deploy, no PR, patch lands in NEEDS_REVIEW); the exact files in scope; and what evidence the implementation report must contain.",
    "Keep it concrete enough to execute, but do not create runner jobs yourself — the King authorizes execution downstream."
  ].join("\n"),
  "grand-vizier": [
    "Return a section titled 'Grand Vizier Execution Decision'.",
    "Synthesize the council into ONE execution-ready decision: the single objective, the exact change set (file paths from the Architect), acceptance criteria, validation commands, and an overall risk level (LOW/MEDIUM/HIGH/CRITICAL).",
    "State plainly — safe to auto-execute (risk LOW + fresh context) or requires King approval. Pick a side; do not hedge.",
    "Reference the Archivist, Researcher, Architect, and General outputs. Do not add unsupported facts.",
    "End your response with: 'My recommendation: [safe to auto-execute | requires King review] — [one sentence why].'"
  ].join("\n")
};

const BUILD_EXECUTION_GUARDRAILS = [
  "M23 BUILD mode: you MAY produce an execution-ready plan (concrete file-level changes, acceptance criteria, validation commands).",
  "M23 guardrail: the council itself still creates no runner jobs — execution happens only through the King-authorized downstream path.",
  "M23 guardrail: any resulting patch lands in NEEDS_REVIEW. Never auto-merge, auto-deploy, push branches, or create PRs.",
  "M23 guardrail: do not weaken runner auth or context binding, and do not expose secrets or raw local root paths.",
  "Precision: commit to exact file paths, function names, and commands. Do not say 'update the relevant files' — name them. Hedging terms (may, might, consider) require a concrete follow-up."
].join("\n");

export async function processTaskWithGrandVizier(taskId: string, userId: string) {
  const task = await prisma.task.findFirst({
    where: { id: taskId, createdBy: userId },
    include: {
      sessions: true,
      user: { select: { role: true } }
    }
  });

  if (!task) {
    const error = new Error("Task not found");
    error.name = "NotFoundError";
    throw error;
  }

  if (task.status === "COMPLETED" || task.sessions.some((session) => session.status === "COMPLETED")) {
    const error = new Error("This decree has already received council counsel");
    error.name = "ConflictError";
    throw error;
  }

  const agents = await prisma.agent.findMany({
    where: {
      isActive: true,
      slug: { in: AGENTS_BY_MODE[task.mode] }
    }
  });
  const selectedAgents = orderSelectedAgents(task.mode, agents);

  // Council responses are persisted by createdAt, which is non-deterministic when the
  // specialist wave runs concurrently. Re-sort returned responses by the canonical council
  // order so display + downstream (memory, learning candidate) order is stable in both the
  // sequential and parallel modes. No-op for the sequential path (already in this order).
  const councilOrderIndex = new Map(selectedAgents.map((agent, index) => [agent.id, index]));
  const sortByCouncilOrder = <T extends { agentId: string }>(rows: T[]): T[] =>
    [...rows].sort((a, b) => (councilOrderIndex.get(a.agentId) ?? 999) - (councilOrderIndex.get(b.agentId) ?? 999));

  if (selectedAgents.length !== AGENTS_BY_MODE[task.mode].length) {
    const error = new Error("Required royal agents are not available");
    error.name = "ConflictError";
    throw error;
  }

  const session = await prisma.councilSession.create({
    data: {
      taskId: task.id,
      projectId: task.projectId,
      status: "RUNNING",
      selectedAgentIds: selectedAgents.map((agent) => agent.id)
    }
  });

  await prisma.task.update({
    where: { id: task.id },
    data: { status: "RUNNING" }
  });

  try {
    const defaultMaxTokens = await getNumberSetting("AI_MAX_TOKENS", 700);
    // Adaptive reasoning: assessed once from the decree. Applied ONLY to the Grand
    // Vizier's final synthesis (the agent responsible for the council's verdict) —
    // not blanket across all council agents, to contain cost and instability.
    const adaptiveReasoning = await getBooleanSetting("ADAPTIVE_REASONING_ENABLED", true);
    const decreeComplexity = assessDecreeComplexity({ text: task.command, mode: task.mode });
    const synthesisEscalation = adaptiveReasoning ? escalationFor(decreeComplexity.level) : undefined;
    // Decree frame: structured problem framing injected into every specialist agent's user
    // prompt so agents focus their analysis on the right problem type and answer specific
    // key questions rather than having to infer structure from unstructured prose.
    const decreeFrame = buildDecreeFrameSection(extractDecreeFrame(task.command, task.mode));
    const autoSaveMemory = await getBooleanSetting("AUTO_SAVE_MEMORY", true);
    const autoGenerateReports = await getBooleanSetting("AUTO_GENERATE_REPORTS", true);
    const kingdomContext = await getKingdomContext();
    const baseProjectContext = task.projectId
      ? await buildProjectContext(task.projectId)
      : "[PROJECT CONTEXT]\nNo project assigned. Avoid project-specific assumptions.";
    const contextWarning = await buildContextWarning(task.projectId);
    const projectContext = [contextWarning, baseProjectContext].filter(Boolean).join("\n\n");
    const relevantMemories = await findRelevantMemories(userId, task.command, 5);
    const baseMemoryContext = formatMemoryContext(relevantMemories);
    // Cross-task learning for the council: enrich the shared memory context with
    // relevance-ranked outcome lessons from similar past work (what worked / what to avoid)
    // so every specialist AND the Grand Vizier synthesis deliberate with experience, not just
    // the post-hoc planner. Deterministic, no extra provider call; default ON.
    const councilCrossTaskLearning = await getBooleanSetting("COUNCIL_CROSS_TASK_LEARNING", true);
    const crossTaskLessons = councilCrossTaskLearning
      ? await buildCrossTaskLessons({ decreeText: `${task.title}\n${task.command}`, projectId: task.projectId }).catch((err) => {
          console.warn("[Council] cross-task lessons failed (continuing without):", err instanceof Error ? err.message : String(err));
          return "";
        })
      : "";
    const kingdomMemoryContext = [baseMemoryContext, crossTaskLessons].filter((section) => section && section.trim()).join("\n\n");
    // Curated knowledge (M16): inject each agent's APPROVED knowledge memories into its own
    // prompt so the council finally USES the lessons the King approved (closing the loop where
    // knowledge was created but never consumed). Per-agent → computed inside the pass. Opt-in.
    const knowledgeInContext = await getBooleanSetting("AGENT_KNOWLEDGE_IN_CONTEXT", true);
    const fallbackNotices: string[] = [];
    const generatedResponses: Array<{ agent: Agent; response: string }> = [];
    const usedProviders: string[] = [];
    const usedModels: string[] = [];

    type CouncilPassResult = { agent: Agent; response: string; fallbackNotice: string | null; providerName: string; modelUsed: string };
    // One council-member pass (route → trace → AI call → usage/cost → activity). Extracted
    // from the loop so it can run either sequentially (round-table) or concurrently. The
    // peer transcript is a parameter, not read from generatedResponses, so the caller
    // controls what each agent sees and the ordering of results.
    const runCouncilAgentPass = async (agent: Agent, previousCouncilContext: string): Promise<CouncilPassResult> => {
      let activityId: string | null = null;
      let traceId: string | null = null;
      try {
        const route = await selectAIProviderRoute({ agent, taskMode: task.mode, requiredCapabilities: { chat: true } });
        const effectiveParams = resolveEffectiveParameters(agent, route.provider.type, defaultMaxTokens);
        const providerCalls = buildAIProviderCallsFromRoute(route, agent);

        // Emit preliminary trace for route chain health/budget/chain skips (before trace exists, buffer and emit after)
        const pendingRouteEvents: Array<{ providerId: string; reason: string; kind: "HEALTH_BLOCKED" | "BUDGET_BLOCKED" | "CHAIN_SKIPPED" | "PROVIDER_SKIPPED" }> = [];
        if (route.skippedProviderIds?.length) {
          for (const pid of route.skippedProviderIds) {
            const reason = route.skippedReasons?.[pid] ?? "Provider skipped by route intelligence";
            const kind = reason.includes("BUDGET_BLOCKED") ? "BUDGET_BLOCKED"
              : reason.includes("HEALTH_BLOCKED") ? "HEALTH_BLOCKED"
              : reason.includes("CHAIN_SKIPPED") ? "CHAIN_SKIPPED"
              : "PROVIDER_SKIPPED";
            pendingRouteEvents.push({ providerId: pid, reason, kind });
          }
        }
        if (route.budgetBlocked && route.blockedProviderIds?.length) {
          for (const pid of route.blockedProviderIds) {
            if (!pendingRouteEvents.some((e) => e.providerId === pid)) {
              pendingRouteEvents.push({ providerId: pid, reason: "BUDGET_BLOCKED: budget limit reached", kind: "BUDGET_BLOCKED" });
            }
          }
        }

        const trace = await createAIUsageTrace({
          actorUserId: userId,
          actorRole: task.user.role,
          triggerType: "USER_ACTION",
          triggerRoute: "POST /api/tasks/:id/process",
          triggerLabel: task.title,
          projectId: task.projectId,
          taskId: task.id,
          councilSessionId: session.id,
          agentId: agent.id,
          sourceType: "AGENT_RESPONSE",
          sourceId: session.id,
          operation: "council_agent_response",
          purpose: "Council agent response",
          providerId: route.provider.id,
          providerType: route.provider.type,
          providerName: route.provider.name,
          model: route.model,
          prompt: task.command,
          metadata: {
            taskMode: task.mode,
            agentSlug: agent.slug,
            modelParametersUsed: effectiveParams,
            reasoningEnabled: effectiveParams.reasoning?.enabled ?? false,
            reasoningEffort: effectiveParams.reasoning?.effort ?? null,
            reasoningExcluded: effectiveParams.reasoning?.exclude ?? true,
            streamEnabled: effectiveParams.stream,
            parameterMode: effectiveParams.mode
          },
          attributionStatus: "TRUSTED"
        });
        traceId = trace.traceId;

        // Emit HEALTH_BLOCKED / BUDGET_BLOCKED / CHAIN_SKIPPED steps for skipped providers
        for (const evt of pendingRouteEvents) {
          const titleMap = { HEALTH_BLOCKED: "Provider health-blocked", BUDGET_BLOCKED: "Provider budget-blocked", CHAIN_SKIPPED: "Chain step skipped", PROVIDER_SKIPPED: "Provider skipped" };
          await addTraceStep({
            traceId,
            stepType: evt.kind,
            operation: "route_intelligence",
            title: titleMap[evt.kind],
            detail: evt.reason,
            status: evt.kind,
            providerId: evt.providerId,
            metadata: { skipReason: evt.reason, routeChainId: route.routeChainId ?? null }
          }).catch(() => undefined);
        }

        const traceContext = buildTraceContext({
          traceId,
          sourceType: "AGENT_RESPONSE",
          sourceId: session.id,
          operation: "council_agent_response",
          purpose: "Council agent response",
          triggerType: "USER_ACTION",
          attributionStatus: "TRUSTED"
        });
        const activity = await startAgentActivity({
          traceId,
          attributionStatus: "TRUSTED",
          agentId: agent.id,
          projectId: task.projectId,
          taskId: task.id,
          councilSessionId: session.id,
          status: "THINKING",
          activityType: "AGENT_RESPONSE",
          title: `${agent.title} counsel`,
          detail: task.title,
          providerId: route.provider.id,
          providerName: route.provider.name,
          model: route.model,
          operation: "council_agent_response",
          sourceType: "AGENT_RESPONSE",
          sourceId: session.id,
          requestLabel: `${agent.title} response for ${task.title}`,
          metadata: { taskMode: task.mode }
        });
        activityId = activity.id;

        // ── Timeline: PROVIDER_CALL step ──
        const providerStep = await startTraceStep({
          traceId,
          stepType: "PROVIDER_CALL",
          operation: "council_agent_response",
          title: `${agent.title} provider call`,
          detail: `${route.provider.name} · ${route.model}`,
          agentId: agent.id,
          providerId: route.provider.id,
          providerType: route.provider.type,
          providerName: route.provider.name,
          model: route.model,
          taskId: task.id,
          projectId: task.projectId,
          councilSessionId: session.id,
          promptPreview: task.command
        });

        const agentKnowledgeRaw = knowledgeInContext
          ? await buildAgentKnowledgeContext(agent.id, task.projectId, task.id).then((r) => r.context).catch(() => "")
          : "";
        const agentKnowledge = agentKnowledgeRaw.trim() ? `[APPROVED KNOWLEDGE]\n${agentKnowledgeRaw}` : "";
        const agentMemoryContext = [kingdomMemoryContext, agentKnowledge].filter((section) => section && section.trim()).join("\n\n");

        const generated = await generateWithFallback(providerCalls, {
          command: task.command,
          mode: task.mode,
          agentName: agent.name,
          agentRole: agent.title,
          agentSkills: agent.skills,
          systemPrompt: buildRoleSystemPrompt(agent, task.mode),
          responseStyle: agent.responseStyle,
          temperature: agent.temperature ?? undefined,
          maxTokens: agent.maxTokens ?? defaultMaxTokens,
          modelParameters: effectiveParams,
          kingdomContext: kingdomContext || undefined,
          projectContext,
          kingdomMemoryContext: agentMemoryContext,
          previousCouncilContext,
          decreeFrame
        }, traceContext);

        // ── Timeline: Complete PROVIDER_CALL step ──
        await completeTraceStep(providerStep.id, {
          responsePreview: generated.response,
          tokensUsed: generated.usage.totalTokens,
          metadata: { providerUsed: generated.providerName, modelUsed: generated.modelUsed }
        });

        // Self-growing budget: grow this agent's max_tokens if a real provider truncated.
        await maybeGrowAgentMaxTokens({
          agentId: agent.id,
          agentSlug: agent.slug,
          contentBudgetUsed: effectiveParams.max_tokens,
          finishReason: generated.finishReason,
          providerType: generated.finalProviderType,
          model: generated.modelUsed,
          userId
        }).catch(() => undefined);

        await updateAgentActivity(activityId, {
          status: "RESPONDING",
          providerId: generated.providerId ?? generated.providerName,
          providerName: generated.providerName,
          model: generated.modelUsed
        });

        const agentResponse = await prisma.agentResponse.create({
          data: {
            sessionId: session.id,
            agentId: agent.id,
            role: agent.title,
            response: generated.response
          }
        });
        await updateTraceSource(traceId, { sourceId: agentResponse.id });

        const agentCost = await calculateCostUSDFromRegistry(
          generated.providerId ?? generated.providerName,
          generated.modelUsed,
          generated.usage
        );
        const usageRecord = await prisma.usageRecord.create({
          data: {
            traceId,
            attributionStatus: "TRUSTED",
            taskId: task.id,
            councilSessionId: session.id,
            agentId: agent.id,
            provider: generated.providerName,
            providerId: generated.providerId ?? generated.providerName,
            model: generated.modelUsed,
            promptTokens: generated.usage.promptTokens,
            completionTokens: generated.usage.completionTokens,
            totalTokens: generated.usage.totalTokens,
            inputCacheHitTokens: generated.usage.inputCacheHitTokens ?? null,
            inputCacheMissTokens: generated.usage.inputCacheMissTokens ?? null,
            estimatedCostUSD: agentCost.costUSD,
            estimatedCostLocal: agentCost.costUSD,
            currency: "USD",
            pricingSource: agentCost.source,
            pricingStatus: agentCost.pricingStatus,
            pricingNotes: agentCost.pricingNotes ?? null,
            costSource: agentCost.costSource,
            costConfidence: agentCost.costConfidence,
            ...buildUsageAttribution({
              projectId: task.projectId,
              purpose: "Council agent response",
              sourceType: "AGENT_RESPONSE",
              sourceId: agentResponse.id,
              operation: "council_agent_response",
              requestLabel: `${agent.title} response for ${task.title}`,
              prompt: task.command,
              response: generated.response,
              metadata: {
                taskMode: task.mode,
                agentSlug: agent.slug,
                pricingStatus: agentCost.pricingStatus,
                reasoningTokens: generated.usage.reasoningTokens ?? null,
                actualSentModel: generated.actualSentModel ?? generated.modelUsed,
                responseModel: generated.responseModel ?? null,
                modelParametersUsed: effectiveParams,
                reasoningEnabled: effectiveParams.reasoning?.enabled ?? false,
                reasoningEffort: effectiveParams.reasoning?.effort ?? null,
                reasoningExcluded: effectiveParams.reasoning?.exclude ?? true,
                streamEnabled: effectiveParams.stream,
                parameterMode: effectiveParams.mode
              }
            })
          }
        });

        // ── Timeline: USAGE_RECORDED step ──
        await attachUsageRecordStep(traceId, {
          id: usageRecord.id,
          provider: generated.providerName,
          providerId: generated.providerId ?? generated.providerName,
          model: generated.modelUsed,
          totalTokens: generated.usage.totalTokens,
          estimatedCostUSD: agentCost.costUSD,
          pricingStatus: agentCost.pricingStatus,
          taskId: task.id,
          projectId: task.projectId,
          councilSessionId: session.id,
          agentId: agent.id
        });

        // ── Timeline: AGENT_RESPONSE step ──
        await addTraceStep({
          traceId,
          stepType: "AGENT_RESPONSE",
          operation: "council_agent_response",
          title: `${agent.title} counsel recorded`,
          detail: task.title,
          agentId: agent.id,
          taskId: task.id,
          projectId: task.projectId,
          councilSessionId: session.id,
          responsePreview: generated.response
        });

        await completeAgentActivity(activityId, {
          tokensUsed: generated.usage.totalTokens,
          estimatedCostUSD: agentCost.costUSD,
          providerId: generated.providerId ?? generated.providerName,
          providerName: generated.providerName,
          model: generated.modelUsed,
          sourceId: agentResponse.id,
          usageRecordId: usageRecord.id
        });

        // ── Timeline: TRACE_COMPLETED step for agent trace ──
        await addTraceStep({
          traceId,
          stepType: "TRACE_COMPLETED",
          operation: "trace_completed",
          title: `${agent.title} trace completed`,
          taskId: task.id,
          councilSessionId: session.id,
          agentId: agent.id,
          tokensUsed: generated.usage.totalTokens,
          estimatedCostUSD: agentCost.costUSD
        });

        await completeAIUsageTrace(traceId, generated.response, {
          attributionStatus: "TRUSTED",
          usageRecordId: usageRecord.id,
          tokensUsed: generated.usage.totalTokens,
          estimatedCostUSD: agentCost.costUSD,
          pricingStatus: agentCost.pricingStatus,
          fallbackNotice: generated.fallbackNotice ?? null
        });

        return {
          agent,
          response: generated.response,
          fallbackNotice: generated.fallbackNotice ?? null,
          providerName: generated.providerName,
          modelUsed: generated.modelUsed
        };
      } catch (error) {
        if (activityId) await failAgentActivity(activityId, error).catch(() => undefined);
        if (traceId) await failAIUsageTrace(traceId, error).catch(() => undefined);
        throw error;
      }
    };

    const parallelSpecialists = await getBooleanSetting("COUNCIL_PARALLEL_SPECIALISTS", true);
    const prevContext = () => generatedResponses.map((item) => `${item.agent.title}: ${item.response}`).join("\n\n");
    const applyPass = (r: CouncilPassResult) => {
      generatedResponses.push({ agent: r.agent, response: r.response });
      if (r.fallbackNotice) fallbackNotices.push(r.fallbackNotice);
      usedProviders.push(r.providerName);
      usedModels.push(r.modelUsed);
    };

    if (parallelSpecialists) {
      // Independent-opinion mode (opt-in): the specialists run concurrently and do NOT see
      // each other (empty previousCouncilContext) — turning the critical path from a sum of
      // the calls into the max. The Grand Vizier still runs last with the full transcript and
      // then synthesizes, so only peer-anchoring between specialists is removed. allSettled
      // (not all) keeps one specialist's failure from sinking the whole council.
      const specialists = selectedAgents.filter((a) => a.slug !== "grand-vizier");
      const vizierPass = selectedAgents.filter((a) => a.slug === "grand-vizier");
      const settled = await Promise.allSettled(specialists.map((a) => runCouncilAgentPass(a, "")));
      settled.forEach((s, i) => {
        if (s.status === "fulfilled") applyPass(s.value);
        else console.warn(`[Council] specialist ${specialists[i]?.slug} failed (parallel wave):`, s.reason instanceof Error ? s.reason.message : String(s.reason));
      });
      if (generatedResponses.length === 0) throw new Error("All council specialists failed to respond.");
      for (const agent of vizierPass) {
        applyPass(await runCouncilAgentPass(agent, prevContext()));
      }
    } else {
      // Sequential round-table (default): each agent sees the prior agents' responses.
      for (const agent of selectedAgents) {
        applyPass(await runCouncilAgentPass(agent, prevContext()));
      }
    }

    const grandVizier = selectedAgents.find((agent) => agent.slug === "grand-vizier") ?? selectedAgents[0];
    if (!grandVizier) {
      throw new Error("Grand Vizier is not available");
    }
    const summaryRoute = await selectAIProviderRoute({ agent: grandVizier, taskMode: task.mode, requiredCapabilities: { chat: true } });
    const summaryEffectiveParams = resolveEffectiveParameters(grandVizier, summaryRoute.provider.type, defaultMaxTokens, synthesisEscalation);
    const summaryProviderCalls = buildAIProviderCallsFromRoute(summaryRoute, grandVizier);
    const summaryTrace = await createAIUsageTrace({
      actorUserId: userId,
      actorRole: task.user.role,
      triggerType: "USER_ACTION",
      triggerRoute: "POST /api/tasks/:id/process",
      triggerLabel: task.title,
      projectId: task.projectId,
      taskId: task.id,
      councilSessionId: session.id,
      agentId: grandVizier.id,
      sourceType: "FINAL_COUNSEL",
      sourceId: session.id,
      operation: "final_counsel",
      purpose: "Final council synthesis",
      providerId: summaryRoute.provider.id,
      providerType: summaryRoute.provider.type,
      providerName: summaryRoute.provider.name,
      model: summaryRoute.model,
      prompt: generatedResponses.map((item) => `${item.agent.title}: ${item.response}`).join("\n\n"),
      metadata: {
        taskMode: task.mode,
        agentSlug: grandVizier.slug,
        modelParametersUsed: summaryEffectiveParams,
        complexityLevel: decreeComplexity.level,
        complexitySignals: decreeComplexity.signals,
        reasoningEscalated: !!synthesisEscalation?.reasoning,
        reasoningEnabled: summaryEffectiveParams.reasoning?.enabled ?? false,
        reasoningEffort: summaryEffectiveParams.reasoning?.effort ?? null,
        reasoningExcluded: summaryEffectiveParams.reasoning?.exclude ?? true,
        streamEnabled: summaryEffectiveParams.stream,
        parameterMode: summaryEffectiveParams.mode
      },
      attributionStatus: "TRUSTED"
    });
    const summaryTraceContext = buildTraceContext({
      traceId: summaryTrace.traceId,
      sourceType: "FINAL_COUNSEL",
      sourceId: session.id,
      operation: "final_counsel",
      purpose: "Final council synthesis",
      triggerType: "USER_ACTION",
      attributionStatus: "TRUSTED"
    });
    const summaryActivity = await startAgentActivity({
      traceId: summaryTrace.traceId,
      attributionStatus: "TRUSTED",
      agentId: grandVizier.id,
      projectId: task.projectId,
      taskId: task.id,
      councilSessionId: session.id,
      status: "SUMMARIZING",
      activityType: "FINAL_COUNSEL",
      title: "Grand Vizier synthesis",
      detail: task.title,
      providerId: summaryRoute.provider.id,
      providerName: summaryRoute.provider.name,
      model: summaryRoute.model,
      operation: "final_counsel",
      sourceType: "FINAL_COUNSEL",
      sourceId: session.id,
      requestLabel: `Grand Vizier synthesis for ${task.title}`,
      metadata: { taskMode: task.mode }
    });

    // ── Timeline: FINAL_COUNSEL provider call step ──
    const summaryProviderStep = await startTraceStep({
      traceId: summaryTrace.traceId,
      stepType: "FINAL_COUNSEL",
      operation: "final_counsel",
      title: "Grand Vizier final counsel",
      detail: `${summaryRoute.provider.name} · ${summaryRoute.model}`,
      agentId: grandVizier.id,
      providerId: summaryRoute.provider.id,
      providerType: summaryRoute.provider.type,
      providerName: summaryRoute.provider.name,
      model: summaryRoute.model,
      taskId: task.id,
      projectId: task.projectId,
      councilSessionId: session.id
    });

    const summaryKnowledgeRaw = knowledgeInContext
      ? await buildAgentKnowledgeContext(grandVizier.id, task.projectId, task.id).then((r) => r.context).catch(() => "")
      : "";
    const summaryKnowledge = summaryKnowledgeRaw.trim() ? `[APPROVED KNOWLEDGE]\n${summaryKnowledgeRaw}` : "";
    const summaryMemoryContext = [kingdomMemoryContext, summaryKnowledge].filter((section) => section && section.trim()).join("\n\n");

    const qualityReminder = await buildQualityReminder();

    let generatedSummary: Awaited<ReturnType<typeof generateWithFallback>>;
    try {
      generatedSummary = await generateWithFallback(summaryProviderCalls, {
        command: task.command,
        mode: task.mode,
        agentName: grandVizier.name,
        agentRole: grandVizier.title,
        agentSkills: grandVizier.skills,
        systemPrompt: `${buildRoleSystemPrompt(grandVizier, task.mode)}\n\nSynthesize the council transcript into the final royal summary. Do not add new specialist analysis beyond the transcript.${qualityReminder}`,
        responseStyle: grandVizier.responseStyle,
        temperature: grandVizier.temperature ?? undefined,
        maxTokens: grandVizier.maxTokens ?? defaultMaxTokens,
        modelParameters: summaryEffectiveParams,
        kingdomContext: kingdomContext || undefined,
        projectContext,
        kingdomMemoryContext: summaryMemoryContext,
        previousCouncilContext: generatedResponses.map((item) => `${item.agent.title}: ${item.response}`).join("\n\n")
      }, summaryTraceContext);
    } catch (error) {
      await failTraceStep(summaryProviderStep.id, error).catch(() => undefined);
      await failAgentActivity(summaryActivity.id, error).catch(() => undefined);
      await failAIUsageTrace(summaryTrace.traceId, error).catch(() => undefined);
      throw error;
    }

    // ── Timeline: Complete FINAL_COUNSEL step ──
    await completeTraceStep(summaryProviderStep.id, {
      responsePreview: generatedSummary.response,
      tokensUsed: generatedSummary.usage.totalTokens,
      metadata: { providerUsed: generatedSummary.providerName, modelUsed: generatedSummary.modelUsed }
    });

    // Self-growing budget: grow the Grand Vizier's max_tokens if the synthesis truncated.
    await maybeGrowAgentMaxTokens({
      agentId: grandVizier.id,
      agentSlug: grandVizier.slug,
      contentBudgetUsed: summaryEffectiveParams.max_tokens,
      finishReason: generatedSummary.finishReason,
      providerType: generatedSummary.finalProviderType,
      model: generatedSummary.modelUsed,
      userId
    }).catch(() => undefined);

    if (generatedSummary.fallbackNotice) {
      fallbackNotices.push(generatedSummary.fallbackNotice);
    }
    usedProviders.push(generatedSummary.providerName);
    usedModels.push(generatedSummary.modelUsed);

    const summaryCost = await calculateCostUSDFromRegistry(
      generatedSummary.providerId ?? generatedSummary.providerName,
      generatedSummary.modelUsed,
      generatedSummary.usage
    );
    const summaryUsageRecord = await prisma.usageRecord.create({
      data: {
        traceId: summaryTrace.traceId,
        attributionStatus: "TRUSTED",
        taskId: task.id,
        councilSessionId: session.id,
        agentId: grandVizier.id,
        provider: generatedSummary.providerName,
        providerId: generatedSummary.providerId ?? generatedSummary.providerName,
        model: generatedSummary.modelUsed,
        promptTokens: generatedSummary.usage.promptTokens,
        completionTokens: generatedSummary.usage.completionTokens,
        totalTokens: generatedSummary.usage.totalTokens,
        inputCacheHitTokens: generatedSummary.usage.inputCacheHitTokens ?? null,
        inputCacheMissTokens: generatedSummary.usage.inputCacheMissTokens ?? null,
        estimatedCostUSD: summaryCost.costUSD,
        estimatedCostLocal: summaryCost.costUSD,
        currency: "USD",
        pricingSource: summaryCost.source,
        pricingStatus: summaryCost.pricingStatus,
        pricingNotes: summaryCost.pricingNotes ?? null,
        costSource: summaryCost.costSource,
        costConfidence: summaryCost.costConfidence,
        ...buildUsageAttribution({
          projectId: task.projectId,
          purpose: "Final council synthesis",
          sourceType: "FINAL_COUNSEL",
          sourceId: session.id,
          operation: "final_counsel",
          requestLabel: `Grand Vizier synthesis for ${task.title}`,
          prompt: generatedResponses.map((item) => `${item.agent.title}: ${item.response}`).join("\n\n"),
          response: generatedSummary.response,
          metadata: {
            taskMode: task.mode,
            agentSlug: grandVizier.slug,
            pricingStatus: summaryCost.pricingStatus,
            reasoningTokens: generatedSummary.usage.reasoningTokens ?? null,
            actualSentModel: generatedSummary.actualSentModel ?? generatedSummary.modelUsed,
            responseModel: generatedSummary.responseModel ?? null,
            modelParametersUsed: summaryEffectiveParams,
            reasoningEnabled: summaryEffectiveParams.reasoning?.enabled ?? false,
            reasoningEffort: summaryEffectiveParams.reasoning?.effort ?? null,
            reasoningExcluded: summaryEffectiveParams.reasoning?.exclude ?? true,
            streamEnabled: summaryEffectiveParams.stream,
            parameterMode: summaryEffectiveParams.mode
          }
        })
      }
    });

    // ── Timeline: USAGE_RECORDED step for final counsel ──
    await attachUsageRecordStep(summaryTrace.traceId, {
      id: summaryUsageRecord.id,
      provider: generatedSummary.providerName,
      providerId: generatedSummary.providerId ?? generatedSummary.providerName,
      model: generatedSummary.modelUsed,
      totalTokens: generatedSummary.usage.totalTokens,
      estimatedCostUSD: summaryCost.costUSD,
      pricingStatus: summaryCost.pricingStatus,
      taskId: task.id,
      projectId: task.projectId,
      councilSessionId: session.id,
      agentId: grandVizier.id
    });

    await completeAgentActivity(summaryActivity.id, {
      tokensUsed: generatedSummary.usage.totalTokens,
      estimatedCostUSD: summaryCost.costUSD,
      providerId: generatedSummary.providerId ?? generatedSummary.providerName,
      providerName: generatedSummary.providerName,
      model: generatedSummary.modelUsed,
      usageRecordId: summaryUsageRecord.id
    });
    await completeAIUsageTrace(summaryTrace.traceId, generatedSummary.response, {
      attributionStatus: "TRUSTED",
      usageRecordId: summaryUsageRecord.id,
      tokensUsed: generatedSummary.usage.totalTokens,
      estimatedCostUSD: summaryCost.costUSD,
      pricingStatus: summaryCost.pricingStatus,
      fallbackNotice: generatedSummary.fallbackNotice ?? null
    });

    const finalSummary = [contextWarning, generatedSummary.response].filter(Boolean).join("\n\n");

    const qualityResult = scoreCouncilSynthesis(generatedSummary.response, task.mode);

    const completedSession = await prisma.councilSession.update({
      where: { id: session.id },
      data: {
        status: "COMPLETED",
        finalSummary,
        providerName: [...new Set(usedProviders)].join(", "),
        modelUsed: [...new Set(usedModels)].join(", "),
        fallbackNotice: fallbackNotices.length > 0 ? [...new Set(fallbackNotices)].join("\n") : null,
        consultedMemoryIds: relevantMemories.map((memory) => memory.id),
        qualityScore: qualityResult.score,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        qualityFlags: JSON.parse(JSON.stringify(qualityResult.flags))
      },
      include: {
        task: true,
        responses: {
          include: { agent: true },
          orderBy: { createdAt: "asc" }
        }
      }
    });
    completedSession.responses = sortByCouncilOrder(completedSession.responses);

    await prisma.task.update({
      where: { id: task.id },
      data: { status: "COMPLETED" }
    });

    const sessionUsage = await prisma.usageRecord.aggregate({
      _sum: { estimatedCostUSD: true },
      where: { councilSessionId: session.id }
    });
    const sessionTotalCost = sessionUsage._sum.estimatedCostUSD ?? 0;
    if (sessionTotalCost > 0) {
      await prisma.treasuryLedger.create({
        data: {
          type: "COST",
          source: `council:${session.id}`,
          description: `Council session for task: ${task.title}`,
          amount: sessionTotalCost,
          currency: "USD"
        }
      });
    }

    const qualityOk = qualityResult.score >= QUALITY_GATE_THRESHOLD;
    const savedMemories = autoSaveMemory && qualityOk
      ? await autoSaveMemories({
          userId,
          task,
          session: completedSession,
          responses: completedSession.responses
        })
      : [];

    // ── Timeline: MEMORY_EXTRACTION step ──
    if (savedMemories.length > 0) {
      await addTraceStep({
        traceId: summaryTrace.traceId,
        stepType: "MEMORY_EXTRACTION",
        operation: "memory_extraction",
        title: `${savedMemories.length} memories saved`,
        detail: savedMemories.map((m) => m.title).join(", "),
        taskId: task.id,
        projectId: task.projectId,
        councilSessionId: session.id,
        metadata: { memoryCount: savedMemories.length, memoryIds: savedMemories.map((m) => m.id) }
      });
    }

    const learningCandidate = await createCouncilLearningCandidate({
      task,
      session: completedSession,
      grandVizier,
      responses: completedSession.responses,
      finalSummary,
      traceId: summaryTrace.traceId
    });

    const sessionWithMemories = await prisma.councilSession.update({
      where: { id: completedSession.id },
      data: {
        autoSavedMemoryIds: savedMemories.map((memory) => memory.id)
      },
      include: {
        task: true,
        responses: {
          include: { agent: true },
          orderBy: { createdAt: "asc" }
        }
      }
    });
    sessionWithMemories.responses = sortByCouncilOrder(sessionWithMemories.responses);

    if (autoGenerateReports) {
      const report = await generateRoyalReport({
        userId,
        session: sessionWithMemories,
        consultedMemories: relevantMemories
      });
      await updateAgentActivity(summaryActivity.id, { reportId: report.id }).catch(() => undefined);

      // ── Timeline: REPORT_GENERATION step ──
      await addTraceStep({
        traceId: summaryTrace.traceId,
        stepType: "REPORT_GENERATION",
        operation: "report_generation",
        title: "Royal report generated",
        detail: report.title,
        reportId: report.id,
        taskId: task.id,
        projectId: task.projectId,
        councilSessionId: session.id
      });
    }

    if (learningCandidate) {
      await addTraceStep({
        traceId: summaryTrace.traceId,
        stepType: "MEMORY_EXTRACTION",
        operation: "knowledge_candidate",
        title: "Learning memory candidate created",
        detail: learningCandidate.title,
        taskId: task.id,
        projectId: task.projectId,
        councilSessionId: session.id,
        agentId: grandVizier.id,
        metadata: { candidateId: learningCandidate.id, status: learningCandidate.status }
      });
    }

    // ── Timeline: TRACE_COMPLETED step for final counsel ──
    await addTraceStep({
      traceId: summaryTrace.traceId,
      stepType: "TRACE_COMPLETED",
      operation: "trace_completed",
      title: "Final counsel trace completed",
      taskId: task.id,
      projectId: task.projectId,
      councilSessionId: session.id,
      agentId: grandVizier.id,
      tokensUsed: generatedSummary.usage.totalTokens,
      estimatedCostUSD: summaryCost.costUSD
    });

    await refreshCouncilNextExecutableAction(sessionWithMemories.id).catch((err) => {
      console.warn("[GrandVizier] Next action computation failed:", err instanceof Error ? err.message : String(err));
    });

    // Fire-and-forget: planner runs after council completes, gated by COUNCIL_AUTO_WORK_ORDER_MODE setting
    runPlannerAgent(
      { id: sessionWithMemories.id, finalSummary: sessionWithMemories.finalSummary, projectId: sessionWithMemories.projectId, taskId: task.id },
      { id: task.id, title: task.title, command: task.command, mode: task.mode, projectId: task.projectId, createdBy: task.createdBy, user: task.user ?? undefined },
      userId
    ).catch((err) => {
      console.warn("[GrandVizier] Planner agent failed:", err instanceof Error ? err.message : String(err));
    });

    return sessionWithMemories;
  } catch (error) {
    await prisma.councilSession.update({
      where: { id: session.id },
      data: { status: "FAILED" }
    });
    await prisma.task.update({
      where: { id: task.id },
      data: { status: "FAILED" }
    });
    throw error;
  }
}

async function buildContextWarning(projectId: string | null): Promise<string> {
  if (!projectId) {
    return [
      "[CONTEXT WARNING]",
      "No project is assigned to this Royal Command. Do not create SANDBOX_PATCH jobs from this council output without first linking a project and binding fresh local document context."
    ].join("\n");
  }

  const blockedWorkOrders = await prisma.workOrder.findMany({
    where: {
      projectId,
      status: { in: ["READY", "IN_PROGRESS", "NEEDS_REVIEW"] },
      contextBindingStatus: { not: "FRESH" }
    },
    select: { id: true, title: true, contextBindingStatus: true },
    orderBy: { updatedAt: "desc" },
    take: 5
  });

  if (blockedWorkOrders.length === 0) {
    return "";
  }

  return [
    "[CONTEXT WARNING]",
    "One or more active WorkOrders have stale, missing, or partial project context. SANDBOX_PATCH creation is blocked until contextBindingStatus is FRESH.",
    ...blockedWorkOrders.map((workOrder) => `- ${workOrder.title} (${workOrder.contextBindingStatus}; id ${workOrder.id})`)
  ].join("\n");
}

function buildRoleSystemPrompt(agent: Agent, mode: TaskMode): string {
  let modeContracts: Record<string, string>;
  let guardrails: string;
  if (mode === "BUILD") {
    modeContracts = BUILD_ROLE_CONTRACTS;
    guardrails = BUILD_EXECUTION_GUARDRAILS;
  } else if (mode === "ASK") {
    modeContracts = ASK_ROLE_CONTRACTS;
    guardrails = MANUAL_ONLY_GUARDRAILS;
  } else if (mode === "PLAN") {
    modeContracts = PLAN_ROLE_CONTRACTS;
    guardrails = MANUAL_ONLY_GUARDRAILS;
  } else {
    // RESEARCH and any future modes keep investigation framing
    modeContracts = ROLE_RESPONSE_CONTRACTS;
    guardrails = MANUAL_ONLY_GUARDRAILS;
  }
  const contract = modeContracts[agent.slug] ?? ROLE_RESPONSE_CONTRACTS[agent.slug] ?? "Return structured role-specific council counsel.";
  return [
    agent.systemPrompt || agent.prompt,
    contract,
    guardrails
  ].join("\n\n");
}

async function buildQualityReminder(): Promise<string> {
  try {
    const recent = await prisma.councilSession.findMany({
      where: { qualityScore: { not: null } },
      select: { qualityScore: true },
      orderBy: { createdAt: "desc" },
      take: 5
    });
    if (recent.length < 3) return "";
    const scores = recent.map((s) => s.qualityScore ?? 0);
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    if (avg >= 0.4) return "";
    return `\n\nQUALITY SIGNAL: Recent council syntheses averaged ${Math.round(avg * 100)}/100 on deterministic quality scoring. Ensure this synthesis: (1) closes with a paragraph beginning "My recommendation:" naming a concrete action or decision. (2) For BUILD/RESEARCH decrees, cites at least one specific file path (e.g., apps/api/src/...). (3) Names at least two specialist roles by title (e.g., Royal Archivist, Royal Researcher). (4) Resolves any "it depends" immediately with "on [specific named variable]".`;
  } catch {
    return "";
  }
}

async function createCouncilLearningCandidate(input: {
  task: Task;
  session: CouncilSession;
  grandVizier: Agent;
  responses: AgentResponse[];
  finalSummary: string;
  traceId: string;
}) {
  // Gate: synthesis-capture is proven to produce circular/low-signal content (council's own
  // output relabeled as lessons). Disabled by default; only CAPTURE_LESSONS_FROM_REVIEWS
  // (runner failure outcomes) feeds the knowledge pool.
  const synthesisCapture = await getBooleanSetting("COUNCIL_SYNTHESIS_CAPTURE", false);
  if (!synthesisCapture) return null;

  // Skip trivial decrees — greetings and single-phrase commands produce no learnable content.
  const command = input.task.command.trim();
  const wordCount = command.split(/\s+/).filter(Boolean).length;
  if (wordCount < 4 || command.length < 20) return null;

  const roleMap = new Map(input.responses.map((response) => [response.role, response.response]));
  const archivist = roleMap.get("Royal Archivist") ?? "";
  const researcher = roleMap.get("Royal Researcher") ?? "";
  const architect = roleMap.get("Royal Architect") ?? "";
  const general = roleMap.get("Royal General") ?? "";
  const content = redactPublicOutput([
    `Failure pattern: ${input.task.command}`,
    `Evidence: ${summarizeForCandidate(archivist || input.finalSummary)}`,
    `Lesson: ${summarizeForCandidate(researcher || input.finalSummary)}`,
    `Recommended future behavior: ${summarizeForCandidate([architect, general, input.finalSummary].filter(Boolean).join(" "))}`
  ].join("\n\n"));

  return proposeKnowledgeCandidate({
    agentId: input.grandVizier.id,
    projectId: input.task.projectId,
    taskId: input.task.id,
    councilSessionId: input.session.id,
    traceId: input.traceId,
    sourceType: "COUNCIL_SESSION",
    sourceId: input.session.id,
    title: `Learning candidate from ${input.task.title}`,
    content,
    summary: summarizeForCandidate(input.finalSummary, 280),
    category: /fail|error|diagnos|bug|test/i.test(input.task.command) ? "BUG_LEARNING" : "WORKFLOW_RULE",
    confidence: 0.72,
    proposedByAgentId: input.grandVizier.id,
    tags: ["m17f-1", "council-learning", input.task.mode.toLowerCase()],
    metadata: {
      failurePattern: input.task.command,
      evidenceSourceRoles: input.responses.map((response) => response.role),
      recommendedFutureBehaviorSource: "Royal Architect, Royal General, and Grand Vizier outputs",
      requiresReview: true
    }
  });
}

function redactPublicOutput(value: string): string {
  return redactSecrets(value)
    .replace(/\/Users\/[^\s"'`),;]+/g, "[LOCAL_PATH_REDACTED]")
    .replace(/\/private\/(?:tmp|var)\/[^\s"'`),;]+/g, "[LOCAL_PATH_REDACTED]");
}

function summarizeForCandidate(value: string, maxLength = 450): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 3)}...` : normalized;
}

function orderSelectedAgents(mode: TaskMode, agents: Agent[]): Agent[] {
  const bySlug = new Map(agents.map((agent) => [agent.slug, agent]));
  return AGENTS_BY_MODE[mode].map((slug) => bySlug.get(slug)).filter((agent): agent is Agent => Boolean(agent));
}
