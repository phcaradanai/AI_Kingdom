import { FormEvent, useEffect, useState } from "react";
import { Cpu, Power, Save, Plus, Edit2, X, Trash } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { getModelDisplayName, getProviderDisplayName, getProviderModeBadge, isLocalSandboxProvider } from "@/lib/providerDisplay";
import { cn } from "@/lib/utils";
import { useKingdomStore } from "@/stores/kingdomStore";
import type { AIProviderDto, ModelPricingDto } from "@/types/api";

export function ProvidersPage() {
  const providers = useKingdomStore((state) => state.providers);
  const updateProvider = useKingdomStore((state) => state.updateProvider);
  const createProvider = useKingdomStore((state) => state.createProvider);
  const deleteProvider = useKingdomStore((state) => state.deleteProvider);
  const refresh = useKingdomStore((state) => state.refresh);
  const [pricingRecords, setPricingRecords] = useState<ModelPricingDto[]>([]);
  const [isValidating, setIsValidating] = useState(false);

  async function handleValidateModels() {
    setIsValidating(true);
    try {
      await api.validateModels();
      await refresh();
    } catch (err) {
      console.error("Failed model validation:", err);
    } finally {
      setIsValidating(false);
    }
  }

  useEffect(() => {
    api.modelPricing().then((r) => setPricingRecords(r.modelPricing)).catch(() => undefined);
  }, []);

  function isPricingKnown(provider: AIProviderDto): boolean {
    const model = provider.defaultModel;
    if (!model) return false;
    if (isLocalSandboxProvider(provider)) return true;
    return pricingRecords.some((p) => p.providerType === provider.type && p.model === model && p.isActive);
  }

  const [editingId, setEditingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Pick<AIProviderDto, "defaultModel" | "priority" | "costTier">>>({});
  
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addDraft, setAddDraft] = useState({
    name: "",
    type: "custom",
    baseUrl: "",
    defaultModel: "",
    priority: 100,
    costTier: "MEDIUM",
    credentialEnvKey: "",
    capabilities: { supportsChat: true, supportsTools: false, supportsVision: false, supportsJsonMode: false }
  });

  function startEdit(provider: AIProviderDto) {
    setDrafts({ ...drafts, [provider.id]: { defaultModel: provider.defaultModel, priority: provider.priority, costTier: provider.costTier } });
    setEditingId(provider.id);
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit(event: FormEvent, provider: AIProviderDto) {
    event.preventDefault();
    await updateProvider(provider.id, drafts[provider.id] || {});
    setEditingId(null);
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    await createProvider({
      ...addDraft,
      baseUrl: addDraft.baseUrl || undefined,
      credentialEnvKey: addDraft.credentialEnvKey || undefined
    });
    setIsAddOpen(false);
    setAddDraft({
      name: "", type: "custom", baseUrl: "", defaultModel: "", priority: 100, costTier: "MEDIUM", credentialEnvKey: "",
      capabilities: { supportsChat: true, supportsTools: false, supportsVision: false, supportsJsonMode: false }
    });
  }

  function getReadinessBadge(provider: AIProviderDto) {
    if (!provider.isActive) {
      return <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase font-bold text-muted-foreground border border-border tracking-wider">INACTIVE</span>;
    }
    if (provider.isActive && !provider.hasCredentials && !isLocalSandboxProvider(provider)) {
      return <span className="rounded-full bg-destructive/20 px-2 py-0.5 text-[10px] uppercase font-bold text-destructive border border-destructive/50 tracking-wider">MISSING KEY</span>;
    }
    return <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] uppercase font-bold text-primary border border-primary/50 tracking-wider">READY</span>;
  }

  return (
    <>
      <PageHeader
        eyebrow="Provider Registry"
        title="AI providers"
        description="Manage active providers, routing priority, default models, cost tiers, and public capabilities."
        action={
          <div className="flex gap-2">
            <Button onClick={handleValidateModels} variant="outline" disabled={isValidating}>
              <Cpu className={cn("h-4 w-4 mr-2", isValidating && "animate-spin")} />
              {isValidating ? "Validating..." : "Validate Models"}
            </Button>
            <Button onClick={() => setIsAddOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Provider
            </Button>
          </div>
        }
      />

      <div className="mb-6 rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
        <p><strong className="text-foreground">Providers are the AI engines available to the Kingdom.</strong> Routing policy chooses which provider/model each agent should use. API keys stay server-side in environment variables and are never shown here.</p>
      </div>

      {isAddOpen && (
        <Card className="mb-8 p-6 border-primary bg-card/50">
          <h3 className="text-lg font-display mb-4 flex items-center gap-2"><Plus className="h-5 w-5 text-primary" /> Add New Provider</h3>
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Provider Name</label>
                <Input required value={addDraft.name} onChange={(e) => setAddDraft({ ...addDraft, name: e.target.value })} placeholder="e.g. My Custom OpenAI" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Provider Type</label>
                <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={addDraft.type} onChange={(e) => setAddDraft({ ...addDraft, type: e.target.value })}>
                  <option value="custom">custom</option>
                  <option value="openai-compatible">openai-compatible</option>
                  <option value="openai">openai</option>
                  <option value="anthropic">anthropic</option>
                  <option value="openrouter">openrouter</option>
                  <option value="deepseek">deepseek</option>
                  <option value="gemini">gemini</option>
                  <option value="local">local</option>
                  <option value="sandbox">sandbox</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Base URL</label>
                <p className="text-[11px] text-muted-foreground/80 mb-1.5">Only needed for OpenAI-compatible or custom endpoints.</p>
                <Input value={addDraft.baseUrl} onChange={(e) => setAddDraft({ ...addDraft, baseUrl: e.target.value })} placeholder="https://api.openai.com/v1" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Default Model</label>
                <p className="text-[11px] text-muted-foreground/80 mb-1.5">Example: deepseek-chat, openai/gpt-4o-mini.</p>
                <Input required={addDraft.type !== "sandbox"} value={addDraft.defaultModel} onChange={(e) => setAddDraft({ ...addDraft, defaultModel: e.target.value })} placeholder="e.g. gpt-4o-mini" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Routing Priority <span className="font-normal">(Lower numbers preferred first)</span></label>
                <Input type="number" required min="1" value={addDraft.priority} onChange={(e) => setAddDraft({ ...addDraft, priority: Number(e.target.value) })} />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Cost Tier <span className="font-normal">(Used by cost-mode routing)</span></label>
                <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={addDraft.costTier} onChange={(e) => setAddDraft({ ...addDraft, costTier: e.target.value })}>
                  {["FREE", "LOW", "MEDIUM", "HIGH", "PREMIUM"].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Credential Environment Key</label>
                <p className="text-[11px] text-muted-foreground/80 mb-1.5">Name of the backend .env variable, for example DEEPSEEK_API_KEY. Do not paste the actual key.</p>
                <Input value={addDraft.credentialEnvKey} onChange={(e) => setAddDraft({ ...addDraft, credentialEnvKey: e.target.value })} placeholder="e.g. DEEPSEEK_API_KEY" />
              </div>
              <div className="md:col-span-2 flex flex-wrap items-center gap-6 text-sm mt-2">
                <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" className="rounded border-input text-primary" checked={addDraft.capabilities.supportsChat} onChange={(e) => setAddDraft({...addDraft, capabilities: {...addDraft.capabilities, supportsChat: e.target.checked}})} /> Chat</label>
                <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" className="rounded border-input text-primary" checked={addDraft.capabilities.supportsTools} onChange={(e) => setAddDraft({...addDraft, capabilities: {...addDraft.capabilities, supportsTools: e.target.checked}})} /> Tools</label>
                <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" className="rounded border-input text-primary" checked={addDraft.capabilities.supportsVision} onChange={(e) => setAddDraft({...addDraft, capabilities: {...addDraft.capabilities, supportsVision: e.target.checked}})} /> Vision</label>
                <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" className="rounded border-input text-primary" checked={addDraft.capabilities.supportsJsonMode} onChange={(e) => setAddDraft({...addDraft, capabilities: {...addDraft.capabilities, supportsJsonMode: e.target.checked}})} /> JSON Mode</label>
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-6 border-t border-border/50 pt-4">
              <Button type="button" variant="ghost" onClick={() => setIsAddOpen(false)}>Cancel</Button>
              <Button type="submit">Create Provider</Button>
            </div>
          </form>
        </Card>
      )}

      {providers.length === 0 && !isAddOpen && (
        <div className="text-center py-12 text-muted-foreground">
          No providers found. Add one to get started.
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        {providers.map((provider) => {
          const isEditing = editingId === provider.id;
          const draft = drafts[provider.id] || { defaultModel: "", priority: 100, costTier: "MEDIUM" };

          return (
            <Card key={provider.id} className="relative overflow-hidden transition-all duration-200 hover:border-primary/50">
              <div className="p-5">
                <div className="flex items-start justify-between gap-4 mb-2">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg text-primary"><Cpu className="h-5 w-5" /></div>
                    <div>
                      <h2 className="font-display text-lg flex flex-wrap items-center gap-2">
                        {getProviderDisplayName(provider)}
                        {getReadinessBadge(provider)}
                      </h2>
                      <div className="mt-0.5 text-xs text-muted-foreground">{getProviderModeBadge(provider)}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button className="h-8 px-3 text-xs" variant={provider.isActive ? "primary" : "outline"} onClick={() => void updateProvider(provider.id, { isActive: !provider.isActive })}>
                      <Power className="h-4 w-4 mr-1" />
                      {provider.isActive ? "Active" : "Inactive"}
                    </Button>
                    {!isEditing && (
                      <Button className="h-8 w-8 p-0" variant="ghost" onClick={() => startEdit(provider)}>
                        <Edit2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    )}
                  </div>
                </div>

                {isEditing ? (
                  <form className="space-y-4 mt-6 border-t border-border/50 pt-4" onSubmit={(event) => void saveEdit(event, provider)}>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="text-xs font-semibold text-muted-foreground block mb-1">Default Model <span className="font-normal">(Used when not overridden)</span></label>
                        <Input
                          value={draft.defaultModel}
                          onChange={(event) => setDrafts({ ...drafts, [provider.id]: { ...draft, defaultModel: event.target.value } })}
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-muted-foreground block mb-1">Routing Priority <span className="font-normal">(Lower numbers first)</span></label>
                        <Input
                          type="number"
                          value={draft.priority}
                          onChange={(event) => setDrafts({ ...drafts, [provider.id]: { ...draft, priority: Number(event.target.value) } })}
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-muted-foreground block mb-1">Cost Tier <span className="font-normal">(For AI cost-mode)</span></label>
                        <select
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          value={draft.costTier}
                          onChange={(event) => setDrafts({ ...drafts, [provider.id]: { ...draft, costTier: event.target.value as AIProviderDto["costTier"] } })}
                        >
                          {["FREE", "LOW", "MEDIUM", "HIGH", "PREMIUM"].map((tier) => <option key={tier} value={tier}>{tier}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pt-2">
                      <Button type="submit" className="h-8 px-3 text-xs"><Save className="h-4 w-4 mr-2" /> Save</Button>
                      <Button type="button" className="h-8 px-3 text-xs" variant="ghost" onClick={cancelEdit}><X className="h-4 w-4 mr-2" /> Cancel</Button>
                      {provider.id.startsWith('custom-') && (
                        <Button type="button" className="ml-auto h-8 px-3 text-xs border-red-500/50 text-red-500 hover:bg-red-500/10" variant="outline" onClick={() => void deleteProvider(provider.id)}>
                          <Trash className="h-4 w-4 mr-2" /> Delete
                        </Button>
                      )}
                    </div>
                  </form>
                ) : (
                  <div className="grid grid-cols-2 gap-y-5 text-sm mt-5 border-t border-border/50 pt-5">
                    <div>
                      <span className="block text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1">Provider Type</span>
                      <span className="font-medium">{isLocalSandboxProvider(provider) ? "sandbox" : provider.type}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1">Default Model</span>
                      <span className="font-medium">{provider.defaultModel ? getModelDisplayName(provider.defaultModel) : "None"}</span>
                      {provider.defaultModel && !isLocalSandboxProvider(provider) && (
                        <span className={cn("ml-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border", isPricingKnown(provider) ? "border-primary/40 bg-primary/10 text-primary" : "border-yellow-500/40 bg-yellow-500/10 text-yellow-400")}>
                          {isPricingKnown(provider) ? "Pricing ✓" : "Pricing ?"}
                        </span>
                      )}
                    </div>
                    <div>
                      <span className="block text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1">Routing Priority</span>
                      <span className="font-medium">{provider.priority}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1">Cost Tier</span>
                      <span className="font-medium">{provider.costTier}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="block text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1">Credential Status</span>
                      <span className="font-medium">
                        {isLocalSandboxProvider(provider) ? "No env credentials required" : 
                         provider.hasCredentials ? "Env key configured" : "Missing env key"}
                      </span>
                    </div>
                    {provider.type === "openrouter" && (
                      <div className="col-span-2">
                        <span className="block text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1">Model Validation Status</span>
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          {provider.modelValidationStatus === "VALID" && (
                            <span className="inline-flex items-center gap-1 rounded bg-green-500/10 px-2 py-0.5 text-xs font-semibold text-green-500 border border-green-500/20">
                              Valid
                            </span>
                          )}
                          {provider.modelValidationStatus === "INVALID_MODEL" && (
                            <span className="inline-flex items-center gap-1 rounded bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive border border-destructive/20">
                              Invalid Model
                            </span>
                          )}
                          {provider.modelValidationStatus === "PROVIDER_UNAVAILABLE" && (
                            <span className="inline-flex items-center gap-1 rounded bg-yellow-500/10 px-2 py-0.5 text-xs font-semibold text-yellow-500 border border-yellow-500/20">
                              Provider Unavailable
                            </span>
                          )}
                          {(!provider.modelValidationStatus || provider.modelValidationStatus === "NOT_CHECKED") && (
                            <span className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground border border-border">
                              Not Checked
                            </span>
                          )}
                          {provider.lastValidationTime && (
                            <span className="text-xs text-muted-foreground">
                              Checked: {new Date(provider.lastValidationTime).toLocaleString()}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                    <div className="col-span-2">
                      <span className="block text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-2">Capabilities</span>
                      <div className="flex flex-wrap gap-2 text-xs">
                        {provider.supportsChat && <span className="bg-primary/5 text-primary border border-primary/20 px-2 py-1 rounded-md">chat</span>}
                        {provider.supportsTools && <span className="bg-primary/5 text-primary border border-primary/20 px-2 py-1 rounded-md">tools</span>}
                        {provider.supportsVision && <span className="bg-primary/5 text-primary border border-primary/20 px-2 py-1 rounded-md">vision</span>}
                        {provider.supportsJsonMode && <span className="bg-primary/5 text-primary border border-primary/20 px-2 py-1 rounded-md">json</span>}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
