import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { auditLog } from "../services/auditService.js";
import { ensureDefaultAIProviders, listAIProviders, getAIProvider, createAIProvider, deleteAIProvider } from "../services/aiProviderRegistry.js";
import { validateOpenRouterModels } from "../services/openRouterModelService.js";
import { requireRole } from "../middleware/rbac.js";
import { createAIProviderFromConfig } from "../ai/providerFactory.js";
import { generateWithFallback } from "../ai/generateWithFallback.js";
import { calculateCostUSDFromRegistry } from "../services/modelPricingService.js";
import {
  addTraceStep,
  attachUsageRecordStep,
  buildTraceContext,
  completeAIUsageTrace,
  completeTraceStep,
  createAIUsageTrace,
  failAIUsageTrace,
  startTraceStep
} from "../services/aiUsageTraceService.js";
import { buildUsageAttribution } from "../services/usageAttributionService.js";

const router = Router();

const providerPatchSchema = z.object({
  isActive: z.boolean().optional(),
  defaultModel: z.string().trim().min(1).max(200).optional(),
  priority: z.coerce.number().int().min(1).max(5000).optional(),
  costTier: z.enum(["FREE", "LOW", "MEDIUM", "HIGH", "PREMIUM"]).optional()
});

const providerCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  type: z.string().trim().min(1).max(50),
  baseUrl: z.string().url().optional().or(z.literal("")),
  defaultModel: z.string().trim().max(200).optional(), // allowed empty for local sandbox providers
  priority: z.coerce.number().int().min(1).max(5000),
  costTier: z.enum(["FREE", "LOW", "MEDIUM", "HIGH", "PREMIUM"]),
  capabilities: z.object({
    supportsChat: z.boolean(),
    supportsTools: z.boolean().optional(),
    supportsVision: z.boolean().optional(),
    supportsJsonMode: z.boolean().optional(),
  }),
  credentialEnvKey: z.string().trim()
    .max(100)
    .regex(/^[A-Z0-9_]*$/, "Must be a valid environment variable name")
    .refine((val) => !val.startsWith("sk-") && !val.includes("-"), "Must be an environment variable name, not a literal secret key")
    .optional()
    .or(z.literal(""))
});

const providerTestSchema = z.object({
  prompt: z.string().trim().min(1).max(1000).optional()
});

router.get("/", async (_req, res, next) => {
  try {
    const providers = await listAIProviders();
    res.json({ providers: providers.map(toPublicProvider) });
  } catch (error) {
    next(error);
  }
});

router.post("/", requireRole("KING"), async (req, res, next) => {
  try {
    const payload = providerCreateSchema.parse(req.body);
    const id = `custom-${Date.now()}`;
    
    const provider = await createAIProvider({
      id,
      name: payload.name,
      type: payload.type,
      baseUrl: payload.baseUrl || null,
      defaultModel: payload.defaultModel || "",
      isActive: true,
      priority: payload.priority,
      costTier: payload.costTier,
      capabilities: payload.capabilities,
      credentialEnvKey: payload.credentialEnvKey || undefined
    });

    await auditLog({
      userId: req.user?.id,
      action: "create_ai_provider",
      resourceType: "ai_provider",
      resourceId: provider.id,
      metadata: { id: provider.id, name: provider.name, type: provider.type }
    });

    const providers = await listAIProviders({ syncDefaults: false });
    const merged = providers.find((item) => item.id === provider.id);
    res.json({ provider: merged ? toPublicProvider(merged) : provider });
  } catch (error) {
    next(error);
  }
});

router.patch("/:id", requireRole("KING"), async (req, res, next) => {
  try {
    await ensureDefaultAIProviders();
    const payload = providerPatchSchema.parse(req.body);
    const existing = await prisma.aIProvider.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: "Provider not found" });
      return;
    }

    const provider = await prisma.aIProvider.update({
      where: { id: existing.id },
      data: payload
    });

    await auditLog({
      userId: req.user?.id,
      action: "update_ai_provider",
      resourceType: "ai_provider",
      resourceId: provider.id,
      metadata: { id: provider.id, isActive: provider.isActive, defaultModel: provider.defaultModel, priority: provider.priority, costTier: provider.costTier }
    });

    const providers = await listAIProviders({ syncDefaults: false });
    const merged = providers.find((item) => item.id === provider.id);
    res.json({ provider: merged ? toPublicProvider(merged) : provider });
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", requireRole("KING"), async (req, res, next) => {
  try {
    const existing = await prisma.aIProvider.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: "Provider not found" });
      return;
    }

    await deleteAIProvider(existing.id);

    await auditLog({
      userId: req.user?.id,
      action: "delete_ai_provider",
      resourceType: "ai_provider",
      resourceId: existing.id,
      metadata: { id: existing.id, name: existing.name }
    });

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.post("/validate-models", requireRole("KING"), async (req, res, next) => {
  try {
    await validateOpenRouterModels(["openrouter", "openrouter-free"]);
    await auditLog({
      userId: req.user?.id,
      action: "validate_openrouter_models",
      resourceType: "ai_provider",
      resourceId: "openrouter",
      metadata: { validatedProviders: ["openrouter", "openrouter-free"] }
    });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/test", requireRole("KING"), async (req, res, next) => {
  let traceId: string | null = null;
  try {
    await ensureDefaultAIProviders();
    const payload = providerTestSchema.parse(req.body);
    const providerId = req.params.id;
    if (!providerId) {
      res.status(400).json({ error: "Provider id is required" });
      return;
    }
    const providers = await listAIProviders({ syncDefaults: false });
    const provider = providers.find((item) => item.id === providerId) ?? await getAIProvider(providerId);
    if (!provider) {
      res.status(404).json({ error: "Provider not found" });
      return;
    }

    const prompt = payload.prompt ?? "Provider test call. Reply with a concise readiness confirmation.";
    const trace = await createAIUsageTrace({
      actorUserId: req.user?.id,
      actorRole: req.user?.role,
      triggerType: "PROVIDER_TEST",
      triggerRoute: "POST /api/providers/:id/test",
      triggerLabel: `Provider test: ${provider.name}`,
      sourceType: "PROVIDER_TEST",
      sourceId: provider.id,
      operation: "provider_test_call",
      purpose: "Provider test call",
      providerId: provider.id,
      providerType: provider.type,
      providerName: provider.name,
      model: provider.defaultModel,
      prompt,
      metadata: { providerId: provider.id },
      attributionStatus: "TRUSTED"
    });
    traceId = trace.traceId;
    const traceContext = buildTraceContext({
      traceId,
      triggerType: "PROVIDER_TEST",
      sourceType: "PROVIDER_TEST",
      sourceId: provider.id,
      operation: "provider_test_call",
      purpose: "Provider test call",
      attributionStatus: "TRUSTED"
    });

    // Timeline: PROVIDER_CALL step
    const providerTestStep = await startTraceStep({
      traceId,
      stepType: "PROVIDER_CALL",
      operation: "provider_test_call",
      title: `Provider test: ${provider.name}`,
      detail: `${provider.name} · ${provider.defaultModel}`,
      providerId: provider.id,
      providerType: provider.type,
      providerName: provider.name,
      model: provider.defaultModel,
      promptPreview: prompt
    });

    const generated = await generateWithFallback([
      { provider: createAIProviderFromConfig(provider), model: provider.defaultModel }
    ], {
      command: prompt,
      mode: "ASK",
      agentName: "Provider Test",
      agentRole: "Provider Test",
      agentSkills: ["provider-readiness"],
      systemPrompt: "You are testing provider connectivity. Do not include secrets.",
      responseStyle: "concise",
      maxTokens: 120
    }, traceContext);

    // Timeline: Complete PROVIDER_CALL step
    await completeTraceStep(providerTestStep.id, {
      responsePreview: generated.response,
      tokensUsed: generated.usage.totalTokens,
      metadata: { providerUsed: generated.providerName, modelUsed: generated.modelUsed }
    });

    const cost = await calculateCostUSDFromRegistry(generated.providerName, generated.modelUsed, generated.usage);
    const usageRecord = await prisma.usageRecord.create({
      data: {
        traceId,
        attributionStatus: "TRUSTED",
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
          purpose: "Provider test call",
          sourceType: "PROVIDER_TEST",
          sourceId: provider.id,
          operation: "provider_test_call",
          requestLabel: `Provider test: ${provider.name}`,
          prompt,
          response: generated.response,
          metadata: { providerId: provider.id, pricingStatus: cost.pricingStatus }
        })
      }
    });

    // Timeline: USAGE_RECORDED step
    await attachUsageRecordStep(traceId, {
      id: usageRecord.id,
      provider: generated.providerName,
      providerId: generated.providerId ?? generated.providerName,
      model: generated.modelUsed,
      totalTokens: generated.usage.totalTokens,
      estimatedCostUSD: cost.costUSD,
      pricingStatus: cost.pricingStatus
    });

    // Timeline: TRACE_COMPLETED step
    await addTraceStep({
      traceId,
      stepType: "TRACE_COMPLETED",
      operation: "trace_completed",
      title: "Provider test completed",
      providerId: provider.id,
      providerName: generated.providerName,
      model: generated.modelUsed,
      tokensUsed: generated.usage.totalTokens,
      estimatedCostUSD: cost.costUSD
    });

    await completeAIUsageTrace(traceId, generated.response, {
      attributionStatus: "TRUSTED",
      usageRecordId: usageRecord.id,
      tokensUsed: generated.usage.totalTokens,
      estimatedCostUSD: cost.costUSD,
      fallbackNotice: generated.fallbackNotice ?? null
    });

    await auditLog({
      userId: req.user?.id,
      action: "test_ai_provider",
      resourceType: "ai_provider",
      resourceId: provider.id,
      metadata: { traceId, usageRecordId: usageRecord.id }
    });

    res.json({
      ok: true,
      traceId,
      usageRecordId: usageRecord.id,
      provider: generated.providerName,
      model: generated.modelUsed,
      responsePreview: generated.response.slice(0, 500)
    });
  } catch (error) {
    if (traceId) await failAIUsageTrace(traceId, error).catch(() => undefined);
    next(error);
  }
});

function toPublicProvider(provider: Awaited<ReturnType<typeof listAIProviders>>[number]) {
  return {
    id: provider.id,
    name: provider.name,
    type: provider.type,
    baseUrl: provider.baseUrl,
    defaultModel: provider.defaultModel,
    isActive: provider.isActive,
    priority: provider.priority,
    supportsChat: provider.supportsChat,
    supportsTools: provider.supportsTools ?? false,
    supportsVision: provider.supportsVision ?? false,
    supportsJsonMode: provider.supportsJsonMode ?? false,
    costTier: provider.costTier,
    capabilities: provider.capabilities,
    hasCredentials: provider.hasCredentials,
    environmentMode: provider.environmentMode,
    maxTokensPerRequest: provider.maxTokensPerRequest,
    maxRequestsPerDay: provider.maxRequestsPerDay,
    maxTokensPerDay: provider.maxTokensPerDay,
    maxEstimatedCostPerDay: provider.maxEstimatedCostPerDay,
    allowSensitiveContext: provider.allowSensitiveContext,
    isFreeTier: provider.isFreeTier,
    notes: provider.notes,
    modelValidationStatus: provider.modelValidationStatus,
    lastValidationTime: provider.lastValidationTime,
    config: provider.config ? {
      openRouterModels: provider.config.openRouterModels
    } : null,
    createdAt: provider.createdAt,
    updatedAt: provider.updatedAt
  };
}

export default router;
