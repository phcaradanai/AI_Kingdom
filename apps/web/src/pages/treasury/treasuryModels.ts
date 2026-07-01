import { getProviderDisplayName } from "@/lib/providerDisplay";
import type {
  ProviderHealthStatus,
  ProviderRegistryDto,
  TreasuryAttentionTraceDto,
  TreasuryOverviewDto,
  TreasuryProviderDto,
} from "@/types/api";

export type ProviderSpendSummary = {
  key: string;
  name: string;
  type: string;
  status: ProviderRegistryDto["status"] | "USAGE_ONLY";
  healthStatus: ProviderHealthStatus;
  balance: number | null;
  lastSyncAt: string | null;
  spend: number;
  calls: number;
  tokens: number;
  models: TreasuryProviderDto[];
};

export type TreasurySignal = {
  tone: "healthy" | "attention" | "danger" | "unknown";
  labelKey: string;
};

export function formatCost(usd: number): string {
  if (usd === 0) return "$0.00";
  if (usd < 0.0001) return `$${usd.toExponential(2)}`;
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

export function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

export function formatBalance(amount: number | null): string {
  return amount === null ? "—" : `$${amount.toFixed(2)}`;
}

export function summarizeProviderSpend(
  registry: ProviderRegistryDto[],
  providerRows: TreasuryProviderDto[],
): ProviderSpendSummary[] {
  const summaries = new Map<string, ProviderSpendSummary>();

  for (const provider of registry) {
    summaries.set(provider.id, {
      key: provider.id,
      name: provider.name,
      type: provider.type,
      status: provider.status,
      healthStatus: provider.healthStatus,
      balance: provider.balance,
      lastSyncAt: provider.lastSyncAt,
      spend: provider.spend,
      calls: 0,
      tokens: 0,
      models: [],
    });
  }

  for (const row of providerRows) {
    const registryMatch = registry.find((provider) =>
      provider.id === row.providerId ||
      provider.id === row.provider ||
      provider.type === row.provider,
    );
    const key = registryMatch?.id ?? row.providerId ?? row.provider;
    const current = summaries.get(key) ?? {
      key,
      name: getProviderDisplayName(row.providerId ?? row.provider),
      type: row.provider,
      status: "USAGE_ONLY" as const,
      healthStatus: "UNKNOWN" as const,
      balance: null,
      lastSyncAt: null,
      spend: 0,
      calls: 0,
      tokens: 0,
      models: [],
    };
    current.models.push(row);
    current.spend = current.models.reduce((sum, model) => sum + model.totalCostUSD, 0);
    current.calls = current.models.reduce((sum, model) => sum + model.callCount, 0);
    current.tokens = current.models.reduce((sum, model) => sum + model.totalTokens, 0);
    summaries.set(key, current);
  }

  return [...summaries.values()].sort((left, right) =>
    right.spend - left.spend || left.name.localeCompare(right.name),
  );
}

export function getBudgetSignal(overview: TreasuryOverviewDto | null): TreasurySignal {
  if (!overview) return { tone: "unknown", labelKey: "treasury.risk.unknown" };
  if (overview.budgetStatus.dailyWarning || overview.budgetStatus.monthlyWarning) {
    return { tone: "danger", labelKey: "treasury.budget.warning" };
  }
  if (overview.budgetStatus.dailyLimit === null && overview.budgetStatus.monthlyLimit === null) {
    return { tone: "unknown", labelKey: "treasury.budget.unset" };
  }
  return { tone: "healthy", labelKey: "treasury.budget.within" };
}

export function getHealthSignal(providers: ProviderSpendSummary[]): TreasurySignal {
  const statuses = providers.filter((provider) => provider.status !== "DISABLED").map((provider) => provider.healthStatus);
  if (statuses.includes("DOWN")) return { tone: "danger", labelKey: "treasury.health.down" };
  if (statuses.includes("DEGRADED")) return { tone: "attention", labelKey: "treasury.health.degraded" };
  if (statuses.length === 0 || statuses.every((status) => status === "UNKNOWN")) {
    return { tone: "unknown", labelKey: "treasury.health.unknown" };
  }
  return { tone: "healthy", labelKey: "treasury.health.healthy" };
}

export function getRiskSignal(input: {
  overview: TreasuryOverviewDto | null;
  providers: ProviderSpendSummary[];
  traces: TreasuryAttentionTraceDto[];
  partial: boolean;
}): TreasurySignal {
  if (!input.overview && input.providers.length === 0) {
    return { tone: "unknown", labelKey: "treasury.risk.unknown" };
  }
  const budget = getBudgetSignal(input.overview);
  const health = getHealthSignal(input.providers);
  if (budget.tone === "danger" || health.tone === "danger" || input.traces.some((trace) => trace.attentionKind === "FAILED")) {
    return { tone: "danger", labelKey: "treasury.risk.high" };
  }
  if (input.partial || health.tone === "attention" || health.tone === "unknown") {
    return { tone: "attention", labelKey: "treasury.risk.attention" };
  }
  return { tone: "healthy", labelKey: "treasury.risk.controlled" };
}

export function traceMatchesProvider(trace: TreasuryAttentionTraceDto, provider: ProviderSpendSummary): boolean {
  return trace.providerId === provider.key || trace.providerType === provider.type || trace.providerName === provider.name;
}
