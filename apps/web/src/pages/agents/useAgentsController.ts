import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useKingdomStore } from "@/stores/kingdomStore";
import type { AgentDto, AgentPayload, AgentRoutingPreviewDto, DisplayProfilePayload, EffectiveRequestPreviewDto, ModelParameters, ProviderModelsDto } from "@/types/api";
import {
  blankAgent,
  cleanAgentPayload,
  defaultModelParameters,
  FALLBACK_DEBOUNCE_MS,
  FALLBACK_VALIDATION_TTL_MS,
  fallbackKey,
  toAgentPayload,
  toDisplayPayload,
  type AgentEditorMode,
  type AgentSection,
  type FallbackValidationState,
} from "./agentModels";

export function useAgentsController() {
  const agents = useKingdomStore((state) => state.agents);
  const providers = useKingdomStore((state) => state.providers);
  const createAgent = useKingdomStore((state) => state.createAgent);
  const updateAgent = useKingdomStore((state) => state.updateAgent);
  const deleteAgent = useKingdomStore((state) => state.deleteAgent);

  const [selected, setSelected] = useState<AgentDto | null>(agents[0] ?? null);
  const [draft, setDraft] = useState<AgentPayload>(agents[0] ? toAgentPayload(agents[0]) : blankAgent);
  const [displayDraft, setDisplayDraft] = useState<DisplayProfilePayload>(toDisplayPayload(agents[0] ?? null));
  const [activeSection, setActiveSection] = useState<AgentSection>("identity");
  const [editorMode, setEditorMode] = useState<AgentEditorMode>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive" | "attention">("all");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [displaySaving, setDisplaySaving] = useState(false);
  const [displayError, setDisplayError] = useState<string | null>(null);
  const [routingPreview, setRoutingPreview] = useState<AgentRoutingPreviewDto | null>(null);
  const [effectivePreview, setEffectivePreview] = useState<EffectiveRequestPreviewDto | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingEffectivePreview, setLoadingEffectivePreview] = useState(false);
  const [providerModels, setProviderModels] = useState<ProviderModelsDto | null>(null);
  const [newFallbackProvider, setNewFallbackProvider] = useState("");
  const [newFallbackModel, setNewFallbackModel] = useState("");
  const [fallbackValidation, setFallbackValidation] = useState<Record<string, FallbackValidationState>>({});
  const [fallbackWarning, setFallbackWarning] = useState<string | null>(null);
  const [routingHelpOpen, setRoutingHelpOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AgentDto | null>(null);

  const validationInFlight = useRef(new Set<string>());
  const validationLastChecked = useRef(new Map<string, number>());
  const validationSequence = useRef(new Map<string, number>());
  const hasAutoChecked = useRef(false);
  const fallbackModelsRef = useRef<string[]>(draft.fallbackModels ?? []);

  const selectedProvider = useMemo(
    () => providers.find((provider) => provider.id === draft.preferredProviderId) ?? null,
    [draft.preferredProviderId, providers],
  );
  const openRouterModels: string[] = selectedProvider?.config?.openRouterModels ?? providerModels?.models ?? [];
  const primaryModelInvalid = Boolean(
    selectedProvider?.type === "openrouter" &&
      draft.defaultModel &&
      selectedProvider.config?.openRouterModels?.length &&
      !selectedProvider.config.openRouterModels.includes(draft.defaultModel),
  );

  const visibleAgents = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return agents.filter((agent) => {
      const matchesQuery = !normalized || [agent.name, agent.title, agent.role, agent.specialty, agent.displayName, agent.displayTitle]
        .some((value) => value?.toLowerCase().includes(normalized));
      const needsAttention = !agent.preferredProviderId || !agent.defaultModel || agent.fallbackModels.length === 0;
      const matchesStatus = statusFilter === "all" ||
        (statusFilter === "active" && agent.isActive) ||
        (statusFilter === "inactive" && !agent.isActive) ||
        (statusFilter === "attention" && needsAttention);
      return matchesQuery && matchesStatus;
    });
  }, [agents, query, statusFilter]);

  const counts = useMemo(() => ({
    total: agents.length,
    active: agents.filter((agent) => agent.isActive).length,
    routed: agents.filter((agent) => agent.preferredProviderId && agent.defaultModel).length,
    attention: agents.filter((agent) => !agent.preferredProviderId || !agent.defaultModel || agent.fallbackModels.length === 0).length,
  }), [agents]);

  useEffect(() => {
    if (!selected && agents.length > 0 && editorMode !== "create") selectAgent(agents[0]!);
  }, [agents, editorMode, selected]);

  useEffect(() => {
    if (!selected?.id) {
      setRoutingPreview(null);
      setEffectivePreview(null);
      return;
    }
    void loadRoutingPreview(selected.id);
    void loadEffectivePreview(selected.id);
  }, [selected?.id]);

  useEffect(() => {
    if (selectedProvider?.type !== "openrouter") {
      setProviderModels(null);
      return;
    }
    api.getProviderModels(selectedProvider.id).then(setProviderModels).catch(() => setProviderModels(null));
  }, [selectedProvider?.id, selectedProvider?.type]);

  const fallbackModelsKey = (draft.fallbackModels ?? []).join("\n");
  useEffect(() => {
    fallbackModelsRef.current = draft.fallbackModels ?? [];
  }, [fallbackModelsKey]);

  const shouldValidate = useCallback((modelId: string, force = false) => {
    const providerId = selectedProvider?.id;
    if (!providerId || !modelId.trim()) return false;
    const key = fallbackKey(providerId, modelId);
    if (validationInFlight.current.has(key)) return false;
    if (force) return true;
    const checked = validationLastChecked.current.get(key);
    return !checked || Date.now() - checked > FALLBACK_VALIDATION_TTL_MS;
  }, [selectedProvider?.id]);

  const validateFallbackModels = useCallback(async (models: string[], force = false) => {
    const providerId = selectedProvider?.id;
    if (!providerId) return;
    const unique = Array.from(new Set(models.map((model) => model.trim()).filter(Boolean)));
    const pending = unique.filter((model) => shouldValidate(model, force));
    if (pending.length === 0) return;
    const entries = pending.map((model) => {
      const key = fallbackKey(providerId, model);
      const sequence = (validationSequence.current.get(key) ?? 0) + 1;
      validationSequence.current.set(key, sequence);
      validationInFlight.current.add(key);
      return { key, model, sequence };
    });
    setFallbackValidation((current) => {
      const next = { ...current };
      entries.forEach(({ key, model }) => { next[key] = { status: "CHECKING", modelId: model }; });
      return next;
    });
    try {
      const response = await api.validateProviderModels(providerId, pending);
      const byModel = new Map(response.results.map((result) => [result.modelId, result]));
      const active = new Set(fallbackModelsRef.current.map((model) => model.trim()).filter(Boolean));
      setFallbackValidation((current) => {
        const next = { ...current };
        entries.forEach((entry) => {
          if (validationSequence.current.get(entry.key) !== entry.sequence || !active.has(entry.model)) return;
          const result = byModel.get(entry.model);
          next[entry.key] = result ? { ...result } : {
            status: "INVALID",
            reason: "Validation result was not returned.",
            checkedAt: new Date().toISOString(),
            modelId: entry.model,
          };
          validationLastChecked.current.set(entry.key, Date.now());
        });
        return next;
      });
    } catch (validationError) {
      const reason = validationError instanceof Error ? validationError.message : "Fallback model validation failed.";
      setFallbackValidation((current) => {
        const next = { ...current };
        entries.forEach((entry) => {
          if (validationSequence.current.get(entry.key) === entry.sequence) {
            next[entry.key] = { status: "INVALID", reason, checkedAt: new Date().toISOString(), modelId: entry.model };
            validationLastChecked.current.set(entry.key, Date.now());
          }
        });
        return next;
      });
    } finally {
      entries.forEach(({ key }) => validationInFlight.current.delete(key));
    }
  }, [selectedProvider?.id, shouldValidate]);

  useEffect(() => {
    const models = (draft.fallbackModels ?? []).map((model) => model.trim()).filter(Boolean);
    if (!selectedProvider?.id || models.length === 0) return;
    const delay = hasAutoChecked.current ? FALLBACK_DEBOUNCE_MS : 0;
    const timer = window.setTimeout(() => {
      hasAutoChecked.current = true;
      void validateFallbackModels(models);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [fallbackModelsKey, selectedProvider?.id, validateFallbackModels]);

  function selectAgent(agent: AgentDto) {
    setSelected(agent);
    setDraft(toAgentPayload(agent));
    setDisplayDraft(toDisplayPayload(agent));
    setActiveSection("identity");
    setError(null);
    setNotice(null);
    setFallbackWarning(null);
    hasAutoChecked.current = false;
  }

  function openCreate() {
    setSelected(null);
    setDraft({ ...blankAgent });
    setDisplayDraft(toDisplayPayload(null));
    setActiveSection("identity");
    setEditorMode("create");
    setError(null);
    setNotice(null);
  }

  function openEdit(section: AgentSection = activeSection) {
    if (!selected) return;
    setDraft(toAgentPayload(selected));
    setDisplayDraft(toDisplayPayload(selected));
    setActiveSection(section);
    setEditorMode("edit");
    setError(null);
    setNotice(null);
  }

  function closeEditor() {
    setEditorMode(null);
    if (selected) {
      setDraft(toAgentPayload(selected));
      setDisplayDraft(toDisplayPayload(selected));
    }
    setError(null);
  }

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    const models = (draft.fallbackModels ?? []).map((model) => model.trim()).filter(Boolean);
    const invalid = models.filter((model) => getFallbackValidation(model).status === "INVALID");
    setFallbackWarning(invalid.length > 0 ? `${invalid.length}` : null);
    void validateFallbackModels(models, true);
    try {
      const saved = editorMode === "create" || !selected
        ? await createAgent(cleanAgentPayload(draft))
        : await updateAgent(selected.id, cleanAgentPayload(draft));
      setSelected(saved);
      setDraft(toAgentPayload(saved));
      setDisplayDraft(toDisplayPayload(saved));
      setEditorMode(null);
      setNotice("saved");
      void loadRoutingPreview(saved.id);
      void loadEffectivePreview(saved.id);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to save agent");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(agent: AgentDto) {
    setError(null);
    try {
      const updated = await updateAgent(agent.id, { isActive: !agent.isActive });
      if (selected?.id === updated.id) setSelected(updated);
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Unable to update agent");
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await deleteAgent(deleteTarget.id);
      const remaining = agents.filter((agent) => agent.id !== deleteTarget.id);
      setDeleteTarget(null);
      if (selected?.id === deleteTarget.id) {
        const next = remaining[0] ?? null;
        setSelected(next);
        setDraft(next ? toAgentPayload(next) : { ...blankAgent });
      }
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete agent");
    } finally {
      setSaving(false);
    }
  }

  async function saveDisplayProfile() {
    if (!selected) return;
    setDisplaySaving(true);
    setDisplayError(null);
    try {
      await api.updateAgentDisplayProfile(selected.id, displayDraft);
      const response = await api.agents();
      useKingdomStore.setState({ agents: response.agents });
      const refreshed = response.agents.find((agent) => agent.id === selected.id) ?? selected;
      setSelected(refreshed);
      setDisplayDraft(toDisplayPayload(refreshed));
      setNotice("displaySaved");
    } catch (profileError) {
      setDisplayError(profileError instanceof Error ? profileError.message : "Failed to save display profile");
    } finally {
      setDisplaySaving(false);
    }
  }

  async function resetPortrait() {
    if (!selected) return;
    setDisplaySaving(true);
    setDisplayError(null);
    try {
      await api.updateAgentDisplayProfile(selected.id, { avatarUrl: null });
      const response = await api.agents();
      useKingdomStore.setState({ agents: response.agents });
      const refreshed = response.agents.find((agent) => agent.id === selected.id) ?? selected;
      setSelected(refreshed);
      setDisplayDraft(toDisplayPayload(refreshed));
    } catch (profileError) {
      setDisplayError(profileError instanceof Error ? profileError.message : "Failed to reset portrait");
    } finally {
      setDisplaySaving(false);
    }
  }

  async function uploadAvatar(file: File) {
    if (!selected) return;
    setDisplaySaving(true);
    setDisplayError(null);
    try {
      await api.uploadAgentAvatar(selected.id, file);
      const response = await api.agents();
      useKingdomStore.setState({ agents: response.agents });
      const refreshed = response.agents.find((agent) => agent.id === selected.id) ?? selected;
      setSelected(refreshed);
      setDisplayDraft(toDisplayPayload(refreshed));
    } catch (uploadError) {
      setDisplayError(uploadError instanceof Error ? uploadError.message : "Upload failed");
    } finally {
      setDisplaySaving(false);
    }
  }

  async function loadRoutingPreview(agentId = selected?.id) {
    if (!agentId) return;
    setLoadingPreview(true);
    try { setRoutingPreview(await api.getAgentRoutingPreview(agentId)); }
    catch { setRoutingPreview(null); }
    finally { setLoadingPreview(false); }
  }

  async function loadEffectivePreview(agentId = selected?.id) {
    if (!agentId) return;
    setLoadingEffectivePreview(true);
    try { setEffectivePreview(await api.getAgentEffectiveRequestPreview(agentId)); }
    catch { setEffectivePreview(null); }
    finally { setLoadingEffectivePreview(false); }
  }

  function getFallbackValidation(model: string) {
    if (!selectedProvider?.id) return { status: "NOT_CHECKED", reason: "Select a preferred provider before validation." } as FallbackValidationState;
    return fallbackValidation[fallbackKey(selectedProvider.id, model)] ?? { status: "NOT_CHECKED" };
  }

  function addFallbackModel() {
    const model = newFallbackModel.trim();
    if (!model || (draft.fallbackModels ?? []).includes(model)) return;
    setDraft({ ...draft, fallbackModels: [...(draft.fallbackModels ?? []), model] });
    setNewFallbackModel("");
  }

  function updateFallbackModel(index: number, model: string) {
    const list = [...(draft.fallbackModels ?? [])];
    list[index] = model;
    setDraft({ ...draft, fallbackModels: list });
    setFallbackWarning(null);
  }

  function removeFallbackModel(index: number) {
    setDraft({ ...draft, fallbackModels: (draft.fallbackModels ?? []).filter((_, itemIndex) => itemIndex !== index) });
  }

  function moveFallbackModel(index: number, direction: -1 | 1) {
    const list = [...(draft.fallbackModels ?? [])];
    const target = index + direction;
    if (target < 0 || target >= list.length) return;
    [list[index], list[target]] = [list[target]!, list[index]!];
    setDraft({ ...draft, fallbackModels: list });
  }

  function addFallbackProvider() {
    const id = newFallbackProvider.trim();
    if (!id || (draft.fallbackProviderIds ?? []).includes(id)) return;
    setDraft({ ...draft, fallbackProviderIds: [...(draft.fallbackProviderIds ?? []), id] });
    setNewFallbackProvider("");
  }

  function removeFallbackProvider(id: string) {
    setDraft({ ...draft, fallbackProviderIds: (draft.fallbackProviderIds ?? []).filter((providerId) => providerId !== id) });
  }

  function moveFallbackProvider(index: number, direction: -1 | 1) {
    const list = [...(draft.fallbackProviderIds ?? [])];
    const target = index + direction;
    if (target < 0 || target >= list.length) return;
    [list[index], list[target]] = [list[target]!, list[index]!];
    setDraft({ ...draft, fallbackProviderIds: list });
  }

  function updateModelParameters(patch: Partial<ModelParameters>) {
    setDraft({ ...draft, modelParameters: { ...(draft.modelParameters ?? defaultModelParameters), ...patch } });
  }

  return {
    agents, providers, selected, draft, displayDraft, activeSection, editorMode, query, statusFilter,
    error, notice, saving, displaySaving, displayError, routingPreview, effectivePreview, loadingPreview,
    loadingEffectivePreview, selectedProvider, providerModels, openRouterModels, primaryModelInvalid,
    newFallbackProvider, newFallbackModel, fallbackWarning, routingHelpOpen, deleteTarget, visibleAgents, counts,
    setDraft, setDisplayDraft, setActiveSection, setQuery, setStatusFilter, setNewFallbackProvider,
    setNewFallbackModel, setRoutingHelpOpen, setDeleteTarget, selectAgent, openCreate, openEdit, closeEditor,
    submit, toggleActive, confirmDelete, saveDisplayProfile, resetPortrait, uploadAvatar, loadRoutingPreview,
    loadEffectivePreview, getFallbackValidation, validateFallbackModels, addFallbackModel, updateFallbackModel,
    removeFallbackModel, moveFallbackModel, addFallbackProvider, removeFallbackProvider, moveFallbackProvider,
    updateModelParameters,
  };
}

export type AgentsController = ReturnType<typeof useAgentsController>;
