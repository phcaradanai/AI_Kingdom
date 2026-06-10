import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { requireRole } from "../middleware/rbac.js";
import { invalidatePricingCache } from "../services/modelPricingService.js";

const router = Router();

const pricingSchema = z.object({
  providerType: z.string().trim().min(1).max(80),
  model: z.string().trim().min(1).max(200),
  displayName: z.string().trim().max(200).optional().nullable(),
  canonicalModel: z.string().trim().max(200).optional().nullable(),
  inputPerMillion: z.number().min(0).optional().nullable(),
  outputPerMillion: z.number().min(0),
  inputCacheHitPerMillion: z.number().min(0).optional().nullable(),
  inputCacheMissPerMillion: z.number().min(0).optional().nullable(),
  currency: z.string().trim().max(10).default("USD"),
  notes: z.string().trim().max(500).optional().nullable(),
  isAlias: z.boolean().optional().default(false),
  aliasOf: z.string().trim().max(200).optional().nullable(),
  isDeprecated: z.boolean().optional().default(false),
  deprecationDate: z.string().datetime().optional().nullable().transform((v) => (v ? new Date(v) : null)),
  concurrencyLimit: z.number().int().positive().optional().nullable(),
  supportsThinking: z.boolean().optional().default(false),
  defaultThinkingEnabled: z.boolean().optional().default(false),
  supportedReasoningEfforts: z.array(z.string()).optional().default([]),
  unsupportedThinkingParams: z.array(z.string()).optional().default([]),
  isActive: z.boolean().default(true)
});

router.get("/", async (_req, res, next) => {
  try {
    const records = await prisma.aIModelPricing.findMany({ orderBy: [{ providerType: "asc" }, { model: "asc" }] });
    res.json({ modelPricing: records });
  } catch (error) {
    next(error);
  }
});

router.post("/", requireRole("KING"), async (req, res, next) => {
  try {
    const payload = pricingSchema.parse(req.body);
    const normalized = { ...payload, providerType: payload.providerType.toLowerCase() };
    const record = await prisma.aIModelPricing.upsert({
      where: { providerType_model: { providerType: normalized.providerType, model: normalized.model } },
      update: { ...normalized, source: "manual" },
      create: { ...normalized, source: "manual" }
    });
    invalidatePricingCache();
    res.status(201).json({ record });
  } catch (error) {
    next(error);
  }
});

router.put("/:id", requireRole("KING"), async (req, res, next) => {
  try {
    const existing = await prisma.aIModelPricing.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: "Pricing record not found" });
      return;
    }
    const payload = pricingSchema.partial().parse(req.body);
    const normalized = payload.providerType ? { ...payload, providerType: payload.providerType.toLowerCase() } : payload;
    const record = await prisma.aIModelPricing.update({ where: { id: existing.id }, data: { ...normalized, source: "manual" } });
    invalidatePricingCache();
    res.json({ record });
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", requireRole("KING"), async (req, res, next) => {
  try {
    const existing = await prisma.aIModelPricing.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: "Pricing record not found" });
      return;
    }
    await prisma.aIModelPricing.update({ where: { id: existing.id }, data: { isActive: false } });
    invalidatePricingCache();
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
