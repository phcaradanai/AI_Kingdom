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

export function sanitizeLogOutput(raw: string, maxLength = MAX_OUTPUT_LENGTH): string {
  return truncateOutput(redactSecrets(raw), maxLength);
}

/**
 * Keeps only the last `maxLines` lines of `text`. Failure details (e.g. "not ok"
 * lines and the final summary from a test runner) are almost always near the end
 * of stdout/stderr, so a tail-based cap preserves them even when the full output
 * is large.
 */
export function tailLines(text: string, maxLines: number): string {
  if (!text) return text;
  const lines = text.split("\n");
  if (lines.length <= maxLines) return text;
  const omitted = lines.length - maxLines;
  return `...[truncated ${omitted} earlier line${omitted === 1 ? "" : "s"}]...\n${lines.slice(-maxLines).join("\n")}`;
}

export interface CapturedOutput {
  text: string;
  truncated: boolean;
}

/**
 * Redacts secrets, then bounds `raw` to the last `maxLines` lines and
 * `maxChars` characters (tail-biased, like `tailLines`). Used to keep
 * captured command output bounded in memory/storage without ever killing
 * the underlying process. `truncated` reports whether anything was cut.
 */
export function captureOutput(raw: string, maxLines: number, maxChars: number): CapturedOutput {
  if (!raw) return { text: raw, truncated: false };
  const redacted = redactSecrets(raw);
  let text = redacted;
  let truncated = false;

  const lineTailed = tailLines(text, maxLines);
  if (lineTailed !== text) {
    text = lineTailed;
    truncated = true;
  }

  if (text.length > maxChars) {
    const omitted = text.length - maxChars;
    text = `...[truncated ${omitted} earlier char${omitted === 1 ? "" : "s"}]...\n${text.slice(-maxChars)}`;
    truncated = true;
  }

  return { text, truncated };
}
