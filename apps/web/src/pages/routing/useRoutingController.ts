import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type {
  ProviderModelSnapshotDto,
  ProviderRegistryDto,
  RouteChainDto,
} from "@/types/api";
import {
  blankDraft,
  filterRouteChains,
  getEntryModel,
  getRoutingCounts,
  type RouteChainDraft,
  type RouteChainFilter,
  type RoutingDetailSection,
  type RoutingEditorMode,
} from "./routingModels";

export function useRoutingController() {
  const [chains, setChains] = useState<RouteChainDto[]>([]);
  const [providers, setProviders] = useState<ProviderRegistryDto[]>([]);
  const [models, setModels] = useState<ProviderModelSnapshotDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [modelCatalogError, setModelCatalogError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<"created" | "saved" | "duplicated" | "deleted" | "refreshed" | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<RouteChainFilter>("ALL");
  const [detailSection, setDetailSection] = useState<RoutingDetailSection>("sequence");
  const [mobileView, setMobileView] = useState<"registry" | "detail">("registry");
  const [editorMode, setEditorMode] = useState<RoutingEditorMode>(null);
  const [deleteTarget, setDeleteTarget] = useState<RouteChainDto | null>(null);

  const load = useCallback(async (options: { quiet?: boolean } = {}) => {
    if (!options.quiet) setLoading(true);
    setError(null);
    setModelCatalogError(false);
    try {
      const [chainsResult, registryResult, modelsResult] = await Promise.all([
        api.routeChains(),
        api.treasuryProviderRegistry(),
        api.providerModels("openrouter").catch(() => {
          setModelCatalogError(true);
          return { models: [] as ProviderModelSnapshotDto[], lastSyncedAt: null };
        }),
      ]);
      setChains(chainsResult.routeChains);
      setProviders(registryResult.providers);
      setModels(modelsResult.models);
      if (options.quiet) setNotice("refreshed");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Failed to load routing data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (chains.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !chains.some((chain) => chain.id === selectedId)) {
      setSelectedId(chains[0]?.id ?? null);
    }
  }, [chains, selectedId]);

  const selected = chains.find((chain) => chain.id === selectedId) ?? null;
  const filteredChains = useMemo(
    () => filterRouteChains(chains, search, filter),
    [chains, filter, search],
  );
  const counts = useMemo(() => getRoutingCounts(chains), [chains]);

  function selectChain(id: string) {
    setSelectedId(id);
    setDetailSection("sequence");
    setMobileView("detail");
  }

  async function createChain(draft: RouteChainDraft) {
    setSaving(true);
    setError(null);
    try {
      const created = await api.createRouteChain({
        name: draft.name,
        taskMode: draft.taskMode || null,
        scope: draft.scope,
        description: draft.description || null,
        entries: draft.entries.map((entry) => ({
          providerId: entry.providerId,
          model: getEntryModel(entry, providers),
          isEnabled: entry.isEnabled,
          notes: entry.notes || null,
        })),
      });
      setChains((current) => [...current, created.routeChain]);
      setSelectedId(created.routeChain.id);
      setMobileView("detail");
      setEditorMode(null);
      setNotice("created");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Create failed");
    } finally {
      setSaving(false);
    }
  }

  async function updateChain(draft: RouteChainDraft) {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await api.updateRouteChain(selected.id, {
        name: draft.name,
        description: draft.description || null,
        entries: draft.entries.map((entry) => ({
          providerId: entry.providerId,
          model: getEntryModel(entry, providers),
          isEnabled: entry.isEnabled,
          notes: entry.notes || null,
        })),
      });
      setChains((current) =>
        current.map((chain) =>
          chain.id === updated.routeChain.id ? updated.routeChain : chain,
        ),
      );
      setEditorMode(null);
      setNotice("saved");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function toggleSelectedActive() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await api.updateRouteChain(selected.id, {
        isActive: !selected.isActive,
      });
      setChains((current) =>
        current.map((chain) =>
          chain.id === updated.routeChain.id ? updated.routeChain : chain,
        ),
      );
      setNotice("saved");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  async function duplicateSelected() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      const copy = await api.duplicateRouteChain(selected.id);
      setChains((current) => [...current, copy.routeChain]);
      setSelectedId(copy.routeChain.id);
      setNotice("duplicated");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Duplicate failed");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setSaving(true);
    setError(null);
    try {
      await api.deleteRouteChain(deleteTarget.id);
      setChains((current) => current.filter((chain) => chain.id !== deleteTarget.id));
      setDeleteTarget(null);
      setMobileView("registry");
      setNotice("deleted");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Delete failed");
    } finally {
      setSaving(false);
    }
  }

  return {
    chains,
    confirmDelete,
    counts,
    createChain,
    deleteTarget,
    detailSection,
    duplicateSelected,
    editorMode,
    error,
    filter,
    filteredChains,
    loading,
    load,
    mobileView,
    modelCatalogError,
    models,
    notice,
    openCreate: () => setEditorMode("create"),
    openEdit: () => setEditorMode("edit"),
    providers,
    saving,
    search,
    selectChain,
    selected,
    setDeleteTarget,
    setDetailSection,
    setEditorMode,
    setFilter,
    setMobileView,
    setSearch,
    toggleSelectedActive,
    updateChain,
  };
}

export type RoutingController = ReturnType<typeof useRoutingController>;

export function initialRoutingDraft(chain: RouteChainDto | null) {
  return chain ? undefined : blankDraft();
}
