import type { SettingsCategory } from "@prisma/client";
import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";

export const DEFAULT_SETTINGS: Array<{ key: string; value: string; category: SettingsCategory; description: string }> = [
  { key: "AI_PROVIDER", value: env.AI_PROVIDER, category: "AI", description: "Legacy default provider hint. Routing policy can override this per task or agent." },
  { key: "AI_COST_MODE", value: env.AI_COST_MODE, category: "AI", description: "Provider routing cost preference: low, balanced, or quality." },
  { key: "OPENAI_MODEL", value: env.OPENAI_MODEL, category: "AI", description: "Default OpenAI-compatible model for agents without overrides." },
  { key: "AI_TIMEOUT_MS", value: String(env.AI_TIMEOUT_MS), category: "AI", description: "Request timeout for AI calls in milliseconds." },
  { key: "AI_MAX_TOKENS", value: String(env.AI_MAX_TOKENS), category: "AI", description: "Default maximum output tokens for AI calls." },
  { key: "DEFAULT_TASK_MODE", value: "ASK", category: "SYSTEM", description: "Default task mode in the Throne Room." },
  { key: "AUTO_PROCESS_TASKS", value: "false", category: "SYSTEM", description: "Automatically send new tasks to the Grand Vizier." },
  { key: "AUTO_SAVE_MEMORY", value: "true", category: "SYSTEM", description: "Automatically save concise memories after council completion." },
  { key: "AUTO_GENERATE_REPORTS", value: "true", category: "SYSTEM", description: "Automatically generate Royal Reports after council completion." },
  { key: "DAILY_BUDGET_LIMIT_USD", value: "", category: "SYSTEM", description: "Daily spend limit in USD. Empty string disables the limit." },
  { key: "MONTHLY_BUDGET_LIMIT_USD", value: "", category: "SYSTEM", description: "Monthly spend limit in USD. Empty string disables the limit." }
];

export async function ensureDefaultSettings() {
  for (const setting of DEFAULT_SETTINGS) {
    await prisma.setting.upsert({
      where: { key: setting.key },
      update: {},
      create: setting
    });
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
