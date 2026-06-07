import { FormEvent, useEffect, useState } from "react";
import { Shield, AlertTriangle, CheckCircle, XCircle, RefreshCw, ChevronUp, ChevronDown, X, Plus } from "lucide-react";
import { AgentPortrait } from "@/components/AgentPortrait";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getProviderDisplayName } from "@/lib/providerDisplay";
import { cn } from "@/lib/utils";
import { useKingdomStore } from "@/stores/kingdomStore";
import type { AgentDto, AgentPayload, AgentRoutingPreviewDto, ProviderModelsDto } from "@/types/api";
import { api } from "@/lib/api";

const selectCls = "h-10 w-full rounded-md border border-border bg-input px-3 text-sm text-foreground outline-none transition focus:ring-2 focus:ring-primary";

const ROUTING_POLICY_OPTIONS = [
  { value: "GLOBAL_ROUTING", label: "Global Routing", description: "Use system-wide routing policy. Recommended for most agents." },
  { value: "FIXED_PRIMARY", label: "Fixed Primary", description: "Always use the configured preferred provider. No fallback." },
  { value: "FIXED_PRIMARY_WITH_FALLBACK", label: "Fixed Primary + Fallback", description: "Try preferred provider, then fall back through the configured chain." },
  { value: "SANDBOX_FREE_ONLY", label: "Sandbox / Free Only", description: "Use only free-tier or sandbox providers. Zero cost but limited quality." },
  { value: "LOWEST_COST", label: "Lowest Cost", description: "Always route to the cheapest available capable provider." },
  { value: "QUALITY_FIRST", label: "Quality First", description: "Route to the highest-capability provider regardless of cost." }
] as const;

const COST_POLICY_OPTIONS = [
  { value: "", label: "Inherit global setting", description: "Use the system-wide cost mode setting." },
  { value: "LOW", label: "Low Cost", description: "Prefer cheaper providers and models." },
  { value: "BALANCED", label: "Balanced", description: "Balance cost and quality." },
  { value: "QUALITY", label: "Quality", description: "Prefer higher-quality providers even if more expensive." }
];

const blankAgent: AgentPayload = {
  name: "",
  title: "",
  role: "",
  specialty: "",
  description: "",
  systemPrompt: "",
  skills: [],
  responseStyle: "concise, structured, practical",
  isActive: true,
  priority: 100,
  preferredProviderId: null,
  defaultModel: "",
  fallbackProviderIds: [],
  fallbackModels: [],
  routingPolicy: "GLOBAL_ROUTING",
  costPreference: null,
  temperature: null,
  maxTokens: null
};

function ProviderBadge({ label, variant }: { label: string; variant: "ok" | "warn" | "error" | "muted" }) {
  const cls = {
    ok: "bg-green-500/10 text-green-400 border-green-500/20",
    warn: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    error: "bg-red-500/10 text-red-400 border-red-500/20",
    muted: "bg-muted/30 text-muted-foreground border-border/40"
  }[variant];
  return <span className={cn("inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium border", cls)}>{label}</span>;
}

function providerStatusVariant(p: { environmentMode?: string; hasCredentials: boolean; isActive?: boolean }): "ok" | "warn" | "error" | "muted" {
  if (p.isActive === false) return "muted";
  if (!p.hasCredentials) return "warn";
  if (p.environmentMode === "DISABLED") return "error";
  if (p.environmentMode === "SANDBOX" || p.environmentMode === "PRODUCTION") return "ok";
  return "muted";
}

export function AgentsPage() {
  const agents = useKingdomStore((state) => state.agents);
  const createAgent = useKingdomStore((state) => state.createAgent);
  const updateAgent = useKingdomStore((state) => state.updateAgent);
  const deleteAgent = useKingdomStore((state) => state.deleteAgent);
  const providers = useKingdomStore((state) => state.providers);
  const [selected, setSelected] = useState<AgentDto | null>(agents[0] ?? null);
  const [draft, setDraft] = useState<AgentPayload>(selected ? toPayload(selected) : blankAgent);
  const [error, setError] = useState<string | null>(null);
  const [routingPreview, setRoutingPreview] = useState<AgentRoutingPreviewDto | null>(null);
  const [providerModels, setProviderModels] = useState<ProviderModelsDto | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [newFallbackProvider, setNewFallbackProvider] = useState("");
  const [newFallbackModel, setNewFallbackModel] = useState("");

  const selectedProvider = draft.preferredProviderId
    ? providers.find((p) => p.id === draft.preferredProviderId)
    : null;

  const isModelInvalid = !!(
    selectedProvider &&
    selectedProvider.type === "openrouter" &&
    draft.defaultModel &&
    selectedProvider.config?.openRouterModels?.length &&
    !selectedProvider.config.openRouterModels.includes(draft.defaultModel)
  );

  const openRouterModelList: string[] = selectedProvider?.config?.openRouterModels ?? providerModels?.models ?? [];

  useEffect(() => {
    if (selected?.id) {
      loadRoutingPreview(selected.id);
    } else {
      setRoutingPreview(null);
    }
  }, [selected?.id]);

  useEffect(() => {
    if (selectedProvider && selectedProvider.type === "openrouter") {
      api.getProviderModels(selectedProvider.id)
        .then(setProviderModels)
        .catch(() => setProviderModels(null));
    } else {
      setProviderModels(null);
    }
  }, [selectedProvider?.id]);

  async function loadRoutingPreview(agentId: string) {
    setLoadingPreview(true);
    try {
      const preview = await api.getAgentRoutingPreview(agentId);
      setRoutingPreview(preview);
    } catch {
      setRoutingPreview(null);
    } finally {
      setLoadingPreview(false);
    }
  }

  function selectAgent(agent: AgentDto | null) {
    setSelected(agent);
    setDraft(agent ? toPayload(agent) : blankAgent);
    setError(null);
    setRoutingPreview(null);
    setProviderModels(null);
    setNewFallbackProvider("");
    setNewFallbackModel("");
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      if (selected) {
        const updated = await updateAgent(selected.id, cleanPayload(draft));
        setSelected(updated);
        loadRoutingPreview(updated.id);
      } else {
        const created = await createAgent(cleanPayload(draft));
        setSelected(created);
        loadRoutingPreview(created.id);
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to save agent");
    }
  }

  async function toggleActive(agent: AgentDto) {
    setError(null);
    try {
      await updateAgent(agent.id, { isActive: !agent.isActive });
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Unable to update agent");
    }
  }

  function addFallbackProvider() {
    const id = newFallbackProvider.trim();
    if (!id || (draft.fallbackProviderIds ?? []).includes(id)) return;
    setDraft({ ...draft, fallbackProviderIds: [...(draft.fallbackProviderIds ?? []), id] });
    setNewFallbackProvider("");
  }

  function removeFallbackProvider(id: string) {
    setDraft({ ...draft, fallbackProviderIds: (draft.fallbackProviderIds ?? []).filter((v) => v !== id) });
  }

  function moveFallbackProvider(index: number, direction: -1 | 1) {
    const list = [...(draft.fallbackProviderIds ?? [])];
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= list.length) return;
    const tmp = list[index]!; list[index] = list[newIndex]!; list[newIndex] = tmp;
    setDraft({ ...draft, fallbackProviderIds: list });
  }

  function addFallbackModel() {
    const model = newFallbackModel.trim();
    if (!model || (draft.fallbackModels ?? []).includes(model)) return;
    setDraft({ ...draft, fallbackModels: [...(draft.fallbackModels ?? []), model] });
    setNewFallbackModel("");
  }

  function removeFallbackModel(model: string) {
    setDraft({ ...draft, fallbackModels: (draft.fallbackModels ?? []).filter((m) => m !== model) });
  }

  function moveFallbackModel(index: number, direction: -1 | 1) {
    const list = [...(draft.fallbackModels ?? [])];
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= list.length) return;
    const tmp = list[index]!; list[index] = list[newIndex]!; list[newIndex] = tmp;
    setDraft({ ...draft, fallbackModels: list });
  }

  return (
    <>
      <PageHeader
        eyebrow="Agent Registry"
        title="Royal AI agents"
        description="Manage council agents, prompts, priorities, skills, routing profiles, and model overrides without editing code."
      />
      <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
        <div className="space-y-4">
          <Button className="w-full" onClick={() => selectAgent(null)}>Create New Agent</Button>
          {agents.map((agent) => (
            <Card key={agent.id} className={cn("transition", selected?.id === agent.id && "border-primary/60 bg-primary/10")}>
              <button className="w-full text-left" onClick={() => selectAgent(agent)}>
                <div className="flex items-start gap-4">
                  <AgentPortrait agent={agent} size="md" status={agent.isActive ? "IDLE" : "COMPLETED"} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="font-display text-xl">{agent.title}</h2>
                        <p className="mt-1 text-sm text-muted-foreground">{agent.name} · priority {agent.priority}</p>
                      </div>
                      <Shield className={cn("h-5 w-5 shrink-0", agent.isActive ? "text-primary" : "text-muted-foreground")} />
                    </div>
                    <p className="mt-3 line-clamp-2 text-sm leading-6 text-muted-foreground">{agent.description || agent.specialty}</p>
                  </div>
                </div>
              </button>
              <div className="mt-4 flex justify-between gap-2">
                <Button variant="outline" onClick={() => void toggleActive(agent)} disabled={agent.slug === "grand-vizier"}>
                  {agent.isActive ? "Deactivate" : "Activate"}
                </Button>
                <Button variant="outline" onClick={() => void deleteAgent(agent.id)} disabled={agent.slug === "grand-vizier"}>Soft Delete</Button>
              </div>
            </Card>
          ))}
        </div>

        <Card>
          <div className="flex flex-col gap-4 border-b border-border/50 pb-5 sm:flex-row sm:items-center">
            <AgentPortrait agent={selected ?? draft} size="xl" status={selected?.isActive === false ? "COMPLETED" : "IDLE"} />
            <div>
              <h2 className="font-display text-2xl">{selected ? `Edit ${selected.title}` : "Create Agent"}</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                {selected ? selected.specialty : "Portrait preview uses known agent names or title fallbacks. Custom agents use initials until an asset is added."}
              </p>
            </div>
          </div>

          <form className="mt-5 space-y-6" onSubmit={onSubmit}>
            {/* Identity */}
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField id="agent-name" label="Agent Name" required>
                <Input id="agent-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="grand-vizier" />
              </FormField>
              <FormField id="agent-title" label="Title">
                <Input id="agent-title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Grand Vizier" />
              </FormField>
              <FormField id="agent-role" label="Role">
                <Input id="agent-role" value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })} placeholder="Strategic Orchestrator" />
              </FormField>
              <FormField id="agent-specialty" label="Specialty">
                <Input id="agent-specialty" value={draft.specialty} onChange={(e) => setDraft({ ...draft, specialty: e.target.value })} placeholder="Royal synthesis and decision-making" />
              </FormField>
            </div>

            <FormField id="agent-description" label="Description">
              <Textarea id="agent-description" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Describe what this agent does and when it's consulted." />
            </FormField>

            <FormField id="agent-system-prompt" label="System Prompt">
              <Textarea id="agent-system-prompt" className="min-h-44" value={draft.systemPrompt} onChange={(e) => setDraft({ ...draft, systemPrompt: e.target.value })} placeholder="You are a royal advisor…" />
            </FormField>

            <FormField id="agent-response-style" label="Response Style">
              <Textarea id="agent-response-style" value={draft.responseStyle} onChange={(e) => setDraft({ ...draft, responseStyle: e.target.value })} placeholder="concise, structured, practical" />
            </FormField>

            <FormField id="agent-skills" label="Skills">
              <Input id="agent-skills" value={draft.skills.join(", ")} onChange={(e) => setDraft({ ...draft, skills: e.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} placeholder="Comma-separated: planning, risk analysis, strategy" />
            </FormField>

            {/* Agent Routing Profile */}
            <div className="rounded-lg border border-border/60 bg-muted/20 p-4 space-y-4">
              <h3 className="font-semibold text-sm text-foreground">Agent Routing Profile</h3>
              <p className="text-xs text-muted-foreground -mt-2">Controls which AI provider and model this agent uses. Leave most fields blank to inherit global routing.</p>

              {/* Preferred Provider */}
              <FormField id="agent-provider" label="Preferred Provider" description="Optional. Leave blank to use global routing policy.">
                <select
                  id="agent-provider"
                  className={selectCls}
                  value={draft.preferredProviderId ?? ""}
                  onChange={(e) => setDraft({ ...draft, preferredProviderId: e.target.value || null, defaultModel: "" })}
                >
                  <option value="">Use global routing (auto)</option>
                  {providers.map((provider) => (
                    <option key={provider.id} value={provider.id}>{getProviderDisplayName(provider)}</option>
                  ))}
                </select>
                {selectedProvider && (
                  <div className="mt-2 rounded-md border border-border/40 bg-background/60 p-3 text-xs space-y-1.5">
                    <div className="flex flex-wrap gap-1.5 items-center">
                      <span className="font-medium text-foreground">{selectedProvider.name}</span>
                      <ProviderBadge label={selectedProvider.environmentMode ?? "UNKNOWN"} variant={selectedProvider.environmentMode === "SANDBOX" ? "ok" : selectedProvider.environmentMode === "PRODUCTION" ? "ok" : "error"} />
                      <ProviderBadge label={selectedProvider.hasCredentials ? "Credentials OK" : "No credentials"} variant={selectedProvider.hasCredentials ? "ok" : "warn"} />
                      <ProviderBadge label={selectedProvider.costTier} variant="muted" />
                      {selectedProvider.isFreeTier && <ProviderBadge label="Free tier" variant="ok" />}
                    </div>
                    <div className="text-muted-foreground">
                      Default model: <span className="font-mono text-foreground">{selectedProvider.defaultModel || "—"}</span>
                    </div>
                    {selectedProvider.modelValidationStatus && (
                      <div className="text-muted-foreground">
                        Validation:{" "}
                        <ProviderBadge
                          label={selectedProvider.modelValidationStatus === "VALID" ? "Valid" : selectedProvider.modelValidationStatus === "INVALID_MODEL" ? "Invalid model" : selectedProvider.modelValidationStatus === "PROVIDER_UNAVAILABLE" ? "Unavailable" : "Not checked"}
                          variant={selectedProvider.modelValidationStatus === "VALID" ? "ok" : selectedProvider.modelValidationStatus === "INVALID_MODEL" ? "error" : "warn"}
                        />
                        {selectedProvider.lastValidationTime && (
                          <span className="ml-1 text-muted-foreground">checked {new Date(selectedProvider.lastValidationTime).toLocaleString()}</span>
                        )}
                      </div>
                    )}
                    {providerModels && providerModels.count > 0 && (
                      <div className="text-muted-foreground">{providerModels.count.toLocaleString()} models available{providerModels.fromCache ? " (cached)" : ""}</div>
                    )}
                  </div>
                )}
              </FormField>

              {/* Primary Model */}
              <FormField
                id="agent-model"
                label="Primary Model"
                description={selectedProvider?.type === "openrouter"
                  ? "Select from validated models or type a full model ID e.g. openai/gpt-4o-mini."
                  : "Optional override. Leave blank to use provider default."}
              >
                {openRouterModelList.length > 0 ? (
                  <select
                    id="agent-model"
                    className={selectCls}
                    value={draft.defaultModel ?? ""}
                    onChange={(e) => setDraft({ ...draft, defaultModel: e.target.value || null })}
                  >
                    <option value="">Use provider default ({selectedProvider?.defaultModel || "auto"})</option>
                    {!draft.defaultModel || openRouterModelList.includes(draft.defaultModel ?? "") ? null : (
                      <option value={draft.defaultModel ?? ""} className="text-yellow-400">
                        {draft.defaultModel} (not in registry)
                      </option>
                    )}
                    {openRouterModelList.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                ) : (
                  <Input
                    id="agent-model"
                    value={draft.defaultModel ?? ""}
                    onChange={(e) => setDraft({ ...draft, defaultModel: e.target.value })}
                    placeholder={selectedProvider?.defaultModel ? `Default: ${selectedProvider.defaultModel}` : "openrouter/owl-alpha"}
                  />
                )}
                {isModelInvalid && (
                  <div className="mt-1 flex items-start gap-1.5 text-xs text-yellow-500 font-medium bg-yellow-500/10 border border-yellow-500/20 rounded p-2">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>Model "{draft.defaultModel}" is not in the validated registry for {selectedProvider?.name}. This may cause a 404 at runtime.</span>
                  </div>
                )}
              </FormField>

              {/* Fallback Models */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Fallback Models</label>
                <p className="text-xs text-muted-foreground mb-2">Ordered list of model IDs to try if the primary model fails. Uses the preferred provider.</p>
                {(draft.fallbackModels ?? []).length > 0 && (
                  <div className="mb-2 space-y-1">
                    {(draft.fallbackModels ?? []).map((model, i) => {
                      const isInvalid = !!(openRouterModelList.length > 0 && !openRouterModelList.includes(model));
                      return (
                        <div key={model} className="flex items-center gap-1.5 rounded-md border border-border/40 bg-background/60 px-2 py-1 text-xs">
                          <span className="flex-1 font-mono text-foreground truncate">{model}</span>
                          {isInvalid && <span title="Not in validated registry"><AlertTriangle className="h-3 w-3 text-yellow-500 shrink-0" /></span>}
                          <button type="button" onClick={() => moveFallbackModel(i, -1)} disabled={i === 0} className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30">
                            <ChevronUp className="h-3 w-3" />
                          </button>
                          <button type="button" onClick={() => moveFallbackModel(i, 1)} disabled={i === (draft.fallbackModels ?? []).length - 1} className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30">
                            <ChevronDown className="h-3 w-3" />
                          </button>
                          <button type="button" onClick={() => removeFallbackModel(model)} className="p-0.5 text-muted-foreground hover:text-red-400">
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="flex gap-2">
                  {openRouterModelList.length > 0 ? (
                    <select
                      className={cn(selectCls, "h-9 text-xs flex-1")}
                      value={newFallbackModel}
                      onChange={(e) => setNewFallbackModel(e.target.value)}
                    >
                      <option value="">Select model to add…</option>
                      {openRouterModelList.filter((m) => !(draft.fallbackModels ?? []).includes(m)).map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      className="h-9 text-xs flex-1"
                      value={newFallbackModel}
                      onChange={(e) => setNewFallbackModel(e.target.value)}
                      placeholder="Model ID e.g. openai/gpt-4o-mini"
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addFallbackModel(); } }}
                    />
                  )}
                  <Button type="button" variant="outline" className="h-9 px-3" onClick={addFallbackModel} disabled={!newFallbackModel.trim()}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* Fallback Providers */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Fallback Providers</label>
                <p className="text-xs text-muted-foreground mb-2">Ordered list of providers to try if the primary fails. Leave empty to use the global fallback chain.</p>
                {(draft.fallbackProviderIds ?? []).length > 0 && (
                  <div className="mb-2 space-y-1">
                    {(draft.fallbackProviderIds ?? []).map((id, i) => {
                      const prov = providers.find((p) => p.id === id);
                      const variant = prov ? providerStatusVariant(prov) : "muted";
                      const warning = !prov
                        ? "Provider not found"
                        : !prov.hasCredentials
                          ? "Missing credentials"
                          : prov.environmentMode === "DISABLED"
                            ? "Disabled"
                            : null;
                      return (
                        <div key={id} className="flex items-center gap-1.5 rounded-md border border-border/40 bg-background/60 px-2 py-1 text-xs">
                          <span className="flex-1 min-w-0">
                            <span className="font-medium text-foreground">{prov?.name ?? id}</span>
                            {prov && <span className="ml-1 text-muted-foreground">· {prov.environmentMode}</span>}
                          </span>
                          {warning && <span title={warning}><AlertTriangle className="h-3 w-3 text-yellow-500 shrink-0" /></span>}
                          {!warning && prov && <CheckCircle className="h-3 w-3 text-green-400 shrink-0" />}
                          <button type="button" onClick={() => moveFallbackProvider(i, -1)} disabled={i === 0} className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30">
                            <ChevronUp className="h-3 w-3" />
                          </button>
                          <button type="button" onClick={() => moveFallbackProvider(i, 1)} disabled={i === (draft.fallbackProviderIds ?? []).length - 1} className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30">
                            <ChevronDown className="h-3 w-3" />
                          </button>
                          <button type="button" onClick={() => removeFallbackProvider(id)} className="p-0.5 text-muted-foreground hover:text-red-400">
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="flex gap-2">
                  <select
                    className={cn(selectCls, "h-9 text-xs flex-1")}
                    value={newFallbackProvider}
                    onChange={(e) => setNewFallbackProvider(e.target.value)}
                  >
                    <option value="">Select provider to add…</option>
                    {providers
                      .filter((p) => !(draft.fallbackProviderIds ?? []).includes(p.id))
                      .map((p) => (
                        <option key={p.id} value={p.id}>{p.name} ({p.environmentMode})</option>
                      ))}
                  </select>
                  <Button type="button" variant="outline" className="h-9 px-3" onClick={addFallbackProvider} disabled={!newFallbackProvider.trim()}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* Routing + Cost Policy row */}
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField id="agent-routing-policy" label="Routing Policy">
                  <select
                    id="agent-routing-policy"
                    className={selectCls}
                    value={draft.routingPolicy ?? "GLOBAL_ROUTING"}
                    onChange={(e) => setDraft({ ...draft, routingPolicy: e.target.value || null })}
                  >
                    {ROUTING_POLICY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  {draft.routingPolicy && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {ROUTING_POLICY_OPTIONS.find((o) => o.value === draft.routingPolicy)?.description}
                    </p>
                  )}
                </FormField>
                <FormField id="agent-cost-policy" label="Cost Policy">
                  <select
                    id="agent-cost-policy"
                    className={selectCls}
                    value={draft.costPreference ?? ""}
                    onChange={(e) => setDraft({ ...draft, costPreference: (e.target.value || null) as AgentPayload["costPreference"] })}
                  >
                    {COST_POLICY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </FormField>
              </div>
            </div>

            {/* Effective Routing Preview */}
            {selected && (
              <div className="rounded-lg border border-border/60 bg-muted/10 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm text-foreground">Effective Routing Preview</h3>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-7 px-2 text-xs gap-1"
                    onClick={() => loadRoutingPreview(selected.id)}
                    disabled={loadingPreview}
                  >
                    <RefreshCw className={cn("h-3 w-3", loadingPreview && "animate-spin")} />
                    Refresh
                  </Button>
                </div>
                {loadingPreview ? (
                  <p className="text-xs text-muted-foreground">Loading…</p>
                ) : routingPreview ? (
                  <div className="space-y-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">Primary: </span>
                      {routingPreview.effectiveRoute ? (
                        <span>
                          <span className="font-medium text-foreground">{routingPreview.effectiveRoute.provider.name}</span>
                          <span className="text-muted-foreground"> / </span>
                          <span className="font-mono text-foreground">{routingPreview.effectiveRoute.model || routingPreview.effectiveRoute.provider.defaultModel}</span>
                          <span className="ml-1.5">
                            <ProviderBadge label={routingPreview.effectiveRoute.provider.environmentMode} variant={routingPreview.effectiveRoute.provider.environmentMode === "SANDBOX" ? "ok" : "ok"} />
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">No active provider available</span>
                      )}
                    </div>

                    {routingPreview.effectiveRoute && routingPreview.effectiveRoute.fallbackProviders.length > 0 && (
                      <div>
                        <span className="text-muted-foreground">Fallback chain: </span>
                        <span className="text-foreground">
                          {routingPreview.effectiveRoute.fallbackProviders.map((fp, i) => (
                            <span key={fp.id}>
                              {i > 0 && <span className="text-muted-foreground"> → </span>}
                              <span className="font-medium">{fp.name}</span>
                              <span className="text-muted-foreground"> ({fp.environmentMode})</span>
                            </span>
                          ))}
                        </span>
                      </div>
                    )}

                    {routingPreview.latestUsage && (
                      <div className="mt-1 pt-2 border-t border-border/40">
                        <span className="text-muted-foreground">Latest actual call: </span>
                        <span className="font-medium text-foreground">{routingPreview.latestUsage.provider}</span>
                        <span className="text-muted-foreground"> / </span>
                        <span className="font-mono text-foreground">{routingPreview.latestUsage.model}</span>
                        <span className="text-muted-foreground ml-1.5">
                          {routingPreview.latestUsage.totalTokens.toLocaleString()} tokens
                          {" · "}
                          {new Date(routingPreview.latestUsage.createdAt).toLocaleString()}
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No preview available.</p>
                )}
              </div>
            )}

            {/* Advanced Parameters */}
            <div className="grid gap-3 sm:grid-cols-3">
              <FormField id="agent-priority" label="Priority">
                <Input id="agent-priority" type="number" value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) })} placeholder="100" />
              </FormField>
              <FormField id="agent-temperature" label="Temperature" description="Lower = more deterministic, higher = more creative.">
                <Input id="agent-temperature" type="number" step="0.1" min="0" max="2" value={draft.temperature ?? ""} onChange={(e) => setDraft({ ...draft, temperature: e.target.value ? Number(e.target.value) : null })} placeholder="0.7" />
              </FormField>
              <FormField id="agent-max-tokens" label="Max Tokens" description="Maximum response length for this agent.">
                <Input id="agent-max-tokens" type="number" value={draft.maxTokens ?? ""} onChange={(e) => setDraft({ ...draft, maxTokens: e.target.value ? Number(e.target.value) : null })} placeholder="700" />
              </FormField>
            </div>

            {error ? <div className="rounded-md border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-100">{error}</div> : null}
            <Button>{selected ? "Save Agent" : "Create Agent"}</Button>
          </form>
        </Card>
      </div>
    </>
  );
}

function toPayload(agent: AgentDto): AgentPayload {
  return {
    name: agent.name,
    title: agent.title,
    role: agent.role,
    specialty: agent.specialty,
    description: agent.description,
    systemPrompt: agent.systemPrompt || agent.prompt,
    skills: agent.skills,
    responseStyle: agent.responseStyle,
    isActive: agent.isActive,
    priority: agent.priority,
    preferredProviderId: agent.preferredProviderId,
    defaultModel: agent.defaultModel,
    fallbackProviderIds: agent.fallbackProviderIds,
    fallbackModels: agent.fallbackModels ?? [],
    routingPolicy: agent.routingPolicy ?? "GLOBAL_ROUTING",
    costPreference: agent.costPreference,
    temperature: agent.temperature,
    maxTokens: agent.maxTokens
  };
}

function cleanPayload(payload: AgentPayload): AgentPayload {
  return {
    ...payload,
    preferredProviderId: payload.preferredProviderId || null,
    defaultModel: payload.defaultModel || null,
    fallbackProviderIds: payload.fallbackProviderIds ?? [],
    fallbackModels: payload.fallbackModels ?? [],
    routingPolicy: payload.routingPolicy ?? "GLOBAL_ROUTING",
    costPreference: payload.costPreference ?? null,
    temperature: payload.temperature ?? null,
    maxTokens: payload.maxTokens ?? null
  };
}
