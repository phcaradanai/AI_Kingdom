import { Activity, AlertTriangle, RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ProvenanceLinks } from "@/components/ProvenanceLinks";
import { KingdomActivityFeed } from "@/components/kingdom/KingdomActivityFeed";
import {
  initials,
  LOCATIONS,
  resolveLocation,
  STATE_ANIMATION,
  STATE_COLORS,
  STATE_DOT,
  STATE_LABEL,
  type LocationKey
} from "@/components/kingdom/agentPresence";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { SectionCard } from "@/components/ui/SectionCard";
import { api } from "@/lib/api";
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

function GlanceStat({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className="rounded-lg border border-border/40 bg-muted/10 p-3 text-center">
      <div className={cn("text-2xl font-bold", count > 0 ? color : "text-muted-foreground/40")}>{count}</div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}

// ── Agent avatar (motion reflects real state) ───────────────────────────────────

function AgentAvatar({
  agent,
  selected,
  onSelect
}: {
  agent: AgentPresenceDto;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const displayName = agent.displayName ?? agent.name;
  const isActive = agent.state !== "IDLE";

  return (
    <button
      type="button"
      data-state={agent.state}
      aria-pressed={selected}
      aria-label={`${displayName} — ${STATE_LABEL[agent.state]}`}
      onClick={() => onSelect(agent.id)}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg border p-2.5 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50",
        selected ? "border-primary/50 bg-primary/5" : "border-border/40 bg-card/60 hover:border-border",
        !isActive && "opacity-70"
      )}
    >
      <span
        className={cn(
          "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-xs font-bold",
          STATE_COLORS[agent.state],
          STATE_ANIMATION[agent.state]
        )}
      >
        {initials(displayName)}
        <span className={cn("absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-background", STATE_DOT[agent.state])} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-foreground">{displayName}</span>
          <span className="ml-auto shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {STATE_LABEL[agent.state]}
          </span>
        </span>
        {agent.currentTask ? (
          <span className="mt-0.5 block truncate text-xs text-foreground/70">{agent.currentTask}</span>
        ) : agent.blockingReason ? (
          <span className="mt-0.5 block truncate text-xs text-destructive/80">{agent.blockingReason}</span>
        ) : (
          <span className="mt-0.5 block truncate text-xs text-muted-foreground/60">{agent.role || "Royal agent"}</span>
        )}
      </span>
    </button>
  );
}

// ── Location card ───────────────────────────────────────────────────────────────

function LocationCard({
  locationKey,
  agents,
  selectedId,
  onSelect
}: {
  locationKey: LocationKey;
  agents: AgentPresenceDto[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const location = LOCATIONS.find((l) => l.key === locationKey)!;
  const Icon = location.icon;
  const activeCount = agents.filter((a) => a.state !== "IDLE").length;

  return (
    <div className="flex flex-col rounded-xl border border-border/60 bg-background/40 p-4">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <div className="font-display text-sm font-semibold leading-tight">{location.label}</div>
          <div className="truncate text-[11px] text-muted-foreground">{location.blurb}</div>
        </div>
        {activeCount > 0 && (
          <span className="ml-auto shrink-0 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
            {activeCount} active
          </span>
        )}
      </div>
      {agents.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border/40 px-3 py-4 text-center text-xs text-muted-foreground/60">
          Empty
        </p>
      ) : (
        <div className="space-y-2">
          {agents.map((agent) => (
            <AgentAvatar key={agent.id} agent={agent} selected={agent.id === selectedId} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Agent detail (Phase 4 + 6: real work + provenance) ──────────────────────────

function AgentDetail({ agent, onClose }: { agent: AgentPresenceDto; onClose: () => void }) {
  const displayName = agent.displayName ?? agent.name;
  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
      <div className="mb-3 flex items-start gap-3">
        <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-sm font-bold", STATE_COLORS[agent.state])}>
          {initials(displayName)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-base font-semibold">{displayName}</div>
          <div className="truncate text-xs text-muted-foreground">{agent.role || "Royal agent"}</div>
        </div>
        <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider", STATE_COLORS[agent.state])}>
          <span className={cn("h-1.5 w-1.5 rounded-full", STATE_DOT[agent.state])} />
          {STATE_LABEL[agent.state]}
        </span>
        <button type="button" onClick={onClose} aria-label="Close agent detail" className="shrink-0 text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      <dl className="space-y-2 text-sm">
        <div>
          <dt className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Current task</dt>
          <dd className="text-foreground/85">{agent.currentTask ?? "Idle — no active task"}</dd>
        </div>
        {agent.progress && (
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Progress</dt>
            <dd className="text-foreground/85">{agent.progress}</dd>
          </div>
        )}
        {agent.blockingReason && (
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Blocker</dt>
            <dd className="text-destructive">{agent.blockingReason}</dd>
          </div>
        )}
      </dl>

      <div className="mt-3 border-t border-border/50 pt-3">
        <ProvenanceLinks
          source={agent.currentWorkOrder ? { label: agent.currentWorkOrder.title, to: "/work-orders" } : undefined}
          updatedAt={agent.lastActivityAt ?? undefined}
        />
        {agent.currentWorkOrder && (
          <Link
            to="/work-orders"
            className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
          >
            Open work order
          </Link>
        )}
      </div>
    </div>
  );
}

// ── Main view ───────────────────────────────────────────────────────────────────

export function LivingKingdomView() {
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
      const msg = err instanceof Error ? err.message : "Failed to load the living kingdom";
      if (isRefresh) setRefreshError(msg);
      else setError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (loading || error) return;
    const id = setInterval(() => void load(true), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [load, loading, error]);

  const agents = useMemo(() => presence?.agents ?? [], [presence]);

  const byLocation = useMemo(() => {
    const map = new Map<LocationKey, AgentPresenceDto[]>();
    for (const location of LOCATIONS) map.set(location.key, []);
    for (const agent of agents) map.get(resolveLocation(agent))!.push(agent);
    return map;
  }, [agents]);

  const stats = useMemo(() => summarize(agents), [agents]);
  const allIdle = agents.length > 0 && stats.working === 0 && stats.awaiting === 0 && stats.blocked === 0;
  const selectedAgent = selectedId ? agents.find((a) => a.id === selectedId) ?? null : null;

  if (loading) return <LoadingState message="Summoning the kingdom..." />;
  if (error) return <ErrorState title="Unable to load the living kingdom." message={error} onRetry={() => void load()} />;

  return (
    <div className="space-y-5">
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl">The Living Kingdom</h2>
          <p className="text-sm text-muted-foreground">Who is working, idle, or blocked — at a glance. Every motion reflects real activity.</p>
        </div>
        <Button variant="outline" onClick={() => void load(true)} disabled={refreshing} className="gap-2">
          <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
          {refreshing ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      {refreshError && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-300">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="flex-1">Refresh failed: {refreshError}. Showing last-known state.</span>
          <button type="button" onClick={() => void load(true)} className="shrink-0 text-xs underline">Retry</button>
        </div>
      )}

      {/* At-a-glance counts */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <GlanceStat label="Working" count={stats.working} color="text-emerald-400" />
        <GlanceStat label="Awaiting Review" count={stats.awaiting} color="text-amber-400" />
        <GlanceStat label="Blocked" count={stats.blocked} color="text-destructive" />
        <GlanceStat label="Resting" count={stats.idle} color="text-muted-foreground" />
      </div>

      {allIdle && (
        <div className="rounded-lg border border-border/50 bg-muted/10 px-4 py-3 text-center text-sm text-muted-foreground">
          The kingdom rests — no active operations. Issue a decree from the Command view to set the court in motion.
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Kingdom map */}
        <div className="space-y-5">
          {selectedAgent && <AgentDetail agent={selectedAgent} onClose={() => setSelectedId(null)} />}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {LOCATIONS.map((location) => (
              <LocationCard
                key={location.key}
                locationKey={location.key}
                agents={byLocation.get(location.key) ?? []}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            ))}
          </div>
        </div>

        {/* Kingdom Herald — real events (Phase 5) */}
        <SectionCard title="Kingdom Herald" icon={Activity} contentClassName="p-3 max-h-[640px] overflow-y-auto">
          <KingdomActivityFeed activities={activity?.activities ?? []} limit={HERALD_LIMIT} />
        </SectionCard>
      </div>

      {lastUpdated && (
        <p className="text-center text-[11px] text-muted-foreground">
          Updated {timeAgo(lastUpdated.toISOString())}
          {refreshing ? " · Refreshing…" : " · Auto-refreshes every 30s"}
          {" · "}Live data from AgentActivity, AutomationJobs, CouncilSessions
        </p>
      )}
    </div>
  );
}
