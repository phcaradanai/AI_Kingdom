import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { auditLog } from "../services/auditService.js";
import { ensureDefaultAIProviders, listAIProviders, createAIProvider, deleteAIProvider } from "../services/aiProviderRegistry.js";
import { requireRole } from "../middleware/rbac.js";

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
  defaultModel: z.string().trim().max(200).optional(), // allowed empty for mock
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
