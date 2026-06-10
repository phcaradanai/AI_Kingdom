import type { SettingsCategory } from "@prisma/client";
import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";

export const DEFAULT_SETTINGS: Array<{ key: string; value: string; category: SettingsCategory; description: string }> = [
  { key: "AI_COST_MODE", value: env.AI_COST_MODE, category: "AI", description: "Provider routing cost preference: low, balanced, or quality." },
  { key: "AI_TIMEOUT_MS", value: String(env.AI_TIMEOUT_MS), category: "AI", description: "Request timeout for AI calls in milliseconds." },
  { key: "AI_MAX_TOKENS", value: String(env.AI_MAX_TOKENS), category: "AI", description: "Default maximum output tokens for AI calls." },
  { key: "AUTO_SAVE_MEMORY", value: "true", category: "SYSTEM", description: "Automatically save concise memories after council completion." },
  { key: "AUTO_GENERATE_REPORTS", value: "true", category: "SYSTEM", description: "Automatically generate Royal Reports after council completion." },
  { key: "AUTO_PLAN_WORK_ORDERS", value: "false", category: "SYSTEM", description: "Automatically run the Planner Agent after each completed council session to generate draft work orders for King review." },
  { key: "AUTO_ASSIGN_WORK_ORDERS", value: "true", category: "SYSTEM", description: "Automatically assign a suitable internal agent to planner-created draft work orders based on skill and specialty matching." },
  { key: "ROUTING_DEBUG_MODE", value: "false", category: "SYSTEM", description: "When enabled, low-confidence and debug-only routing decisions are stored as inbox items (hidden by default) for admin review." },
  { key: "ALLOW_PRODUCTION_FALLBACK_IN_SANDBOX", value: "false", category: "SYSTEM", description: "Allow production provider calls when running outside production mode. Keep disabled unless actively testing production routes." },
  { key: "DAILY_BUDGET_LIMIT_USD", value: "", category: "SYSTEM", description: "Daily spend limit in USD. Leave empty to disable the limit." },
  { key: "MONTHLY_BUDGET_LIMIT_USD", value: "", category: "SYSTEM", description: "Monthly spend limit in USD. Leave empty to disable the limit." },
  { key: "ALLOW_RUNNER_BRANCH_PUSH", value: "false", category: "SYSTEM", description: "Allow the runner to push a safe feature branch after King approval. Branch name format: kingdom/job-<id>-<slug>." },
  { key: "ALLOW_RUNNER_PR_CREATE", value: "false", category: "SYSTEM", description: "Allow the runner to create a GitHub PR after King approval of a patch artifact." }
];

// Keys that were removed from active settings and should be cleaned up from existing databases.
const DEPRECATED_SETTING_KEYS = ["AI_PROVIDER", "OPENAI_MODEL", "DEFAULT_TASK_MODE", "AUTO_PROCESS_TASKS"];

export async function ensureDefaultSettings() {
  for (const setting of DEFAULT_SETTINGS) {
    await prisma.setting.upsert({
      where: { key: setting.key },
      update: {},
      create: setting
    });
  }
  if (DEPRECATED_SETTING_KEYS.length > 0) {
    await prisma.setting.deleteMany({ where: { key: { in: DEPRECATED_SETTING_KEYS } } });
  }
}

export async function getSettingValue(key: string, fallback = ""): Promise<string> {
  const setting = await prisma.setting.findUnique({ where: { key } });
  return setting?.value ?? fallback;
}

export async function getBooleanSetting(key: string, fallback: boolean): Promise<boolean> {
  const value = await getSettingValue(key, String(fallback));
  return ["true", "1", "yes", "on"].includes(value.toLowerCase());
}

export async function getNumberSetting(key: string, fallback: number): Promise<number> {
  const value = Number(await getSettingValue(key, String(fallback)));
  return Number.isFinite(value) ? value : fallback;
}
