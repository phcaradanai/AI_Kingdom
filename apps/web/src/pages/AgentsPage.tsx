import { FormEvent, useEffect, useRef, useState } from "react";
import { Shield, AlertTriangle, CheckCircle, RefreshCw, ChevronUp, ChevronDown, X, Plus, Settings2, Image, RotateCcw, ExternalLink } from "lucide-react";
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
import type { AgentDto, AgentPayload, AgentRoutingPreviewDto, DisplayProfilePayload, ProviderModelsDto, ParameterMode, ModelParameters, EffectiveRequestPreviewDto } from "@/types/api";
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

const DEFAULT_MODEL_PARAMETERS: ModelParameters = {
  stream: false,
  temperature: null,
  max_tokens: null,
  top_p: null,
  seed: null,
  response_format: "none",
  stop: null,
  frequency_penalty: null,
  presence_penalty: null,
  repetition_penalty: null,
  top_k: null,
  min_p: null,
  openrouter_route: "none",
  openrouter_provider_preferences: null,
  plugins: null,
  reasoning: { enabled: true, effort: "medium", max_tokens: null, exclude: true },
  tools: { enabled: false, tool_choice: "auto" }
};

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
  maxTokens: null,
  personalDetail: "",
  personality: "",
  relationshipWithKing: "",
  relationshipWithCouncil: "",
  roleBoundaries: "",
  allowedActions: [],
  forbiddenActions: [],
  approvalRequiredFor: [],
  canProposeMemoryCandidates: true,
  canAutoSaveTrustedMemory: false,
  memoryRequiresApproval: true,
  allowedMemoryCategories: [],
  retentionPolicy: "approved durable memories only; raw reasoning must never be stored as memory",
  parameterMode: "ROLE_DEFAULT",
  modelParameters: null
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
  const [effectivePreview, setEffectivePreview] = useState<EffectiveRequestPreviewDto | null>(null);
  const [loadingEffectivePreview, setLoadingEffectivePreview] = useState(false);
  const [newFallbackProvider, setNewFallbackProvider] = useState("");
  const [newFallbackModel, setNewFallbackModel] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [displayDraft, setDisplayDraft] = useState<DisplayProfilePayload>(toDisplayPayload(selected));
  const [displaySaving, setDisplaySaving] = useState(false);
  const [displayError, setDisplayError] = useState<string | null>(null);
  const [displaySuccess, setDisplaySuccess] = useState(false);
  const avatarFileRef = useRef<HTMLInputElement>(null);

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
  const primaryModelValidationState: "Valid" | "Invalid" | "Not checked" = isModelInvalid
    ? "Invalid"
    : selectedProvider?.modelValidationStatus === "VALID"
      ? "Valid"
      : selectedProvider?.modelValidationStatus === "INVALID_MODEL"
        ? "Invalid"
        : "Not checked";

  useEffect(() => {
    if (selected?.id) {
      loadRoutingPreview(selected.id);
      loadEffectivePreview(selected.id);
    } else {
      setRoutingPreview(null);
      setEffectivePreview(null);
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

  async function loadEffectivePreview(agentId: string) {
    setLoadingEffectivePreview(true);
    try {
      const preview = await api.getAgentEffectiveRequestPreview(agentId);
      setEffectivePreview(preview);
    } catch {
      setEffectivePreview(null);
    } finally {
      setLoadingEffectivePreview(false);
    }
  }

  function selectAgent(agent: AgentDto | null) {
    setSelected(agent);
    setDraft(agent ? toPayload(agent) : blankAgent);
    setDisplayDraft(toDisplayPayload(agent));
    setError(null);
    setDisplayError(null);
    setDisplaySuccess(false);
    setRoutingPreview(null);
    setEffectivePreview(null);
    setProviderModels(null);
    setNewFallbackProvider("");
    setNewFallbackModel("");
  }

  async function onSaveDisplayProfile() {
    if (!selected) return;
    setDisplaySaving(true);
    setDisplayError(null);
    setDisplaySuccess(false);
    try {
      await api.updateAgentDisplayProfile(selected.id, displayDraft);
      const updatedAgents = await api.agents();
      useKingdomStore.setState({ agents: updatedAgents.agents });
      const refreshed = updatedAgents.agents.find((a) => a.id === selected.id) ?? null;
      if (refreshed) {
        setSelected(refreshed);
        setDisplayDraft(toDisplayPayload(refreshed));
      }
      setDisplaySuccess(true);
      setTimeout(() => setDisplaySuccess(false), 3000);
    } catch (err) {
      setDisplayError(err instanceof Error ? err.message : "Failed to save display profile");
    } finally {
      setDisplaySaving(false);
    }
  }

  function onResetToCanonical() {
    if (!selected) return;
    setDisplayDraft({
      ...displayDraft,
      displayName: null,
      displayTitle: null
    });
  }

  async function onResetPortrait() {
    if (!selected) return;
    setDisplaySaving(true);
    setDisplayError(null);
    try {
      await api.updateAgentDisplayProfile(selected.id, { avatarUrl: null });
      const updatedAgents = await api.agents();
      useKingdomStore.setState({ agents: updatedAgents.agents });
      const refreshed = updatedAgents.agents.find((a) => a.id === selected.id) ?? null;
      if (refreshed) {
        setSelected(refreshed);
        setDisplayDraft(toDisplayPayload(refreshed));
      }
      setDisplaySuccess(true);
      setTimeout(() => setDisplaySuccess(false), 3000);
    } catch (err) {
      setDisplayError(err instanceof Error ? err.message : "Failed to reset portrait");
    } finally {
      setDisplaySaving(false);
    }
  }

  async function onUploadAvatar(file: File) {
    if (!selected) return;
    setDisplaySaving(true);
    setDisplayError(null);
    try {
      const result = await api.uploadAgentAvatar(selected.id, file);
      setDisplayDraft({ ...displayDraft, avatarUrl: result.avatarUrl });
      const updatedAgents = await api.agents();
      useKingdomStore.setState({ agents: updatedAgents.agents });
      const refreshed = updatedAgents.agents.find((a) => a.id === selected.id) ?? null;
      if (refreshed) {
        setSelected(refreshed);
        setDisplayDraft(toDisplayPayload(refreshed));
      }
    } catch (err) {
      setDisplayError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setDisplaySaving(false);
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      if (selected) {
        const updated = await updateAgent(selected.id, cleanPayload(draft));
        setSelected(updated);
        loadRoutingPreview(updated.id);
        loadEffectivePreview(updated.id);
      } else {
        const created = await createAgent(cleanPayload(draft));
        setSelected(created);
        loadRoutingPreview(created.id);
        loadEffectivePreview(created.id);
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

  function updateModelParameters(patch: Partial<ModelParameters>) {
    setDraft({ ...draft, modelParameters: { ...(draft.modelParameters ?? DEFAULT_MODEL_PARAMETERS), ...patch } });
  }

  function togglePlugin(plugin: NonNullable<ModelParameters["plugins"]>[number], enabled: boolean) {
    const current = draft.modelParameters?.plugins ?? [];
    const next = enabled ? [...new Set([...current, plugin])] : current.filter((item) => item !== plugin);
    updateModelParameters({ plugins: next.length > 0 ? next : null });
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
                  <AgentPortrait agent={agent} size="lg" status={agent.isActive ? "IDLE" : "COMPLETED"} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="font-display text-xl">{agent.displayTitle ?? agent.canonicalTitle ?? agent.title}</h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {agent.displayName ?? agent.canonicalName ?? agent.name}
                          {(agent.displayName || agent.displayTitle) && (
                            <span className="ml-1 text-xs text-primary/60">· custom</span>
                          )}
                          {" "}· priority {agent.priority}
                        </p>
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
            <AgentPortrait agent={selected ?? draft} size="hero" shape="portrait-card" status={selected?.isActive === false ? "COMPLETED" : "IDLE"} clickToView />
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

            <div className="rounded-lg border border-border/60 bg-muted/15 p-4 space-y-4">
              <h3 className="font-semibold text-sm text-foreground">Royal Identity</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField id="agent-personal-detail" label="Personal Detail">
                  <Textarea id="agent-personal-detail" value={draft.personalDetail ?? ""} onChange={(e) => setDraft({ ...draft, personalDetail: e.target.value })} placeholder="Persistent personal details, history, and presentation." />
                </FormField>
                <FormField id="agent-personality" label="Personality">
                  <Textarea id="agent-personality" value={draft.personality ?? ""} onChange={(e) => setDraft({ ...draft, personality: e.target.value })} placeholder="Temperament, voice, and decision posture." />
                </FormField>
                <FormField id="agent-king-relationship" label="Relationship with the King">
                  <Textarea id="agent-king-relationship" value={draft.relationshipWithKing ?? ""} onChange={(e) => setDraft({ ...draft, relationshipWithKing: e.target.value })} placeholder="How this agent serves, challenges, and reports to the King." />
                </FormField>
                <FormField id="agent-council-relationship" label="Relationship with the Council">
                  <Textarea id="agent-council-relationship" value={draft.relationshipWithCouncil ?? ""} onChange={(e) => setDraft({ ...draft, relationshipWithCouncil: e.target.value })} placeholder="How this agent collaborates with other royal officials." />
                </FormField>
              </div>
            </div>

            <FormField id="agent-system-prompt" label="System Prompt">
              <Textarea id="agent-system-prompt" className="min-h-44" value={draft.systemPrompt} onChange={(e) => setDraft({ ...draft, systemPrompt: e.target.value })} placeholder="You are a royal advisor…" />
            </FormField>

            <FormField id="agent-response-style" label="Response Style">
              <Textarea id="agent-response-style" value={draft.responseStyle} onChange={(e) => setDraft({ ...draft, responseStyle: e.target.value })} placeholder="concise, structured, practical" />
            </FormField>

            <FormField id="agent-skills" label="Skills">
              <Input id="agent-skills" value={draft.skills.join(", ")} onChange={(e) => setDraft({ ...draft, skills: e.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} placeholder="Comma-separated: planning, risk analysis, strategy" />
            </FormField>

            <div className="rounded-lg border border-border/60 bg-muted/15 p-4 space-y-4">
              <h3 className="font-semibold text-sm text-foreground">Authority &amp; Boundaries</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField id="agent-allowed-actions" label="Allowed Actions">
                  <Textarea id="agent-allowed-actions" value={(draft.allowedActions ?? []).join("\n")} onChange={(e) => setDraft({ ...draft, allowedActions: lines(e.target.value) })} placeholder="One action per line." />
                </FormField>
                <FormField id="agent-forbidden-actions" label="Forbidden Actions">
                  <Textarea id="agent-forbidden-actions" value={(draft.forbiddenActions ?? []).join("\n")} onChange={(e) => setDraft({ ...draft, forbiddenActions: lines(e.target.value) })} placeholder="One forbidden action per line." />
                </FormField>
                <FormField id="agent-approval-required" label="Requires King Approval For">
                  <Textarea id="agent-approval-required" value={(draft.approvalRequiredFor ?? []).join("\n")} onChange={(e) => setDraft({ ...draft, approvalRequiredFor: lines(e.target.value) })} placeholder="One approval boundary per line." />
                </FormField>
                <FormField id="agent-role-boundaries" label="Role Boundaries">
                  <Textarea id="agent-role-boundaries" value={draft.roleBoundaries ?? ""} onChange={(e) => setDraft({ ...draft, roleBoundaries: e.target.value })} placeholder="Scope limits, handoff rules, and escalation behavior." />
                </FormField>
              </div>
            </div>

            <div className="rounded-lg border border-border/60 bg-muted/15 p-4 space-y-4">
              <h3 className="font-semibold text-sm text-foreground">Memory &amp; Learning Policy</h3>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="flex items-center gap-2 rounded border border-border/40 bg-background/40 p-3 text-xs text-foreground cursor-pointer">
                  <input type="checkbox" checked={draft.canProposeMemoryCandidates ?? true} onChange={(e) => setDraft({ ...draft, canProposeMemoryCandidates: e.target.checked })} />
                  Can propose memory candidates
                </label>
                <label className="flex items-center gap-2 rounded border border-border/40 bg-background/40 p-3 text-xs text-foreground cursor-pointer">
                  <input type="checkbox" checked={draft.canAutoSaveTrustedMemory ?? false} onChange={(e) => setDraft({ ...draft, canAutoSaveTrustedMemory: e.target.checked })} />
                  Can auto-save trusted memory
                </label>
                <label className="flex items-center gap-2 rounded border border-border/40 bg-background/40 p-3 text-xs text-foreground cursor-pointer">
                  <input type="checkbox" checked={draft.memoryRequiresApproval ?? true} onChange={(e) => setDraft({ ...draft, memoryRequiresApproval: e.target.checked })} />
                  Memory requires approval
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField id="agent-memory-categories" label="Allowed Memory Categories">
                  <Textarea id="agent-memory-categories" value={(draft.allowedMemoryCategories ?? []).join("\n")} onChange={(e) => setDraft({ ...draft, allowedMemoryCategories: lines(e.target.value) })} placeholder="PROJECT_FACT&#10;USER_PREFERENCE&#10;WORKFLOW_RULE" />
                </FormField>
                <FormField id="agent-retention-policy" label="Retention Policy">
                  <Textarea id="agent-retention-policy" value={draft.retentionPolicy ?? ""} onChange={(e) => setDraft({ ...draft, retentionPolicy: e.target.value })} placeholder="Approved durable memories only; raw reasoning must never be stored as memory." />
                </FormField>
              </div>
              <div className="rounded border border-yellow-500/20 bg-yellow-500/5 p-3 text-xs text-yellow-200">
                Raw reasoning must never be stored as memory.
              </div>
            </div>

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
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>Primary model:</span>
                  <ValidationBadge state={primaryModelValidationState} />
                </div>
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
                          {isInvalid ? <ValidationBadge state="Invalid" /> : <ValidationBadge state={openRouterModelList.length > 0 ? "Valid" : "Not checked"} />}
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
                      const readiness = routingPreview?.fallbackProviderDetails?.find((item) => item?.id === id)?.readiness;
                      return (
                        <div key={id} className="flex items-center gap-1.5 rounded-md border border-border/40 bg-background/60 px-2 py-1 text-xs">
                          <span className="flex-1 min-w-0">
                            <span className="font-medium text-foreground">{prov?.name ?? id}</span>
                            {prov && <span className="ml-1 text-muted-foreground">· {prov.environmentMode}</span>}
                          </span>
                          {readiness ? (
                            <ValidationBadge state={readiness.label as "Ready" | "Disabled" | "Insufficient balance" | "Production blocked in sandbox"} />
                          ) : warning ? (
                            <span title={warning}><AlertTriangle className="h-3 w-3 text-yellow-500 shrink-0" /></span>
                          ) : prov ? (
                            <CheckCircle className="h-3 w-3 text-green-400 shrink-0" />
                          ) : null}
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

            {/* Model Parameters Panel */}
            <div className="rounded-lg border border-border/60 bg-muted/20 p-4 space-y-4">
              <div className="flex items-center gap-2">
                <Settings2 className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-semibold text-sm text-foreground">Model Parameters</h3>
              </div>
              <p className="text-xs text-muted-foreground -mt-2">Controls how this agent calls the AI provider. Role Default uses pre-tuned values per agent type.</p>

              {/* Parameter Mode */}
              <FormField id="agent-param-mode" label="Parameter Mode">
                <select
                  id="agent-param-mode"
                  className={selectCls}
                  value={draft.parameterMode ?? "ROLE_DEFAULT"}
                  onChange={(e) => setDraft({ ...draft, parameterMode: e.target.value as ParameterMode })}
                >
                  <option value="ROLE_DEFAULT">Role Default — pre-tuned values per agent type</option>
                  <option value="MANUAL">Manual — King-configured values</option>
                  <option value="PROVIDER_DEFAULT">Provider Default — send only model and max_tokens</option>
                </select>
              </FormField>

              {draft.parameterMode === "MANUAL" && (
                <>
                  {/* Reasoning */}
                  <div className="rounded border border-border/40 bg-background/40 p-3 space-y-3">
                    <h4 className="text-xs font-semibold text-foreground">Reasoning</h4>
                    <p className="text-xs text-muted-foreground -mt-2">Reasoning tokens may count as output tokens. Raw reasoning is excluded from response by default.</p>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
                        <input
                          type="checkbox"
                          checked={draft.modelParameters?.reasoning?.enabled ?? true}
                          onChange={(e) => setDraft({
                            ...draft,
                            modelParameters: {
                              ...(draft.modelParameters ?? DEFAULT_MODEL_PARAMETERS),
                              reasoning: { ...(draft.modelParameters?.reasoning ?? {}), enabled: e.target.checked }
                            }
                          })}
                          className="rounded"
                        />
                        Reasoning enabled
                      </label>
                      <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
                        <input
                          type="checkbox"
                          checked={draft.modelParameters?.reasoning?.exclude ?? true}
                          onChange={(e) => setDraft({
                            ...draft,
                            modelParameters: {
                              ...(draft.modelParameters ?? DEFAULT_MODEL_PARAMETERS),
                              reasoning: { ...(draft.modelParameters?.reasoning ?? {}), exclude: e.target.checked }
                            }
                          })}
                          className="rounded"
                        />
                        Exclude reasoning from response
                      </label>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <FormField id="agent-reasoning-effort" label="Reasoning Effort">
                        <select
                          id="agent-reasoning-effort"
                          className={cn(selectCls, "h-9 text-xs")}
                          value={draft.modelParameters?.reasoning?.effort ?? "medium"}
                          onChange={(e) => setDraft({
                            ...draft,
                            modelParameters: {
                              ...(draft.modelParameters ?? DEFAULT_MODEL_PARAMETERS),
                              reasoning: { ...(draft.modelParameters?.reasoning ?? {}), effort: e.target.value as "none" | "minimal" | "low" | "medium" | "high" | "xhigh" }
                            }
                          })}
                        >
                          {["none", "minimal", "low", "medium", "high", "xhigh"].map((e) => (
                            <option key={e} value={e}>{e}</option>
                          ))}
                        </select>
                      </FormField>
                      <FormField id="agent-reasoning-max-tokens" label="Reasoning Max Tokens" description="Leave blank for no limit.">
                        <Input
                          id="agent-reasoning-max-tokens"
                          type="number"
                          className="h-9 text-xs"
                          value={draft.modelParameters?.reasoning?.max_tokens ?? ""}
                          onChange={(e) => setDraft({
                            ...draft,
                            modelParameters: {
                              ...(draft.modelParameters ?? DEFAULT_MODEL_PARAMETERS),
                              reasoning: { ...(draft.modelParameters?.reasoning ?? {}), max_tokens: e.target.value ? Number(e.target.value) : null }
                            }
                          })}
                          placeholder="No limit"
                        />
                      </FormField>
                    </div>
                  </div>

                  {/* Core sampling params */}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <FormField id="mp-temperature" label="Temperature" description="0 = deterministic, 2 = creative.">
                      <Input
                        id="mp-temperature"
                        type="number" step="0.05" min="0" max="2"
                        value={draft.modelParameters?.temperature ?? draft.temperature ?? ""}
                        onChange={(e) => setDraft({
                          ...draft,
                          modelParameters: { ...(draft.modelParameters ?? DEFAULT_MODEL_PARAMETERS), temperature: e.target.value ? Number(e.target.value) : null }
                        })}
                        placeholder="Role default"
                      />
                    </FormField>
                    <FormField id="mp-max-tokens" label="Max Tokens">
                      <Input
                        id="mp-max-tokens"
                        type="number" min="64" max="32000"
                        value={draft.modelParameters?.max_tokens ?? draft.maxTokens ?? ""}
                        onChange={(e) => setDraft({
                          ...draft,
                          modelParameters: { ...(draft.modelParameters ?? DEFAULT_MODEL_PARAMETERS), max_tokens: e.target.value ? Number(e.target.value) : null }
                        })}
                        placeholder="Global default"
                      />
                    </FormField>
                    <FormField id="mp-top-p" label="Top P" description="Nucleus sampling. Leave blank for default.">
                      <Input
                        id="mp-top-p"
                        type="number" step="0.01" min="0" max="1"
                        value={draft.modelParameters?.top_p ?? ""}
                        onChange={(e) => setDraft({
                          ...draft,
                          modelParameters: { ...(draft.modelParameters ?? DEFAULT_MODEL_PARAMETERS), top_p: e.target.value ? Number(e.target.value) : null }
                        })}
                        placeholder="Default"
                      />
                    </FormField>
                    <FormField id="mp-seed" label="Seed" description="Leave blank for non-deterministic.">
                      <Input
                        id="mp-seed"
                        type="number"
                        value={draft.modelParameters?.seed ?? ""}
                        onChange={(e) => setDraft({
                          ...draft,
                          modelParameters: { ...(draft.modelParameters ?? DEFAULT_MODEL_PARAMETERS), seed: e.target.value ? Number(e.target.value) : null }
                        })}
                        placeholder="Random"
                      />
                    </FormField>
                  </div>

                  {/* Stream */}
                  <div className="rounded border border-yellow-500/20 bg-yellow-500/5 p-3">
                    <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
                      <input
                        type="checkbox"
                        checked={draft.modelParameters?.stream ?? false}
                        onChange={(e) => setDraft({
                          ...draft,
                          modelParameters: { ...(draft.modelParameters ?? DEFAULT_MODEL_PARAMETERS), stream: e.target.checked }
                        })}
                        className="rounded"
                      />
                      <span>Stream responses</span>
                    </label>
                    <p className="mt-1 text-xs text-yellow-500/80">Streaming requires SSE parser; currently off by default.</p>
                  </div>

                  {/* Tools */}
                  <div className="rounded border border-border/40 bg-background/40 p-3 space-y-3">
                    <h4 className="text-xs font-semibold text-foreground">Tools</h4>
                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
                        <input
                          type="checkbox"
                          checked={draft.modelParameters?.tools?.enabled ?? false}
                          onChange={(e) => setDraft({
                            ...draft,
                            modelParameters: {
                              ...(draft.modelParameters ?? DEFAULT_MODEL_PARAMETERS),
                              tools: { ...(draft.modelParameters?.tools ?? {}), enabled: e.target.checked }
                            }
                          })}
                          className="rounded"
                        />
                        Tools enabled
                      </label>
                      <FormField id="mp-tool-choice" label="Tool choice">
                        <select
                          id="mp-tool-choice"
                          className={cn(selectCls, "h-9 text-xs")}
                          value={draft.modelParameters?.tools?.tool_choice ?? "auto"}
                          onChange={(e) => setDraft({
                            ...draft,
                            modelParameters: {
                              ...(draft.modelParameters ?? DEFAULT_MODEL_PARAMETERS),
                              tools: { ...(draft.modelParameters?.tools ?? {}), tool_choice: e.target.value as "auto" | "none" | "required" }
                            }
                          })}
                        >
                          {["auto", "none", "required"].map((tc) => (
                            <option key={tc} value={tc}>{tc}</option>
                          ))}
                        </select>
                      </FormField>
                    </div>
                  </div>

                  <details className="rounded border border-border/40 bg-background/40 p-3 space-y-4" open={advancedOpen} onToggle={(e) => setAdvancedOpen(e.currentTarget.open)}>
                    <summary className="cursor-pointer text-xs font-semibold text-foreground">Advanced Parameters</summary>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <FormField id="mp-response-format" label="response_format">
                        <select
                          id="mp-response-format"
                          className={cn(selectCls, "h-9 text-xs")}
                          value={draft.modelParameters?.response_format ?? "none"}
                          onChange={(e) => updateModelParameters({ response_format: e.target.value as ModelParameters["response_format"] })}
                        >
                          <option value="none">none</option>
                          <option value="json_object">json_object</option>
                          <option value="json_schema">json_schema</option>
                        </select>
                      </FormField>
                      <FormField id="mp-openrouter-route" label="OpenRouter route">
                        <select
                          id="mp-openrouter-route"
                          className={cn(selectCls, "h-9 text-xs")}
                          value={draft.modelParameters?.openrouter_route ?? "none"}
                          onChange={(e) => updateModelParameters({ openrouter_route: e.target.value as ModelParameters["openrouter_route"] })}
                        >
                          <option value="none">none</option>
                          <option value="fallback">fallback</option>
                        </select>
                      </FormField>
                      <FormField id="mp-stop" label="Stop Sequences">
                        <Textarea
                          id="mp-stop"
                          value={(draft.modelParameters?.stop ?? []).join("\n")}
                          onChange={(e) => updateModelParameters({ stop: lines(e.target.value) })}
                          placeholder="One sequence per line"
                        />
                      </FormField>
                      <FormField id="mp-provider-preferences" label="OpenRouter Provider Preferences">
                        <Textarea
                          id="mp-provider-preferences"
                          value={(draft.modelParameters?.openrouter_provider_preferences ?? []).join("\n")}
                          onChange={(e) => updateModelParameters({ openrouter_provider_preferences: lines(e.target.value) })}
                          placeholder="Provider slug, one per line"
                        />
                      </FormField>
                      <FormField id="mp-frequency-penalty" label="frequency_penalty">
                        <Input id="mp-frequency-penalty" type="number" step="0.1" min="-2" max="2" value={draft.modelParameters?.frequency_penalty ?? ""} onChange={(e) => updateModelParameters({ frequency_penalty: e.target.value ? Number(e.target.value) : null })} />
                      </FormField>
                      <FormField id="mp-presence-penalty" label="presence_penalty">
                        <Input id="mp-presence-penalty" type="number" step="0.1" min="-2" max="2" value={draft.modelParameters?.presence_penalty ?? ""} onChange={(e) => updateModelParameters({ presence_penalty: e.target.value ? Number(e.target.value) : null })} />
                      </FormField>
                      <FormField id="mp-repetition-penalty" label="repetition_penalty">
                        <Input id="mp-repetition-penalty" type="number" step="0.05" min="0" max="2" value={draft.modelParameters?.repetition_penalty ?? ""} onChange={(e) => updateModelParameters({ repetition_penalty: e.target.value ? Number(e.target.value) : null })} />
                      </FormField>
                      <FormField id="mp-top-k" label="top_k">
                        <Input id="mp-top-k" type="number" min="0" max="1000" value={draft.modelParameters?.top_k ?? ""} onChange={(e) => updateModelParameters({ top_k: e.target.value ? Number(e.target.value) : null })} />
                      </FormField>
                      <FormField id="mp-min-p" label="min_p">
                        <Input id="mp-min-p" type="number" step="0.01" min="0" max="1" value={draft.modelParameters?.min_p ?? ""} onChange={(e) => updateModelParameters({ min_p: e.target.value ? Number(e.target.value) : null })} />
                      </FormField>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {(["web", "file-parser", "response-healing", "context-compression"] as const).map((plugin) => (
                        <label key={plugin} className="flex items-center gap-2 rounded border border-border/40 bg-background/60 p-2 text-xs text-foreground cursor-pointer">
                          <input
                            type="checkbox"
                            checked={(draft.modelParameters?.plugins ?? []).includes(plugin)}
                            onChange={(e) => togglePlugin(plugin, e.target.checked)}
                          />
                          {plugin}
                        </label>
                      ))}
                    </div>
                  </details>
                </>
              )}

              {draft.parameterMode === "ROLE_DEFAULT" && (
                <div className="rounded border border-border/40 bg-background/40 p-3 text-xs text-muted-foreground">
                  Role defaults apply: temperature and reasoning effort are tuned per agent type. Switch to Manual to override.
                </div>
              )}
              {draft.parameterMode === "PROVIDER_DEFAULT" && (
                <div className="rounded border border-border/40 bg-background/40 p-3 text-xs text-muted-foreground">
                  Only model and max_tokens will be sent. Provider uses its own defaults for all other parameters.
                </div>
              )}
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

                    {routingPreview.sandboxFallbackMode && (
                      <div className="rounded border border-yellow-500/20 bg-yellow-500/5 p-2">
                        <span className="text-yellow-200">Sandbox fallback mode: </span>
                        <span className="text-muted-foreground">production fallbacks are blocked unless explicitly enabled.</span>
                      </div>
                    )}

                    {routingPreview.blockedFallbackProviderDetails?.length ? (
                      <div>
                        <span className="text-muted-foreground">Skipped/blocked providers: </span>
                        <span className="text-foreground">
                          {routingPreview.blockedFallbackProviderDetails
                            .filter((item) => item.readiness.state !== "READY")
                            .map((item, i) => (
                              <span key={item.id}>
                                {i > 0 && <span className="text-muted-foreground">, </span>}
                                <span className="font-medium">{item.name}</span>
                                <span className="text-muted-foreground"> ({item.readiness.label})</span>
                              </span>
                            ))}
                        </span>
                      </div>
                    ) : null}

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

            {/* Effective Request Preview */}
            {selected && (
              <div className="rounded-lg border border-border/60 bg-muted/10 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm text-foreground">Effective Request Preview</h3>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-7 px-2 text-xs gap-1"
                    onClick={() => loadEffectivePreview(selected.id)}
                    disabled={loadingEffectivePreview}
                  >
                    <RefreshCw className={cn("h-3 w-3", loadingEffectivePreview && "animate-spin")} />
                    Refresh
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Sanitized view of what the provider request will look like. API key and headers are never shown.</p>
                {loadingEffectivePreview ? (
                  <p className="text-xs text-muted-foreground">Loading…</p>
                ) : effectivePreview ? (
                  <div className="space-y-3">
                    <div className="text-xs font-medium text-muted-foreground">Mode: <span className="text-foreground">{effectivePreview.parameterMode}</span></div>
                    <div className="grid gap-2 text-xs sm:grid-cols-2">
                      <PreviewField label="configuredProvider" value={effectivePreview.preview.configuredProvider} />
                      <PreviewField label="configuredModel" value={effectivePreview.preview.configuredModel ?? "provider default"} />
                      <PreviewField label="actualSentModel" value={effectivePreview.preview.actualSentModel} />
                      <PreviewField label="finalResponseModel" value={effectivePreview.preview.finalResponseModel ?? "not available"} />
                      <PreviewField label="streamEnabled" value={String(effectivePreview.preview.streamEnabled)} />
                      <PreviewField label="reasoningEnabled" value={String(effectivePreview.preview.reasoningEnabled)} />
                      <PreviewField label="reasoningEffort" value={effectivePreview.preview.reasoningEffort ?? "none"} />
                      <PreviewField label="reasoningExcluded" value={String(effectivePreview.preview.reasoningExcluded)} />
                      <PreviewField label="response_format" value={effectivePreview.preview.response_format ?? "none"} />
                    </div>
                    <div className="rounded-md border border-border/40 bg-background/60 p-3 text-xs">
                      <div className="mb-2 font-medium text-muted-foreground">Provider/model validation state</div>
                      <pre className="font-mono text-foreground whitespace-pre-wrap break-all">{JSON.stringify(effectivePreview.preview.validationState, null, 2)}</pre>
                    </div>
                    <div className="text-xs font-medium text-muted-foreground">Actual Sent Body Preview</div>
                    <pre className="rounded-md border border-border/40 bg-background/80 p-3 text-xs text-foreground font-mono overflow-x-auto whitespace-pre-wrap break-all">
                      {JSON.stringify(effectivePreview.preview.actualSentBodyPreview, null, 2)}
                    </pre>
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

          {/* Display & Portrait — separate from core identity */}
          {selected && (
            <div className="mt-8 rounded-lg border border-border/60 bg-muted/10 p-4 space-y-5">
              <div className="flex items-center gap-2">
                <Image className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-semibold text-sm text-foreground">Display &amp; Portrait</h3>
              </div>
              <div className="rounded border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-200">
                Portrait changes affect display only. Agent role, memory, routing, and relationships remain unchanged.
              </div>

              {/* Portrait preview */}
              <div className="flex flex-col sm:flex-row gap-5 items-start">
                <div className="shrink-0">
                  <AgentPortrait
                    agent={selected}
                    size="hero"
                    shape="portrait-card"
                    status="IDLE"
                    showStatusRing={false}
                    clickToView
                    className="w-[200px]"
                  />
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => {
                        const portrait = selected.avatarUrl;
                        if (portrait) window.open(portrait, "_blank", "noopener");
                      }}
                      disabled={!selected.avatarUrl}
                    >
                      <ExternalLink className="h-3 w-3" /> View Full
                    </button>
                    {selected.avatarVersion > 1 && (
                      <span className="text-xs text-muted-foreground">v{selected.avatarVersion}</span>
                    )}
                  </div>
                </div>

                <div className="flex-1 space-y-4 min-w-0">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <FormField id="dp-display-name" label="Display Name" description="Overrides the canonical name in the UI only.">
                      <Input
                        id="dp-display-name"
                        value={displayDraft.displayName ?? ""}
                        onChange={(e) => setDisplayDraft({ ...displayDraft, displayName: e.target.value || null })}
                        placeholder={selected.canonicalName ?? selected.name}
                      />
                    </FormField>
                    <FormField id="dp-display-title" label="Display Title" description="Overrides the canonical title in the UI only.">
                      <Input
                        id="dp-display-title"
                        value={displayDraft.displayTitle ?? ""}
                        onChange={(e) => setDisplayDraft({ ...displayDraft, displayTitle: e.target.value || null })}
                        placeholder={selected.canonicalTitle ?? selected.title}
                      />
                    </FormField>
                  </div>

                  <FormField id="dp-avatar-url" label="Portrait Image URL" description="Custom portrait URL. Leave blank to use uploaded file or default portrait.">
                    <Input
                      id="dp-avatar-url"
                      value={displayDraft.avatarUrl ?? ""}
                      onChange={(e) => setDisplayDraft({ ...displayDraft, avatarUrl: e.target.value || null })}
                      placeholder="https://example.com/portrait.png"
                    />
                  </FormField>

                  {/* Upload dropzone */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">Upload Portrait</label>
                    <p className="text-xs text-muted-foreground mb-2">
                      JPEG, PNG, or WebP — max 5 MB. Recommended: 1024 × 1280 px (portrait) or 1254 × 1254 px (square).
                    </p>
                    <input
                      ref={avatarFileRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void onUploadAvatar(file);
                        if (avatarFileRef.current) avatarFileRef.current.value = "";
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => avatarFileRef.current?.click()}
                      disabled={displaySaving}
                      className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border/60 bg-muted/10 px-4 py-5 text-sm text-muted-foreground transition hover:border-primary/40 hover:bg-muted/20 hover:text-foreground disabled:opacity-50"
                    >
                      <Image className="h-5 w-5" />
                      Click to choose file
                    </button>
                    {selected.avatarUrl && (
                      <span className="mt-1.5 block text-xs text-muted-foreground font-mono truncate">{selected.avatarUrl}</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <FormField id="dp-avatar-prompt" label="Portrait Prompt" description="Optional generative prompt used to create this portrait.">
                  <Textarea
                    id="dp-avatar-prompt"
                    value={displayDraft.avatarPrompt ?? ""}
                    onChange={(e) => setDisplayDraft({ ...displayDraft, avatarPrompt: e.target.value || null })}
                    placeholder="A regal council figure in a medieval fantasy setting…"
                  />
                </FormField>
                <FormField id="dp-avatar-style" label="Portrait Style">
                  <Input
                    id="dp-avatar-style"
                    value={displayDraft.avatarStyle ?? ""}
                    onChange={(e) => setDisplayDraft({ ...displayDraft, avatarStyle: e.target.value || null })}
                    placeholder="oil painting, cinematic, photorealistic…"
                  />
                </FormField>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button type="button" onClick={() => void onSaveDisplayProfile()} disabled={displaySaving}>
                  {displaySaving ? "Saving…" : "Save Display Profile"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void onResetPortrait()}
                  disabled={displaySaving || !selected.avatarUrl}
                  title="Remove custom portrait, reverting to default"
                >
                  <Image className="h-4 w-4 mr-1.5" />
                  Reset Portrait
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={onResetToCanonical}
                  disabled={displaySaving}
                  title="Clear displayName and displayTitle, reverting to canonical identity"
                >
                  <RotateCcw className="h-4 w-4 mr-1.5" />
                  Reset to Canonical
                </Button>
              </div>

              {displayError && (
                <div className="rounded-md border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-100">{displayError}</div>
              )}
              {displaySuccess && (
                <div className="rounded-md border border-green-400/30 bg-green-400/10 p-3 text-sm text-green-200">Display profile saved.</div>
              )}

              {(selected.canonicalName || selected.canonicalTitle || selected.coreSlug) && (
                <div className="rounded border border-border/40 bg-background/40 p-3 text-xs text-muted-foreground space-y-1">
                  <div className="font-medium text-foreground">Canonical Identity (stable)</div>
                  {selected.canonicalName && <div>Name: <span className="text-foreground">{selected.canonicalName}</span></div>}
                  {selected.canonicalTitle && <div>Title: <span className="text-foreground">{selected.canonicalTitle}</span></div>}
                  {selected.coreSlug && <div>Slug: <span className="font-mono text-foreground">{selected.coreSlug}</span></div>}
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

function ValidationBadge({ state }: { state: "Valid" | "Invalid" | "Not checked" | "Ready" | "Disabled" | "Insufficient balance" | "Production blocked in sandbox" }) {
  const variant =
    state === "Valid" || state === "Ready" ? "ok" :
      state === "Invalid" || state === "Disabled" ? "error" :
        "warn";
  return <ProviderBadge label={state} variant={variant} />;
}

function PreviewField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border/40 bg-background/60 p-2">
      <div className="text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-foreground break-all">{value}</div>
    </div>
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
    maxTokens: agent.maxTokens,
    personalDetail: agent.personalDetail ?? "",
    personality: agent.personality ?? "",
    relationshipWithKing: agent.relationshipWithKing ?? "",
    relationshipWithCouncil: agent.relationshipWithCouncil ?? "",
    roleBoundaries: agent.roleBoundaries ?? "",
    allowedActions: agent.allowedActions ?? [],
    forbiddenActions: agent.forbiddenActions ?? [],
    approvalRequiredFor: agent.approvalRequiredFor ?? [],
    canProposeMemoryCandidates: agent.canProposeMemoryCandidates ?? true,
    canAutoSaveTrustedMemory: agent.canAutoSaveTrustedMemory ?? false,
    memoryRequiresApproval: agent.memoryRequiresApproval ?? true,
    allowedMemoryCategories: agent.allowedMemoryCategories ?? [],
    retentionPolicy: agent.retentionPolicy ?? "approved durable memories only; raw reasoning must never be stored as memory",
    parameterMode: (agent.parameterMode as ParameterMode) ?? "ROLE_DEFAULT",
    modelParameters: agent.modelParameters ?? null
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
    maxTokens: payload.maxTokens ?? null,
    personalDetail: payload.personalDetail ?? "",
    personality: payload.personality ?? "",
    relationshipWithKing: payload.relationshipWithKing ?? "",
    relationshipWithCouncil: payload.relationshipWithCouncil ?? "",
    roleBoundaries: payload.roleBoundaries ?? "",
    allowedActions: payload.allowedActions ?? [],
    forbiddenActions: payload.forbiddenActions ?? [],
    approvalRequiredFor: payload.approvalRequiredFor ?? [],
    canProposeMemoryCandidates: payload.canProposeMemoryCandidates ?? true,
    canAutoSaveTrustedMemory: payload.canAutoSaveTrustedMemory ?? false,
    memoryRequiresApproval: payload.memoryRequiresApproval ?? true,
    allowedMemoryCategories: payload.allowedMemoryCategories ?? [],
    retentionPolicy: payload.retentionPolicy ?? "approved durable memories only; raw reasoning must never be stored as memory",
    parameterMode: payload.parameterMode ?? "ROLE_DEFAULT",
    modelParameters: payload.parameterMode === "MANUAL" ? (payload.modelParameters ?? null) : null
  };
}

function lines(value: string): string[] {
  return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

function toDisplayPayload(agent: AgentDto | null): DisplayProfilePayload {
  return {
    displayName: agent?.displayName ?? null,
    displayTitle: agent?.displayTitle ?? null,
    avatarUrl: agent?.avatarUrl ?? null,
    avatarPrompt: agent?.avatarPrompt ?? null,
    avatarStyle: agent?.avatarStyle ?? null
  };
}
