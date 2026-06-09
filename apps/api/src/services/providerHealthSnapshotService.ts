import { prisma } from "../db/prisma.js";

export type ProviderHealthStatus = "HEALTHY" | "DEGRADED" | "DOWN" | "UNKNOWN";

export type ProviderHealthSnapshotDto = {
  id: string;
  providerType: string;
  providerId: string | null;
  lastSuccessAt: Date | null;
  failureRate: number | null;
  timeoutRate: number | null;
  avgDurationMs: number | null;
  sampleSize: number;
  healthStatus: ProviderHealthStatus;
  computedAt: Date;
  createdAt: Date;
};

export type ProviderHealthComputeResult = {
  snapshots: ProviderHealthSnapshotDto[];
  computedAt: Date;
};

const FAILURE_RATE_DEGRADED = 0.1;
const FAILURE_RATE_DOWN = 0.5;
const MIN_SAMPLE_SIZE = 3;

function classifyHealth(failureRate: number | null, sampleSize: number): ProviderHealthStatus {
  if (sampleSize < MIN_SAMPLE_SIZE) return "UNKNOWN";
  if (failureRate === null) return "UNKNOWN";
  if (failureRate >= FAILURE_RATE_DOWN) return "DOWN";
  if (failureRate >= FAILURE_RATE_DEGRADED) return "DEGRADED";
  return "HEALTHY";
}

export async function computeAndPersistHealthSnapshots(): Promise<ProviderHealthComputeResult> {
  // Aggregate from AIUsageTraceStep to avoid live query overhead in routing
  const steps = await prisma.aIUsageTraceStep.findMany({
    where: {
      stepType: { in: ["PROVIDER_CALL_SUCCESS", "PROVIDER_CALL_FAILED"] },
      providerId: { not: null }
    },
    select: {
      stepType: true,
      providerId: true,
      providerType: true,
      providerName: true,
      durationMs: true,
      errorMessage: true,
      metadata: true,
      endedAt: true
    }
  });

  type Stats = {
    providerType: string;
    providerId: string;
    successCount: number;
    failureCount: number;
    timeoutCount: number;
    totalDurationMs: number;
    durationSampleCount: number;
    lastSuccessAt: Date | null;
  };

  const statsMap = new Map<string, Stats>();

  for (const step of steps) {
    if (!step.providerId) continue;
    const key = `${step.providerId}`;
    const existing = statsMap.get(key) ?? {
      providerType: step.providerType ?? step.providerId,
      providerId: step.providerId,
      successCount: 0,
      failureCount: 0,
      timeoutCount: 0,
      totalDurationMs: 0,
      durationSampleCount: 0,
      lastSuccessAt: null
    };

    if (step.stepType === "PROVIDER_CALL_SUCCESS") {
      existing.successCount += 1;
      if (step.endedAt && (!existing.lastSuccessAt || step.endedAt > existing.lastSuccessAt)) {
        existing.lastSuccessAt = step.endedAt;
      }
    } else {
      existing.failureCount += 1;
      const msg = step.errorMessage?.toLowerCase() ?? "";
      const meta = step.metadata && typeof step.metadata === "object" ? step.metadata as Record<string, unknown> : {};
      if (msg.includes("timeout") || msg.includes("timed out") || String(meta.statusCode) === "408" || String(meta.statusCode) === "504") {
        existing.timeoutCount += 1;
      }
    }

    if (step.durationMs != null) {
      existing.totalDurationMs += step.durationMs;
      existing.durationSampleCount += 1;
    }

    statsMap.set(key, existing);
  }

  const computedAt = new Date();
  const created: ProviderHealthSnapshotDto[] = [];

  for (const stats of statsMap.values()) {
    const totalCalls = stats.successCount + stats.failureCount;
    const failureRate = totalCalls > 0 ? stats.failureCount / totalCalls : null;
    const timeoutRate = stats.failureCount > 0 ? stats.timeoutCount / stats.failureCount : null;
    const avgDurationMs = stats.durationSampleCount > 0 ? Math.round(stats.totalDurationMs / stats.durationSampleCount) : null;
    const healthStatus = classifyHealth(failureRate, totalCalls);

    const row = await prisma.providerHealthSnapshot.create({
      data: {
        providerType: stats.providerType,
        providerId: stats.providerId,
        lastSuccessAt: stats.lastSuccessAt,
        failureRate,
        timeoutRate,
        avgDurationMs,
        sampleSize: totalCalls,
        healthStatus,
        computedAt
      }
    });

    created.push(toHealthSnapshotDto(row));
  }

  return { snapshots: created, computedAt };
}

export async function getLatestProviderHealthSnapshots(): Promise<ProviderHealthSnapshotDto[]> {
  const rows = await prisma.providerHealthSnapshot.findMany({
    orderBy: { computedAt: "desc" }
  });

  const latest = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const key = `${row.providerType}:${row.providerId ?? ""}`;
    if (!latest.has(key)) latest.set(key, row);
  }

  return Array.from(latest.values())
    .sort((a, b) => a.providerType.localeCompare(b.providerType))
    .map(toHealthSnapshotDto);
}

export async function getLatestHealthSnapshotForProvider(providerType: string, providerId?: string): Promise<ProviderHealthSnapshotDto | null> {
  const where = providerId
    ? { providerType, providerId }
    : { providerType };

  const row = await prisma.providerHealthSnapshot.findFirst({
    where,
    orderBy: { computedAt: "desc" }
  });
  return row ? toHealthSnapshotDto(row) : null;
}

function toHealthSnapshotDto(row: {
  id: string;
  providerType: string;
  providerId: string | null;
  lastSuccessAt: Date | null;
  failureRate: number | null;
  timeoutRate: number | null;
  avgDurationMs: number | null;
  sampleSize: number;
  healthStatus: string;
  computedAt: Date;
  createdAt: Date;
}): ProviderHealthSnapshotDto {
  return {
    id: row.id,
    providerType: row.providerType,
    providerId: row.providerId,
    lastSuccessAt: row.lastSuccessAt,
    failureRate: row.failureRate,
    timeoutRate: row.timeoutRate,
    avgDurationMs: row.avgDurationMs,
    sampleSize: row.sampleSize,
    healthStatus: row.healthStatus as ProviderHealthStatus,
    computedAt: row.computedAt,
    createdAt: row.createdAt
  };
}
