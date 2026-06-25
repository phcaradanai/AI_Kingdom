import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useKingdomStore } from "@/stores/kingdomStore";
import type { AIProviderDto } from "@/types/api";
import {
  EMPTY_TELEMETRY,
  filterProviders,
  getProviderAccount,
  getProviderCounts,
  getProviderHealth,
  getProviderModels,
  type ProviderCreatePayload,
  type ProviderDetailSection,
  type ProviderEditPayload,
  type ProviderEditorMode,
  type ProviderFilter,
  type ProviderTelemetry,
} from "./providerModels";

export function useProvidersController() {
  const providers = useKingdomStore((state) => state.providers);
  const updateProvider = useKingdomStore((state) => state.updateProvider);
  const createProvider = useKingdomStore((state) => state.createProvider);
  const deleteProvider = useKingdomStore((state) => state.deleteProvider);
  const refresh = useKingdomStore((state) => state.refresh);
  const [telemetry, setTelemetry] =
    useState<ProviderTelemetry>(EMPTY_TELEMETRY);
  const [telemetryLoading, setTelemetryLoading] = useState(true);
  const [telemetryError, setTelemetryError] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ProviderFilter>("ALL");
  const [detailSection, setDetailSection] =
    useState<ProviderDetailSection>("overview");
  const [mobileView, setMobileView] = useState<"registry" | "detail">(
    "registry",
  );
  const [editorMode, setEditorMode] = useState<ProviderEditorMode>(null);
  const [deleteTarget, setDeleteTarget] = useState<AIProviderDto | null>(null);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<"saved" | "created" | "synced" | null>(
    null,
  );

  const loadTelemetry = useCallback(async () => {
    setTelemetryLoading(true);
    setTelemetryError(false);
    const [pricingResult, healthResult, accountsResult, modelsResult] =
      await Promise.allSettled([
        api.modelPricing(),
        api.providerHealth(),
        api.providerAccounts(),
        api.providerModels("openrouter"),
      ]);
    setTelemetry({
      pricing:
        pricingResult.status === "fulfilled"
          ? pricingResult.value.modelPricing
          : [],
      health:
        healthResult.status === "fulfilled" ? healthResult.value.health : [],
      accounts:
        accountsResult.status === "fulfilled"
          ? accountsResult.value.accounts
          : [],
      models:
        modelsResult.status === "fulfilled" ? modelsResult.value.models : [],
    });
    setTelemetryError(
      [pricingResult, healthResult, accountsResult, modelsResult].some(
        (result) => result.status === "rejected",
      ),
    );
    setTelemetryLoading(false);
  }, []);

  useEffect(() => {
    void loadTelemetry();
  }, [loadTelemetry]);

  useEffect(() => {
    if (providers.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !providers.some((item) => item.id === selectedId)) {
      const [firstProvider] = providers;
      if (!firstProvider) {
        return;
      }
      setSelectedId(firstProvider.id);
    }
  }, [providers, selectedId]);

  const selected =
    providers.find((provider) => provider.id === selectedId) ?? null;
  const filteredProviders = useMemo(
    () => filterProviders(providers, telemetry.health, search, filter),
    [filter, providers, search, telemetry.health],
  );
  const counts = useMemo(
    () => getProviderCounts(providers, telemetry.health),
    [providers, telemetry.health],
  );

  function selectProvider(id: string) {
    setSelectedId(id);
    setDetailSection("overview");
    setMobileView("detail");
  }

  async function syncModels() {
    setSyncing(true);
    setError(null);
    try {
      await api.validateModels();
      await refresh();
      await loadTelemetry();
      setNotice("synced");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  async function saveEdit(payload: ProviderEditPayload) {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      await updateProvider(selected.id, payload);
      setEditorMode(null);
      setNotice("saved");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function create(payload: ProviderCreatePayload) {
    setSaving(true);
    setError(null);
    try {
      const provider = await createProvider(payload);
      setSelectedId(provider.id);
      setEditorMode(null);
      setMobileView("detail");
      setNotice("created");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Create failed");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      await updateProvider(selected.id, { isActive: !selected.isActive });
      setNotice("saved");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setSaving(true);
    setError(null);
    try {
      await deleteProvider(deleteTarget.id);
      setDeleteTarget(null);
      setEditorMode(null);
      setMobileView("registry");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Delete failed");
    } finally {
      setSaving(false);
    }
  }

  return {
    accounts: telemetry.accounts,
    confirmDelete,
    counts,
    create,
    deleteTarget,
    detailSection,
    editorMode,
    error,
    filter,
    filteredProviders,
    health: telemetry.health,
    loadTelemetry,
    mobileView,
    models: selected ? getProviderModels(selected, telemetry.models) : [],
    notice,
    openCreate: () => setEditorMode("create"),
    openEdit: () => setEditorMode("edit"),
    pricing: telemetry.pricing,
    providerAccount: selected
      ? getProviderAccount(selected, telemetry.accounts)
      : null,
    providerHealth: selected
      ? getProviderHealth(selected, telemetry.health)
      : null,
    providers,
    saveEdit,
    saving,
    search,
    selected,
    selectProvider,
    setDeleteTarget,
    setDetailSection,
    setEditorMode,
    setFilter,
    setMobileView,
    setSearch,
    syncing,
    syncModels,
    telemetryError,
    telemetryLoading,
    toggleActive,
  };
}

export type ProvidersController = ReturnType<typeof useProvidersController>;
