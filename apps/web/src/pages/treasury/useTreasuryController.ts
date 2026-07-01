import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type {
  ProviderReconciliationSnapshotDto,
  ProviderRegistryDto,
  TreasuryAttentionTraceDto,
  TreasuryDailyDto,
  TreasuryFallbackAnalyticsDto,
  TreasuryMonthlyDto,
  TreasuryOverviewDto,
  TreasuryProviderDto,
  UsageRecordDto,
} from "@/types/api";
import { summarizeProviderSpend } from "./treasuryModels";

export type TreasuryOperation = "account" | "models" | "health" | "balance" | "reconcile";

export function useTreasuryController() {
  const [overview, setOverview] = useState<TreasuryOverviewDto | null>(null);
  const [providerRows, setProviderRows] = useState<TreasuryProviderDto[]>([]);
  const [registry, setRegistry] = useState<ProviderRegistryDto[]>([]);
  const [daily, setDaily] = useState<TreasuryDailyDto[]>([]);
  const [monthly, setMonthly] = useState<TreasuryMonthlyDto[]>([]);
  const [fallbackAnalytics, setFallbackAnalytics] = useState<TreasuryFallbackAnalyticsDto[]>([]);
  const [records, setRecords] = useState<UsageRecordDto[]>([]);
  const [attentionTraces, setAttentionTraces] = useState<TreasuryAttentionTraceDto[]>([]);
  const [reconciliation, setReconciliation] = useState<ProviderReconciliationSnapshotDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [failures, setFailures] = useState<string[]>([]);
  const [selectedProviderKey, setSelectedProviderKey] = useState<string | null>(null);
  const [operation, setOperation] = useState<TreasuryOperation | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);

  const load = useCallback(async (options: { quiet?: boolean } = {}) => {
    if (!options.quiet) setLoading(true);
    const results = await Promise.allSettled([
      api.treasuryOverview(),
      api.treasuryByProvider(),
      api.treasuryProviderRegistry(),
      api.treasuryReports(30),
      api.treasuryMonthly(12),
      api.treasuryFallbackAnalytics(),
      api.treasuryUsage(50),
      api.treasuryAttentionTraces(12),
      api.latestReconciliation(),
    ] as const);
    const missing: string[] = [];

    const [overviewResult, providerResult, registryResult, dailyResult, monthlyResult, fallbackResult, usageResult, traceResult, reconciliationResult] = results;
    if (overviewResult.status === "fulfilled") setOverview(overviewResult.value); else missing.push("overview");
    if (providerResult.status === "fulfilled") setProviderRows(providerResult.value.providers); else missing.push("provider spend");
    if (registryResult.status === "fulfilled") setRegistry(registryResult.value.providers); else missing.push("provider registry");
    if (dailyResult.status === "fulfilled") setDaily(dailyResult.value.daily); else missing.push("daily trend");
    if (monthlyResult.status === "fulfilled") setMonthly(monthlyResult.value.monthly); else missing.push("monthly trend");
    if (fallbackResult.status === "fulfilled") setFallbackAnalytics(fallbackResult.value.analytics); else missing.push("routing failures");
    if (usageResult.status === "fulfilled") setRecords(usageResult.value.records); else missing.push("usage records");
    if (traceResult.status === "fulfilled") setAttentionTraces(traceResult.value.traces); else missing.push("attention traces");
    if (reconciliationResult.status === "fulfilled") setReconciliation(reconciliationResult.value.snapshot); else missing.push("reconciliation");

    setFailures(missing);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const providers = useMemo(
    () => summarizeProviderSpend(registry, providerRows),
    [providerRows, registry],
  );

  useEffect(() => {
    if (providers.length === 0) {
      setSelectedProviderKey(null);
      return;
    }
    if (!selectedProviderKey || !providers.some((provider) => provider.key === selectedProviderKey)) {
      setSelectedProviderKey(providers[0]!.key);
    }
  }, [providers, selectedProviderKey]);

  const selectedProvider = providers.find((provider) => provider.key === selectedProviderKey) ?? null;
  const hasAnyData = overview !== null || providers.length > 0 || records.length > 0 || attentionTraces.length > 0;

  async function runOperation(nextOperation: TreasuryOperation) {
    setOperation(nextOperation);
    setOperationError(null);
    try {
      if (nextOperation === "account") await api.syncOpenRouterAccount();
      if (nextOperation === "models") await api.syncOpenRouterModels();
      if (nextOperation === "health") await api.computeProviderHealth();
      if (nextOperation === "balance") await api.syncDeepSeekBalance();
      if (nextOperation === "reconcile") {
        const result = await api.runReconciliation();
        setReconciliation(result.snapshot);
      }
      await load({ quiet: true });
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : "Treasury evidence operation failed");
    } finally {
      setOperation(null);
    }
  }

  return {
    overview,
    providers,
    selectedProvider,
    selectProvider: setSelectedProviderKey,
    daily,
    monthly,
    fallbackAnalytics,
    records,
    attentionTraces,
    reconciliation,
    loading,
    failures,
    hasAnyData,
    load,
    operation,
    operationError,
    runOperation,
  };
}

export type TreasuryController = ReturnType<typeof useTreasuryController>;
