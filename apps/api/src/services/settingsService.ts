import type { SettingsCategory } from "@prisma/client";
import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";

export const DEFAULT_SETTINGS: Array<{ key: string; value: string; category: SettingsCategory; description: string }> = [
  { key: "AI_COST_MODE", value: env.AI_COST_MODE, category: "AI", description: "Provider routing cost preference: low, balanced, or quality." },
  { key: "AI_TIMEOUT_MS", value: String(env.AI_TIMEOUT_MS), category: "AI", description: "Request timeout for AI calls in milliseconds." },
  { key: "AI_MAX_TOKENS", value: String(env.AI_MAX_TOKENS), category: "AI", description: "Default maximum output tokens for AI calls." },
  { key: "UI_LANGUAGE", value: "en", category: "UI", description: "Default interface language for the web app. Use en for English or th for Thai." },
  { key: "AUTO_SAVE_MEMORY", value: "true", category: "SYSTEM", description: "Automatically save concise memories after council completion." },
  { key: "AUTO_GENERATE_REPORTS", value: "true", category: "SYSTEM", description: "Automatically generate Royal Reports after council completion." },
  { key: "COUNCIL_AUTO_WORK_ORDER_MODE", value: "OFF", category: "SYSTEM", description: "Controls whether the Planner Agent auto-creates work orders after council completion. OFF = disabled; DRAFT = create draft work orders for King review; READY = create work orders ready for agent assignment." },
  { key: "AUTO_ASSIGN_WORK_ORDERS", value: "true", category: "SYSTEM", description: "Automatically assign a suitable internal agent to planner-created draft work orders based on skill and specialty matching." },
  { key: "ROUTING_DEBUG_MODE", value: "false", category: "SYSTEM", description: "When enabled, low-confidence and debug-only routing decisions are stored as inbox items (hidden by default) for admin review." },
  { key: "ALLOW_PRODUCTION_FALLBACK_IN_SANDBOX", value: "false", category: "SYSTEM", description: "Allow production provider calls when running outside production mode. Keep disabled unless actively testing production routes." },
  { key: "DAILY_BUDGET_LIMIT_USD", value: "", category: "SYSTEM", description: "Daily spend limit in USD. Leave empty to disable the limit." },
  { key: "MONTHLY_BUDGET_LIMIT_USD", value: "", category: "SYSTEM", description: "Monthly spend limit in USD. Leave empty to disable the limit." },
  { key: "ALLOW_RUNNER_BRANCH_PUSH", value: "false", category: "SYSTEM", description: "Allow the runner to push a safe feature branch after King approval. Branch name format: kingdom/job-<id>-<slug>." },
  { key: "ALLOW_RUNNER_PR_CREATE", value: "false", category: "SYSTEM", description: "Allow the runner to create a GitHub PR after King approval of a patch artifact." },
  { key: "EXTERNAL_AGENT_BRIDGE_ENABLED", value: "false", category: "SYSTEM", description: "Enable queued External Agent Bridge jobs. Runner-side EXTERNAL_AGENT_BRIDGE_ENABLED must also be true before commands execute." },
  { key: "DEFAULT_EXTERNAL_AGENT_ID", value: "", category: "SYSTEM", description: "Optional default ExternalAgent id used when work orders request automatic external-agent execution." },
  { key: "AUTO_SELECT_EXTERNAL_AGENT", value: "true", category: "SYSTEM", description: "Allow the Kingdom to select an active external agent when a work order has no explicit assignment." },
  { key: "ALLOW_EXTERNAL_AGENT_WRITE", value: "false", category: "SYSTEM", description: "Allow external agent commands to modify the isolated runner workspace. Disabled by default." },
  { key: "ALLOW_EXTERNAL_AGENT_NETWORK", value: "false", category: "SYSTEM", description: "Allow external agent commands to use network access when the configured external tool supports it. Disabled by default." },
  { key: "ALLOW_EXTERNAL_AGENT_BRANCH_PUSH", value: "false", category: "SYSTEM", description: "Allow bridge jobs to push branches after King approval. Disabled by default." },
  { key: "ALLOW_EXTERNAL_AGENT_PR_CREATE", value: "false", category: "SYSTEM", description: "Allow bridge jobs to create pull requests after King approval. Disabled by default." },
  { key: "ALLOW_EXTERNAL_AGENT_DEPLOY", value: "false", category: "SYSTEM", description: "Allow bridge jobs to deploy. Must remain false unless a future approved milestone enables deploy support." },
  { key: "MAX_EXTERNAL_AGENT_RUNTIME_SECONDS", value: "900", category: "SYSTEM", description: "Default timeout for each external agent bridge command." },
  { key: "MAX_EXTERNAL_AGENT_AUTO_RETRIES", value: "2", category: "SYSTEM", description: "Maximum automatic revision attempts after failed bridge validation." },
  { key: "REQUIRE_KING_APPROVAL_FOR_EXTERNAL_AGENT", value: "true", category: "SYSTEM", description: "Require King approval before a queued external-agent bridge job can be claimed by a runner." },
  { key: "REQUIRE_KING_APPROVAL_FOR_BRANCH_PUSH", value: "true", category: "SYSTEM", description: "Require King approval before any bridge branch push." },
  { key: "REQUIRE_KING_APPROVAL_FOR_PR_CREATE", value: "true", category: "SYSTEM", description: "Require King approval before any bridge pull request creation." },
  { key: "REQUIRE_KING_APPROVAL_FOR_DEPLOY", value: "true", category: "SYSTEM", description: "Require King approval before any bridge deploy action." },
  { key: "LIVING_LOOP_ENABLED", value: "false", category: "SYSTEM", description: "Enable the continuous living loop that observes Kingdom state and proposes automation candidates." },
  { key: "LIVING_LOOP_INTERVAL_MINUTES", value: "15", category: "SYSTEM", description: "Interval in minutes between scheduled living loop runs." },
  { key: "LIVING_LOOP_MIN_CONFIDENCE", value: "70", category: "SYSTEM", description: "Minimum confidence score (0-100) for a candidate to be proposed." },
  { key: "LIVING_LOOP_MAX_CANDIDATES_PER_RUN", value: "10", category: "SYSTEM", description: "Maximum number of automation candidates created per loop run." },
  { key: "LIVING_LOOP_MAX_DAILY_CANDIDATES", value: "50", category: "SYSTEM", description: "Maximum number of automation candidates per day." },
  { key: "LIVING_LOOP_AUTO_CREATE_VALIDATION_JOBS", value: "false", category: "SYSTEM", description: "Auto-create and run VALIDATION_ONLY automation jobs from high-confidence VALIDATION_JOB candidates (M17D-2)." },
  { key: "LIVING_LOOP_MAX_DAILY_VALIDATION_JOBS", value: "10", category: "SYSTEM", description: "Maximum number of auto-created VALIDATION_ONLY jobs per day." },
  { key: "LIVING_LOOP_VALIDATION_JOB_COOLDOWN_MINUTES", value: "60", category: "SYSTEM", description: "Minimum minutes between validation jobs for the same work order." },
  { key: "LIVING_LOOP_AUTO_SANDBOX_PATCH", value: "false", category: "SYSTEM", description: "Auto-run SANDBOX_PATCH jobs. Disabled in M17D-1." },
  { key: "LIVING_LOOP_MAX_DAILY_SANDBOX_PATCH_JOBS", value: "3", category: "SYSTEM", description: "Maximum number of auto-created SANDBOX_PATCH jobs per day." },
  { key: "LIVING_LOOP_SANDBOX_PATCH_COOLDOWN_MINUTES", value: "120", category: "SYSTEM", description: "Minimum minutes between auto patch jobs for the same work order." },
  { key: "LIVING_LOOP_AUTO_PATCH_MIN_CONFIDENCE", value: "85", category: "SYSTEM", description: "Minimum confidence score (0-100) for a candidate to be auto-patched." },
  { key: "LIVING_LOOP_ALLOW_BRANCH_PUSH", value: "false", category: "SYSTEM", description: "Allow automatic branch push. Disabled in M17D-1." },
  { key: "LIVING_LOOP_ALLOW_PR_CREATE", value: "false", category: "SYSTEM", description: "Allow automatic PR creation. Disabled in M17D-1." },
  { key: "LIVING_LOOP_ALLOW_PAID_PROVIDERS", value: "false", category: "SYSTEM", description: "Allow loop to use paid providers for observations. Disabled in M17D-1." }
];

// Keys that were removed from active settings and should be cleaned up from existing databases.
const DEPRECATED_SETTING_KEYS = ["AI_PROVIDER", "OPENAI_MODEL", "DEFAULT_TASK_MODE", "AUTO_PROCESS_TASKS", "AUTO_PLAN_WORK_ORDERS"];

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
