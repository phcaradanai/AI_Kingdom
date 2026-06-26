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
  { key: "COUNCIL_AUTO_EXECUTE_LOW_RISK", value: "false", category: "SYSTEM", description: "When a BUILD decree's planner produces a LOW-risk work order with fresh project context, auto-dispatch it to the external-agent (Claude Code) bridge and approve it so it executes in the sandbox. Results always land in NEEDS_REVIEW and never auto push, merge, or deploy. MEDIUM, HIGH, or CRITICAL risk and non-fresh context pause for King approval. Requires EXTERNAL_AGENT_BRIDGE_ENABLED and an online runner. Disabled by default." },
  { key: "AUTO_ASSIGN_WORK_ORDERS", value: "true", category: "SYSTEM", description: "Automatically assign a suitable internal agent to planner-created draft work orders based on skill and specialty matching." },
  { key: "COUNCIL_PARALLEL_SPECIALISTS", value: "true", category: "SYSTEM", description: "Run the council's specialist agents concurrently instead of one-by-one. Faster (the slowest specialist sets the pace instead of the sum), but changes how the council deliberates: specialists no longer see each other's answers (independent opinions), while the Grand Vizier still runs last with the full transcript and synthesizes. Default ON (A/B live-proven ~51% faster, 356s→173s, same quality)." },
  { key: "PLANNER_CROSS_TASK_LEARNING", value: "false", category: "SYSTEM", description: "Let the planner learn from past outcomes: inject relevance-ranked lessons from similar prior work — what worked (PASS reviews) and what to avoid (failed reviews with a diagnosis) — into its planning context so it reuses wins and stops repeating past failures. Sourced from existing review records, outcome-gated, deterministic (no extra AI call). Default OFF." },
  { key: "COUNCIL_CROSS_TASK_LEARNING", value: "false", category: "SYSTEM", description: "Same outcome lessons as PLANNER_CROSS_TASK_LEARNING, but injected into the council's shared memory context so every specialist agent AND the Grand Vizier synthesis deliberate with the relevant what-worked / what-to-avoid history — not just the post-hoc planner. Deterministic, no extra AI call, outcome-gated. Default OFF." },
  { key: "AGENT_KNOWLEDGE_IN_CONTEXT", value: "true", category: "SYSTEM", description: "Inject each agent's APPROVED curated knowledge memories (the Knowledge Lab lessons the King approved) into that agent's council prompt and the Grand Vizier synthesis — closing the loop where knowledge was created but never used during decree reasoning. Per-agent + project + global, ranked by use; deterministic." },
  { key: "CAPTURE_LESSONS_FROM_REVIEWS", value: "true", category: "SYSTEM", description: "When a runner job's review fails with a diagnosis (NEEDS_FIX / PATCH_FAILED / VALIDATION_FAILED + whatFailed), auto-propose a PENDING knowledge candidate capturing the lesson, attributed to the responsible agent. Once the King approves it (Knowledge Lab), it feeds back into council + planner via AGENT_KNOWLEDGE_IN_CONTEXT — making the learning loop self-sustaining. Candidates are King-gated; dedup is automatic." },
  { key: "CAPTURE_SUCCESSES_FROM_REVIEWS", value: "true", category: "SYSTEM", description: "When a runner job's review passes (PASS verdict + non-trivial summary + at least one whatPassed item), auto-propose a PENDING knowledge candidate capturing what worked, attributed to the responsible agent. Complements CAPTURE_LESSONS_FROM_REVIEWS: lessons from failure + lessons from success = a self-growing knowledge base. Unlike COUNCIL_SYNTHESIS_CAPTURE (which captured circular council-output), this captures real runner-execution evidence. Candidates are King-gated; dedup is automatic." },
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
  { key: "LIVING_LOOP_AUTO_CREATE_VALIDATION_JOBS", value: "false", category: "SYSTEM", description: "Auto-create and run read-only VALIDATION_ONLY jobs from high-confidence validation candidates." },
  { key: "LIVING_LOOP_MAX_DAILY_VALIDATION_JOBS", value: "10", category: "SYSTEM", description: "Maximum number of auto-created VALIDATION_ONLY jobs per day." },
  { key: "LIVING_LOOP_VALIDATION_JOB_COOLDOWN_MINUTES", value: "60", category: "SYSTEM", description: "Minimum minutes between validation jobs for the same work order." },
  { key: "LIVING_LOOP_AUTO_SANDBOX_PATCH", value: "false", category: "SYSTEM", description: "Auto-create gated SANDBOX_PATCH jobs for eligible low-risk candidates. Results remain in NEEDS_REVIEW." },
  { key: "LIVING_LOOP_MAX_DAILY_SANDBOX_PATCH_JOBS", value: "3", category: "SYSTEM", description: "Maximum number of auto-created SANDBOX_PATCH jobs per day." },
  { key: "LIVING_LOOP_SANDBOX_PATCH_COOLDOWN_MINUTES", value: "120", category: "SYSTEM", description: "Minimum minutes between auto patch jobs for the same work order." },
  { key: "LIVING_LOOP_AUTO_PATCH_MIN_CONFIDENCE", value: "85", category: "SYSTEM", description: "Minimum confidence score (0-100) for a candidate to be auto-patched." },
  { key: "LIVING_LOOP_ALLOW_BRANCH_PUSH", value: "false", category: "SYSTEM", description: "Reserved guardrail. Automatic branch push remains disabled." },
  { key: "LIVING_LOOP_ALLOW_PR_CREATE", value: "false", category: "SYSTEM", description: "Reserved guardrail. Automatic pull request creation remains disabled." },
  { key: "LIVING_LOOP_ALLOW_PAID_PROVIDERS", value: "false", category: "SYSTEM", description: "Reserved guardrail. Paid providers remain disabled for Living Loop observations." },
  { key: "ADAPTIVE_REASONING_ENABLED", value: "true", category: "SYSTEM", description: "Let the responsible Kingdom agent (planner, council synthesis, reviewer) think harder — reasoning ON at high effort — when a decree or work order is assessed as complex. Kill-switch: set false to keep reasoning at the agent's stored config for every task." },
  { key: "REQUIRE_KING_EXTERNAL_AGENT_CHOICE", value: "true", category: "SYSTEM", description: "When the Kingdom would otherwise auto-select an external agent (codex, claude-code, cline, hermes, antigravity, devin, cursor, ...) for execution, pause instead and ask the King to choose among the agents that are ready right now (some may be offline). The King's explicit assignment proceeds normally; only system auto-selection is gated." },
  { key: "AI_MAX_TOKENS_AUTOGROW", value: "true", category: "SYSTEM", description: "When a real provider truncates a response (finish_reason=length) because it needed more than the agent's current max_tokens, grow that agent's stored max_tokens one step (up to AI_MAX_TOKENS_CEILING) and persist it, so later calls use the larger budget. Kill-switch: set false to keep max_tokens fixed." },
  { key: "AI_MAX_TOKENS_CEILING", value: "16000", category: "SYSTEM", description: "Hard upper bound (content tokens) that AI_MAX_TOKENS_AUTOGROW will never exceed — the cost guardrail. Must stay within the model's verified output cap (deepseek-v4-flash accepts content+reasoning-reserve well above this). Raise deliberately." },
  { key: "SUPERVISED_AUTO_RETRY_ENABLED", value: "false", category: "SYSTEM", description: "When a runner job fails mechanically (PATCH_FAILED / VALIDATION_FAILED), let the Kingdom automatically re-dispatch a revision — carrying the reviewer's feedback — before escalating to the King. Conservative: LOW-priority work only, capped at the work order's maxAutoRetries, requires an online runner, results always land NEEDS_REVIEW, and nothing is pushed/merged/deployed. When exhausted, the King is notified. Disabled by default; the King can always trigger a retry manually regardless of this setting." }
];

// Keys that were removed from active settings and should be cleaned up from existing databases.
const DEPRECATED_SETTING_KEYS = ["AI_PROVIDER", "OPENAI_MODEL", "DEFAULT_TASK_MODE", "AUTO_PROCESS_TASKS", "AUTO_PLAN_WORK_ORDERS"];

export async function ensureDefaultSettings() {
  for (const setting of DEFAULT_SETTINGS) {
    await prisma.setting.upsert({
      where: { key: setting.key },
      update: { category: setting.category, description: setting.description },
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
