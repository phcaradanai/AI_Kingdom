import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { auditLog } from "../services/auditService.js";

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
  costPreference: z.enum(["LOW", "BALANCED", "QUALITY"]).optional().nullable(),
  temperature: z.coerce.number().min(0).max(2).optional().nullable(),
  maxTokens: z.coerce.number().int().min(64).max(8000).optional().nullable()
});

const agentPatchSchema = agentSchema.partial();

router.get("/", async (_req, res, next) => {
  try {
    const agents = await prisma.agent.findMany({
      orderBy: [{ isActive: "desc" }, { priority: "asc" }, { createdAt: "asc" }]
    });
    res.json({ agents });
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const payload = agentSchema.parse(req.body);
    const slug = payload.slug ?? slugify(payload.title);
    const agent = await prisma.agent.create({
      data: {
        ...payload,
        slug,
        prompt: payload.prompt ?? payload.systemPrompt,
        specialty: payload.specialty,
        skills: uniqueLower(payload.skills)
      }
    });
    await auditLog({
      userId: req.user?.id,
      action: "create_agent",
      resourceType: "agent",
      resourceId: agent.id,
      metadata: { slug: agent.slug, title: agent.title }
    });
    res.status(201).json({ agent });
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
    res.json({ agent });
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

    const agent = await prisma.agent.update({
      where: { id: existing.id },
      data: {
        ...payload,
        ...(payload.systemPrompt ? { prompt: payload.prompt ?? payload.systemPrompt } : {}),
        ...(payload.fallbackProviderIds ? { fallbackProviderIds: uniqueLower(payload.fallbackProviderIds) } : {}),
        ...(payload.skills ? { skills: uniqueLower(payload.skills) } : {})
      }
    });
    await auditLog({
      userId: req.user?.id,
      action: "update_agent",
      resourceType: "agent",
      resourceId: agent.id,
      metadata: { slug: agent.slug, isActive: agent.isActive }
    });
    res.json({ agent });
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
    res.json({ agent });
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
