import { isLocalSandboxProvider } from "@/lib/providerDisplay";
import type {
  AIProviderDto,
  ModelPricingDto,
  ProviderAccountSnapshotDto,
  ProviderHealthSnapshotDto,
  ProviderModelSnapshotDto,
} from "@/types/api";

export type ProviderFilter = "ALL" | "READY" | "ATTENTION" | "INACTIVE";
export type ProviderDetailSection = "overview" | "models" | "sources";
export type ProviderEditorMode = "create" | "edit" | null;
export type ProviderReadiness = Exclude<ProviderFilter, "ALL">;

export type ProviderTelemetry = {
  pricing: ModelPricingDto[];
  health: ProviderHealthSnapshotDto[];
  accounts: ProviderAccountSnapshotDto[];
  models: ProviderModelSnapshotDto[];
};

export type ProviderEditPayload = Pick<
  AIProviderDto,
  "defaultModel" | "priority" | "costTier"
>;

export type ProviderCreatePayload = {
  name: string;
  type: string;
  baseUrl?: string;
  defaultModel?: string;
  priority: number;
  costTier: string;
  credentialEnvKey?: string;
  capabilities: {
    supportsChat: boolean;
    supportsTools?: boolean;
    supportsVision?: boolean;
    supportsJsonMode?: boolean;
  };
};

export const EMPTY_TELEMETRY: ProviderTelemetry = {
  pricing: [],
  health: [],
  accounts: [],
  models: [],
};

export function getProviderHealth(
  provider: AIProviderDto,
  snapshots: ProviderHealthSnapshotDto[],
) {
  return (
    snapshots.find((item) => item.providerId === provider.id) ??
    snapshots.find((item) => item.providerType === provider.type) ??
    null
  );
}

export function getProviderAccount(
  provider: AIProviderDto,
  snapshots: ProviderAccountSnapshotDto[],
) {
  return (
    snapshots.find((item) => item.providerId === provider.id) ??
    snapshots.find((item) => item.providerType === provider.type) ??
    null
  );
}

export function getProviderModels(
  provider: AIProviderDto,
  snapshots: ProviderModelSnapshotDto[],
) {
  return snapshots.filter((item) => item.providerType === provider.type);
}

export function isProviderPricingKnown(
  provider: AIProviderDto,
  pricing: ModelPricingDto[],
) {
  if (!provider.defaultModel) return false;
  if (isLocalSandboxProvider(provider)) return true;
  return pricing.some(
    (item) =>
      item.providerType === provider.type &&
      item.model === provider.defaultModel &&
      item.isActive,
  );
}

export function getProviderReadiness(
  provider: AIProviderDto,
  snapshots: ProviderHealthSnapshotDto[],
): ProviderReadiness {
  if (!provider.isActive || provider.environmentMode === "DISABLED") {
    return "INACTIVE";
  }
  const sandbox = isLocalSandboxProvider(provider);
  const health = getProviderHealth(provider, snapshots)?.healthStatus;
  const validation = provider.modelValidationStatus;
  if (!sandbox && !provider.hasCredentials) return "ATTENTION";
  if (health === "DOWN" || health === "DEGRADED") return "ATTENTION";
  if (validation === "INVALID_MODEL" || validation === "PROVIDER_UNAVAILABLE") {
    return "ATTENTION";
  }
  return "READY";
}

export function getProviderCounts(
  providers: AIProviderDto[],
  health: ProviderHealthSnapshotDto[],
) {
  const readiness = providers.map((provider) =>
    getProviderReadiness(provider, health),
  );
  return {
    total: providers.length,
    ready: readiness.filter((item) => item === "READY").length,
    attention: readiness.filter((item) => item === "ATTENTION").length,
    inactive: readiness.filter((item) => item === "INACTIVE").length,
  };
}

export function filterProviders(
  providers: AIProviderDto[],
  health: ProviderHealthSnapshotDto[],
  search: string,
  filter: ProviderFilter,
) {
  const query = search.trim().toLowerCase();
  return providers.filter((provider) => {
    const matchesQuery =
      !query ||
      [provider.name, provider.type, provider.defaultModel, provider.id]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(query));
    const readiness = getProviderReadiness(provider, health);
    return matchesQuery && (filter === "ALL" || readiness === filter);
  });
}

export function credentialState(provider: AIProviderDto) {
  if (isLocalSandboxProvider(provider)) return "notRequired" as const;
  return provider.hasCredentials ? ("configured" as const) : ("missing" as const);
}

export function formatMoney(value: number | null | undefined) {
  return value == null ? "—" : `$${value.toFixed(4)}`;
}

export function formatPercent(value: number | null | undefined) {
  return value == null ? "—" : `${(value * 100).toFixed(1)}%`;
}
