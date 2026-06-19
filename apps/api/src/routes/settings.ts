import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { auditLog } from "../services/auditService.js";
import { DEFAULT_SETTINGS, ensureDefaultSettings } from "../services/settingsService.js";
import { ensureDefaultAIProviders } from "../services/aiProviderRegistry.js";

const router = Router();

const settingPatchSchema = z.object({
  value: z.string().trim().max(1000),
  description: z.string().trim().max(500).optional()
});

const DEFAULT_VALUE_MAP = Object.fromEntries(DEFAULT_SETTINGS.map((s) => [s.key, s.value]));

router.get("/", async (_req, res, next) => {
  try {
    await ensureDefaultSettings();
    await ensureDefaultAIProviders();
    const settings = await prisma.setting.findMany({
      orderBy: [{ category: "asc" }, { key: "asc" }]
    });
    const enriched = settings.map((s) => ({ ...s, defaultValue: DEFAULT_VALUE_MAP[s.key] ?? null }));
    res.json({ settings: enriched });
  } catch (error) {
    next(error);
  }
});

router.patch("/:key", async (req, res, next) => {
  try {
    const payload = settingPatchSchema.parse(req.body);
    const existing = await prisma.setting.findUnique({ where: { key: req.params.key } });
    if (!existing) {
      res.status(404).json({ error: "Setting not found" });
      return;
    }
    if (existing.key.toUpperCase().includes("API_KEY")) {
      res.status(400).json({ error: "API keys are configured only through server environment variables" });
      return;
    }

    const valueError = validateSettingValue(existing.key, payload.value);
    if (valueError) {
      res.status(400).json({ error: valueError });
      return;
    }

    const setting = await prisma.setting.update({
      where: { key: existing.key },
      data: {
        value: payload.value,
        ...(payload.description ? { description: payload.description } : {})
      }
    });
    await auditLog({
      userId: req.user?.id,
      action: setting.key.startsWith("LIVING_LOOP_") ? "living_loop_settings_updated" : "update_setting",
      resourceType: "setting",
      resourceId: setting.key,
      metadata: { key: setting.key, category: setting.category }
    });
    res.json({ setting });
  } catch (error) {
    next(error);
  }
});

const BOOLEAN_SETTING_KEYS = [
  "AUTO_SAVE_MEMORY",
  "AUTO_GENERATE_REPORTS",
  "AUTO_ASSIGN_WORK_ORDERS",
  "ROUTING_DEBUG_MODE",
  "ALLOW_PRODUCTION_FALLBACK_IN_SANDBOX",
  "ALLOW_RUNNER_BRANCH_PUSH",
  "ALLOW_RUNNER_PR_CREATE",
  "EXTERNAL_AGENT_BRIDGE_ENABLED",
  "AUTO_SELECT_EXTERNAL_AGENT",
  "ALLOW_EXTERNAL_AGENT_WRITE",
  "ALLOW_EXTERNAL_AGENT_NETWORK",
  "ALLOW_EXTERNAL_AGENT_BRANCH_PUSH",
  "ALLOW_EXTERNAL_AGENT_PR_CREATE",
  "ALLOW_EXTERNAL_AGENT_DEPLOY",
  "REQUIRE_KING_APPROVAL_FOR_EXTERNAL_AGENT",
  "REQUIRE_KING_APPROVAL_FOR_BRANCH_PUSH",
  "REQUIRE_KING_APPROVAL_FOR_PR_CREATE",
  "REQUIRE_KING_APPROVAL_FOR_DEPLOY",
  "LIVING_LOOP_ENABLED",
  "LIVING_LOOP_AUTO_CREATE_VALIDATION_JOBS",
  "LIVING_LOOP_AUTO_SANDBOX_PATCH",
  "LIVING_LOOP_ALLOW_BRANCH_PUSH",
  "LIVING_LOOP_ALLOW_PR_CREATE",
  "LIVING_LOOP_ALLOW_PAID_PROVIDERS"
];

function validateSettingValue(key: string, value: string): string | null {
  if (key === "AI_COST_MODE" && !["low", "balanced", "quality"].includes(value)) return "AI_COST_MODE must be low, balanced, or quality";
  if (key === "COUNCIL_AUTO_WORK_ORDER_MODE" && !["OFF", "DRAFT", "READY"].includes(value)) return "COUNCIL_AUTO_WORK_ORDER_MODE must be OFF, DRAFT, or READY";
  if (key === "UI_LANGUAGE" && !["en", "th"].includes(value)) return "UI_LANGUAGE must be en or th";
  if (BOOLEAN_SETTING_KEYS.includes(key) && !["true", "false"].includes(value)) return `${key} must be true or false`;
  if (key === "AI_TIMEOUT_MS" && (!Number.isFinite(Number(value)) || Number(value) < 1000 || Number(value) > 120000)) return "AI_TIMEOUT_MS must be between 1000 and 120000";
  if (key === "AI_MAX_TOKENS" && (!Number.isFinite(Number(value)) || Number(value) < 64 || Number(value) > 8000)) return "AI_MAX_TOKENS must be between 64 and 8000";
  if (key === "MAX_EXTERNAL_AGENT_RUNTIME_SECONDS" && (!Number.isFinite(Number(value)) || Number(value) < 30 || Number(value) > 7200)) return "MAX_EXTERNAL_AGENT_RUNTIME_SECONDS must be between 30 and 7200";
  if (key === "MAX_EXTERNAL_AGENT_AUTO_RETRIES" && (!Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 5)) return "MAX_EXTERNAL_AGENT_AUTO_RETRIES must be between 0 and 5";
  return null;
}

export default router;
