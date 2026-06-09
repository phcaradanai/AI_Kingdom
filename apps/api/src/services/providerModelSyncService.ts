import type { Prisma } from "@prisma/client";
import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";

const OPENROUTER_PROVIDER_TYPE = "openrouter";
const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
const MODEL_SYNC_TIMEOUT_MS = 30_000;

type OpenRouterModelEntry = {
  id: string;
  name?: string;
  context_length?: number;
  pricing?: {
    prompt?: string;
    completion?: string;
  };
  [key: string]: unknown;
};

export type ProviderModelSnapshotDto = {
  id: string;
  providerType: string;
  modelId: string;
  modelName: string | null;
  contextWindow: number | null;
  inputPricePerMillion: number | null;
  outputPricePerMillion: number | null;
  isAvailable: boolean;
  syncedAt: Date;
  createdAt: Date;
};

export type ProviderModelSyncResult = {
  synced: number;
  failed: number;
  syncedAt: Date;
};

export class ProviderModelSyncError extends Error {
  statusCode: number;
  constructor(message = "OpenRouter models API request failed.", statusCode = 502) {
    super(message);
    this.name = "ProviderModelSyncError";
    this.statusCode = statusCode;
  }
}

export async function syncOpenRouterModels(options: { fetchImpl?: typeof fetch } = {}): Promise<ProviderModelSyncResult> {
  const apiKey = env.OPENROUTER_API_KEY?.trim();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MODEL_SYNC_TIMEOUT_MS);
  let response: Response;

  try {
    response = await fetchImpl(OPENROUTER_MODELS_URL, { headers, signal: controller.signal });
  } catch {
    clearTimeout(timeout);
    throw new ProviderModelSyncError();
  }
  clearTimeout(timeout);

  if (!response.ok) {
    throw new ProviderModelSyncError("OpenRouter models API request failed.", 502);
  }

  const data = (await response.json()) as { data?: OpenRouterModelEntry[] };
  const models = data.data ?? [];
  const syncedAt = new Date();
  let synced = 0;
  let failed = 0;

  await prisma.$transaction(
    models.map((m) => {
      const inputPrice = parsePrice(m.pricing?.prompt);
      const outputPrice = parsePrice(m.pricing?.completion);
      return prisma.providerModelSnapshot.create({
        data: {
          providerType: OPENROUTER_PROVIDER_TYPE,
          modelId: m.id,
          modelName: m.name ?? null,
          contextWindow: typeof m.context_length === "number" ? m.context_length : null,
          inputPricePerMillion: inputPrice,
          outputPricePerMillion: outputPrice,
          isAvailable: true,
          raw: m as Prisma.InputJsonObject,
          syncedAt
        }
      });
    })
  );

  synced = models.length;
  return { synced, failed, syncedAt };
}

export async function getLatestProviderModelSnapshots(providerType = OPENROUTER_PROVIDER_TYPE): Promise<ProviderModelSnapshotDto[]> {
  const rows = await prisma.providerModelSnapshot.findMany({
    where: { providerType },
    orderBy: { syncedAt: "desc" }
  });

  // Return the most recent snapshot per modelId
  const latest = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    if (!latest.has(row.modelId)) latest.set(row.modelId, row);
  }

  return Array.from(latest.values()).map(toModelSnapshotDto);
}

export async function getModelSnapshotById(id: string): Promise<ProviderModelSnapshotDto | null> {
  const row = await prisma.providerModelSnapshot.findUnique({ where: { id } });
  return row ? toModelSnapshotDto(row) : null;
}

export async function getLastModelSyncTime(providerType = OPENROUTER_PROVIDER_TYPE): Promise<Date | null> {
  const row = await prisma.providerModelSnapshot.findFirst({
    where: { providerType },
    orderBy: { syncedAt: "desc" },
    select: { syncedAt: true }
  });
  return row?.syncedAt ?? null;
}

function parsePrice(value: string | null | undefined): number | null {
  if (value == null || value === "") return null;
  // OpenRouter prices are per-token; convert to per-million
  const perToken = Number(value);
  if (!Number.isFinite(perToken)) return null;
  return perToken * 1_000_000;
}

function toModelSnapshotDto(row: {
  id: string;
  providerType: string;
  modelId: string;
  modelName: string | null;
  contextWindow: number | null;
  inputPricePerMillion: number | null;
  outputPricePerMillion: number | null;
  isAvailable: boolean;
  syncedAt: Date;
  createdAt: Date;
}): ProviderModelSnapshotDto {
  return {
    id: row.id,
    providerType: row.providerType,
    modelId: row.modelId,
    modelName: row.modelName,
    contextWindow: row.contextWindow,
    inputPricePerMillion: row.inputPricePerMillion,
    outputPricePerMillion: row.outputPricePerMillion,
    isAvailable: row.isAvailable,
    syncedAt: row.syncedAt,
    createdAt: row.createdAt
  };
}
