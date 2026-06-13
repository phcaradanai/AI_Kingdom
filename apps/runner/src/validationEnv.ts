import { sanitizeLogOutput } from "./secretRedactor.js";

export const VALIDATION_ENV_MISSING_MESSAGE = "Runner validation env missing: TEST_DATABASE_URL or DATABASE_URL";

const DEFAULT_VALIDATION_ENV_ALLOWLIST = ["TEST_DATABASE_URL", "DATABASE_URL", "NODE_ENV"];

const ALWAYS_BLOCKED_ENV = new Set([
  "RUNNER_TOKEN",
  "JWT_SECRET",
  "OPENAI_API_KEY",
  "OPENROUTER_API_KEY",
  "DEEPSEEK_API_KEY",
  "ANTHROPIC_API_KEY",
  "GEMINI_API_KEY",
  "OPENAI_COMPATIBLE_API_KEY",
  "OPENAI_COMPATIBLE_BASE_URL"
]);

export interface ValidationChildEnv {
  env: NodeJS.ProcessEnv;
  forwardedNames: string[];
}

export function getValidationEnvAllowlist(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env.RUNNER_VALIDATION_ENV_ALLOWLIST?.trim();
  const names = raw
    ? raw.split(",").map((name) => name.trim()).filter(Boolean)
    : DEFAULT_VALIDATION_ENV_ALLOWLIST;
  return [...new Set(names.filter((name) => /^[A-Z_][A-Z0-9_]*$/.test(name)))];
}

export function buildValidationChildEnv(sourceEnv: NodeJS.ProcessEnv = process.env): ValidationChildEnv {
  const allowlist = new Set(getValidationEnvAllowlist(sourceEnv));
  const safe: NodeJS.ProcessEnv = {};

  for (const [key, value] of Object.entries(sourceEnv)) {
    if (value === undefined) continue;
    if (ALWAYS_BLOCKED_ENV.has(key)) continue;
    if (key === "DATABASE_URL" || key === "TEST_DATABASE_URL") continue;
    if (key.startsWith("RUNNER_") && key !== "RUNNER_VALIDATION_ENV_ALLOWLIST") continue;
    safe[key] = value;
  }

  const forwardedNames: string[] = [];
  for (const name of allowlist) {
    if (ALWAYS_BLOCKED_ENV.has(name)) continue;
    const value = sourceEnv[name];
    if (value === undefined || value === "") continue;
    safe[name] = value;
    forwardedNames.push(name);
  }

  return { env: safe, forwardedNames };
}

export function validateValidationDatabaseEnv(env: NodeJS.ProcessEnv = process.env): { ok: true } | { ok: false; message: string } {
  const allowlist = new Set(getValidationEnvAllowlist(env));
  const hasTestDatabaseUrl = allowlist.has("TEST_DATABASE_URL") && Boolean(env.TEST_DATABASE_URL?.trim());
  const hasDatabaseUrl = allowlist.has("DATABASE_URL") && Boolean(env.DATABASE_URL?.trim());
  if (hasTestDatabaseUrl || hasDatabaseUrl) return { ok: true };
  return { ok: false, message: VALIDATION_ENV_MISSING_MESSAGE };
}

export function formatForwardedValidationEnvNames(env: NodeJS.ProcessEnv = process.env): string {
  const names = buildValidationChildEnv(env).forwardedNames;
  return sanitizeLogOutput(`Forwarded validation env: ${names.length > 0 ? names.join(", ") : "(none)"}`);
}
