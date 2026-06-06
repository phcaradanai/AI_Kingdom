import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { auditLog } from "../services/auditService.js";
import { ensureDefaultSettings } from "../services/settingsService.js";
import { ensureDefaultAIProviders } from "../services/aiProviderRegistry.js";

const router = Router();

const settingPatchSchema = z.object({
  value: z.string().trim().min(1).max(1000),
  description: z.string().trim().max(500).optional()
});

router.get("/", async (_req, res, next) => {
  try {
    await ensureDefaultSettings();
    await ensureDefaultAIProviders();
    const settings = await prisma.setting.findMany({
      orderBy: [{ category: "asc" }, { key: "asc" }]
    });
    res.json({ settings });
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
      action: "update_setting",
      resourceType: "setting",
      resourceId: setting.key,
      metadata: { key: setting.key, category: setting.category }
    });
    res.json({ setting });
  } catch (error) {
    next(error);
  }
});

function validateSettingValue(key: string, value: string): string | null {
  if (key === "AI_PROVIDER" && !["mock", "openai-compatible", "openai", "openrouter", "deepseek"].includes(value)) return "AI_PROVIDER must be a supported provider id";
  if (key === "AI_COST_MODE" && !["low", "balanced", "quality"].includes(value)) return "AI_COST_MODE must be low, balanced, or quality";
  if (key === "DEFAULT_TASK_MODE" && !["ASK", "PLAN", "RESEARCH", "BUILD"].includes(value)) return "DEFAULT_TASK_MODE is invalid";
  if (["AUTO_PROCESS_TASKS", "AUTO_SAVE_MEMORY", "AUTO_GENERATE_REPORTS"].includes(key) && !["true", "false"].includes(value)) return `${key} must be true or false`;
  if (key === "AI_TIMEOUT_MS" && (!Number.isFinite(Number(value)) || Number(value) < 1000 || Number(value) > 120000)) return "AI_TIMEOUT_MS must be between 1000 and 120000";
  if (key === "AI_MAX_TOKENS" && (!Number.isFinite(Number(value)) || Number(value) < 64 || Number(value) > 8000)) return "AI_MAX_TOKENS must be between 64 and 8000";
  return null;
}

export default router;
