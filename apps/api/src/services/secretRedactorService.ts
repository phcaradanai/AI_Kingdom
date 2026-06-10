/**
 * Redacts secrets from log output and text before persistence.
 * Pure function — no I/O, easy to test.
 */

const REDACTED = "[REDACTED]";
const MAX_OUTPUT_LENGTH = 8000;

/** Patterns matched case-insensitively against the surrounding context */
const SECRET_PATTERNS: RegExp[] = [
  // Bearer / Authorization headers
  /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
  // API keys: sk-..., key-..., token-...
  /\bsk-[A-Za-z0-9]{10,}/gi,
  /\bkey-[A-Za-z0-9]{10,}/gi,
  /\btoken-[A-Za-z0-9]{10,}/gi,
  // DATABASE_URL / postgres URLs
  /postgres(?:ql)?:\/\/[^@\s]+@[^\s]+/gi,
  // Generic KEY=value where KEY contains secret-like words
  /(?:api[_-]?key|secret|password|passwd|token|credential|auth_token|access_token|refresh_token)\s*[=:]\s*\S+/gi,
  // OpenAI / OpenRouter keys
  /\bsk-proj-[A-Za-z0-9]{10,}/gi,
  // Anthropic keys
  /\bsk-ant-[A-Za-z0-9\-]{10,}/gi,
  // JWT-ish: three base64 segments separated by dots
  /\beyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+/gi
];

/** Env var names whose values should always be redacted */
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

  // Redact known env var patterns: NAME=value
  for (const name of SENSITIVE_ENV_NAMES) {
    const envPattern = new RegExp(`(?:^|\\s|;)${name}\\s*=\\s*\\S+`, "gm");
    result = result.replace(envPattern, (match) => {
      const eqIdx = match.indexOf("=");
      return match.slice(0, eqIdx + 1) + REDACTED;
    });
  }

  // Apply pattern-based redaction
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
