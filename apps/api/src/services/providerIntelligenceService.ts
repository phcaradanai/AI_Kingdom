import { getLatestOpenRouterAccountSnapshot } from "./providerAccountSyncService.js";
import { getLatestProviderHealthSnapshots, getLatestHealthSnapshotForProvider, type ProviderHealthStatus } from "./providerHealthSnapshotService.js";
import { getLatestProviderModelSnapshots } from "./providerModelSyncService.js";

export type CachedProviderAvailability = {
  providerType: string;
  providerId: string | null;
  isAvailable: boolean;
  creditsRemaining: number | null;
  lastSyncedAt: Date | null;
};

export type CachedProviderHealth = {
  providerType: string;
  providerId: string | null;
  healthStatus: ProviderHealthStatus;
  failureRate: number | null;
  avgDurationMs: number | null;
  lastSuccessAt: Date | null;
  computedAt: Date | null;
};

export type CachedProviderCost = {
  providerType: string;
  modelId: string;
  inputPricePerMillion: number | null;
  outputPricePerMillion: number | null;
  contextWindow: number | null;
  syncedAt: Date;
};

export type ProviderIntelligenceSummary = {
  availability: CachedProviderAvailability[];
  health: CachedProviderHealth[];
  lastHealthComputedAt: Date | null;
  lastModelSyncedAt: Date | null;
};

export async function getCachedProviderAvailability(): Promise<CachedProviderAvailability[]> {
  const [accountSnapshots] = await Promise.all([
    Promise.all([
      getLatestOpenRouterAccountSnapshot()
    ])
  ]);

  const results: CachedProviderAvailability[] = [];

  const openRouterSnapshot = accountSnapshots[0];
  if (openRouterSnapshot) {
    const hasCredits = openRouterSnapshot.creditsRemaining === null || openRouterSnapshot.creditsRemaining > 0;
    results.push({
      providerType: openRouterSnapshot.providerType,
      providerId: openRouterSnapshot.providerId,
      isAvailable: openRouterSnapshot.status === "ACTIVE" && hasCredits,
      creditsRemaining: openRouterSnapshot.creditsRemaining,
      lastSyncedAt: openRouterSnapshot.syncedAt
    });
  }

  return results;
}

export async function getCachedProviderHealth(providerType?: string, providerId?: string): Promise<CachedProviderHealth[]> {
  if (providerType) {
    const snapshot = await getLatestHealthSnapshotForProvider(providerType, providerId);
    if (!snapshot) return [];
    return [{
      providerType: snapshot.providerType,
      providerId: snapshot.providerId,
      healthStatus: snapshot.healthStatus,
      failureRate: snapshot.failureRate,
      avgDurationMs: snapshot.avgDurationMs,
      lastSuccessAt: snapshot.lastSuccessAt,
      computedAt: snapshot.computedAt
    }];
  }

  const snapshots = await getLatestProviderHealthSnapshots();
  return snapshots.map((s) => ({
    providerType: s.providerType,
    providerId: s.providerId,
    healthStatus: s.healthStatus,
    failureRate: s.failureRate,
    avgDurationMs: s.avgDurationMs,
    lastSuccessAt: s.lastSuccessAt,
    computedAt: s.computedAt
  }));
}

export async function getCachedProviderCosts(providerType = "openrouter"): Promise<CachedProviderCost[]> {
  const models = await getLatestProviderModelSnapshots(providerType);
  return models.map((m) => ({
    providerType: m.providerType,
    modelId: m.modelId,
    inputPricePerMillion: m.inputPricePerMillion,
    outputPricePerMillion: m.outputPricePerMillion,
    contextWindow: m.contextWindow,
    syncedAt: m.syncedAt
  }));
}

export async function getProviderIntelligenceSummary(): Promise<ProviderIntelligenceSummary> {
  const [availability, health, models] = await Promise.all([
    getCachedProviderAvailability(),
    getCachedProviderHealth(),
    getLatestProviderModelSnapshots()
  ]);

  const lastHealthComputedAt = health.reduce<Date | null>((latest, h) => {
    if (!h.computedAt) return latest;
    return !latest || h.computedAt > latest ? h.computedAt : latest;
  }, null);

  const lastModelSyncedAt = models.reduce<Date | null>((latest, m) => {
    return !latest || m.syncedAt > latest ? m.syncedAt : latest;
  }, null);

  return {
    availability,
    health,
    lastHealthComputedAt,
    lastModelSyncedAt
  };
}
