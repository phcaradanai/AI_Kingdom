import { prisma } from "../db/prisma.js";

export type ProviderHealthStatus = "HEALTHY" | "DEGRADED" | "DOWN" | "UNKNOWN";
export type HealthWindowKind = "LAST_50" | "LAST_24H" | "LAST_7D" | "LIFETIME";

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
  windowKind: HealthWindowKind;
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

function emptyStats(providerType: string, providerId: string): Stats {
  return { providerType, providerId, successCount: 0, failureCount: 0, timeoutCount: 0, totalDurationMs: 0, durationSampleCount: 0, lastSuccessAt: null };
}

function accumulateStep(stats: Stats, step: { stepType: string; durationMs: number | null; errorMessage: string | null; metadata: unknown; endedAt: Date | null }): void {
  if (step.stepType === "PROVIDER_CALL_SUCCESS") {
    stats.successCount += 1;
    if (step.endedAt && (!stats.lastSuccessAt || step.endedAt > stats.lastSuccessAt)) {
      stats.lastSuccessAt = step.endedAt;
    }
  } else {
    stats.failureCount += 1;
    const msg = step.errorMessage?.toLowerCase() ?? "";
    const meta = step.metadata && typeof step.metadata === "object" ? step.metadata as Record<string, unknown> : {};
    if (msg.includes("timeout") || msg.includes("timed out") || String(meta.statusCode) === "408" || String(meta.statusCode) === "504") {
      stats.timeoutCount += 1;
    }
  }
  if (step.durationMs != null) {
    stats.totalDurationMs += step.durationMs;
    stats.durationSampleCount += 1;
  }
}

function computeHealth(stats: Stats): { failureRate: number | null; timeoutRate: number | null; avgDurationMs: number | null; healthStatus: ProviderHealthStatus } {
  const totalCalls = stats.successCount + stats.failureCount;
  const failureRate = totalCalls > 0 ? stats.failureCount / totalCalls : null;
  const timeoutRate = stats.failureCount > 0 ? stats.timeoutCount / stats.failureCount : null;
  const avgDurationMs = stats.durationSampleCount > 0 ? Math.round(stats.totalDurationMs / stats.durationSampleCount) : null;
  const healthStatus = classifyHealth(failureRate, totalCalls);
  return { failureRate, timeoutRate, avgDurationMs, healthStatus };
}

async function persistSnapshot(
  stats: Stats,
  windowKind: HealthWindowKind,
  computedAt: Date
): Promise<ProviderHealthSnapshotDto> {
  const { failureRate, timeoutRate, avgDurationMs, healthStatus } = computeHealth(stats);
  const totalCalls = stats.successCount + stats.failureCount;
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
      windowKind,
      computedAt
    }
  });
  return toHealthSnapshotDto(row);
}

export async function computeAndPersistHealthSnapshots(): Promise<ProviderHealthComputeResult> {
  const now = new Date();
  const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Fetch all relevant steps once, ordered by startedAt desc (for LAST_50 slicing)
  const allSteps = await prisma.aIUsageTraceStep.findMany({
    where: {
      stepType: { in: ["PROVIDER_CALL_SUCCESS", "PROVIDER_CALL_FAILED"] },
      providerId: { not: null }
    },
    select: {
      stepType: true,
      providerId: true,
      providerType: true,
      durationMs: true,
      errorMessage: true,
      metadata: true,
      endedAt: true,
      startedAt: true
    },
    orderBy: { startedAt: "desc" }
  });

  // Group all steps per provider key
  const allByProvider = new Map<string, (typeof allSteps)>();
  for (const step of allSteps) {
    if (!step.providerId) continue;
    const key = step.providerId;
    if (!allByProvider.has(key)) allByProvider.set(key, []);
    allByProvider.get(key)!.push(step);
  }

  const computedAt = new Date();
  const created: ProviderHealthSnapshotDto[] = [];

  for (const [providerId, steps] of allByProvider) {
    const providerType = steps[0]?.providerType ?? providerId;

    // LAST_50
    const last50Steps = steps.slice(0, 50);
    const statsLast50 = emptyStats(providerType, providerId);
    for (const step of last50Steps) accumulateStep(statsLast50, step);
    created.push(await persistSnapshot(statsLast50, "LAST_50", computedAt));

    // LAST_24H
    const last24hSteps = steps.filter((s) => s.startedAt >= since24h);
    const statsLast24h = emptyStats(providerType, providerId);
    for (const step of last24hSteps) accumulateStep(statsLast24h, step);
    created.push(await persistSnapshot(statsLast24h, "LAST_24H", computedAt));

    // LAST_7D
    const last7dSteps = steps.filter((s) => s.startedAt >= since7d);
    const statsLast7d = emptyStats(providerType, providerId);
    for (const step of last7dSteps) accumulateStep(statsLast7d, step);
    created.push(await persistSnapshot(statsLast7d, "LAST_7D", computedAt));
  }

  return { snapshots: created, computedAt };
}

export async function getLatestProviderHealthSnapshots(windowKind: HealthWindowKind = "LAST_50"): Promise<ProviderHealthSnapshotDto[]> {
  const rows = await prisma.providerHealthSnapshot.findMany({
    where: { windowKind },
    orderBy: { computedAt: "desc" }
  });

  const latest = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const key = `${row.providerType}:${row.providerId ?? ""}`;
    if (!latest.has(key)) latest.set(key, row);
  }

  // Fall back to LIFETIME snapshots if no windowed snapshot exists
  if (latest.size === 0 && windowKind !== "LIFETIME") {
    return getLatestProviderHealthSnapshots("LIFETIME");
  }

  return Array.from(latest.values())
    .sort((a, b) => a.providerType.localeCompare(b.providerType))
    .map(toHealthSnapshotDto);
}

export async function getLatestHealthSnapshotForProvider(providerType: string, providerId?: string, windowKind: HealthWindowKind = "LAST_50"): Promise<ProviderHealthSnapshotDto | null> {
  const where = providerId
    ? { providerType, providerId, windowKind }
    : { providerType, windowKind };

  const row = await prisma.providerHealthSnapshot.findFirst({
    where,
    orderBy: { computedAt: "desc" }
  });

  if (!row && windowKind !== "LIFETIME") {
    return getLatestHealthSnapshotForProvider(providerType, providerId, "LIFETIME");
  }

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
  windowKind?: string;
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
    windowKind: (row.windowKind ?? "LIFETIME") as HealthWindowKind,
    computedAt: row.computedAt,
    createdAt: row.createdAt
  };
}
