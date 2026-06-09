import { z } from "zod";
import { Prisma } from "@prisma/client";
import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";

const OPENROUTER_PROVIDER_TYPE = "openrouter";
const OPENROUTER_PROVIDER_ID = "openrouter";
const OPENROUTER_KEY_URL = "https://openrouter.ai/api/v1/auth/key";
const ACCOUNT_SYNC_TIMEOUT_MS = 10_000;

const openRouterKeyResponseSchema = z.object({
  data: z.object({
    label: z.string().optional(),
    usage: z.number().optional(),
    is_free_tier: z.boolean().optional(),
    rate_limit: z.object({
      requests: z.number().optional(),
      interval: z.string().optional()
    }).optional(),
    limit: z.number().nullable().optional(),
    limit_remaining: z.number().nullable().optional()
  })
});

export type ProviderAccountSnapshotDto = {
  id: string;
  providerType: string;
  providerId: string | null;
  creditsRemaining: number | null;
  creditsUsed: number | null;
  isFreeTier: boolean;
  rateLimit: Record<string, unknown> | null;
  status: string;
  syncedAt: Date;
  createdAt: Date;
};

export class ProviderAccountConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderAccountConfigError";
  }
}

export class ProviderAccountApiError extends Error {
  statusCode: number;
  constructor(message = "OpenRouter account API request failed.", statusCode = 502) {
    super(message);
    this.name = "ProviderAccountApiError";
    this.statusCode = statusCode;
  }
}

export async function syncOpenRouterAccount(options: { fetchImpl?: typeof fetch } = {}): Promise<ProviderAccountSnapshotDto> {
  const apiKey = env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    throw new ProviderAccountConfigError("OPENROUTER_API_KEY is not configured on the backend.");
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ACCOUNT_SYNC_TIMEOUT_MS);
  let response: Response;

  try {
    response = await fetchImpl(OPENROUTER_KEY_URL, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal
    });
  } catch {
    clearTimeout(timeout);
    const row = await recordOpenRouterErrorSnapshot();
    return toAccountSnapshotDto(row);
  }
  clearTimeout(timeout);

  if (!response.ok) {
    const row = await recordOpenRouterErrorSnapshot(response.status);
    return toAccountSnapshotDto(row);
  }

  const json = await response.json();
  const parsed = openRouterKeyResponseSchema.parse(json);
  const { data } = parsed;
  const syncedAt = new Date();

  const row = await prisma.providerAccountSnapshot.create({
    data: {
      providerType: OPENROUTER_PROVIDER_TYPE,
      providerId: OPENROUTER_PROVIDER_ID,
      creditsRemaining: data.limit_remaining ?? null,
      creditsUsed: data.usage ?? null,
      isFreeTier: data.is_free_tier ?? false,
      rateLimit: data.rate_limit ? (data.rate_limit as Prisma.InputJsonObject) : Prisma.DbNull,
      status: "ACTIVE",
      raw: data as Prisma.InputJsonObject,
      syncedAt
    }
  });

  return toAccountSnapshotDto(row);
}

export async function getLatestOpenRouterAccountSnapshot(): Promise<ProviderAccountSnapshotDto | null> {
  const row = await prisma.providerAccountSnapshot.findFirst({
    where: { providerType: OPENROUTER_PROVIDER_TYPE, status: { not: "ERROR" } },
    orderBy: { syncedAt: "desc" }
  });
  return row ? toAccountSnapshotDto(row) : null;
}

export async function listLatestProviderAccountSnapshots(): Promise<ProviderAccountSnapshotDto[]> {
  const rows = await prisma.providerAccountSnapshot.findMany({
    orderBy: { syncedAt: "desc" }
  });

  const latest = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const key = `${row.providerType}:${row.providerId ?? ""}`;
    if (!latest.has(key)) latest.set(key, row);
  }

  return Array.from(latest.values())
    .sort((a, b) => a.providerType.localeCompare(b.providerType))
    .map(toAccountSnapshotDto);
}

async function recordOpenRouterErrorSnapshot(statusCode?: number) {
  return prisma.providerAccountSnapshot.create({
    data: {
      providerType: OPENROUTER_PROVIDER_TYPE,
      providerId: OPENROUTER_PROVIDER_ID,
      status: "ERROR",
      raw: {
        status: "provider_api_error",
        statusCode: statusCode ?? null,
        message: "OpenRouter account API request failed."
      }
    }
  });
}

function toAccountSnapshotDto(row: {
  id: string;
  providerType: string;
  providerId: string | null;
  creditsRemaining: number | null;
  creditsUsed: number | null;
  isFreeTier: boolean;
  rateLimit: Prisma.JsonValue | null;
  status: string;
  syncedAt: Date;
  createdAt: Date;
}): ProviderAccountSnapshotDto {
  const rl = row.rateLimit && typeof row.rateLimit === "object" && !Array.isArray(row.rateLimit)
    ? (row.rateLimit as Record<string, unknown>)
    : null;
  return {
    id: row.id,
    providerType: row.providerType,
    providerId: row.providerId,
    creditsRemaining: row.creditsRemaining,
    creditsUsed: row.creditsUsed,
    isFreeTier: row.isFreeTier,
    rateLimit: rl,
    status: row.status,
    syncedAt: row.syncedAt,
    createdAt: row.createdAt
  };
}
