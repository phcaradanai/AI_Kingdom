import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { auditLog } from "../services/auditService.js";
import { describeFallbackProviderReadiness, isSandboxFallbackModeActive, selectAIProviderRoute } from "../services/aiProviderRouter.js";
import { listAIProviders } from "../services/aiProviderRegistry.js";
import { resolveEffectiveParameters, buildProviderRequestBody } from "../ai/modelParameterResolver.js";

const router = Router();

const agentSchema = z.object({
  slug: z.string().trim().min(2).max(80).regex(/^[a-z0-9-]+$/).optional(),
  name: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(120),
  role: z.string().trim().min(1).max(120),
  specialty: z.string().trim().min(1).max(220),
  description: z.string().trim().max(800).default(""),
  prompt: z.string().trim().max(4000).optional(),
  systemPrompt: z.string().trim().min(1).max(6000),
  skills: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  responseStyle: z.string().trim().max(1000).default("concise, structured, practical"),
  isActive: z.boolean().default(true),
  priority: z.coerce.number().int().min(1).max(1000).default(100),
  preferredProviderId: z.string().trim().max(120).optional().nullable(),
  defaultModel: z.string().trim().max(120).optional().nullable(),
  fallbackProviderIds: z.array(z.string().trim().min(1).max(120)).max(10).default([]),
  fallbackModels: z.array(z.string().trim().min(1).max(200)).max(10).default([]),
  routingPolicy: z.enum(["GLOBAL_ROUTING", "FIXED_PRIMARY", "FIXED_PRIMARY_WITH_FALLBACK", "SANDBOX_FREE_ONLY", "LOWEST_COST", "QUALITY_FIRST"]).optional().nullable(),
  costPreference: z.enum(["LOW", "BALANCED", "QUALITY"]).optional().nullable(),
  temperature: z.coerce.number().min(0).max(2).optional().nullable(),
  maxTokens: z.coerce.number().int().min(64).max(8000).optional().nullable(),
  personalDetail: z.string().trim().max(2000).default(""),
  personality: z.string().trim().max(2000).default(""),
  relationshipWithKing: z.string().trim().max(2000).default(""),
  relationshipWithCouncil: z.string().trim().max(2000).default(""),
  roleBoundaries: z.string().trim().max(2000).default(""),
  allowedActions: z.array(z.string().trim().min(1).max(240)).max(40).default([]),
  forbiddenActions: z.array(z.string().trim().min(1).max(240)).max(40).default([]),
  approvalRequiredFor: z.array(z.string().trim().min(1).max(240)).max(40).default([]),
  canProposeMemoryCandidates: z.boolean().default(true),
  canAutoSaveTrustedMemory: z.boolean().default(false),
  memoryRequiresApproval: z.boolean().default(true),
  allowedMemoryCategories: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  retentionPolicy: z.string().trim().max(1000).default("approved durable memories only; raw reasoning must never be stored as memory"),
  parameterMode: z.enum(["MANUAL", "ROLE_DEFAULT", "PROVIDER_DEFAULT"]).optional().nullable(),
  modelParameters: z.object({
    stream: z.boolean().optional(),
    temperature: z.number().min(0).max(2).optional().nullable(),
    max_tokens: z.number().int().min(64).max(32000).optional().nullable(),
    top_p: z.number().min(0).max(1).optional().nullable(),
    seed: z.number().int().optional().nullable(),
    response_format: z.enum(["none", "json_object", "json_schema"]).optional().nullable(),
    stop: z.array(z.string().min(1).max(120)).max(8).optional().nullable(),
    frequency_penalty: z.number().min(-2).max(2).optional().nullable(),
    presence_penalty: z.number().min(-2).max(2).optional().nullable(),
    repetition_penalty: z.number().min(0).max(2).optional().nullable(),
    top_k: z.number().int().min(0).max(1000).optional().nullable(),
    min_p: z.number().min(0).max(1).optional().nullable(),
    openrouter_route: z.enum(["none", "fallback"]).optional().nullable(),
    openrouter_provider_preferences: z.array(z.string().trim().min(1).max(120)).max(20).optional().nullable(),
    plugins: z.array(z.enum(["web", "file-parser", "response-healing", "context-compression"])).max(10).optional().nullable(),
    reasoning: z.object({
      enabled: z.boolean().optional(),
      effort: z.enum(["none", "minimal", "low", "medium", "high", "xhigh"]).optional(),
      max_tokens: z.number().int().optional().nullable(),
      exclude: z.boolean().optional()
    }).optional(),
    tools: z.object({
      enabled: z.boolean().optional(),
      tool_choice: z.enum(["auto", "none", "required"]).optional()
    }).optional()
  }).optional().nullable()
});

const agentPatchSchema = agentSchema.partial();

router.get("/", async (_req, res, next) => {
  try {
    const agents = await prisma.agent.findMany({
      where: { isTestData: false },
      orderBy: [{ isActive: "desc" }, { priority: "asc" }, { createdAt: "asc" }]
    });
    res.json({ agents: agents.map(toAgentDto) });
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const payload = agentSchema.parse(req.body);
    const slug = payload.slug ?? slugify(payload.title);
    const { modelParameters } = payload;
    const agent = await prisma.agent.create({
      data: {
        slug,
        name: payload.name,
        title: payload.title,
        role: payload.role,
        specialty: payload.specialty,
        description: payload.description,
        prompt: payload.prompt ?? payload.systemPrompt,
        systemPrompt: payload.systemPrompt,
        skills: uniqueLower(payload.skills),
        responseStyle: payload.responseStyle,
        isActive: payload.isActive,
        priority: payload.priority,
        preferredProviderId: payload.preferredProviderId,
        defaultModel: payload.defaultModel,
        fallbackProviderIds: uniqueLower(payload.fallbackProviderIds),
        fallbackModels: payload.fallbackModels,
        routingPolicy: payload.routingPolicy,
        costPreference: payload.costPreference,
        temperature: payload.temperature,
        maxTokens: payload.maxTokens,
        parameterMode: payload.parameterMode,
        config: buildAgentConfig(null, payload) as Prisma.InputJsonObject,
        modelParameters: modelParameters === null ? Prisma.JsonNull : (modelParameters as Prisma.InputJsonValue | undefined)
      }
    });
    await auditLog({
      userId: req.user?.id,
      action: "create_agent",
      resourceType: "agent",
      resourceId: agent.id,
      metadata: { slug: agent.slug, title: agent.title }
    });
    res.status(201).json({ agent: toAgentDto(agent) });
  } catch (error) {
    next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const agent = await prisma.agent.findUnique({ where: { id: req.params.id } });
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    res.json({ agent: toAgentDto(agent) });
  } catch (error) {
    next(error);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const existing = await prisma.agent.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    const payload = agentPatchSchema.parse(req.body);
    if (existing.slug === "grand-vizier" && payload.isActive === false) {
      res.status(400).json({ error: "Grand Vizier cannot be deactivated" });
      return;
    }

    const { modelParameters, ...restPayload } = stripProfileFields(payload);
    const agent = await prisma.agent.update({
      where: { id: existing.id },
      data: {
        ...restPayload,
        ...(payload.systemPrompt ? { prompt: payload.prompt ?? payload.systemPrompt } : {}),
        ...(payload.fallbackProviderIds ? { fallbackProviderIds: uniqueLower(payload.fallbackProviderIds) } : {}),
        ...(payload.skills ? { skills: uniqueLower(payload.skills) } : {}),
        config: buildAgentConfig(existing.config, payload) as Prisma.InputJsonObject,
        ...("modelParameters" in payload ? { modelParameters: modelParameters === null ? Prisma.JsonNull : (modelParameters as Prisma.InputJsonValue | undefined) } : {})
      }
    });
    await auditLog({
      userId: req.user?.id,
      action: "update_agent",
      resourceType: "agent",
      resourceId: agent.id,
      metadata: { slug: agent.slug, isActive: agent.isActive }
    });
    res.json({ agent: toAgentDto(agent) });
  } catch (error) {
    next(error);
  }
});

router.get("/:id/effective-request-preview", async (req, res, next) => {
  try {
    const agent = await prisma.agent.findUnique({ where: { id: req.params.id } });
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    let providerType = "openrouter";
    let providerName = "unknown";
    let configuredProvider = agent.preferredProviderId ?? "global-routing";
    const configuredModel = agent.defaultModel ?? null;
    let actualSentModel = agent.defaultModel ?? "unknown";
    let validationState: Record<string, unknown> = { primaryModel: "Not checked" };

    try {
      const route = await selectAIProviderRoute({ agent, taskMode: "ASK" });
      providerType = route.provider.type;
      providerName = route.provider.name;
      configuredProvider = route.provider.id;
      actualSentModel = route.model;
      validationState = {
        primaryModel: providerValidationLabel(route.provider.modelValidationStatus),
        fallbackProviders: await Promise.all(route.fallbackProviders.map(async (provider) => ({
          id: provider.id,
          name: provider.name,
          ...(await describeFallbackProviderReadiness(provider))
        })))
      };
    } catch {
      // fall through with defaults
    }

    const effective = resolveEffectiveParameters(agent, providerType);
    const latestTrace = await prisma.aIUsageTrace.findFirst({
      where: { agentId: agent.id },
      orderBy: { createdAt: "desc" },
      select: { model: true, metadata: true }
    });
    const latestUsage = await prisma.usageRecord.findFirst({
      where: { agentId: agent.id },
      orderBy: { createdAt: "desc" },
      select: { metadata: true, model: true }
    });
    const finalResponseModel = readMetadataString(latestUsage?.metadata, "responseModel") ?? latestUsage?.model ?? latestTrace?.model ?? null;
    const actualSentBodyPreview = buildProviderRequestBody({
      model: actualSentModel,
      messages: [
        { role: "system", content: "[omitted: safe-preview disabled]" },
        { role: "user", content: "[omitted: safe-preview disabled]" }
      ],
      effective
    });

    res.json({
      preview: {
        configuredProvider,
        configuredModel,
        actualSentModel,
        finalResponseModel,
        streamEnabled: effective.stream,
        reasoningEnabled: effective.reasoning?.enabled ?? false,
        reasoningEffort: effective.reasoning?.effort ?? null,
        reasoningExcluded: effective.reasoning?.exclude ?? true,
        response_format: effective.response_format ?? null,
        validationState,
        actualSentBodyPreview
      },
      parameterMode: effective.mode
    });
  } catch (error) {
    next(error);
  }
});

router.get("/:id/routing-preview", async (req, res, next) => {
  try {
    const agent = await prisma.agent.findUnique({ where: { id: req.params.id } });
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    type ProviderSummary = { id: string; name: string; type: string; environmentMode: string; hasCredentials: boolean; costTier: string; defaultModel: string };
    const allProviders = await listAIProviders({ activeOnly: false });
    let effectiveRoute: { provider: ProviderSummary; model: string; fallbackProviders: ProviderSummary[] } | null = null;

    try {
      const route = await selectAIProviderRoute({ agent, taskMode: "ASK" });
      effectiveRoute = {
        provider: {
          id: route.provider.id,
          name: route.provider.name,
          type: route.provider.type,
          environmentMode: route.provider.environmentMode,
          hasCredentials: route.provider.hasCredentials,
          costTier: route.provider.costTier,
          defaultModel: route.provider.defaultModel
        },
        model: route.model,
        fallbackProviders: route.fallbackProviders.map((fp) => ({
          id: fp.id,
          name: fp.name,
          type: fp.type,
          environmentMode: fp.environmentMode,
          hasCredentials: fp.hasCredentials,
          costTier: fp.costTier,
          defaultModel: fp.defaultModel
        }))
      };
    } catch {
      // provider unavailable — still return agent config
    }

    const latestUsage = await prisma.usageRecord.findFirst({
      where: { agentId: agent.id },
      orderBy: { createdAt: "desc" },
      select: { provider: true, providerId: true, model: true, totalTokens: true, estimatedCostUSD: true, createdAt: true }
    });

    const fallbackProviderDetails = await Promise.all(agent.fallbackProviderIds
      .map((id) => allProviders.find((p) => p.id === id))
      .filter(Boolean)
      .map(async (p) => p && ({ id: p.id, name: p.name, type: p.type, environmentMode: p.environmentMode, hasCredentials: p.hasCredentials, costTier: p.costTier, isActive: p.isActive, readiness: await describeFallbackProviderReadiness(p) })));
    const sandboxFallbackMode = await isSandboxFallbackModeActive();
    const blockedFallbackProviderDetails = await Promise.all(allProviders
      .filter((provider) => provider.environmentMode === "PRODUCTION" && !provider.isFreeTier)
      .map(async (provider) => ({ id: provider.id, name: provider.name, type: provider.type, environmentMode: provider.environmentMode, hasCredentials: provider.hasCredentials, costTier: provider.costTier, isActive: provider.isActive, readiness: await describeFallbackProviderReadiness(provider) })));

    res.json({
      effectiveRoute,
      fallbackProviderDetails,
      blockedFallbackProviderDetails,
      sandboxFallbackMode,
      latestUsage: latestUsage ?? null
    });
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const existing = await prisma.agent.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    if (existing.slug === "grand-vizier") {
      res.status(400).json({ error: "Grand Vizier cannot be deleted" });
      return;
    }

    const agent = await prisma.agent.update({
      where: { id: existing.id },
      data: { isActive: false }
    });
    await auditLog({
      userId: req.user?.id,
      action: "delete_agent",
      resourceType: "agent",
      resourceId: agent.id,
      metadata: { slug: agent.slug }
    });
    res.json({ agent: toAgentDto(agent) });
  } catch (error) {
    next(error);
  }
});

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

function uniqueLower(values: string[]): string[] {
  return [...new Set(values.map((value) => value.toLowerCase()))];
}

export default router;

type AgentPayloadInput = z.infer<typeof agentPatchSchema>;

const DEFAULT_MEMORY_POLICY = {
  canProposeMemoryCandidates: true,
  canAutoSaveTrustedMemory: false,
  memoryRequiresApproval: true,
  allowedMemoryCategories: [] as string[],
  retentionPolicy: "approved durable memories only; raw reasoning must never be stored as memory"
};

function stripProfileFields<T extends Record<string, unknown>>(payload: T): { modelParameters?: unknown } & Record<string, unknown> {
  const {
    personalDetail,
    personality,
    relationshipWithKing,
    relationshipWithCouncil,
    roleBoundaries,
    allowedActions,
    forbiddenActions,
    approvalRequiredFor,
    canProposeMemoryCandidates,
    canAutoSaveTrustedMemory,
    memoryRequiresApproval,
    allowedMemoryCategories,
    retentionPolicy,
    ...rest
  } = payload;
  void personalDetail;
  void personality;
  void relationshipWithKing;
  void relationshipWithCouncil;
  void roleBoundaries;
  void allowedActions;
  void forbiddenActions;
  void approvalRequiredFor;
  void canProposeMemoryCandidates;
  void canAutoSaveTrustedMemory;
  void memoryRequiresApproval;
  void allowedMemoryCategories;
  void retentionPolicy;
  return rest;
}

function toAgentDto(agent: any) {
  const profile = normalizeAgentProfile(agent.config);
  return {
    ...agent,
    ...profile.identity,
    ...profile.authority,
    ...profile.memoryPolicy
  };
}

function normalizeAgentProfile(config: unknown) {
  const raw = asRecord(config);
  const identity = asRecord(raw.royalIdentity);
  const authority = asRecord(raw.authority);
  const memoryPolicy = asRecord(raw.memoryPolicy);
  return {
    identity: {
      personalDetail: stringValue(identity.personalDetail),
      personality: stringValue(identity.personality),
      relationshipWithKing: stringValue(identity.relationshipWithKing),
      relationshipWithCouncil: stringValue(identity.relationshipWithCouncil)
    },
    authority: {
      roleBoundaries: stringValue(authority.roleBoundaries),
      allowedActions: stringArray(authority.allowedActions),
      forbiddenActions: stringArray(authority.forbiddenActions),
      approvalRequiredFor: stringArray(authority.approvalRequiredFor)
    },
    memoryPolicy: {
      canProposeMemoryCandidates: booleanValue(memoryPolicy.canProposeMemoryCandidates, DEFAULT_MEMORY_POLICY.canProposeMemoryCandidates),
      canAutoSaveTrustedMemory: booleanValue(memoryPolicy.canAutoSaveTrustedMemory, DEFAULT_MEMORY_POLICY.canAutoSaveTrustedMemory),
      memoryRequiresApproval: booleanValue(memoryPolicy.memoryRequiresApproval, DEFAULT_MEMORY_POLICY.memoryRequiresApproval),
      allowedMemoryCategories: stringArray(memoryPolicy.allowedMemoryCategories),
      retentionPolicy: stringValue(memoryPolicy.retentionPolicy, DEFAULT_MEMORY_POLICY.retentionPolicy)
    }
  };
}

function buildAgentConfig(existingConfig: unknown, payload: AgentPayloadInput): Record<string, unknown> {
  const raw = asRecord(existingConfig);
  const existing = normalizeAgentProfile(existingConfig);
  return {
    ...raw,
    royalIdentity: {
      ...existing.identity,
      ...pickDefined({
        personalDetail: payload.personalDetail,
        personality: payload.personality,
        relationshipWithKing: payload.relationshipWithKing,
        relationshipWithCouncil: payload.relationshipWithCouncil
      })
    },
    authority: {
      ...existing.authority,
      ...pickDefined({
        roleBoundaries: payload.roleBoundaries,
        allowedActions: payload.allowedActions,
        forbiddenActions: payload.forbiddenActions,
        approvalRequiredFor: payload.approvalRequiredFor
      })
    },
    memoryPolicy: {
      ...existing.memoryPolicy,
      ...pickDefined({
        canProposeMemoryCandidates: payload.canProposeMemoryCandidates,
        canAutoSaveTrustedMemory: payload.canAutoSaveTrustedMemory,
        memoryRequiresApproval: payload.memoryRequiresApproval,
        allowedMemoryCategories: payload.allowedMemoryCategories,
        retentionPolicy: payload.retentionPolicy
      })
    }
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function pickDefined(values: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined));
}

function providerValidationLabel(status: string | null | undefined): "Valid" | "Invalid" | "Not checked" {
  if (status === "VALID") return "Valid";
  if (status === "INVALID_MODEL") return "Invalid";
  return "Not checked";
}

function readMetadataString(metadata: unknown, key: string): string | null {
  const raw = asRecord(metadata);
  const value = raw[key];
  return typeof value === "string" && value ? value : null;
}
