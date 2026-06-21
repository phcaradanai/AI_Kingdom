import type { Agent, DirectAgentRequestType, Prisma, UserRole } from "@prisma/client";
import { buildAIProviderCallsFromRoute } from "../ai/providerCallPlanner.js";
import { generateWithFallback } from "../ai/generateWithFallback.js";
import { resolveEffectiveParameters } from "../ai/modelParameterResolver.js";
import { prisma } from "../db/prisma.js";
import { extractAgentDisplayProfile } from "./agentDisplayProfileService.js";
import { calculateCostUSDFromRegistry } from "./modelPricingService.js";
import { selectAIProviderRoute } from "./aiProviderRouter.js";
import { getKingdomContext } from "./kingdomComplianceService.js";
import { findRelevantMemories, formatMemoryContext } from "./memoryService.js";
import { buildProjectContext } from "./projectContextService.js";
import { getNumberSetting } from "./settingsService.js";
import { redactSecrets, buildUsageAttribution } from "./usageAttributionService.js";
import { completeAgentActivity, failAgentActivity, startAgentActivity, updateAgentActivity } from "./agentActivityService.js";
import { proposeKnowledgeCandidate } from "./agentKnowledgeService.js";
import {
  addTraceStep,
  attachUsageRecordStep,
  buildTraceContext,
  completeAIUsageTrace,
  completeTraceStep,
  createAIUsageTrace,
  failAIUsageTrace,
  startTraceStep,
  updateTraceSource
} from "./aiUsageTraceService.js";

export type DirectAgentSaveMode = "NONE" | "ARTIFACT" | "KNOWLEDGE_CANDIDATE" | "BOTH";

export type DirectAgentSendInput = {
  userId: string;
  userRole: UserRole;
  sessionId?: string;
  agentId?: string;
  projectId?: string | null;
  title?: string | null;
  prompt: string;
  requestType: DirectAgentRequestType;
  saveMode?: DirectAgentSaveMode;
};

const DIRECT_AGENT_GUARDRAILS = [
  "Direct Kingdom Agent guardrails:",
  "- This is a direct advisory conversation or personal assignment, not a command-execution path.",
  "- Do not run shell commands, patch files, push branches, create pull requests, merge, deploy, or call proprietary external-agent APIs.",
  "- Do not expose secrets, raw local root paths, tokens, credentials, or private scratchpad reasoning.",
  "- If current external facts are required and no browsing/source material is provided, state the limitation and identify what should be verified.",
  "- Durable kingdom knowledge must be saved as a reviewable candidate or artifact; do not silently auto-approve memory."
].join("\n");

const REQUEST_INSTRUCTIONS: Record<DirectAgentRequestType, string> = {
  GENERAL_QUESTION: "Answer the King directly. Keep assumptions visible and give a practical next step when useful.",
  RESEARCH_ASSIGNMENT: [
    "Produce a research brief for kingdom reuse.",
    "Separate known facts, assumptions, open questions, and recommended sources to verify.",
    "End with reusable knowledge notes suitable for review before becoming durable memory."
  ].join("\n"),
  SUMMARY_ASSIGNMENT: [
    "Summarize the relevant kingdom work clearly.",
    "Prioritize what happened today, what needs attention, and what decision or follow-up is safe."
  ].join("\n"),
  PERSONAL_TASK: [
    "Treat this as a personal assignment for this agent.",
    "Return the completed advisory output plus any blocked items that require King approval or external verification."
  ].join("\n")
};

export async function listDirectAgentSessions(userId: string) {
  const sessions = await prisma.directAgentSession.findMany({
    where: { createdByUserId: userId },
    include: {
      agent: true,
      project: { select: { id: true, name: true, codename: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 }
    },
    orderBy: { updatedAt: "desc" },
    take: 80
  });
  return sessions.map(toSessionDto);
}

export async function getDirectAgentSession(userId: string, sessionId: string) {
  const session = await prisma.directAgentSession.findFirst({
    where: { id: sessionId, createdByUserId: userId },
    include: {
      agent: true,
      project: { select: { id: true, name: true, codename: true } },
      messages: { orderBy: { createdAt: "asc" } }
    }
  });
  if (!session) {
    const error = new Error("Direct agent session not found");
    error.name = "NotFoundError";
    throw error;
  }
  return toSessionDto(session);
}

export async function sendDirectAgentMessage(input: DirectAgentSendInput) {
  const prompt = redactSecrets(input.prompt.trim());
  if (!prompt) {
    throw new Error("Prompt is required");
  }

  const { session, agent } = await getOrCreateSession(input, prompt);
  const userMessage = await prisma.directAgentMessage.create({
    data: {
      sessionId: session.id,
      role: "USER",
      content: prompt,
      metadata: {
        requestType: input.requestType,
        saveMode: input.saveMode ?? "NONE"
      } as Prisma.InputJsonObject
    }
  });

  let activityId: string | null = null;
  let traceId: string | null = null;
  try {
    const defaultMaxTokens = await getNumberSetting("AI_MAX_TOKENS", 900);
    const route = await selectAIProviderRoute({ agent, taskMode: requestTypeToTaskMode(input.requestType), requiredCapabilities: { chat: true } });
    const effectiveParams = resolveEffectiveParameters(agent, route.provider.type, defaultMaxTokens);
    const providerCalls = buildAIProviderCallsFromRoute(route, agent);
    const trace = await createAIUsageTrace({
      actorUserId: input.userId,
      actorRole: input.userRole,
      triggerType: "USER_ACTION",
      triggerRoute: input.sessionId ? "POST /api/agent-conversations/:id/messages" : "POST /api/agent-conversations",
      triggerLabel: session.title,
      projectId: session.projectId,
      agentId: agent.id,
      sourceType: "DIRECT_AGENT_MESSAGE",
      sourceId: userMessage.id,
      operation: "direct_agent_response",
      purpose: `Direct ${agent.title} response`,
      providerId: route.provider.id,
      providerType: route.provider.type,
      providerName: route.provider.name,
      model: route.model,
      prompt,
      metadata: {
        requestType: input.requestType,
        agentSlug: agent.slug,
        modelParametersUsed: effectiveParams,
        saveMode: input.saveMode ?? "NONE"
      },
      attributionStatus: "TRUSTED"
    });
    traceId = trace.traceId;

    const traceContext = buildTraceContext({
      traceId,
      sourceType: "DIRECT_AGENT_MESSAGE",
      sourceId: userMessage.id,
      operation: "direct_agent_response",
      purpose: `Direct ${agent.title} response`,
      triggerType: "USER_ACTION",
      attributionStatus: "TRUSTED"
    });

    const activity = await startAgentActivity({
      traceId,
      attributionStatus: "TRUSTED",
      agentId: agent.id,
      projectId: session.projectId,
      status: "THINKING",
      activityType: "DIRECT_AGENT_RESPONSE",
      title: `${agent.title} direct response`,
      detail: session.title,
      providerId: route.provider.id,
      providerName: route.provider.name,
      model: route.model,
      operation: "direct_agent_response",
      sourceType: "DIRECT_AGENT_MESSAGE",
      sourceId: userMessage.id,
      requestLabel: session.title,
      metadata: { requestType: input.requestType }
    });
    activityId = activity.id;

    const providerStep = await startTraceStep({
      traceId,
      stepType: "PROVIDER_CALL",
      operation: "direct_agent_response",
      title: `${agent.title} direct provider call`,
      detail: `${route.provider.name} · ${route.model}`,
      agentId: agent.id,
      providerId: route.provider.id,
      providerType: route.provider.type,
      providerName: route.provider.name,
      model: route.model,
      projectId: session.projectId,
      promptPreview: prompt
    });

    const generated = await generateWithFallback(providerCalls, {
      command: prompt,
      mode: requestTypeToTaskMode(input.requestType),
      agentName: agent.name,
      agentRole: agent.title,
      agentSkills: agent.skills,
      systemPrompt: buildDirectAgentSystemPrompt(agent, input.requestType),
      responseStyle: agent.responseStyle,
      temperature: agent.temperature ?? undefined,
      maxTokens: agent.maxTokens ?? defaultMaxTokens,
      modelParameters: effectiveParams,
      kingdomContext: await buildKingdomOperatingContext(input.userId),
      projectContext: await buildSafeProjectContext(session.projectId),
      kingdomMemoryContext: await buildRelevantMemoryContext(input.userId, prompt),
      previousCouncilContext: await buildConversationContext(session.id)
    }, traceContext);

    await completeTraceStep(providerStep.id, {
      responsePreview: generated.response,
      tokensUsed: generated.usage.totalTokens,
      metadata: { providerUsed: generated.providerName, modelUsed: generated.modelUsed }
    });
    await updateAgentActivity(activityId, {
      status: "RESPONDING",
      providerId: generated.providerId ?? generated.providerName,
      providerName: generated.providerName,
      model: generated.modelUsed
    });

    const agentMessage = await prisma.directAgentMessage.create({
      data: {
        sessionId: session.id,
        agentId: agent.id,
        role: "AGENT",
        content: redactSecrets(generated.response),
        traceId,
        metadata: {
          providerName: generated.providerName,
          providerId: generated.providerId ?? null,
          modelUsed: generated.modelUsed,
          fallbackNotice: generated.fallbackNotice ?? null
        } as Prisma.InputJsonObject
      }
    });
    await updateTraceSource(traceId, { sourceId: agentMessage.id });

    const cost = await calculateCostUSDFromRegistry(generated.providerId ?? generated.providerName, generated.modelUsed, generated.usage);
    const usageRecord = await prisma.usageRecord.create({
      data: {
        traceId,
        attributionStatus: "TRUSTED",
        projectId: session.projectId,
        agentId: agent.id,
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
        costSource: cost.costSource,
        costConfidence: cost.costConfidence,
        ...buildUsageAttribution({
          projectId: session.projectId,
          purpose: `Direct ${agent.title} response`,
          sourceType: "DIRECT_AGENT_MESSAGE",
          sourceId: agentMessage.id,
          operation: "direct_agent_response",
          requestLabel: session.title,
          prompt,
          response: generated.response,
          metadata: {
            requestType: input.requestType,
            agentSlug: agent.slug,
            saveMode: input.saveMode ?? "NONE",
            pricingStatus: cost.pricingStatus,
            actualSentModel: generated.actualSentModel ?? generated.modelUsed,
            responseModel: generated.responseModel ?? null,
            modelParametersUsed: effectiveParams
          }
        })
      }
    });

    await prisma.directAgentMessage.update({
      where: { id: agentMessage.id },
      data: { usageRecordId: usageRecord.id }
    });
    await attachUsageRecordStep(traceId, {
      id: usageRecord.id,
      provider: generated.providerName,
      providerId: generated.providerId ?? generated.providerName,
      model: generated.modelUsed,
      totalTokens: generated.usage.totalTokens,
      estimatedCostUSD: cost.costUSD,
      projectId: session.projectId,
      agentId: agent.id
    });
    await addTraceStep({
      traceId,
      stepType: "DIRECT_AGENT_RESPONSE",
      operation: "direct_agent_response",
      title: `${agent.title} direct response recorded`,
      agentId: agent.id,
      projectId: session.projectId,
      responsePreview: generated.response
    });

    const saved = await persistDirectAgentOutput({
      sessionId: session.id,
      agent,
      userId: input.userId,
      projectId: session.projectId,
      traceId,
      messageId: agentMessage.id,
      requestType: input.requestType,
      saveMode: input.saveMode ?? "NONE",
      title: session.title,
      content: generated.response
    });

    await prisma.directAgentSession.update({
      where: { id: session.id },
      data: {
        status: "COMPLETED",
        summary: summarizeResponse(generated.response),
        latestTraceId: traceId,
        latestUsageRecordId: usageRecord.id,
        providerName: generated.providerName,
        modelUsed: generated.modelUsed,
        fallbackNotice: generated.fallbackNotice ?? null,
        artifactId: saved.artifactId ?? session.artifactId,
        knowledgeCandidateId: saved.knowledgeCandidateId ?? session.knowledgeCandidateId,
        completedAt: new Date()
      }
    });

    await completeAgentActivity(activityId, {
      tokensUsed: generated.usage.totalTokens,
      estimatedCostUSD: cost.costUSD,
      providerId: generated.providerId ?? generated.providerName,
      providerName: generated.providerName,
      model: generated.modelUsed,
      sourceId: agentMessage.id,
      usageRecordId: usageRecord.id
    });
    await completeAIUsageTrace(traceId, generated.response, {
      attributionStatus: "TRUSTED",
      usageRecordId: usageRecord.id,
      tokensUsed: generated.usage.totalTokens,
      estimatedCostUSD: cost.costUSD,
      fallbackNotice: generated.fallbackNotice ?? null,
      artifactId: saved.artifactId ?? null,
      knowledgeCandidateId: saved.knowledgeCandidateId ?? null
    });

    return getDirectAgentSession(input.userId, session.id);
  } catch (error) {
    if (activityId) await failAgentActivity(activityId, error).catch(() => undefined);
    if (traceId) await failAIUsageTrace(traceId, error).catch(() => undefined);
    await prisma.directAgentSession.update({
      where: { id: session.id },
      data: { status: "FAILED" }
    }).catch(() => undefined);
    throw error;
  }
}

export async function listAvailableDirectAgents() {
  const agents = await prisma.agent.findMany({
    where: { isActive: true, isTestData: false },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }]
  });
  return agents.map(toDirectAgentDto);
}

async function getOrCreateSession(input: DirectAgentSendInput, prompt: string): Promise<{ session: { id: string; agentId: string; projectId: string | null; title: string; artifactId: string | null; knowledgeCandidateId: string | null }; agent: Agent }> {
  if (input.sessionId) {
    const session = await prisma.directAgentSession.findFirst({
      where: { id: input.sessionId, createdByUserId: input.userId, status: { not: "ARCHIVED" } },
      include: { agent: true }
    });
    if (!session) {
      const error = new Error("Direct agent session not found");
      error.name = "NotFoundError";
      throw error;
    }
    if (!session.agent.isActive) {
      const error = new Error("Selected agent is inactive");
      error.name = "ConflictError";
      throw error;
    }
    return { session, agent: session.agent };
  }

  if (!input.agentId) {
    throw new Error("agentId is required for a new direct agent session");
  }
  const agent = await prisma.agent.findFirst({ where: { id: input.agentId, isActive: true, isTestData: false } });
  if (!agent) {
    const error = new Error("Active agent not found");
    error.name = "NotFoundError";
    throw error;
  }
  if (input.projectId) {
    const project = await prisma.project.findUnique({ where: { id: input.projectId }, select: { id: true } });
    if (!project) {
      const error = new Error("Project not found");
      error.name = "NotFoundError";
      throw error;
    }
  }
  const session = await prisma.directAgentSession.create({
    data: {
      agentId: agent.id,
      projectId: input.projectId ?? null,
      createdByUserId: input.userId,
      title: buildTitle(input.title, prompt),
      requestType: input.requestType,
      status: "OPEN"
    }
  });
  return { session, agent };
}

function buildDirectAgentSystemPrompt(agent: Agent, requestType: DirectAgentRequestType): string {
  return [
    agent.systemPrompt || agent.prompt,
    DIRECT_AGENT_GUARDRAILS,
    REQUEST_INSTRUCTIONS[requestType],
    buildRoleSpecificInstruction(agent.slug)
  ].filter(Boolean).join("\n\n");
}

function buildRoleSpecificInstruction(slug: string): string {
  if (slug === "royal-researcher") {
    return "As Royal Researcher, favor research briefs with evidence, uncertainty, source ideas, and reusable kingdom notes.";
  }
  if (slug === "grand-vizier") {
    return "As Grand Vizier, synthesize current kingdom state into decisions, priorities, risks, and safe next actions.";
  }
  if (slug === "royal-general") {
    return "As Royal General, answer with operating judgment, execution order, risk controls, and clear constraints.";
  }
  return "";
}

async function buildKingdomOperatingContext(userId: string): Promise<string> {
  const [charter, dailyContext] = await Promise.all([
    getKingdomContext(),
    buildRecentKingdomContext(userId)
  ]);
  return [charter, dailyContext].filter(Boolean).join("\n\n");
}

async function buildSafeProjectContext(projectId: string | null): Promise<string> {
  if (!projectId) return "[PROJECT CONTEXT]\nNo project selected for this direct agent conversation.";
  return buildProjectContext(projectId);
}

async function buildRelevantMemoryContext(userId: string, prompt: string): Promise<string> {
  const memories = await findRelevantMemories(userId, prompt, 5);
  return formatMemoryContext(memories);
}

async function buildConversationContext(sessionId: string): Promise<string> {
  const messages = await prisma.directAgentMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: "asc" },
    take: 12
  });
  if (messages.length === 0) return "";
  return [
    "[DIRECT AGENT CONVERSATION SO FAR]",
    ...messages.map((message) => `${message.role}: ${redactSecrets(message.content).slice(0, 1200)}`)
  ].join("\n\n");
}

async function buildRecentKingdomContext(userId: string): Promise<string> {
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  const [tasks, workOrders, reports, directSessions] = await Promise.all([
    prisma.task.findMany({
      where: { createdBy: userId, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { title: true, mode: true, status: true, updatedAt: true }
    }),
    prisma.workOrder.findMany({
      where: { createdByUserId: userId, updatedAt: { gte: since } },
      orderBy: { updatedAt: "desc" },
      take: 8,
      select: { title: true, status: true, priority: true, updatedAt: true }
    }),
    prisma.report.findMany({
      where: { createdBy: userId, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { title: true, category: true, importance: true, createdAt: true }
    }),
    prisma.directAgentSession.findMany({
      where: { createdByUserId: userId, createdAt: { gte: since } },
      orderBy: { updatedAt: "desc" },
      take: 8,
      select: { title: true, requestType: true, status: true, updatedAt: true }
    })
  ]);

  return [
    "[RECENT KINGDOM CONTEXT - TODAY]",
    formatContextRows("Tasks", tasks.map((item) => `${item.status} ${item.mode}: ${item.title}`)),
    formatContextRows("Work Orders", workOrders.map((item) => `${item.status} ${item.priority}: ${item.title}`)),
    formatContextRows("Reports", reports.map((item) => `${item.importance} ${item.category}: ${item.title}`)),
    formatContextRows("Direct Agent Sessions", directSessions.map((item) => `${item.status} ${item.requestType}: ${item.title}`))
  ].filter(Boolean).join("\n");
}

function formatContextRows(label: string, rows: string[]): string {
  if (rows.length === 0) return `${label}: none`;
  return `${label}:\n${rows.map((row) => `- ${redactSecrets(row)}`).join("\n")}`;
}

async function persistDirectAgentOutput(input: {
  sessionId: string;
  agent: Agent;
  userId: string;
  projectId: string | null;
  traceId: string;
  messageId: string;
  requestType: DirectAgentRequestType;
  saveMode: DirectAgentSaveMode;
  title: string;
  content: string;
}) {
  let artifactId: string | null = null;
  let knowledgeCandidateId: string | null = null;
  const content = redactSecrets(input.content);

  if (input.saveMode === "ARTIFACT" || input.saveMode === "BOTH") {
    const artifact = await prisma.artifact.create({
      data: {
        projectId: input.projectId,
        title: `${input.agent.title}: ${input.title}`,
        type: artifactTypeForRequest(input.requestType),
        content,
        sourceType: "DIRECT_AGENT_SESSION",
        sourceId: input.sessionId,
        tags: ["direct-agent", input.agent.slug, input.requestType.toLowerCase()],
        dataSource: "DIRECT_AGENT_RESPONSE",
        dataQuality: "REVIEW_REQUIRED",
        provenance: {
          sourceType: "DIRECT_AGENT_MESSAGE",
          sourceId: input.messageId,
          traceId: input.traceId,
          agentId: input.agent.id
        } as Prisma.InputJsonObject,
        traceId: input.traceId,
        createdBySystem: false
      }
    });
    artifactId = artifact.id;
  }

  if ((input.saveMode === "KNOWLEDGE_CANDIDATE" || input.saveMode === "BOTH") && agentCanProposeKnowledge(input.agent)) {
    const candidate = await proposeKnowledgeCandidate({
      agentId: input.agent.id,
      projectId: input.projectId,
      traceId: input.traceId,
      sourceType: "DIRECT_AGENT_MESSAGE",
      sourceId: input.messageId,
      title: `${input.agent.title}: ${input.title}`,
      content,
      summary: summarizeResponse(content),
      category: input.requestType === "RESEARCH_ASSIGNMENT" ? "PROJECT_FACT" : "UNKNOWN",
      confidence: 0.65,
      proposedByAgentId: input.agent.id,
      tags: ["direct-agent", input.agent.slug, input.requestType.toLowerCase()],
      metadata: {
        sessionId: input.sessionId,
        saveMode: input.saveMode,
        requiresReview: true
      }
    });
    knowledgeCandidateId = candidate?.id ?? null;
  }

  return { artifactId, knowledgeCandidateId };
}

function agentCanProposeKnowledge(agent: Agent): boolean {
  const raw = agent.config && typeof agent.config === "object" && !Array.isArray(agent.config)
    ? agent.config as Record<string, unknown>
    : {};
  const memoryPolicy = raw.memoryPolicy && typeof raw.memoryPolicy === "object" && !Array.isArray(raw.memoryPolicy)
    ? raw.memoryPolicy as Record<string, unknown>
    : {};
  return typeof memoryPolicy.canProposeMemoryCandidates === "boolean" ? memoryPolicy.canProposeMemoryCandidates : true;
}

function requestTypeToTaskMode(requestType: DirectAgentRequestType) {
  if (requestType === "RESEARCH_ASSIGNMENT") return "RESEARCH" as const;
  if (requestType === "SUMMARY_ASSIGNMENT" || requestType === "PERSONAL_TASK") return "PLAN" as const;
  return "ASK" as const;
}

function artifactTypeForRequest(requestType: DirectAgentRequestType) {
  if (requestType === "RESEARCH_ASSIGNMENT") return "MARKET_RESEARCH" as const;
  if (requestType === "SUMMARY_ASSIGNMENT") return "GENERAL_NOTE" as const;
  if (requestType === "PERSONAL_TASK") return "PROMPT" as const;
  return "GENERAL_NOTE" as const;
}

function buildTitle(title: string | null | undefined, prompt: string): string {
  const raw = title?.trim() || prompt.split(/\s+/).slice(0, 10).join(" ");
  return redactSecrets(raw).slice(0, 140);
}

function summarizeResponse(content: string): string {
  const normalized = redactSecrets(content).replace(/\s+/g, " ").trim();
  return normalized.length > 280 ? `${normalized.slice(0, 277).trimEnd()}...` : normalized;
}

function toSessionDto(session: any) {
  return {
    id: session.id,
    agentId: session.agentId,
    projectId: session.projectId,
    createdByUserId: session.createdByUserId,
    title: session.title,
    requestType: session.requestType,
    status: session.status,
    summary: session.summary,
    latestTraceId: session.latestTraceId,
    latestUsageRecordId: session.latestUsageRecordId,
    artifactId: session.artifactId,
    knowledgeCandidateId: session.knowledgeCandidateId,
    providerName: session.providerName,
    modelUsed: session.modelUsed,
    fallbackNotice: session.fallbackNotice,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    completedAt: session.completedAt,
    agent: session.agent ? toDirectAgentDto(session.agent) : null,
    project: session.project ?? null,
    messages: Array.isArray(session.messages) ? session.messages.map(toMessageDto) : []
  };
}

function toMessageDto(message: any) {
  return {
    id: message.id,
    sessionId: message.sessionId,
    agentId: message.agentId,
    role: message.role,
    content: message.content,
    traceId: message.traceId,
    usageRecordId: message.usageRecordId,
    metadata: message.metadata,
    createdAt: message.createdAt
  };
}

function toDirectAgentDto(agent: Agent) {
  const displayProfile = extractAgentDisplayProfile(agent.config);
  return {
    id: agent.id,
    slug: agent.slug,
    name: agent.name,
    title: agent.title,
    role: agent.role,
    specialty: agent.specialty,
    description: agent.description,
    skills: agent.skills,
    isActive: agent.isActive,
    displayName: displayProfile.displayName,
    displayTitle: displayProfile.displayTitle,
    avatarUrl: displayProfile.avatarUrl,
    avatarVersion: displayProfile.avatarVersion
  };
}
