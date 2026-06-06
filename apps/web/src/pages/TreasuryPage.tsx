import { FormEvent, useEffect, useState } from "react";
import { Plus, Save, Trash2, X } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn, formatDate } from "@/lib/utils";
import { api } from "@/lib/api";
import type {
  ModelPricingDto,
  ModelPricingPayload,
  PricingWarningsDto,
  TreasuryOverviewDto,
  TreasuryAgentDto,
  TreasuryProviderDto,
  TreasuryDailyDto,
  UsageRecordDto
} from "@/types/api";

function formatCost(usd: number): string {
  if (usd === 0) return "$0.00";
  if (usd < 0.0001) return `$${usd.toExponential(2)}`;
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(4)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function StatCard({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <Card className={cn("p-5", warn && "border-yellow-500/60 bg-yellow-500/5")}>
      <div className={cn("text-2xl font-bold tabular-nums", warn ? "text-yellow-400" : "text-foreground")}>
        {value}
      </div>
      <div className="mt-1 text-sm font-medium text-foreground">{label}</div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </Card>
  );
}

function BudgetBanner({ status }: { status: TreasuryOverviewDto["budgetStatus"] }) {
  if (!status.dailyWarning && !status.monthlyWarning) return null;
  const messages: string[] = [];
  if (status.dailyWarning && status.dailyLimit !== null)
    messages.push(`Daily limit of ${formatCost(status.dailyLimit)} reached`);
  if (status.monthlyWarning && status.monthlyLimit !== null)
    messages.push(`Monthly limit of ${formatCost(status.monthlyLimit)} reached`);

  return (
    <div className="flex items-start gap-3 rounded-lg border border-yellow-500/50 bg-yellow-500/10 px-4 py-3 text-sm">
      <span className="mt-0.5 shrink-0 text-yellow-400">⚠</span>
      <div>
        <div className="font-semibold text-yellow-300">Royal Treasury Warning</div>
        {messages.map((m) => (
          <div key={m} className="text-yellow-200/80">
            {m}
          </div>
        ))}
        <div className="mt-1 text-xs text-yellow-200/60">
          Adjust limits in Settings → DAILY_BUDGET_LIMIT_USD / MONTHLY_BUDGET_LIMIT_USD
        </div>
      </div>
    </div>
  );
}

function AgentTable({ agents }: { agents: TreasuryAgentDto[] }) {
  if (agents.length === 0)
    return <p className="py-8 text-center text-sm text-muted-foreground">No agent usage recorded yet.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th className="pb-2 pr-4 font-medium">Agent</th>
            <th className="pb-2 pr-4 text-right font-medium">Calls</th>
            <th className="pb-2 pr-4 text-right font-medium">Tokens</th>
            <th className="pb-2 text-right font-medium">Cost (USD)</th>
          </tr>
        </thead>
        <tbody>
          {agents.map((a) => (
            <tr key={a.agentId ?? "unknown"} className="border-b border-border/40 last:border-0">
              <td className="py-2.5 pr-4">
                <div className="font-medium">{a.agent?.name ?? "Unknown"}</div>
                <div className="text-xs text-muted-foreground">{a.agent?.title ?? a.agentId ?? "—"}</div>
              </td>
              <td className="py-2.5 pr-4 text-right tabular-nums">{a.callCount}</td>
              <td className="py-2.5 pr-4 text-right tabular-nums">{formatTokens(a.totalTokens)}</td>
              <td className="py-2.5 text-right tabular-nums font-mono text-xs">{formatCost(a.totalCostUSD)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProviderTable({ providers }: { providers: TreasuryProviderDto[] }) {
  if (providers.length === 0)
    return <p className="py-8 text-center text-sm text-muted-foreground">No provider usage recorded yet.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th className="pb-2 pr-4 font-medium">Provider / Model</th>
            <th className="pb-2 pr-4 text-right font-medium">Calls</th>
            <th className="pb-2 pr-4 text-right font-medium">Input</th>
            <th className="pb-2 pr-4 text-right font-medium">Output</th>
            <th className="pb-2 text-right font-medium">Cost (USD)</th>
          </tr>
        </thead>
        <tbody>
          {providers.map((p) => (
            <tr key={`${p.provider}:${p.model}`} className="border-b border-border/40 last:border-0">
              <td className="py-2.5 pr-4">
                <div className="font-medium capitalize">{p.provider}</div>
                <div className="text-xs text-muted-foreground">{p.model}</div>
              </td>
              <td className="py-2.5 pr-4 text-right tabular-nums">{p.callCount}</td>
              <td className="py-2.5 pr-4 text-right tabular-nums text-xs">{formatTokens(p.promptTokens)}</td>
              <td className="py-2.5 pr-4 text-right tabular-nums text-xs">{formatTokens(p.completionTokens)}</td>
              <td className="py-2.5 text-right tabular-nums font-mono text-xs">{formatCost(p.totalCostUSD)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DailyChart({ daily }: { daily: TreasuryDailyDto[] }) {
  if (daily.length === 0)
    return <p className="py-8 text-center text-sm text-muted-foreground">No daily data in the selected window.</p>;

  const maxCost = Math.max(...daily.map((d) => d.totalCostUSD), 0.00001);

  return (
    <div className="space-y-1">
      {daily
        .slice()
        .reverse()
        .map((d) => {
          const pct = (d.totalCostUSD / maxCost) * 100;
          return (
            <div key={d.date} className="flex items-center gap-3 text-xs">
              <span className="w-20 shrink-0 text-muted-foreground">{d.date}</span>
              <div className="flex-1 rounded bg-muted/30">
                <div
                  className="h-4 rounded bg-primary/60 transition-all"
                  style={{ width: `${Math.max(pct, 0.5)}%` }}
                />
              </div>
              <span className="w-20 shrink-0 text-right font-mono tabular-nums">{formatCost(d.totalCostUSD)}</span>
              <span className="w-10 shrink-0 text-right text-muted-foreground">{d.callCount} calls</span>
            </div>
          );
        })}
    </div>
  );
}

function RecentUsageTable({ records }: { records: UsageRecordDto[] }) {
  if (records.length === 0)
    return <p className="py-8 text-center text-sm text-muted-foreground">No usage records yet.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th className="pb-2 pr-4 font-medium">When</th>
            <th className="pb-2 pr-4 font-medium">Agent</th>
            <th className="pb-2 pr-4 font-medium">Model</th>
            <th className="pb-2 pr-4 text-right font-medium">Tokens</th>
            <th className="pb-2 text-right font-medium">Cost</th>
          </tr>
        </thead>
        <tbody>
          {records.map((r) => (
            <tr key={r.id} className="border-b border-border/40 last:border-0">
              <td className="py-2 pr-4 text-xs text-muted-foreground">{formatDate(r.createdAt)}</td>
              <td className="py-2 pr-4">
                <span className="text-xs">{r.agent?.name ?? "—"}</span>
              </td>
              <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">{r.model}</td>
              <td className="py-2 pr-4 text-right tabular-nums text-xs">{formatTokens(r.totalTokens)}</td>
              <td className="py-2 text-right font-mono tabular-nums text-xs">{formatCost(r.estimatedCostUSD)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const blankPricing: ModelPricingPayload = { providerType: "", model: "", displayName: "", inputPerMillion: 0, outputPerMillion: 0, notes: "" };

function ModelPricingSection() {
  const [records, setRecords] = useState<ModelPricingDto[]>([]);
  const [warnings, setWarnings] = useState<PricingWarningsDto | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Partial<ModelPricingPayload>>>({});
  const [isAdding, setIsAdding] = useState(false);
  const [newDraft, setNewDraft] = useState<ModelPricingPayload>(blankPricing);
  const [savingError, setSavingError] = useState<string | null>(null);

  async function load() {
    const [pr, pw] = await Promise.all([api.modelPricing(), api.treasuryPricingWarnings()]);
    setRecords(pr.modelPricing);
    setWarnings(pw);
  }

  useEffect(() => { void load(); }, []);

  async function saveEdit(id: string) {
    setSavingError(null);
    try {
      await api.updateModelPricing(id, drafts[id] ?? {});
      setEditingId(null);
      await load();
    } catch (err) { setSavingError(err instanceof Error ? err.message : "Save failed"); }
  }

  async function createRecord(e: FormEvent) {
    e.preventDefault();
    setSavingError(null);
    try {
      await api.createModelPricing(newDraft);
      setIsAdding(false);
      setNewDraft(blankPricing);
      await load();
    } catch (err) { setSavingError(err instanceof Error ? err.message : "Create failed"); }
  }

  async function deactivate(id: string) {
    await api.deleteModelPricing(id);
    await load();
  }

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Model Pricing Registry</h2>
        <Button variant="outline" onClick={() => setIsAdding(true)}><Plus className="h-4 w-4" />Add Pricing</Button>
      </div>

      {warnings && warnings.unknownModels.length > 0 && (
        <div className="mb-4 rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-200">
          <span className="font-semibold">⚠ Unknown pricing detected: </span>
          {warnings.unknownModels.map((m) => `${m.provider}:${m.model} (${m.count} calls)`).join(", ")}
          . Add pricing records below to track costs accurately.
        </div>
      )}

      {isAdding && (
        <Card className="mb-4 border-primary/40">
          <form className="space-y-3" onSubmit={createRecord}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input required placeholder="Provider type (e.g. deepseek)" value={newDraft.providerType} onChange={(e) => setNewDraft({ ...newDraft, providerType: e.target.value })} />
              <Input required placeholder="Model (e.g. deepseek-v4-pro)" value={newDraft.model} onChange={(e) => setNewDraft({ ...newDraft, model: e.target.value })} />
              <Input placeholder="Display name" value={newDraft.displayName ?? ""} onChange={(e) => setNewDraft({ ...newDraft, displayName: e.target.value })} />
              <Input placeholder="Notes" value={newDraft.notes ?? ""} onChange={(e) => setNewDraft({ ...newDraft, notes: e.target.value })} />
              <Input required type="number" min="0" step="0.0001" placeholder="Input $/M tokens" value={newDraft.inputPerMillion} onChange={(e) => setNewDraft({ ...newDraft, inputPerMillion: parseFloat(e.target.value) || 0 })} />
              <Input required type="number" min="0" step="0.0001" placeholder="Output $/M tokens" value={newDraft.outputPerMillion} onChange={(e) => setNewDraft({ ...newDraft, outputPerMillion: parseFloat(e.target.value) || 0 })} />
            </div>
            {savingError && <div className="text-sm text-red-400">{savingError}</div>}
            <div className="flex gap-2">
              <Button type="submit"><Save className="h-4 w-4" />Save</Button>
              <Button type="button" variant="outline" onClick={() => { setIsAdding(false); setSavingError(null); }}><X className="h-4 w-4" />Cancel</Button>
            </div>
          </form>
        </Card>
      )}

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="pb-2 pr-4 font-medium">Provider / Model</th>
                <th className="pb-2 pr-4 text-right font-medium">Input $/M</th>
                <th className="pb-2 pr-4 text-right font-medium">Output $/M</th>
                <th className="pb-2 pr-4 font-medium">Source</th>
                <th className="pb-2 font-medium">Notes</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {records.map((r) => {
                const isEditing = editingId === r.id;
                const draft = drafts[r.id] ?? { inputPerMillion: r.inputPerMillion, outputPerMillion: r.outputPerMillion, notes: r.notes };
                return (
                  <tr key={r.id} className={cn("border-b border-border/40 last:border-0", !r.isActive && "opacity-40")}>
                    <td className="py-2.5 pr-4">
                      <div className="font-medium">{r.displayName ?? r.model}</div>
                      <div className="text-xs text-muted-foreground">{r.providerType}:{r.model}</div>
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">
                      {isEditing ? <Input type="number" min="0" step="0.0001" className="h-7 w-24 text-right text-xs" value={draft.inputPerMillion ?? 0} onChange={(e) => setDrafts({ ...drafts, [r.id]: { ...draft, inputPerMillion: parseFloat(e.target.value) || 0 } })} /> : `$${r.inputPerMillion}`}
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">
                      {isEditing ? <Input type="number" min="0" step="0.0001" className="h-7 w-24 text-right text-xs" value={draft.outputPerMillion ?? 0} onChange={(e) => setDrafts({ ...drafts, [r.id]: { ...draft, outputPerMillion: parseFloat(e.target.value) || 0 } })} /> : `$${r.outputPerMillion}`}
                    </td>
                    <td className="py-2.5 pr-4 text-xs text-muted-foreground">{r.source}</td>
                    <td className="py-2.5 pr-4 text-xs text-muted-foreground">
                      {isEditing ? <Input className="h-7 text-xs" value={draft.notes ?? ""} onChange={(e) => setDrafts({ ...drafts, [r.id]: { ...draft, notes: e.target.value } })} /> : (r.notes ?? "—")}
                    </td>
                    <td className="py-2.5">
                      <div className="flex items-center gap-1">
                        {isEditing ? (
                          <>
                            <Button variant="outline" className="h-7 px-2 text-xs" onClick={() => void saveEdit(r.id)}><Save className="h-3 w-3" /></Button>
                            <Button variant="ghost" className="h-7 px-2 text-xs" onClick={() => setEditingId(null)}><X className="h-3 w-3" /></Button>
                          </>
                        ) : (
                          <>
                            <Button variant="ghost" className="h-7 px-2 text-xs" onClick={() => { setEditingId(r.id); setDrafts({ ...drafts, [r.id]: { inputPerMillion: r.inputPerMillion, outputPerMillion: r.outputPerMillion, notes: r.notes } }); }}>Edit</Button>
                            {r.isActive && <Button variant="ghost" className="h-7 px-2 text-xs text-muted-foreground" onClick={() => void deactivate(r.id)}><Trash2 className="h-3 w-3" /></Button>}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {records.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-sm text-muted-foreground">No pricing records yet.</td></tr>}
            </tbody>
          </table>
        </div>
        {savingError && <div className="mt-2 text-sm text-red-400">{savingError}</div>}
        <p className="mt-3 text-xs text-muted-foreground">Updated {formatDate(new Date().toISOString())} · Prices in USD per 1M tokens</p>
      </Card>
    </section>
  );
}

export function TreasuryPage() {
  const [overview, setOverview] = useState<TreasuryOverviewDto | null>(null);
  const [agents, setAgents] = useState<TreasuryAgentDto[]>([]);
  const [providers, setProviders] = useState<TreasuryProviderDto[]>([]);
  const [daily, setDaily] = useState<TreasuryDailyDto[]>([]);
  const [records, setRecords] = useState<UsageRecordDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [ov, ag, pr, rp, us] = await Promise.all([
          api.treasuryOverview(),
          api.treasuryByAgent(),
          api.treasuryByProvider(),
          api.treasuryReports(30),
          api.treasuryUsage(50)
        ]);
        setOverview(ov);
        setAgents(ag.agents);
        setProviders(pr.providers);
        setDaily(rp.daily);
        setRecords(us.records);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load treasury data");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  return (
    <>
      <PageHeader
        eyebrow="Kingdom Finance"
        title="Royal Treasury"
        description="Track AI token usage, provider costs, agent spending, and budget status across the kingdom."
      />

      {loading && (
        <div className="py-16 text-center text-sm text-muted-foreground">Loading treasury data…</div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {!loading && !error && overview && (
        <div className="space-y-8">
          {/* Budget Warning */}
          <BudgetBanner status={overview.budgetStatus} />

          {/* Kingdom Overview */}
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Kingdom Overview
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Cost Today"
                value={formatCost(overview.costToday)}
                sub={`${formatTokens(overview.totalTokensToday)} tokens`}
                warn={overview.budgetStatus.dailyWarning}
              />
              <StatCard
                label="Cost This Month"
                value={formatCost(overview.costThisMonth)}
                sub={`${formatTokens(overview.totalTokensThisMonth)} tokens`}
                warn={overview.budgetStatus.monthlyWarning}
              />
              <StatCard
                label="All-Time Cost"
                value={formatCost(overview.costAllTime)}
                sub={`${formatTokens(overview.totalTokensAllTime)} tokens total`}
              />
              <StatCard
                label="Tasks / Sessions"
                value={`${overview.totalTasksTracked} / ${overview.totalSessionsTracked}`}
                sub={`${overview.totalCallsAllTime} AI calls recorded`}
              />
            </div>
          </section>

          {/* Budget Status */}
          {(overview.budgetStatus.dailyLimit !== null || overview.budgetStatus.monthlyLimit !== null) && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Budget Status
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {overview.budgetStatus.dailyLimit !== null && (
                  <Card className="p-5">
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <span className="font-medium">Daily Budget</span>
                      <span className="tabular-nums text-muted-foreground">
                        {formatCost(overview.costToday)} / {formatCost(overview.budgetStatus.dailyLimit)}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          overview.budgetStatus.dailyWarning ? "bg-yellow-400" : "bg-primary"
                        )}
                        style={{
                          width: `${Math.min((overview.costToday / overview.budgetStatus.dailyLimit) * 100, 100)}%`
                        }}
                      />
                    </div>
                  </Card>
                )}
                {overview.budgetStatus.monthlyLimit !== null && (
                  <Card className="p-5">
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <span className="font-medium">Monthly Budget</span>
                      <span className="tabular-nums text-muted-foreground">
                        {formatCost(overview.costThisMonth)} / {formatCost(overview.budgetStatus.monthlyLimit)}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          overview.budgetStatus.monthlyWarning ? "bg-yellow-400" : "bg-primary"
                        )}
                        style={{
                          width: `${Math.min((overview.costThisMonth / overview.budgetStatus.monthlyLimit) * 100, 100)}%`
                        }}
                      />
                    </div>
                  </Card>
                )}
              </div>
            </section>
          )}

          {/* Agent Spending */}
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Agent Spending
            </h2>
            <Card className="p-5">
              <AgentTable agents={agents} />
            </Card>
          </section>

          {/* Provider Spending */}
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Provider Spending
            </h2>
            <Card className="p-5">
              <ProviderTable providers={providers} />
            </Card>
          </section>

          {/* Daily Cost — last 30 days */}
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Daily Cost — Last 30 Days
            </h2>
            <Card className="p-5">
              <DailyChart daily={daily} />
            </Card>
          </section>

          {/* Recent Usage */}
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Recent Usage Records
            </h2>
            <Card className="p-5">
              <RecentUsageTable records={records} />
            </Card>
          </section>

          {/* Model Pricing Registry */}
          <ModelPricingSection />
        </div>
      )}
    </>
  );
}
