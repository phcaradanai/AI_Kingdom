/**
 * Secret redactor for the runner sandbox.
 * Mirrors apps/api/src/services/secretRedactorService.ts — kept in sync manually.
 */

const REDACTED = "[REDACTED]";
const MAX_OUTPUT_LENGTH = 8000;

const SECRET_PATTERNS: RegExp[] = [
  /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
  /\bsk-[A-Za-z0-9]{10,}/gi,
  /\bkey-[A-Za-z0-9]{10,}/gi,
  /\btoken-[A-Za-z0-9]{10,}/gi,
  /postgres(?:ql)?:\/\/[^@\s]+@[^\s]+/gi,
  /(?:api[_-]?key|secret|password|passwd|token|credential|auth_token|access_token|refresh_token)\s*[=:]\s*\S+/gi,
  /\bsk-proj-[A-Za-z0-9]{10,}/gi,
  /\bsk-ant-[A-Za-z0-9\-]{10,}/gi,
  /\beyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+/gi
];

const SENSITIVE_ENV_NAMES = new Set([
  "RUNNER_TOKEN",
  "DATABASE_URL",
  "TEST_DATABASE_URL",
  "JWT_SECRET",
  "OPENAI_API_KEY",
  "OPENROUTER_API_KEY",
  "DEEPSEEK_API_KEY",
  "ANTHROPIC_API_KEY",
  "GEMINI_API_KEY",
  "OPENAI_COMPATIBLE_API_KEY"
]);

export function redactSecrets(text: string): string {
  if (!text) return text;
  let result = text;
  for (const name of SENSITIVE_ENV_NAMES) {
    const envPattern = new RegExp(`(?:^|\\s|;)${name}\\s*=\\s*\\S+`, "gm");
    result = result.replace(envPattern, (match) => {
      const eqIdx = match.indexOf("=");
      return match.slice(0, eqIdx + 1) + REDACTED;
    });
  }
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, REDACTED);
  }
  return result;
}

export function truncateOutput(text: string, maxLength = MAX_OUTPUT_LENGTH): string {
  if (!text || text.length <= maxLength) return text;
  const half = Math.floor(maxLength / 2);
  return `${text.slice(0, half)}\n...[truncated ${text.length - maxLength} chars]...\n${text.slice(-half)}`;
}

export function sanitizeLogOutput(raw: string): string {
  return truncateOutput(redactSecrets(raw));
}
