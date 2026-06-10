import { Fragment, FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, RefreshCw, Save, Trash2, X } from "lucide-react";
import { AgentPortrait } from "@/components/AgentPortrait";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getModelDisplayName, getProviderDisplayName } from "@/lib/providerDisplay";
import { cn, formatDate } from "@/lib/utils";
import { api } from "@/lib/api";
import type {
  ModelPricingDto,
  ModelPricingPayload,
  PricingWarningsDto,
  AttributionStatus,
  TreasuryOverviewDto,
  TreasuryAgentDto,
  TreasuryProviderDto,
  TreasuryDailyDto,
  TreasuryMonthlyDto,
  TreasuryModelDto,
  TreasuryFallbackAnalyticsDto,
  UsageRecordDto,
  ProviderHealthStatus,
  ProviderRegistryDto,
  CostSource
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

function formatBalance(amount: number, currency: string): string {
  if (currency === "USD") return `$${amount.toFixed(2)}`;
  return `${currency} ${amount.toFixed(2)}`;
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

function ProviderBalanceSection({
  overview,
  onSync,
  syncing,
  syncError
}: {
  overview: TreasuryOverviewDto;
  onSync: () => Promise<void>;
  syncing: boolean;
  syncError: string | null;
}) {
  const balances = overview.latestProviderBalances.filter((item) => item.providerType === "deepseek" && item.currency !== "UNKNOWN");
  const balance = overview.latestDeepSeekBalance;
  const providerError = overview.reconciliationStatus === "PROVIDER_API_ERROR";

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Provider Balance</h2>
        <Button variant="outline" onClick={() => void onSync()} disabled={syncing}>
          <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
          {syncing ? "Syncing" : "Sync DeepSeek Balance"}
        </Button>
      </div>
      <Card className="p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-sm font-semibold text-foreground">DeepSeek</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {balances.length > 0
                ? balances.some((item) => item.isAvailable) ? "Balance available for API calls" : "Balance unavailable for API calls"
                : "No provider balance snapshot yet"}
            </div>
            {syncError && (
              <div className="mt-3 rounded-md border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-200">
                {syncError}
              </div>
            )}
            {!syncError && providerError && (
              <div className="mt-3 rounded-md border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-200">
                DeepSeek balance API was unavailable during the last sync attempt.
              </div>
            )}
          </div>

          {balances.length > 0 ? (
            <div className="w-full overflow-x-auto lg:max-w-2xl">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Currency</th>
                    <th className="pb-2 pr-4 font-medium">Availability</th>
                    <th className="pb-2 pr-4 text-right font-medium">Total</th>
                    <th className="pb-2 pr-4 text-right font-medium">Granted</th>
                    <th className="pb-2 text-right font-medium">Topped-up</th>
                  </tr>
                </thead>
                <tbody>
                  {balances.map((item) => (
                    <tr key={item.id} className="border-b border-border/40 last:border-0">
                      <td className="py-2.5 pr-4 font-mono text-xs font-semibold">{item.currency}</td>
                      <td className="py-2.5 pr-4 text-xs">{item.isAvailable ? "Available" : "Unavailable"}</td>
                      <td className="py-2.5 pr-4 text-right font-mono text-xs">{formatBalance(item.totalBalance, item.currency)}</td>
                      <td className="py-2.5 pr-4 text-right font-mono text-xs">{formatBalance(item.grantedBalance, item.currency)}</td>
                      <td className="py-2.5 text-right font-mono text-xs">{formatBalance(item.toppedUpBalance, item.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="w-full rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground lg:max-w-md">
              Sync DeepSeek balance to create the first backend snapshot.
            </div>
          )}
        </div>
        <div className="mt-4 text-xs text-muted-foreground">
          Last synced: {overview.balanceLastFetchedAt ? formatDate(overview.balanceLastFetchedAt) : "Never"}
        </div>
      </Card>
    </section>
  );
}

function healthStatusColor(status: ProviderHealthStatus): string {
  if (status === "HEALTHY") return "text-emerald-400";
  if (status === "DEGRADED") return "text-amber-400";
  if (status === "DOWN") return "text-red-400";
  return "text-muted-foreground";
}

function ProviderTelemetrySection({
  overview,
  onSyncAccount,
  onSyncModels,
  onComputeHealth,
  syncingAccount,
  syncingModels,
  computingHealth,
  syncError
}: {
  overview: TreasuryOverviewDto;
  onSyncAccount: () => Promise<void>;
  onSyncModels: () => Promise<void>;
  onComputeHealth: () => Promise<void>;
  syncingAccount: boolean;
  syncingModels: boolean;
  computingHealth: boolean;
  syncError: string | null;
}) {
  const { providerTelemetry } = overview;
  const openRouterAccount = providerTelemetry.accountSnapshots.find((s) => s.providerType === "openrouter");
  const healthSnapshots = providerTelemetry.healthSnapshots;

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Provider Intelligence</h2>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void onSyncAccount()} disabled={syncingAccount}>
            <RefreshCw className={cn("h-4 w-4", syncingAccount && "animate-spin")} />
            {syncingAccount ? "Syncing…" : "Sync OpenRouter Account"}
          </Button>
          <Button variant="outline" onClick={() => void onSyncModels()} disabled={syncingModels}>
            <RefreshCw className={cn("h-4 w-4", syncingModels && "animate-spin")} />
            {syncingModels ? "Syncing…" : "Sync OpenRouter Models"}
          </Button>
          <Button variant="outline" onClick={() => void onComputeHealth()} disabled={computingHealth}>
            <RefreshCw className={cn("h-4 w-4", computingHealth && "animate-spin")} />
            {computingHealth ? "Computing…" : "Compute Health"}
          </Button>
        </div>
      </div>

      {syncError && (
        <div className="mb-3 rounded-md border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-200">
          {syncError}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <div className="mb-3 text-sm font-semibold">OpenRouter Account</div>
          {openRouterAccount ? (
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Status</span>
                <span className={cn("font-medium", openRouterAccount.status === "ACTIVE" ? "text-emerald-400" : "text-red-400")}>
                  {openRouterAccount.status}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Credits remaining</span>
                <span className="font-mono font-semibold">
                  {openRouterAccount.creditsRemaining != null ? `$${openRouterAccount.creditsRemaining.toFixed(4)}` : "Unlimited / Unknown"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Credits used</span>
                <span className="font-mono tabular-nums">
                  {openRouterAccount.creditsUsed != null ? `$${openRouterAccount.creditsUsed.toFixed(4)}` : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Free tier</span>
                <span>{openRouterAccount.isFreeTier ? "Yes" : "No"}</span>
              </div>
              <div className="mt-3 text-xs text-muted-foreground">Last synced: {formatDate(openRouterAccount.syncedAt)}</div>
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground">
              No account snapshot yet. Click "Sync OpenRouter Account".
            </div>
          )}
        </Card>

        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-semibold">Provider Health</div>
            {providerTelemetry.lastModelSyncedAt && (
              <div className="text-xs text-muted-foreground">Model catalog: {formatDate(providerTelemetry.lastModelSyncedAt)}</div>
            )}
          </div>
          {healthSnapshots.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Provider</th>
                    <th className="pb-2 pr-4 text-right font-medium">Status</th>
                    <th className="pb-2 pr-4 text-right font-medium">Failure %</th>
                    <th className="pb-2 text-right font-medium">Avg ms</th>
                  </tr>
                </thead>
                <tbody>
                  {healthSnapshots.map((h) => (
                    <tr key={h.id} className="border-b border-border/40 last:border-0">
                      <td className="py-2 pr-4 font-medium">{getProviderDisplayName(h.providerId ?? h.providerType)}</td>
                      <td className={cn("py-2 pr-4 text-right text-xs font-semibold", healthStatusColor(h.healthStatus))}>
                        {h.healthStatus}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums text-xs">
                        {h.failureRate != null ? `${(h.failureRate * 100).toFixed(1)}%` : "—"}
                      </td>
                      <td className="py-2 text-right tabular-nums text-xs text-muted-foreground">
                        {h.avgDurationMs != null ? `${h.avgDurationMs}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground">
              No health snapshots yet. Click "Compute Health".
            </div>
          )}
        </Card>
      </div>
    </section>
  );
}

function ReconciliationSection({ overview }: { overview: TreasuryOverviewDto }) {
  const balance = overview.latestDeepSeekBalance;
  const delta = overview.balanceDelta;

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Reconciliation</h2>
      <Card className="p-5">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <div className="text-xs text-muted-foreground">Estimated DeepSeek spend today</div>
            <div className="mt-1 font-mono text-lg font-semibold">{formatCost(overview.deepseekEstimatedSpendToday)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Estimated DeepSeek spend this month</div>
            <div className="mt-1 font-mono text-lg font-semibold">{formatCost(overview.deepseekEstimatedSpendThisMonth)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">DeepSeek latest balance</div>
            <div className="mt-1 font-mono text-lg font-semibold">
              {balance ? formatBalance(balance.totalBalance, balance.currency) : "No snapshot"}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Reconciliation status</div>
            <div className="mt-1 text-sm font-semibold">{overview.reconciliationStatus.replaceAll("_", " ")}</div>
          </div>
        </div>
        {delta && (
          <div className="mt-4 rounded-md border border-border/70 bg-muted/20 px-4 py-3 text-sm">
            <span className="font-medium">Observed provider balance decrease:</span>{" "}
            <span className="font-mono">{formatBalance(delta.balanceDelta, delta.currency)}</span>
            <span className="text-muted-foreground"> approximate, based on the last two snapshots.</span>
          </div>
        )}
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
          Estimated spend is calculated from AI Kingdom token usage. Provider balance is the actual account balance from DeepSeek.
          They may differ due to external usage, cache pricing, rounding, or delayed billing.
        </p>
      </Card>
    </section>
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
                <div className="flex items-center gap-3">
                  <AgentPortrait agent={a.agent} size="sm" status="IDLE" />
                  <div>
                    <div className="font-medium">{a.agent?.name ?? "Unknown"}</div>
                    <div className="text-xs text-muted-foreground">{a.agent?.title ?? a.agentId ?? "—"}</div>
                  </div>
                </div>
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
                <div className="font-medium">{getProviderDisplayName(p.providerId ?? p.provider)}</div>
                <div className="text-xs text-muted-foreground">{getModelDisplayName(p.model)}</div>
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

function ModelTable({ models }: { models: TreasuryModelDto[] }) {
  if (models.length === 0)
    return <p className="py-8 text-center text-sm text-muted-foreground">No model usage recorded yet.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th className="pb-2 pr-4 font-medium">Model</th>
            <th className="pb-2 pr-4 text-right font-medium">Calls</th>
            <th className="pb-2 pr-4 text-right font-medium">Input</th>
            <th className="pb-2 pr-4 text-right font-medium">Output</th>
            <th className="pb-2 text-right font-medium">Cost (USD)</th>
          </tr>
        </thead>
        <tbody>
          {models.map((m) => (
            <tr key={`${m.provider}:${m.model}`} className="border-b border-border/40 last:border-0">
              <td className="py-2.5 pr-4">
                <div className="font-medium">{getModelDisplayName(m.model)}</div>
                <div className="text-xs text-muted-foreground">{getProviderDisplayName(m.providerId ?? m.provider)}</div>
              </td>
              <td className="py-2.5 pr-4 text-right tabular-nums">{m.callCount}</td>
              <td className="py-2.5 pr-4 text-right tabular-nums text-xs">{formatTokens(m.promptTokens)}</td>
              <td className="py-2.5 pr-4 text-right tabular-nums text-xs">{formatTokens(m.completionTokens)}</td>
              <td className="py-2.5 text-right tabular-nums font-mono text-xs">{formatCost(m.totalCostUSD)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MonthlyChart({ monthly }: { monthly: TreasuryMonthlyDto[] }) {
  if (monthly.length === 0)
    return <p className="py-8 text-center text-sm text-muted-foreground">No monthly data available.</p>;

  const maxCost = Math.max(...monthly.map((m) => m.totalCostUSD), 0.00001);

  return (
    <div className="space-y-1">
      {monthly
        .slice()
        .reverse()
        .map((m) => {
          const pct = (m.totalCostUSD / maxCost) * 100;
          return (
            <div key={m.month} className="flex items-center gap-3 text-xs">
              <span className="w-20 shrink-0 text-muted-foreground">{m.month}</span>
              <div className="flex-1 rounded bg-muted/30">
                <div
                  className="h-4 rounded bg-primary/60 transition-all"
                  style={{ width: `${Math.max(pct, 0.5)}%` }}
                />
              </div>
              <span className="w-20 shrink-0 text-right font-mono tabular-nums">{formatCost(m.totalCostUSD)}</span>
              <span className="w-14 shrink-0 text-right text-muted-foreground">{m.callCount} calls</span>
            </div>
          );
        })}
    </div>
  );
}

function FallbackAnalyticsTable({ analytics }: { analytics: TreasuryFallbackAnalyticsDto[] }) {
  if (analytics.length === 0)
    return <p className="py-8 text-center text-sm text-muted-foreground">No fallback analytics yet. Run council sessions to generate traces.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th className="pb-2 pr-4 font-medium">Provider / Model</th>
            <th className="pb-2 pr-4 text-right font-medium">Success</th>
            <th className="pb-2 pr-4 text-right font-medium">Failure</th>
            <th className="pb-2 pr-4 text-right font-medium">Timeout</th>
            <th className="pb-2 pr-4 text-right font-medium">Total</th>
            <th className="pb-2 text-right font-medium">Avg Duration</th>
          </tr>
        </thead>
        <tbody>
          {analytics.map((a) => {
            const successRate = a.totalCalls > 0 ? Math.round((a.successCount / a.totalCalls) * 100) : 0;
            return (
              <tr key={`${a.providerId}:${a.model}`} className="border-b border-border/40 last:border-0">
                <td className="py-2.5 pr-4">
                  <div className="font-medium">{getProviderDisplayName(a.providerId)}</div>
                  {a.model && <div className="text-xs text-muted-foreground">{getModelDisplayName(a.model)}</div>}
                </td>
                <td className="py-2.5 pr-4 text-right tabular-nums text-emerald-400">{a.successCount}</td>
                <td className="py-2.5 pr-4 text-right tabular-nums text-red-400">{a.failureCount}</td>
                <td className="py-2.5 pr-4 text-right tabular-nums text-amber-400">{a.timeoutCount}</td>
                <td className="py-2.5 pr-4 text-right tabular-nums text-xs">
                  {a.totalCalls}
                  <span className={cn("ml-1 text-[10px]", successRate >= 80 ? "text-emerald-400" : successRate >= 50 ? "text-amber-400" : "text-red-400")}>
                    ({successRate}%)
                  </span>
                </td>
                <td className="py-2.5 text-right tabular-nums text-xs text-muted-foreground">
                  {a.avgDurationMs != null ? `${a.avgDurationMs}ms` : "—"}
                </td>
              </tr>
            );
          })}
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

function CostSourceBadge({ source }: { source?: CostSource | null }) {
  if (!source || source === "ESTIMATED") return null;
  if (source === "FREE") {
    return (
      <span className="ml-1 rounded px-1 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
        Free
      </span>
    );
  }
  if (source === "PROVIDER_REPORTED") {
    return (
      <span className="ml-1 rounded px-1 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-blue-500/20 text-blue-300 border border-blue-500/30">
        Reported
      </span>
    );
  }
  return null;
}

function ProviderStatusBadge({ status }: { status: ProviderRegistryDto["status"] }) {
  const meta: Record<string, { label: string; className: string }> = {
    ACTIVE: { label: "Active", className: "text-emerald-400" },
    SANDBOX: { label: "Sandbox", className: "text-blue-400" },
    NO_CREDENTIALS: { label: "No Key", className: "text-amber-400" },
    DISABLED: { label: "Disabled", className: "text-muted-foreground" }
  };
  const m = meta[status] ?? { label: status, className: "text-muted-foreground" };
  return <span className={cn("text-xs font-semibold", m.className)}>{m.label}</span>;
}

function ProviderRegistrySection({ providers }: { providers: ProviderRegistryDto[] }) {
  if (providers.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
        No active providers detected.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th className="pb-2 pr-4 font-medium">Provider</th>
            <th className="pb-2 pr-4 font-medium">Status</th>
            <th className="pb-2 pr-4 text-right font-medium">Health</th>
            <th className="pb-2 pr-4 text-right font-medium">Balance</th>
            <th className="pb-2 pr-4 text-right font-medium">Spend</th>
            <th className="pb-2 pr-4 text-right font-medium">Models</th>
            <th className="pb-2 text-right font-medium">Last Sync</th>
          </tr>
        </thead>
        <tbody>
          {providers.map((p) => (
            <tr key={p.id} className="border-b border-border/40 last:border-0">
              <td className="py-2.5 pr-4">
                <div className="font-medium">{p.name}</div>
                <div className="text-xs text-muted-foreground">{p.defaultModel}</div>
              </td>
              <td className="py-2.5 pr-4">
                <ProviderStatusBadge status={p.status} />
              </td>
              <td className={cn("py-2.5 pr-4 text-right text-xs font-semibold", healthStatusColor(p.healthStatus))}>
                {p.healthStatus}
              </td>
              <td className="py-2.5 pr-4 text-right font-mono text-xs">
                {p.balance != null ? `$${p.balance.toFixed(4)}` : <span className="text-muted-foreground">—</span>}
              </td>
              <td className="py-2.5 pr-4 text-right font-mono text-xs">
                {p.spend > 0 ? formatCost(p.spend) : <span className="text-muted-foreground">$0.00</span>}
              </td>
              <td className="py-2.5 pr-4 text-right tabular-nums text-xs">
                {p.modelCount > 0 ? p.modelCount : <span className="text-muted-foreground">—</span>}
              </td>
              <td className="py-2.5 text-right text-xs text-muted-foreground">
                {p.lastSyncAt ? formatDate(p.lastSyncAt) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PricingStatusBadge({ status, notes }: { status?: string | null; notes?: string | null }) {
  if (!status || status === "KNOWN") return null;
  if (status === "ESTIMATED") {
    return (
      <span title={notes ?? "Cache details unavailable; input estimated as cache miss."} className="ml-1 rounded px-1 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 cursor-help">
        Est
      </span>
    );
  }
  return (
    <span className="ml-1 rounded px-1 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-destructive/20 text-destructive border border-destructive/30">
      Unknown
    </span>
  );
}

function AttributionBadge({ status }: { status: AttributionStatus }) {
  const meta = {
    TRUSTED: { label: "Verified source", className: "border-emerald-400/35 bg-emerald-400/10 text-emerald-300" },
    PARTIAL: { label: "Partial source", className: "border-amber-400/35 bg-amber-400/10 text-amber-300" },
    LEGACY_UNATTRIBUTED: { label: "Legacy / source unknown", className: "border-muted-foreground/30 bg-muted/30 text-muted-foreground" },
    UNKNOWN_SOURCE: { label: "Unknown source", className: "border-destructive/40 bg-destructive/10 text-destructive" }
  }[status] ?? { label: "Unknown source", className: "border-destructive/40 bg-destructive/10 text-destructive" };

  return (
    <span className={cn("inline-flex rounded-md border px-2 py-1 text-[10px] font-bold uppercase tracking-wider", meta.className)}>
      {meta.label}
    </span>
  );
}

function readableLabel(value?: string | null) {
  if (!value) return "—";
  return value.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function RecentUsageTable({ records }: { records: UsageRecordDto[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  if (records.length === 0)
    return <p className="py-8 text-center text-sm text-muted-foreground">No usage records yet.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th className="pb-2 pr-4 font-medium">When</th>
            <th className="pb-2 pr-4 font-medium">Agent</th>
            <th className="pb-2 pr-4 font-medium">Attribution</th>
            <th className="pb-2 pr-4 font-medium">Model</th>
            <th className="pb-2 pr-4 text-right font-medium">Tokens</th>
            <th className="pb-2 text-right font-medium">Cost</th>
          </tr>
        </thead>
        <tbody>
          {records.map((r) => {
            const expanded = expandedId === r.id;
            return (
              <Fragment key={r.id}>
                <tr className={cn("border-b border-border/40 last:border-0", r.attributionStatus !== "TRUSTED" && "bg-muted/10 opacity-85")}>
                  <td className="py-2 pr-4 text-xs text-muted-foreground">
                    <button className="text-left hover:text-primary" onClick={() => setExpandedId(expanded ? null : r.id)}>
                      {formatDate(r.createdAt)}
                    </button>
                  </td>
                  <td className="py-2 pr-4">
                    <div className="flex items-center gap-2">
                      <AgentPortrait agent={r.agent} size="sm" status={r.attributionStatus === "TRUSTED" ? "COMPLETED" : "WAITING_PROVIDER"} />
                      <span className="text-xs">{r.agent?.name ?? "—"}</span>
                    </div>
                  </td>
                  <td className="py-2 pr-4">
                    <AttributionBadge status={r.attributionStatus} />
                  </td>
                  <td className="py-2 pr-4 text-xs text-muted-foreground">{getProviderDisplayName(r.providerId ?? r.provider)} · {getModelDisplayName(r.model)}</td>
                  <td className="py-2 pr-4 text-right tabular-nums text-xs">{formatTokens(r.totalTokens)}</td>
                  <td className="py-2 text-right font-mono tabular-nums text-xs">
                    {formatCost(r.estimatedCostUSD)}
                    <CostSourceBadge source={r.costSource} />
                    <PricingStatusBadge status={r.pricingStatus} notes={r.pricingNotes} />
                  </td>
                </tr>
                {expanded && (
                  <tr className="border-b border-border/40 bg-background/40">
                    <td colSpan={6} className="px-3 py-3">
                      <div className="grid gap-3 text-xs md:grid-cols-2">
                        <div className="rounded-lg border border-border/60 bg-muted/10 p-3">
                          <div className="font-semibold uppercase tracking-wider text-primary/70">Trace</div>
                          <div className="mt-2 space-y-1 text-muted-foreground">
                            <div>Trace ID: <span className="font-mono text-foreground">{r.traceId ?? "No trusted trace"}</span></div>
                            <div>Purpose: <span className="text-foreground">{r.purpose ?? "—"}</span></div>
                            <div>Operation: <span className="text-foreground">{readableLabel(r.operation)}</span></div>
                            <div>Trigger: <span className="text-foreground">{readableLabel(r.triggerType)}</span></div>
                            <div>Actor: <span className="text-foreground">{r.actorDisplayName ?? r.actorUserId ?? "—"}</span></div>
                            {r.traceId && <Link to={`/usage-traces/${r.traceId}`} className="inline-flex pt-1 text-primary hover:underline">View Trace</Link>}
                          </div>
                        </div>
                        <div className="rounded-lg border border-border/60 bg-muted/10 p-3">
                          <div className="font-semibold uppercase tracking-wider text-primary/70">Safe Preview</div>
                          <div className="mt-2 space-y-2 text-muted-foreground">
                            <div><span className="text-foreground">Prompt:</span> {r.promptPreview ?? "No sanitized preview"}</div>
                            <div><span className="text-foreground">Response:</span> {r.responsePreview ?? "No sanitized preview"}</div>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const blankPricing: ModelPricingPayload = { providerType: "", model: "", displayName: "", outputPerMillion: 0, notes: "" };

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
        <div className="mb-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span className="font-semibold">⚠ Unknown pricing: </span>
          {warnings.unknownModels.map((m) => `${getProviderDisplayName(m.provider)}:${getModelDisplayName(m.model)} (${m.count} calls)`).join(", ")}
          . Add pricing records below.
        </div>
      )}
      {warnings && warnings.estimatedModels.length > 0 && (
        <div className="mb-4 rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-200">
          <span className="font-semibold">~ Estimated cost ({warnings.estimatedPricingUsageCount} records): </span>
          {warnings.estimatedModels.map((m) => `${getProviderDisplayName(m.provider)}:${getModelDisplayName(m.model)} (${m.count})`).join(", ")}
          . DeepSeek cache details unavailable; input estimated at cache-miss rate.
        </div>
      )}

      {isAdding && (
        <Card className="mb-4 border-primary/40">
          <form className="space-y-3" onSubmit={createRecord}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input required placeholder="Provider type (e.g. deepseek)" value={newDraft.providerType} onChange={(e) => setNewDraft({ ...newDraft, providerType: e.target.value })} />
              <Input required placeholder="Model (e.g. deepseek-v4-flash)" value={newDraft.model} onChange={(e) => setNewDraft({ ...newDraft, model: e.target.value })} />
              <Input placeholder="Display name" value={newDraft.displayName ?? ""} onChange={(e) => setNewDraft({ ...newDraft, displayName: e.target.value })} />
              <Input placeholder="Notes" value={newDraft.notes ?? ""} onChange={(e) => setNewDraft({ ...newDraft, notes: e.target.value })} />
              <Input type="number" min="0" step="0.000001" placeholder="Cache-hit input $/M (optional)" value={newDraft.inputCacheHitPerMillion ?? ""} onChange={(e) => setNewDraft({ ...newDraft, inputCacheHitPerMillion: e.target.value ? parseFloat(e.target.value) : null })} />
              <Input type="number" min="0" step="0.000001" placeholder="Cache-miss input $/M (or simple input $/M)" value={newDraft.inputCacheMissPerMillion ?? ""} onChange={(e) => setNewDraft({ ...newDraft, inputCacheMissPerMillion: e.target.value ? parseFloat(e.target.value) : null })} />
              <Input required type="number" min="0" step="0.0001" placeholder="Output $/M tokens" value={newDraft.outputPerMillion} onChange={(e) => setNewDraft({ ...newDraft, outputPerMillion: parseFloat(e.target.value) || 0 })} />
              <Input type="number" min="0" step="0.000001" placeholder="Legacy input $/M (simple pricing)" value={newDraft.inputPerMillion ?? ""} onChange={(e) => setNewDraft({ ...newDraft, inputPerMillion: e.target.value ? parseFloat(e.target.value) : null })} />
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
                <th className="pb-2 pr-3 font-medium">Provider / Model</th>
                <th className="pb-2 pr-3 text-right font-medium">Hit $/M</th>
                <th className="pb-2 pr-3 text-right font-medium">Miss $/M</th>
                <th className="pb-2 pr-3 text-right font-medium">Out $/M</th>
                <th className="pb-2 pr-3 font-medium">Source</th>
                <th className="pb-2 font-medium">Notes</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {records.map((r) => {
                const isEditing = editingId === r.id;
                const draft = drafts[r.id] ?? { inputCacheHitPerMillion: r.inputCacheHitPerMillion, inputCacheMissPerMillion: r.inputCacheMissPerMillion, outputPerMillion: r.outputPerMillion, notes: r.notes };
                const hitPrice = r.inputCacheHitPerMillion ?? r.inputPerMillion;
                const missPrice = r.inputCacheMissPerMillion ?? r.inputPerMillion;
                return (
                  <tr key={r.id} className={cn("border-b border-border/40 last:border-0", !r.isActive && "opacity-40")}>
                    <td className="py-2.5 pr-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-medium">{r.displayName ?? r.model}</span>
                        {r.isAlias && <span className="rounded bg-muted/60 px-1 py-0.5 text-[10px] text-muted-foreground border border-border/50">alias</span>}
                        {r.isDeprecated && <span className="rounded bg-yellow-500/20 px-1 py-0.5 text-[10px] text-yellow-400 border border-yellow-500/30">deprecated</span>}
                        {r.supportsThinking && <span className="rounded bg-primary/10 px-1 py-0.5 text-[10px] text-primary border border-primary/20">thinking</span>}
                      </div>
                      <div className="text-xs text-muted-foreground">{getProviderDisplayName(r.providerType)}:{getModelDisplayName(r.model)}</div>
                      {r.concurrencyLimit && <div className="text-[10px] text-muted-foreground/60">{r.concurrencyLimit} concurrent</div>}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-xs">
                      {isEditing
                        ? <Input type="number" min="0" step="0.000001" className="h-7 w-24 text-right text-xs" value={draft.inputCacheHitPerMillion ?? ""} onChange={(e) => setDrafts({ ...drafts, [r.id]: { ...draft, inputCacheHitPerMillion: e.target.value ? parseFloat(e.target.value) : null } })} />
                        : hitPrice != null ? `$${hitPrice}` : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-xs">
                      {isEditing
                        ? <Input type="number" min="0" step="0.000001" className="h-7 w-24 text-right text-xs" value={draft.inputCacheMissPerMillion ?? ""} onChange={(e) => setDrafts({ ...drafts, [r.id]: { ...draft, inputCacheMissPerMillion: e.target.value ? parseFloat(e.target.value) : null } })} />
                        : missPrice != null ? `$${missPrice}` : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-xs">
                      {isEditing
                        ? <Input type="number" min="0" step="0.0001" className="h-7 w-24 text-right text-xs" value={draft.outputPerMillion ?? 0} onChange={(e) => setDrafts({ ...drafts, [r.id]: { ...draft, outputPerMillion: parseFloat(e.target.value) || 0 } })} />
                        : `$${r.outputPerMillion}`}
                    </td>
                    <td className="py-2.5 pr-3 text-xs text-muted-foreground">{r.source}</td>
                    <td className="py-2.5 pr-3 text-xs text-muted-foreground max-w-[160px] truncate" title={r.notes ?? undefined}>
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
                            <Button variant="ghost" className="h-7 px-2 text-xs" onClick={() => { setEditingId(r.id); setDrafts({ ...drafts, [r.id]: { inputCacheHitPerMillion: r.inputCacheHitPerMillion, inputCacheMissPerMillion: r.inputCacheMissPerMillion, outputPerMillion: r.outputPerMillion, notes: r.notes } }); }}>Edit</Button>
                            {r.isActive && <Button variant="ghost" className="h-7 px-2 text-xs text-muted-foreground" onClick={() => void deactivate(r.id)}><Trash2 className="h-3 w-3" /></Button>}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {records.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-sm text-muted-foreground">No pricing records yet.</td></tr>}
            </tbody>
          </table>
        </div>
        {savingError && <div className="mt-2 text-sm text-red-400">{savingError}</div>}
        <p className="mt-3 text-xs text-muted-foreground">Prices in USD per 1M tokens · Hit = cache hit · Miss = cache miss · Out = output</p>
      </Card>
    </section>
  );
}

export function TreasuryPage() {
  const [overview, setOverview] = useState<TreasuryOverviewDto | null>(null);
  const [agents, setAgents] = useState<TreasuryAgentDto[]>([]);
  const [providers, setProviders] = useState<TreasuryProviderDto[]>([]);
  const [providerRegistry, setProviderRegistry] = useState<ProviderRegistryDto[]>([]);
  const [models, setModels] = useState<TreasuryModelDto[]>([]);
  const [daily, setDaily] = useState<TreasuryDailyDto[]>([]);
  const [monthly, setMonthly] = useState<TreasuryMonthlyDto[]>([]);
  const [fallbackAnalytics, setFallbackAnalytics] = useState<TreasuryFallbackAnalyticsDto[]>([]);
  const [records, setRecords] = useState<UsageRecordDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncingBalance, setSyncingBalance] = useState(false);
  const [balanceSyncError, setBalanceSyncError] = useState<string | null>(null);
  const [syncingOpenRouterAccount, setSyncingOpenRouterAccount] = useState(false);
  const [syncingOpenRouterModels, setSyncingOpenRouterModels] = useState(false);
  const [computingHealth, setComputingHealth] = useState(false);
  const [telemetrySyncError, setTelemetrySyncError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [ov, ag, pr, reg, md, rp, mo, fa, us] = await Promise.all([
          api.treasuryOverview(),
          api.treasuryByAgent(),
          api.treasuryByProvider(),
          api.treasuryProviderRegistry(),
          api.treasuryByModel(),
          api.treasuryReports(30),
          api.treasuryMonthly(12),
          api.treasuryFallbackAnalytics(),
          api.treasuryUsage(50)
        ]);
        setOverview(ov);
        setAgents(ag.agents);
        setProviders(pr.providers);
        setProviderRegistry(reg.providers);
        setModels(md.models);
        setDaily(rp.daily);
        setMonthly(mo.monthly);
        setFallbackAnalytics(fa.analytics);
        setRecords(us.records);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load treasury data");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  async function syncDeepSeekBalance() {
    setSyncingBalance(true);
    setBalanceSyncError(null);
    try {
      await api.syncDeepSeekBalance();
      const ov = await api.treasuryOverview();
      setOverview(ov);
    } catch (err) {
      setBalanceSyncError(err instanceof Error ? err.message : "DeepSeek balance sync failed");
      const ov = await api.treasuryOverview().catch(() => null);
      if (ov) setOverview(ov);
    } finally {
      setSyncingBalance(false);
    }
  }

  async function syncOpenRouterAccount() {
    setSyncingOpenRouterAccount(true);
    setTelemetrySyncError(null);
    try {
      await api.syncOpenRouterAccount();
      const ov = await api.treasuryOverview();
      setOverview(ov);
    } catch (err) {
      setTelemetrySyncError(err instanceof Error ? err.message : "OpenRouter account sync failed");
      const ov = await api.treasuryOverview().catch(() => null);
      if (ov) setOverview(ov);
    } finally {
      setSyncingOpenRouterAccount(false);
    }
  }

  async function syncOpenRouterModels() {
    setSyncingOpenRouterModels(true);
    setTelemetrySyncError(null);
    try {
      await api.syncOpenRouterModels();
      const ov = await api.treasuryOverview();
      setOverview(ov);
    } catch (err) {
      setTelemetrySyncError(err instanceof Error ? err.message : "OpenRouter models sync failed");
      const ov = await api.treasuryOverview().catch(() => null);
      if (ov) setOverview(ov);
    } finally {
      setSyncingOpenRouterModels(false);
    }
  }

  async function computeProviderHealth() {
    setComputingHealth(true);
    setTelemetrySyncError(null);
    try {
      await api.computeProviderHealth();
      const ov = await api.treasuryOverview();
      setOverview(ov);
    } catch (err) {
      setTelemetrySyncError(err instanceof Error ? err.message : "Health compute failed");
      const ov = await api.treasuryOverview().catch(() => null);
      if (ov) setOverview(ov);
    } finally {
      setComputingHealth(false);
    }
  }

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

          {/* Unified Provider Registry */}
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Provider Registry</h2>
            <Card className="p-5">
              <ProviderRegistrySection providers={providerRegistry} />
            </Card>
          </section>

          <ProviderBalanceSection
            overview={overview}
            onSync={syncDeepSeekBalance}
            syncing={syncingBalance}
            syncError={balanceSyncError}
          />

          <ProviderTelemetrySection
            overview={overview}
            onSyncAccount={syncOpenRouterAccount}
            onSyncModels={syncOpenRouterModels}
            onComputeHealth={computeProviderHealth}
            syncingAccount={syncingOpenRouterAccount}
            syncingModels={syncingOpenRouterModels}
            computingHealth={computingHealth}
            syncError={telemetrySyncError}
          />

          <ReconciliationSection overview={overview} />

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
                    <div className="mt-2 text-xs text-muted-foreground">
                      Remaining:{" "}
                      <span className={cn("font-mono font-semibold", overview.budgetStatus.dailyWarning ? "text-yellow-400" : "text-foreground")}>
                        {formatCost(Math.max(0, overview.budgetStatus.dailyLimit - overview.costToday))}
                      </span>
                      {overview.budgetStatus.dailyWarning && (
                        <span className="ml-2 font-semibold text-yellow-400">⚠ Limit reached — expensive providers blocked</span>
                      )}
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
                    <div className="mt-2 text-xs text-muted-foreground">
                      Remaining:{" "}
                      <span className={cn("font-mono font-semibold", overview.budgetStatus.monthlyWarning ? "text-yellow-400" : "text-foreground")}>
                        {formatCost(Math.max(0, overview.budgetStatus.monthlyLimit - overview.costThisMonth))}
                      </span>
                      {overview.budgetStatus.monthlyWarning && (
                        <span className="ml-2 font-semibold text-yellow-400">⚠ Limit reached — expensive providers blocked</span>
                      )}
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

          {/* Model Spending */}
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Model Spending
            </h2>
            <Card className="p-5">
              <ModelTable models={models} />
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

          {/* Monthly Cost */}
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Monthly Cost — Last 12 Months
            </h2>
            <Card className="p-5">
              <MonthlyChart monthly={monthly} />
            </Card>
          </section>

          {/* Fallback Analytics */}
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Routing Fallback Analytics
            </h2>
            <Card className="p-5">
              <FallbackAnalyticsTable analytics={fallbackAnalytics} />
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
