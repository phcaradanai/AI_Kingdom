import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";

const DEEPSEEK_PROVIDER_TYPE = "deepseek";
const DEEPSEEK_PROVIDER_ID = "deepseek";
const DEEPSEEK_BALANCE_URL = "https://api.deepseek.com/user/balance";
const BALANCE_TIMEOUT_MS = 10_000;

const deepSeekBalanceResponseSchema = z.object({
  is_available: z.boolean(),
  balance_infos: z.array(z.object({
    currency: z.enum(["CNY", "USD"]),
    total_balance: z.string(),
    granted_balance: z.string(),
    topped_up_balance: z.string()
  }))
});

export type ProviderBalanceSnapshotDto = {
  id: string;
  providerType: string;
  providerId: string | null;
  isAvailable: boolean;
  currency: string;
  totalBalance: number;
  grantedBalance: number;
  toppedUpBalance: number;
  fetchedAt: Date;
  createdAt: Date;
  status?: "OK" | "PROVIDER_API_ERROR";
};

export class ProviderBalanceConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderBalanceConfigError";
  }
}

export class ProviderBalanceApiError extends Error {
  statusCode: number;

  constructor(message = "DeepSeek balance API request failed.", statusCode = 502) {
    super(message);
    this.name = "ProviderBalanceApiError";
    this.statusCode = statusCode;
  }
}

export async function fetchDeepSeekBalanceSnapshot(options: { fetchImpl?: typeof fetch } = {}): Promise<ProviderBalanceSnapshotDto[]> {
  const apiKey = env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) {
    throw new ProviderBalanceConfigError("DEEPSEEK_API_KEY is not configured on the backend.");
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BALANCE_TIMEOUT_MS);
  let response: Response;

  try {
    response = await fetchImpl(DEEPSEEK_BALANCE_URL, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal
    });
  } catch {
    clearTimeout(timeout);
    await recordDeepSeekApiErrorSnapshot();
    throw new ProviderBalanceApiError();
  }
  clearTimeout(timeout);

  if (!response.ok) {
    await recordDeepSeekApiErrorSnapshot(response.status);
    throw new ProviderBalanceApiError("DeepSeek balance API request failed.", 502);
  }

  const json = await response.json();
  const parsed = deepSeekBalanceResponseSchema.parse(json);
  const fetchedAt = new Date();

  const snapshots = await prisma.$transaction(parsed.balance_infos.map((info) => {
    const totalBalance = parseBalanceAmount(info.total_balance, "total_balance");
    const grantedBalance = parseBalanceAmount(info.granted_balance, "granted_balance");
    const toppedUpBalance = parseBalanceAmount(info.topped_up_balance, "topped_up_balance");

    return prisma.providerBalanceSnapshot.create({
      data: {
        providerType: DEEPSEEK_PROVIDER_TYPE,
        providerId: DEEPSEEK_PROVIDER_ID,
        isAvailable: parsed.is_available,
        currency: info.currency,
        totalBalance,
        grantedBalance,
        toppedUpBalance,
        raw: parsed as Prisma.InputJsonObject,
        fetchedAt
      }
    });
  }));

  return snapshots.map(toPublicSnapshot);
}

export async function listLatestProviderBalanceSnapshots(): Promise<ProviderBalanceSnapshotDto[]> {
  const rows = await prisma.providerBalanceSnapshot.findMany({
    orderBy: { fetchedAt: "desc" }
  });

  const latest = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const key = `${row.providerType}:${row.providerId ?? ""}:${row.currency}`;
    if (!latest.has(key)) latest.set(key, row);
  }

  return Array.from(latest.values())
    .sort((a, b) => a.providerType.localeCompare(b.providerType) || a.currency.localeCompare(b.currency))
    .map(toPublicSnapshot);
}

export async function getLatestDeepSeekBalanceSnapshot(): Promise<ProviderBalanceSnapshotDto | null> {
  const row = await prisma.providerBalanceSnapshot.findFirst({
    where: { providerType: DEEPSEEK_PROVIDER_TYPE, currency: { not: "UNKNOWN" } },
    orderBy: { fetchedAt: "desc" }
  });
  return row ? toPublicSnapshot(row) : null;
}

export async function getLatestDeepSeekBalanceErrorSnapshot(): Promise<ProviderBalanceSnapshotDto | null> {
  const row = await prisma.providerBalanceSnapshot.findFirst({
    where: { providerType: DEEPSEEK_PROVIDER_TYPE, currency: "UNKNOWN" },
    orderBy: { fetchedAt: "desc" }
  });
  return row ? toPublicSnapshot(row) : null;
}

export async function getDeepSeekBalanceDelta(latest: ProviderBalanceSnapshotDto | null): Promise<{
  currency: string;
  previousTotalBalance: number;
  latestTotalBalance: number;
  balanceDelta: number;
  previousFetchedAt: Date;
  latestFetchedAt: Date;
} | null> {
  if (!latest || latest.currency === "UNKNOWN") return null;

  const rows = await prisma.providerBalanceSnapshot.findMany({
    where: { providerType: DEEPSEEK_PROVIDER_TYPE, currency: latest.currency },
    orderBy: { fetchedAt: "desc" },
    take: 2
  });

  if (rows.length < 2) return null;
  const [latestRow, previousRow] = rows;
  if (!latestRow || !previousRow) return null;

  return {
    currency: latestRow.currency,
    previousTotalBalance: previousRow.totalBalance,
    latestTotalBalance: latestRow.totalBalance,
    balanceDelta: previousRow.totalBalance - latestRow.totalBalance,
    previousFetchedAt: previousRow.fetchedAt,
    latestFetchedAt: latestRow.fetchedAt
  };
}

function parseBalanceAmount(value: string, fieldName: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid DeepSeek balance amount for ${fieldName}`);
  }
  return parsed;
}

async function recordDeepSeekApiErrorSnapshot(statusCode?: number): Promise<void> {
  await prisma.providerBalanceSnapshot.create({
    data: {
      providerType: DEEPSEEK_PROVIDER_TYPE,
      providerId: DEEPSEEK_PROVIDER_ID,
      isAvailable: false,
      currency: "UNKNOWN",
      totalBalance: 0,
      grantedBalance: 0,
      toppedUpBalance: 0,
      raw: {
        status: "provider_api_error",
        statusCode: statusCode ?? null,
        message: "DeepSeek balance API request failed."
      }
    }
  });
}

function toPublicSnapshot(row: {
  id: string;
  providerType: string;
  providerId: string | null;
  isAvailable: boolean;
  currency: string;
  totalBalance: number;
  grantedBalance: number;
  toppedUpBalance: number;
  raw: Prisma.JsonValue | null;
  fetchedAt: Date;
  createdAt: Date;
}): ProviderBalanceSnapshotDto {
  const raw = row.raw;
  const status = raw && typeof raw === "object" && !Array.isArray(raw) && "status" in raw && raw.status === "provider_api_error"
    ? "PROVIDER_API_ERROR"
    : "OK";

  return {
    id: row.id,
    providerType: row.providerType,
    providerId: row.providerId,
    isAvailable: row.isAvailable,
    currency: row.currency,
    totalBalance: row.totalBalance,
    grantedBalance: row.grantedBalance,
    toppedUpBalance: row.toppedUpBalance,
    fetchedAt: row.fetchedAt,
    createdAt: row.createdAt,
    status
  };
}
