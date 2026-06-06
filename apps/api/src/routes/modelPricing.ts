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
  inputPerMillion: z.number().min(0),
  outputPerMillion: z.number().min(0),
  currency: z.string().trim().max(10).default("USD"),
  notes: z.string().trim().max(500).optional().nullable(),
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
    const record = await prisma.aIModelPricing.upsert({
      where: { providerType_model: { providerType: payload.providerType, model: payload.model } },
      update: { ...payload, source: "manual" },
      create: { ...payload, source: "manual" }
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
    const record = await prisma.aIModelPricing.update({ where: { id: existing.id }, data: { ...payload, source: "manual" } });
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
