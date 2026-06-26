import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { requireRole } from "../middleware/rbac.js";
import { auditLog } from "../services/auditService.js";
import { ensureDefaultExternalAgents } from "../services/externalAgentWorkOrderService.js";
import { getExternalAgentReadiness } from "../services/externalAgentReadinessService.js";
import { getBooleanSetting } from "../services/settingsService.js";
import { requestCliProbe, getProbeResult, isProbeInFlight } from "../services/cliProbeService.js";

const router = Router();

const externalAgentSchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: z.enum(["CLAUDE_CODE", "CODEX", "CLINE", "KILO", "ANTIGRAVITY", "HERMES", "OPENCODE", "CURSOR", "DEVIN", "GENERIC_CLI", "MANUAL_ONLY", "CUSTOM"]),
  roleTitle: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1200).default(""),
  capabilities: z.array(z.string().trim().min(1).max(100)).max(30).default([]),
  executionMode: z.enum(["MANUAL_COPY_PASTE", "CLI_MANUAL", "API", "FUTURE_AUTOMATED"]).default("MANUAL_COPY_PASTE"),
  command: z.string().trim().max(2000).optional().nullable(),
  workingDirectory: z.string().trim().max(1000).optional().nullable(),
  environmentProfile: z.string().trim().max(120).optional().nullable(),
  isActive: z.boolean().default(true),
  bridgeEnabled: z.boolean().default(false),
  maxRuntimeSeconds: z.number().int().min(30).max(7200).default(900),
  requiresApproval: z.boolean().default(true),
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

// Readiness: which external agents can the King pick right now (config + live runner probe).
// Declared before "/:id" so it is not shadowed by the param route.
router.get("/readiness", async (_req, res, next) => {
  try {
    await ensureDefaultExternalAgents();
    const readiness = await getExternalAgentReadiness();
    res.json(readiness);
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

router.post("/:id/test", requireRole("KING"), async (req, res, next) => {
  try {
    const externalAgent = await prisma.externalAgent.findUnique({ where: { id: req.params.id } });
    if (!externalAgent) {
      res.status(404).json({ error: "External agent not found" });
      return;
    }
    const bridgeEnabled = await getBooleanSetting("EXTERNAL_AGENT_BRIDGE_ENABLED", false);
    const issues = [
      bridgeEnabled ? null : "EXTERNAL_AGENT_BRIDGE_ENABLED is false",
      externalAgent.isActive ? null : "External agent is inactive",
      externalAgent.bridgeEnabled ? null : "Agent bridgeEnabled is false",
      externalAgent.type === "MANUAL_ONLY" ? "Manual-only agents cannot be run by the bridge" : null,
      externalAgent.command?.trim() ? null : "Agent command template is empty"
    ].filter((item): item is string => Boolean(item));
    const prompt = [
      "# AI Kingdom External Agent Bridge Test",
      "",
      "Reply with one short line that includes the tool name and version if available.",
      "Do not edit files.",
      "Do not run network, push, create PRs, deploy, or print environment variables."
    ].join("\n");

    await auditLog({
      userId: req.user?.id,
      action: "test_external_agent_bridge_config",
      resourceType: "external_agent",
      resourceId: externalAgent.id,
      metadata: { bridgeEnabled, issues, type: externalAgent.type }
    }).catch(() => undefined);

    res.json({
      test: {
        status: issues.length === 0 ? "READY" : "BLOCKED",
        issues,
        prompt,
        commandTemplate: externalAgent.command,
        maxRuntimeSeconds: externalAgent.maxRuntimeSeconds,
        captures: ["stdout", "stderr", "exitCode", "durationMs", "version/output preview"]
      }
    });
  } catch (error) {
    next(error);
  }
});

/** POST /:id/request-probe — King requests an on-demand live CLI probe for this agent */
router.post("/:id/request-probe", requireRole("KING"), async (req, res, next) => {
  try {
    const agent = await prisma.externalAgent.findUnique({ where: { id: req.params.id } });
    if (!agent) {
      res.status(404).json({ error: "External agent not found" });
      return;
    }

    const runner = await prisma.agentRunner.findFirst({
      where: { status: "ONLINE" },
      orderBy: { lastHeartbeatAt: "desc" }
    });
    if (!runner) {
      res.status(409).json({ error: "No online runner available — start the runner to enable live probes" });
      return;
    }

    requestCliProbe(agent.id, agent.type, runner.id);

    await auditLog({
      userId: req.user?.id,
      action: "request_cli_probe",
      resourceType: "external_agent",
      resourceId: agent.id,
      metadata: { type: agent.type, runnerId: runner.id }
    }).catch(() => undefined);

    res.json({ requested: true, agentId: agent.id, runnerId: runner.id });
  } catch (err) {
    next(err);
  }
});

/** GET /:id/probe-result — poll for the latest live probe result */
router.get("/:id/probe-result", requireRole("KING"), async (req, res, next) => {
  try {
    const agentId = req.params.id as string;
    const result = getProbeResult(agentId);
    const inFlight = !result && isProbeInFlight(agentId, "");
    res.json({ result, inFlight });
  } catch (err) {
    next(err);
  }
});

export default router;
