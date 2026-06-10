import { useEffect, useState, FormEvent } from "react";
import { ArrowDown, ArrowUp, Plus, Save, Trash2, X, RefreshCw, ChevronDown, ChevronRight, Copy } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { getProviderDisplayName, getModelDisplayName } from "@/lib/providerDisplay";
import { cn, formatDate } from "@/lib/utils";
import type { RouteChainDto, RouteChainEntryDto, ProviderRegistryDto, ProviderHealthStatus, ProviderModelSnapshotDto } from "@/types/api";

function healthColor(status: ProviderHealthStatus): string {
  if (status === "HEALTHY") return "text-emerald-400";
  if (status === "DEGRADED") return "text-amber-400";
  if (status === "DOWN") return "text-red-400";
  return "text-muted-foreground";
}

function HealthDot({ status }: { status: ProviderHealthStatus }) {
  const colors: Record<ProviderHealthStatus, string> = {
    HEALTHY: "bg-emerald-400",
    DEGRADED: "bg-amber-400",
    DOWN: "bg-red-400",
    UNKNOWN: "bg-muted-foreground/40"
  };
  return <span className={cn("inline-block h-2 w-2 rounded-full", colors[status])} title={status} />;
}

type EntryDraft = { providerId: string; model: string; isEnabled: boolean; notes: string };

const blankEntry = (): EntryDraft => ({ providerId: "", model: "", isEnabled: true, notes: "" });

function EntryRow({
  entry,
  index,
  total,
  providers,
  onMove,
  onChange,
  onRemove
}: {
  entry: EntryDraft;
  index: number;
  total: number;
  providers: ProviderRegistryDto[];
  onMove: (from: number, to: number) => void;
  onChange: (index: number, patch: Partial<EntryDraft>) => void;
  onRemove: (index: number) => void;
}) {
  const isSandbox = entry.providerId === "local-sandbox-baseline";
  const prov = providers.find((p) => p.id === entry.providerId);

  return (
    <div className={cn("flex items-start gap-3 rounded-lg border border-border/60 bg-card/40 p-3", !entry.isEnabled && "opacity-50")}>
      <div className="flex flex-col gap-1 pt-1">
        <Button variant="ghost" className="h-6 w-6 p-0" disabled={index === 0} onClick={() => onMove(index, index - 1)}>
          <ArrowUp className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" className="h-6 w-6 p-0" disabled={index === total - 1} onClick={() => onMove(index, index + 1)}>
          <ArrowDown className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="flex-1 min-w-0 grid gap-2 sm:grid-cols-3">
        <div>
          <label className="text-xs text-muted-foreground">Provider</label>
          <select
            className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            value={entry.providerId}
            onChange={(e) => onChange(index, { providerId: e.target.value, model: "" })}
          >
            <option value="">Select provider…</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          {prov && (
            <div className={cn("mt-0.5 text-[10px] font-semibold", healthColor(prov.healthStatus))}>
              {prov.healthStatus}
            </div>
          )}
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Model</label>
          <Input
            className="mt-0.5 h-8 text-sm"
            placeholder={prov?.defaultModel ?? "model-id"}
            value={entry.model}
            onChange={(e) => onChange(index, { model: e.target.value })}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Notes</label>
          <Input
            className="mt-0.5 h-8 text-sm"
            placeholder="Optional"
            value={entry.notes}
            onChange={(e) => onChange(index, { notes: e.target.value })}
          />
        </div>
      </div>
      <div className="flex items-center gap-2 pt-1">
        <input
          type="checkbox"
          className="rounded border-border"
          checked={entry.isEnabled}
          onChange={(e) => onChange(index, { isEnabled: e.target.checked })}
          title="Enabled"
        />
        <Button
          variant="ghost"
          className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
          disabled={isSandbox}
          onClick={() => onRemove(index)}
          title={isSandbox ? "Sandbox safety net cannot be removed" : "Remove"}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function RouteChainCard({
  chain,
  providers,
  onUpdated,
  onDeleted,
  onDuplicated
}: {
  chain: RouteChainDto;
  providers: ProviderRegistryDto[];
  onUpdated: (c: RouteChainDto) => void;
  onDeleted: (id: string) => void;
  onDuplicated: (c: RouteChainDto) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(chain.name);
  const [desc, setDesc] = useState(chain.description ?? "");
  const [entries, setEntries] = useState<EntryDraft[]>(
    chain.entries.map((e) => ({ providerId: e.providerId, model: e.model, isEnabled: e.isEnabled, notes: e.notes ?? "" }))
  );
  const [error, setError] = useState<string | null>(null);

  function moveEntry(from: number, to: number) {
    const arr = [...entries];
    const [item] = arr.splice(from, 1);
    arr.splice(to, 0, item!);
    setEntries(arr);
  }

  function changeEntry(index: number, patch: Partial<EntryDraft>) {
    setEntries(entries.map((e, i) => i === index ? { ...e, ...patch } : e));
  }

  function removeEntry(index: number) {
    setEntries(entries.filter((_, i) => i !== index));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const updated = await api.updateRouteChain(chain.id, {
        name,
        description: desc || null,
        entries: entries.map((e) => ({ providerId: e.providerId, model: e.model || providers.find((p) => p.id === e.providerId)?.defaultModel || "", isEnabled: e.isEnabled, notes: e.notes || null }))
      });
      onUpdated(updated.routeChain);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive() {
    const updated = await api.updateRouteChain(chain.id, { isActive: !chain.isActive });
    onUpdated(updated.routeChain);
  }

  async function handleDelete() {
    if (!confirm(`Delete route chain "${chain.name}"?`)) return;
    await api.deleteRouteChain(chain.id);
    onDeleted(chain.id);
  }

  async function handleDuplicate() {
    const copy = await api.duplicateRouteChain(chain.id);
    onDuplicated(copy.routeChain);
  }

  const activeProv = providers.filter((p) => chain.entries.some((e) => e.providerId === p.id));

  return (
    <Card className={cn("p-4", !chain.isActive && "opacity-60")}>
      <div className="flex items-start justify-between gap-3">
        <button className="flex items-center gap-2 text-left" onClick={() => setExpanded(!expanded)}>
          {expanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
          <div>
            <div className="text-sm font-semibold">{chain.name}</div>
            <div className="text-xs text-muted-foreground">
              {chain.scope === "GLOBAL" ? "Global" : chain.taskMode ?? chain.agentId ?? chain.scope}
              {" · "}{chain.entries.length} routes
            </div>
          </div>
        </button>
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex gap-1">
            {activeProv.map((p) => (
              <HealthDot key={p.id} status={p.healthStatus} />
            ))}
          </div>
          <Button variant="ghost" className="h-7 px-2 text-xs" onClick={toggleActive}>
            {chain.isActive ? "Disable" : "Enable"}
          </Button>
          <Button variant="ghost" className="h-7 px-2 text-xs" onClick={() => { setEditing(true); setExpanded(true); }}>Edit</Button>
          <Button variant="ghost" className="h-7 w-7 p-0" title="Duplicate chain" onClick={() => void handleDuplicate()}>
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => void handleDelete()}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 space-y-3">
          {editing ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs text-muted-foreground">Name</label>
                  <Input className="mt-0.5 h-8" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Description</label>
                  <Input className="mt-0.5 h-8" value={desc} onChange={(e) => setDesc(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                {entries.map((e, i) => (
                  <EntryRow key={i} entry={e} index={i} total={entries.length} providers={providers}
                    onMove={moveEntry} onChange={changeEntry} onRemove={removeEntry} />
                ))}
                <Button variant="outline" className="h-8 text-xs" onClick={() => setEntries([...entries, blankEntry()])}>
                  <Plus className="h-3.5 w-3.5" />Add Route
                </Button>
              </div>
              {error && <div className="text-xs text-destructive">{error}</div>}
              <div className="flex gap-2">
                <Button className="h-8 text-xs" onClick={() => void handleSave()} disabled={saving}>
                  <Save className="h-3.5 w-3.5" />{saving ? "Saving…" : "Save"}
                </Button>
                <Button variant="outline" className="h-8 text-xs" onClick={() => setEditing(false)}>
                  <X className="h-3.5 w-3.5" />Cancel
                </Button>
              </div>
            </>
          ) : (
            <div className="space-y-1.5">
              {chain.entries.map((e, i) => {
                const prov = providers.find((p) => p.id === e.providerId);
                return (
                  <div key={e.id} className={cn("flex items-center gap-3 rounded border border-border/50 px-3 py-2 text-sm", !e.isEnabled && "opacity-40")}>
                    <span className="w-5 text-xs text-muted-foreground">{i + 1}</span>
                    <HealthDot status={prov?.healthStatus ?? "UNKNOWN"} />
                    <span className="font-medium">{getProviderDisplayName(e.providerId)}</span>
                    <span className="text-xs text-muted-foreground">{getModelDisplayName(e.model)}</span>
                    {!e.isEnabled && <span className="ml-auto text-[10px] text-muted-foreground">disabled</span>}
                    {e.notes && <span className="ml-auto text-[10px] text-muted-foreground/70">{e.notes}</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function NewChainForm({
  providers,
  onCreated,
  onCancel
}: {
  providers: ProviderRegistryDto[];
  onCreated: (c: RouteChainDto) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [taskMode, setTaskMode] = useState("");
  const [scope, setScope] = useState("GLOBAL");
  const [desc, setDesc] = useState("");
  const [entries, setEntries] = useState<EntryDraft[]>([blankEntry()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const created = await api.createRouteChain({
        name,
        taskMode: taskMode || null,
        scope,
        description: desc || null,
        entries: entries.map((e) => ({ providerId: e.providerId, model: e.model || providers.find((p) => p.id === e.providerId)?.defaultModel || "", isEnabled: e.isEnabled, notes: e.notes || null }))
      });
      onCreated(created.routeChain);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setSaving(false);
    }
  }

  function moveEntry(from: number, to: number) {
    const arr = [...entries];
    const [item] = arr.splice(from, 1);
    arr.splice(to, 0, item!);
    setEntries(arr);
  }

  function changeEntry(index: number, patch: Partial<EntryDraft>) {
    setEntries(entries.map((e, i) => i === index ? { ...e, ...patch } : e));
  }

  function removeEntry(index: number) {
    setEntries(entries.filter((_, i) => i !== index));
  }

  return (
    <Card className="p-5 border-primary/40">
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="text-sm font-semibold">New Route Chain</div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="text-xs text-muted-foreground">Name</label>
            <Input required className="mt-0.5 h-8" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Default Chain" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Scope</label>
            <select className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" value={scope} onChange={(e) => setScope(e.target.value)}>
              <option value="GLOBAL">Global</option>
              <option value="TASK_MODE">Task Mode</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Task Mode (optional)</label>
            <select className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" value={taskMode} onChange={(e) => setTaskMode(e.target.value)}>
              <option value="">Any</option>
              <option value="ASK">ASK</option>
              <option value="PLAN">PLAN</option>
              <option value="RESEARCH">RESEARCH</option>
              <option value="BUILD">BUILD</option>
            </select>
          </div>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Description</label>
          <Input className="mt-0.5 h-8" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Optional description" />
        </div>
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground font-medium">Routes (fallback order)</div>
          {entries.map((e, i) => (
            <EntryRow key={i} entry={e} index={i} total={entries.length} providers={providers}
              onMove={moveEntry} onChange={changeEntry} onRemove={removeEntry} />
          ))}
          <Button type="button" variant="outline" className="h-8 text-xs" onClick={() => setEntries([...entries, blankEntry()])}>
            <Plus className="h-3.5 w-3.5" />Add Route
          </Button>
        </div>
        {error && <div className="text-xs text-destructive">{error}</div>}
        <div className="flex gap-2">
          <Button type="submit" className="h-8 text-xs" disabled={saving}>
            <Save className="h-3.5 w-3.5" />{saving ? "Creating…" : "Create Chain"}
          </Button>
          <Button type="button" variant="outline" className="h-8 text-xs" onClick={onCancel}>
            <X className="h-3.5 w-3.5" />Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}

function ProviderCatalogSection({
  models,
  providers
}: {
  models: ProviderModelSnapshotDto[];
  providers: ProviderRegistryDto[];
}) {
  const [filter, setFilter] = useState("");
  const providerMap = new Map(providers.map((p) => [p.type, p]));

  const filtered = models.filter(
    (m) => !filter || m.providerType.includes(filter.toLowerCase()) || m.modelId.toLowerCase().includes(filter.toLowerCase()) || (m.modelName ?? "").toLowerCase().includes(filter.toLowerCase())
  );

  if (models.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
        No model catalog synced yet. Use "Sync OpenRouter Models" in Treasury → Provider Intelligence.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Input
        placeholder="Filter by provider or model…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="h-8 text-sm"
      />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="pb-2 pr-4 font-medium">Provider</th>
              <th className="pb-2 pr-4 font-medium">Model</th>
              <th className="pb-2 pr-4 text-right font-medium">Context</th>
              <th className="pb-2 pr-4 text-right font-medium">Input $/M</th>
              <th className="pb-2 pr-4 text-right font-medium">Output $/M</th>
              <th className="pb-2 pr-4 text-center font-medium">Free</th>
              <th className="pb-2 text-center font-medium">Available</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 200).map((m) => {
              const prov = providerMap.get(m.providerType);
              return (
                <tr key={`${m.providerType}:${m.modelId}`} className="border-b border-border/40 last:border-0">
                  <td className="py-2 pr-4 text-xs text-muted-foreground">{getProviderDisplayName(m.providerType)}</td>
                  <td className="py-2 pr-4">
                    <div className="font-mono text-xs">{m.modelId}</div>
                    {m.modelName && m.modelName !== m.modelId && <div className="text-[10px] text-muted-foreground">{m.modelName}</div>}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums text-xs text-muted-foreground">
                    {m.contextWindow ? `${(m.contextWindow / 1000).toFixed(0)}K` : "—"}
                  </td>
                  <td className="py-2 pr-4 text-right font-mono text-xs">
                    {m.inputPricePerMillion != null ? `$${m.inputPricePerMillion}` : "—"}
                  </td>
                  <td className="py-2 pr-4 text-right font-mono text-xs">
                    {m.outputPricePerMillion != null ? `$${m.outputPricePerMillion}` : "—"}
                  </td>
                  <td className="py-2 pr-4 text-center text-xs">
                    {m.inputPricePerMillion === 0 && m.outputPricePerMillion === 0 ? (
                      <span className="text-emerald-400">✓</span>
                    ) : "—"}
                  </td>
                  <td className="py-2 text-center text-xs">
                    {m.isAvailable ? <span className="text-emerald-400">✓</span> : <span className="text-red-400">✗</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length > 200 && (
          <div className="mt-2 text-center text-xs text-muted-foreground">Showing 200 of {filtered.length} models — refine filter to narrow</div>
        )}
      </div>
    </div>
  );
}

export function RoutingPage() {
  const [chains, setChains] = useState<RouteChainDto[]>([]);
  const [providers, setProviders] = useState<ProviderRegistryDto[]>([]);
  const [models, setModels] = useState<ProviderModelSnapshotDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [chainsResult, registryResult, modelsResult] = await Promise.all([
        api.routeChains(),
        api.treasuryProviderRegistry(),
        api.providerModels("openrouter").catch(() => ({ models: [], lastSyncedAt: null }))
      ]);
      setChains(chainsResult.routeChains);
      setProviders(registryResult.providers);
      setModels(modelsResult.models);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load routing data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  function handleUpdated(updated: RouteChainDto) {
    setChains(chains.map((c) => c.id === updated.id ? updated : c));
  }

  function handleDeleted(id: string) {
    setChains(chains.filter((c) => c.id !== id));
  }

  function handleCreated(chain: RouteChainDto) {
    setChains([...chains, chain]);
    setShowNewForm(false);
  }

  function handleDuplicated(chain: RouteChainDto) {
    setChains([...chains, chain]);
  }

  const allProviders = providers;

  return (
    <>
      <PageHeader
        eyebrow="Kingdom Routing"
        title="Route Chain Configuration"
        description="Configure provider and model routing chains. Each route defines a fallback sequence of providers and models."
      />

      {loading && <div className="py-16 text-center text-sm text-muted-foreground">Loading routing configuration…</div>}
      {error && <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

      {!loading && !error && (
        <div className="space-y-8">
          {/* Route Chains */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Route Chains</h2>
              <div className="flex gap-2">
                <Button variant="outline" className="h-8 text-xs" onClick={() => void load()}>
                  <RefreshCw className="h-3.5 w-3.5" />Refresh
                </Button>
                <Button className="h-8 text-xs" onClick={() => setShowNewForm(true)}>
                  <Plus className="h-3.5 w-3.5" />New Chain
                </Button>
              </div>
            </div>

            {showNewForm && (
              <div className="mb-4">
                <NewChainForm providers={allProviders} onCreated={handleCreated} onCancel={() => setShowNewForm(false)} />
              </div>
            )}

            {chains.length === 0 && !showNewForm ? (
              <div className="rounded-md border border-dashed border-border px-6 py-8 text-center text-sm text-muted-foreground">
                No route chains configured. Create one to override the default routing policy.
              </div>
            ) : (
              <div className="space-y-3">
                {chains.map((c) => (
                  <RouteChainCard
                    key={c.id}
                    chain={c}
                    providers={allProviders}
                    onUpdated={handleUpdated}
                    onDeleted={handleDeleted}
                    onDuplicated={handleDuplicated}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Provider Registry */}
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Provider Status</h2>
            <Card className="p-5">
              {providers.length === 0 ? (
                <div className="text-center text-sm text-muted-foreground py-4">No providers registered.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs text-muted-foreground">
                        <th className="pb-2 pr-4 font-medium">Provider</th>
                        <th className="pb-2 pr-4 font-medium">Type</th>
                        <th className="pb-2 pr-4 text-right font-medium">Health</th>
                        <th className="pb-2 pr-4 text-right font-medium">Cost Tier</th>
                        <th className="pb-2 text-right font-medium">Key</th>
                      </tr>
                    </thead>
                    <tbody>
                      {providers.map((p) => (
                        <tr key={p.id} className="border-b border-border/40 last:border-0">
                          <td className="py-2 pr-4">
                            <div className="flex items-center gap-2">
                              <HealthDot status={p.healthStatus} />
                              <span className="font-medium">{p.name}</span>
                            </div>
                            <div className="text-[10px] text-muted-foreground ml-4">{p.defaultModel}</div>
                          </td>
                          <td className="py-2 pr-4 text-xs text-muted-foreground">{p.type}</td>
                          <td className={cn("py-2 pr-4 text-right text-xs font-semibold", healthColor(p.healthStatus))}>{p.healthStatus}</td>
                          <td className="py-2 pr-4 text-right text-xs text-muted-foreground">{p.costTier}</td>
                          <td className="py-2 text-right text-xs">
                            {p.hasCredentials ? <span className="text-emerald-400">✓</span> : <span className="text-muted-foreground">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </section>

          {/* Provider Catalog (Phase 8) */}
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Provider Model Catalog
              <span className="ml-2 text-[10px] font-normal text-muted-foreground/60">(cached — sync from Treasury)</span>
            </h2>
            <Card className="p-5">
              <ProviderCatalogSection models={models} providers={providers} />
            </Card>
          </section>
        </div>
      )}
    </>
  );
}
