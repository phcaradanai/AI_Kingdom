import { Activity, AlertTriangle, RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { KingdomActivityFeed } from "@/components/kingdom/KingdomActivityFeed";
import { KingdomScene } from "@/components/kingdom/KingdomScene";
import { initials, STATE_DOT } from "@/components/kingdom/agentPresence";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { SectionCard } from "@/components/ui/SectionCard";
import { getAgentDisplayName, getAgentDisplayTitle, getAgentPortrait } from "@/lib/agentPortraits";
import { api } from "@/lib/api";
import { useTk } from "@/lib/i18n";
import { cn, timeAgo } from "@/lib/utils";
import type { AgentPresenceDto, KingdomActivityStreamDto, KingdomPresenceDto } from "@/types/api";

const POLL_INTERVAL_MS = 30_000;
const HERALD_LIMIT = 12;

// ── At-a-glance counts (the 10-second read) ─────────────────────────────────────

function summarize(agents: AgentPresenceDto[]) {
  let working = 0;
  let idle = 0;
  let awaiting = 0;
  let blocked = 0;
  for (const a of agents) {
    if (a.state === "IDLE") idle += 1;
    else if (a.state === "WAITING_REVIEW") awaiting += 1;
    else if (a.state === "BLOCKED" || a.state === "ERROR") blocked += 1;
    else working += 1; // THINKING / COUNCIL / WORKING / RUNNING
  }
  return { working, idle, awaiting, blocked };
}

function GlanceChip({ label, count, tone }: { label: string; count: number; tone: string }) {
  return (
    <div className="rounded-lg border border-border/40 bg-muted/10 p-3 text-center">
      <div className={cn("text-2xl font-bold leading-none", count > 0 ? tone : "text-muted-foreground/40")}>{count}</div>
      <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}

// ── Agent detail (Phase 4 + 6: real work + provenance) ──────────────────────────

function AgentDetail({ agent, onClose }: { agent: AgentPresenceDto; onClose: () => void }) {
  const tk = useTk();
  const displayName = getAgentDisplayName(agent);
  const displayTitle = getAgentDisplayTitle(agent) || agent.role || "Royal agent";
  const portrait = getAgentPortrait(agent);

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
      <div className="mb-3 flex items-start gap-3">
        <span className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted text-sm font-bold">
          {portrait ? <img src={portrait} alt="" className="h-full w-full object-cover" /> : initials(displayName)}
          <span className={cn("absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background", STATE_DOT[agent.state])} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-base font-semibold">{displayName}</div>
          <div className="truncate text-xs text-muted-foreground">{displayTitle}</div>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-muted/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          <span className={cn("h-1.5 w-1.5 rounded-full", STATE_DOT[agent.state])} />
          {tk(`presence.state.${agent.state}`)}
        </span>
        <button type="button" onClick={onClose} aria-label={tk("livingKingdom.detail.close")} className="shrink-0 text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      <dl className="space-y-2 text-sm">
        <div>
          <dt className="text-[10px] font-bold text-muted-foreground">{tk("livingKingdom.detail.currentTask")}</dt>
          <dd className="text-foreground/85">{agent.currentTask ?? tk("livingKingdom.detail.idleTask")}</dd>
        </div>
        {agent.progress && (
          <div>
            <dt className="text-[10px] font-bold text-muted-foreground">{tk("livingKingdom.detail.progress")}</dt>
            <dd className="text-foreground/85">{agent.progress}</dd>
          </div>
        )}
        {agent.blockingReason && (
          <div>
            <dt className="text-[10px] font-bold text-muted-foreground">{tk("livingKingdom.detail.blocker")}</dt>
            <dd className="text-destructive">{agent.blockingReason}</dd>
          </div>
        )}
      </dl>

      {/* Provenance — where this work comes from */}
      <div className="mt-3 space-y-1 border-t border-border/40 pt-2">
        <div className="flex items-baseline gap-2">
          <span className="w-20 shrink-0 text-[10px] font-bold text-muted-foreground/70">{tk("livingKingdom.detail.profile")}</span>
          <Link to={`/living-agents/${agent.id}`} className="min-w-0 flex-1 truncate text-xs font-semibold text-primary underline-offset-2 hover:underline">
            {tk("livingKingdom.detail.openProfile")}
          </Link>
        </div>
        {agent.currentWorkOrder && (
          <div className="flex items-baseline gap-2">
            <span className="w-20 shrink-0 text-[10px] font-bold text-muted-foreground/70">{tk("livingKingdom.detail.source")}</span>
            <Link to={`/work-orders?focus=${agent.currentWorkOrder.id}`} className="min-w-0 flex-1 truncate text-xs font-semibold text-primary underline-offset-2 hover:underline">
              {agent.currentWorkOrder.title}
            </Link>
          </div>
        )}
        {agent.lastActivityAt && (
          <div className="flex items-baseline gap-2">
            <span className="w-20 shrink-0 text-[10px] font-bold text-muted-foreground/70">{tk("livingKingdom.detail.updated")}</span>
            <span className="text-xs text-foreground/85">{timeAgo(agent.lastActivityAt)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main view ───────────────────────────────────────────────────────────────────

export function LivingKingdomView() {
  const tk = useTk();
  const [presence, setPresence] = useState<KingdomPresenceDto | null>(null);
  const [activity, setActivity] = useState<KingdomActivityStreamDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
      setRefreshError(null);
    } else {
      setLoading(true);
      setError(null);
    }
    try {
      const [p, a] = await Promise.all([api.getKingdomPresence(), api.getKingdomActivity(HERALD_LIMIT)]);
      setPresence(p);
      setActivity(a);
      setLastUpdated(new Date());
      setRefreshError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : tk("livingKingdom.errorLoad");
      if (isRefresh) setRefreshError(msg);
      else setError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tk]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (loading || error) return;
    const id = setInterval(() => void load(true), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [load, loading, error]);

  const agents = useMemo(() => presence?.agents ?? [], [presence]);
  const stats = useMemo(() => summarize(agents), [agents]);
  const allIdle = agents.length > 0 && stats.working === 0 && stats.awaiting === 0 && stats.blocked === 0;
  const selectedAgent = selectedId ? agents.find((a) => a.id === selectedId) ?? null : null;

  if (loading) return <LoadingState message={tk("livingKingdom.loading")} />;
  if (error) return <ErrorState title={tk("livingKingdom.errorTitle")} message={error} onRetry={() => void load()} />;

  return (
    <div className="space-y-5">
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl">{tk("livingKingdom.title")}</h2>
          <p className="text-sm text-muted-foreground">{tk("livingKingdom.subtitle")}</p>
        </div>
        <Button variant="outline" onClick={() => void load(true)} disabled={refreshing} className="min-h-11 gap-2">
          <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
          {refreshing ? tk("livingKingdom.refreshing") : tk("livingKingdom.refresh")}
        </Button>
      </div>

      {refreshError && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-300">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="flex-1">{tk("livingKingdom.refreshFailed", { message: refreshError })}</span>
          <button type="button" onClick={() => void load(true)} className="shrink-0 text-xs underline">{tk("livingKingdom.retry")}</button>
        </div>
      )}

      {/* At-a-glance counts */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <GlanceChip label={tk("livingKingdom.summary.working")} count={stats.working} tone="text-emerald-400" />
        <GlanceChip label={tk("livingKingdom.summary.awaitingReview")} count={stats.awaiting} tone="text-amber-400" />
        <GlanceChip label={tk("livingKingdom.summary.blocked")} count={stats.blocked} tone="text-destructive" />
        <GlanceChip label={tk("livingKingdom.summary.resting")} count={stats.idle} tone="text-muted-foreground" />
      </div>

      {allIdle && (
        <div className="rounded-lg border border-border/50 bg-muted/10 px-4 py-3 text-center text-sm text-muted-foreground">
          {tk("livingKingdom.restingMessage")}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* The kingdom scene */}
        <div className="space-y-4">
          {selectedAgent && <AgentDetail agent={selectedAgent} onClose={() => setSelectedId(null)} />}
          <KingdomScene agents={agents} selectedId={selectedId} onSelect={setSelectedId} />
        </div>

        {/* Kingdom Herald — real events (Phase 5) */}
        <SectionCard title={tk("livingKingdom.herald")} icon={Activity} contentClassName="p-3 max-h-[640px] overflow-y-auto">
          <KingdomActivityFeed activities={activity?.activities ?? []} limit={HERALD_LIMIT} />
        </SectionCard>
      </div>

      {lastUpdated && (
        <p className="text-center text-[11px] text-muted-foreground">
          {tk("livingKingdom.updated", { time: timeAgo(lastUpdated.toISOString()) })}
          {refreshing ? ` · ${tk("livingKingdom.updating")}` : ` · ${tk("livingKingdom.autoRefresh")}`}
          {` · ${tk("livingKingdom.dataSource")}`}
        </p>
      )}
    </div>
  );
}
