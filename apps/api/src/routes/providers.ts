import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { auditLog } from "../services/auditService.js";
import { ensureDefaultAIProviders, listAIProviders } from "../services/aiProviderRegistry.js";

const router = Router();

const providerPatchSchema = z.object({
  isActive: z.boolean().optional(),
  defaultModel: z.string().trim().min(1).max(200).optional(),
  priority: z.coerce.number().int().min(1).max(5000).optional(),
  costTier: z.enum(["FREE", "LOW", "MEDIUM", "HIGH", "PREMIUM"]).optional()
});

router.get("/", async (_req, res, next) => {
  try {
    const providers = await listAIProviders();
    res.json({ providers: providers.map(toPublicProvider) });
  } catch (error) {
    next(error);
  }
});

router.patch("/:id", async (req, res, next) => {
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
    createdAt: provider.createdAt,
    updatedAt: provider.updatedAt
  };
}

export default router;
