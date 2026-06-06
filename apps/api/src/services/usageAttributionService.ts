import type { Prisma } from "@prisma/client";

export type UsageSourceType =
  | "TASK"
  | "COUNCIL_SESSION"
  | "AGENT_RESPONSE"
  | "FINAL_COUNSEL"
  | "MEMORY_EXTRACTION"
  | "REPORT_GENERATION"
  | "PROVIDER_TEST"
  | "PROVIDER_BALANCE_SYNC"
  | "MANUAL_TEST"
  | "LEGACY";

export type UsageAttributionInput = {
  projectId?: string | null;
  purpose?: string | null;
  sourceType?: UsageSourceType | string | null;
  sourceId?: string | null;
  operation?: string | null;
  requestLabel?: string | null;
  prompt?: unknown;
  response?: unknown;
  promptPreview?: unknown;
  responsePreview?: unknown;
  metadata?: unknown;
};

export function sanitizePreview(text: unknown, maxLength = 500): string | null {
  try {
    if (typeof text !== "string") return null;
    const normalized = text.replace(/\s+/g, " ").trim();
    if (!normalized) return null;
    const redacted = redactSecrets(normalized);
    if (redacted.length <= maxLength) return redacted;
    return `${redacted.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
  } catch {
    return null;
  }
}

export function redactSecrets(text: string): string {
  return text
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "sk-[REDACTED]")
    .replace(/\b(api[_-]?key|password|token|secret|credential)\b\s*[:=]\s*["']?[^"',\s}]+["']?/gi, "$1=[REDACTED]")
    .replace(/([?&](?:api[_-]?key|password|token|secret|credential)=)[^&#\s]+/gi, "$1[REDACTED]");
}

export function buildUsageAttribution(input: UsageAttributionInput): {
  projectId?: string | null;
  purpose?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  operation?: string | null;
  requestLabel?: string | null;
  promptPreview?: string | null;
  responsePreview?: string | null;
  metadata?: Prisma.InputJsonValue;
} {
  const metadata = sanitizeJsonForStorage(input.metadata);
  return {
    projectId: input.projectId ?? null,
    purpose: sanitizeShortField(input.purpose, 160),
    sourceType: sanitizeShortField(input.sourceType, 80),
    sourceId: sanitizeShortField(input.sourceId, 160),
    operation: sanitizeShortField(input.operation, 120),
    requestLabel: sanitizeShortField(input.requestLabel, 160),
    promptPreview: sanitizePreview(input.promptPreview ?? input.prompt),
    responsePreview: sanitizePreview(input.responsePreview ?? input.response),
    ...(metadata === undefined ? {} : { metadata })
  };
}

export function sanitizeJsonForStorage(value: unknown, depth = 0, seen = new WeakSet<object>()): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  if (value === null) return "null";
  if (typeof value === "string") return sanitizePreview(value, 500) ?? "";
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== "object") return String(value);
  if (depth >= 6) return "[MaxDepth]";

  if (seen.has(value)) return "[Circular]";
  seen.add(value);

  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => sanitizeJsonForStorage(item, depth + 1, seen) ?? null);
  }

  const output: Record<string, Prisma.InputJsonValue> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>).slice(0, 100)) {
    if (isSensitiveKey(key)) {
      output[key] = "[REDACTED]";
      continue;
    }
    const sanitized = sanitizeJsonForStorage(raw, depth + 1, seen);
    if (sanitized !== undefined) output[key] = sanitized;
  }
  return output;
}

function sanitizeShortField(value: unknown, maxLength: number): string | null {
  return sanitizePreview(typeof value === "string" ? value : null, maxLength);
}

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[_-]/g, "");
  return ["apikey", "password", "token", "secret", "credential", "authorization", "bearer"].some((term) => normalized.includes(term));
}
