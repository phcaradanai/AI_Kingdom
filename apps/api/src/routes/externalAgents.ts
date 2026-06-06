import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { requireRole } from "../middleware/rbac.js";
import { auditLog } from "../services/auditService.js";
import { ensureDefaultExternalAgents } from "../services/externalAgentWorkOrderService.js";

const router = Router();

const externalAgentSchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: z.enum(["CLAUDE_CODE", "CODEX", "CLINE", "KILO", "ANTIGRAVITY", "HERMES", "OPENCODE", "CUSTOM"]),
  roleTitle: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1200).default(""),
  capabilities: z.array(z.string().trim().min(1).max(100)).max(30).default([]),
  executionMode: z.enum(["MANUAL_COPY_PASTE", "CLI_MANUAL", "API", "FUTURE_AUTOMATED"]).default("MANUAL_COPY_PASTE"),
  isActive: z.boolean().default(true),
  safetyLevel: z.enum(["LOW_RISK", "MEDIUM_RISK", "HIGH_RISK"]).default("MEDIUM_RISK")
});

router.get("/", async (_req, res, next) => {
  try {
    await ensureDefaultExternalAgents();
    const externalAgents = await prisma.externalAgent.findMany({
      orderBy: [{ isActive: "desc" }, { name: "asc" }]
    });
    res.json({ externalAgents });
  } catch (error) {
    next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const externalAgent = await prisma.externalAgent.findUnique({ where: { id: req.params.id } });
    if (!externalAgent) {
      res.status(404).json({ error: "External agent not found" });
      return;
    }
    res.json({ externalAgent });
  } catch (error) {
    next(error);
  }
});

router.post("/", requireRole("KING"), async (req, res, next) => {
  try {
    const payload = externalAgentSchema.parse(req.body);
    const externalAgent = await prisma.externalAgent.create({ data: payload });
    await auditLog({
      userId: req.user?.id,
      action: "create_external_agent",
      resourceType: "external_agent",
      resourceId: externalAgent.id,
      metadata: { type: externalAgent.type, name: externalAgent.name }
    });
    res.status(201).json({ externalAgent });
  } catch (error) {
    next(error);
  }
});

router.patch("/:id", requireRole("KING"), async (req, res, next) => {
  try {
    const existing = await prisma.externalAgent.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: "External agent not found" });
      return;
    }
    const payload = externalAgentSchema.partial().parse(req.body);
    const externalAgent = await prisma.externalAgent.update({ where: { id: existing.id }, data: payload });
    await auditLog({
      userId: req.user?.id,
      action: "update_external_agent",
      resourceType: "external_agent",
      resourceId: externalAgent.id,
      metadata: { type: externalAgent.type, isActive: externalAgent.isActive }
    });
    res.json({ externalAgent });
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", requireRole("KING"), async (req, res, next) => {
  try {
    const existing = await prisma.externalAgent.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: "External agent not found" });
      return;
    }
    const externalAgent = await prisma.externalAgent.update({
      where: { id: existing.id },
      data: { isActive: false }
    });
    await auditLog({
      userId: req.user?.id,
      action: "delete_external_agent",
      resourceType: "external_agent",
      resourceId: externalAgent.id,
      metadata: { softDelete: true, type: externalAgent.type }
    });
    res.json({ externalAgent });
  } catch (error) {
    next(error);
  }
});

export default router;
