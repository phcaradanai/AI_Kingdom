import type {
  ProviderHealthStatus,
  ProviderModelSnapshotDto,
  ProviderRegistryDto,
  RouteChainDto,
  RouteChainEntryDto,
} from "@/types/api";

export type RouteChainFilter = "ALL" | "ACTIVE" | "DISABLED" | "GLOBAL" | "TASK_MODE";
export type RoutingDetailSection = "sequence" | "providers" | "models" | "sources";
export type RoutingEditorMode = "create" | "edit" | null;

export type RouteEntryDraft = {
  providerId: string;
  model: string;
  isEnabled: boolean;
  notes: string;
};

export type RouteChainDraft = {
  name: string;
  taskMode: string;
  scope: string;
  description: string;
  entries: RouteEntryDraft[];
};

export const ROUTE_FILTERS: RouteChainFilter[] = [
  "ALL",
  "ACTIVE",
  "DISABLED",
  "GLOBAL",
  "TASK_MODE",
];

export const DETAIL_SECTIONS: RoutingDetailSection[] = [
  "sequence",
  "providers",
  "models",
  "sources",
];

export function blankEntry(): RouteEntryDraft {
  return { providerId: "", model: "", isEnabled: true, notes: "" };
}

export function blankDraft(): RouteChainDraft {
  return {
    name: "",
    taskMode: "",
    scope: "GLOBAL",
    description: "",
    entries: [blankEntry()],
  };
}

export function draftFromChain(chain: RouteChainDto): RouteChainDraft {
  return {
    name: chain.name,
    taskMode: chain.taskMode ?? "",
    scope: chain.scope,
    description: chain.description ?? "",
    entries: chain.entries.map(entryToDraft),
  };
}

export function entryToDraft(entry: RouteChainEntryDto): RouteEntryDraft {
  return {
    providerId: entry.providerId,
    model: entry.model,
    isEnabled: entry.isEnabled,
    notes: entry.notes ?? "",
  };
}

export function getProviderForEntry(
  entry: Pick<RouteChainEntryDto | RouteEntryDraft, "providerId">,
  providers: ProviderRegistryDto[],
) {
  return providers.find((provider) => provider.id === entry.providerId) ?? null;
}

export function getEntryModel(
  entry: Pick<RouteEntryDraft, "model" | "providerId">,
  providers: ProviderRegistryDto[],
) {
  return entry.model || getProviderForEntry(entry, providers)?.defaultModel || "";
}

export function getEnabledEntries(chain: RouteChainDto) {
  return chain.entries.filter((entry) => entry.isEnabled);
}

export function getUsedProviders(
  chain: RouteChainDto,
  providers: ProviderRegistryDto[],
) {
  const ids = new Set(chain.entries.map((entry) => entry.providerId));
  return providers.filter((provider) => ids.has(provider.id));
}

export function filterRouteChains(
  chains: RouteChainDto[],
  search: string,
  filter: RouteChainFilter,
) {
  const query = search.trim().toLowerCase();
  return chains.filter((chain) => {
    const matchesQuery =
      !query ||
      [
        chain.name,
        chain.description,
        chain.scope,
        chain.taskMode,
        chain.agentId,
        ...chain.entries.flatMap((entry) => [entry.providerId, entry.model, entry.notes]),
      ]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLowerCase().includes(query));
    if (!matchesQuery) return false;
    if (filter === "ACTIVE") return chain.isActive;
    if (filter === "DISABLED") return !chain.isActive;
    if (filter === "GLOBAL") return chain.scope === "GLOBAL";
    if (filter === "TASK_MODE") return chain.scope === "TASK_MODE" || Boolean(chain.taskMode);
    return true;
  });
}

export function getRoutingCounts(chains: RouteChainDto[]) {
  return {
    total: chains.length,
    active: chains.filter((chain) => chain.isActive).length,
    disabled: chains.filter((chain) => !chain.isActive).length,
    routes: chains.reduce((sum, chain) => sum + chain.entries.length, 0),
  };
}

export function getProviderHealthStatus(
  provider: ProviderRegistryDto | null | undefined,
): ProviderHealthStatus {
  return provider?.healthStatus ?? "UNKNOWN";
}

export function getMatchingModelSnapshots(
  chain: RouteChainDto,
  models: ProviderModelSnapshotDto[],
) {
  const pairs = new Set(
    chain.entries.map((entry) => `${providerTypeFromId(entry.providerId)}:${entry.model}`),
  );
  return models.filter((model) => pairs.has(`${model.providerType}:${model.modelId}`));
}

export function providerTypeFromId(providerId: string) {
  if (providerId === "local-sandbox-baseline") return "sandbox";
  if (providerId.includes("openrouter")) return "openrouter";
  if (providerId.includes("deepseek")) return "deepseek";
  if (providerId.includes("openai")) return "openai";
  if (providerId.includes("anthropic")) return "anthropic";
  if (providerId.includes("gemini")) return "gemini";
  return providerId;
}

export function healthTone(status: ProviderHealthStatus) {
  if (status === "HEALTHY") return "text-emerald-300";
  if (status === "DEGRADED") return "text-amber-300";
  if (status === "DOWN") return "text-red-300";
  return "text-muted-foreground";
}

export function healthDotClass(status: ProviderHealthStatus) {
  if (status === "HEALTHY") return "bg-emerald-400";
  if (status === "DEGRADED") return "bg-amber-400";
  if (status === "DOWN") return "bg-red-400";
  return "bg-muted-foreground/40";
}
