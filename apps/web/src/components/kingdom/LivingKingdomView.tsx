import { Activity, AlertTriangle, Bell, Brain, Cog, Hammer, RefreshCw, Users, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { KingdomActivityFeed } from "@/components/kingdom/KingdomActivityFeed";
import {
  initials,
  LOCATIONS,
  resolveLocation,
  STATE_LABEL,
  type LocationKey
} from "@/components/kingdom/agentPresence";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { SectionCard } from "@/components/ui/SectionCard";
import { api } from "@/lib/api";
import { cn, timeAgo } from "@/lib/utils";
import type { AgentPresenceDto, AgentPresenceState, KingdomActivityStreamDto, KingdomPresenceDto } from "@/types/api";

const POLL_INTERVAL_MS = 30_000;
const HERALD_LIMIT = 12;

// ── Cozy room theming (warm, light "world" surface — explicit colors because the
// app's theme tokens are dark). Floors evoke each hall; signs read like wooden plaques.
const LOCATION_THEME: Record<LocationKey, { floor: string; border: string; sign: string; emblem: string }> = {
  throne: { floor: "bg-amber-100/70", border: "border-amber-300", sign: "bg-amber-800 text-amber-50", emblem: "text-amber-700" },
  library: { floor: "bg-sky-100/60", border: "border-sky-300", sign: "bg-sky-800 text-sky-50", emblem: "text-sky-700" },
  warRoom: { floor: "bg-rose-100/60", border: "border-rose-300", sign: "bg-rose-900 text-rose-50", emblem: "text-rose-700" },
  workshop: { floor: "bg-orange-100/60", border: "border-orange-300", sign: "bg-orange-900 text-orange-50", emblem: "text-orange-700" },
  archive: { floor: "bg-stone-200/70", border: "border-stone-300", sign: "bg-stone-700 text-stone-50", emblem: "text-stone-600" },
  treasury: { floor: "bg-emerald-100/60", border: "border-emerald-300", sign: "bg-emerald-900 text-emerald-50", emblem: "text-emerald-700" }
};

// ── State → character look. Posture/glyph make state legible *in the world*, not just
// a colored ring. IDLE is a resting figure that never moves (no fake activity).
type FigureStyle = {
  body: string;
  head: string;
  glyph: LucideIcon | null;
  glyphTone: string;
  bob: string;
  resting: boolean;
  pill: string;
};

const STATE_FIGURE: Record<AgentPresenceState, FigureStyle> = {
  IDLE: { body: "bg-stone-300", head: "border-stone-400 bg-stone-50 text-stone-500", glyph: null, glyphTone: "", bob: "", resting: true, pill: "border-stone-300 bg-stone-200/70 text-stone-500" },
  THINKING: { body: "bg-blue-400", head: "border-blue-500 bg-blue-50 text-blue-700", glyph: Brain, glyphTone: "border-blue-300 bg-blue-50 text-blue-600", bob: "kingdom-bob", resting: false, pill: "border-blue-300 bg-blue-100 text-blue-700" },
  COUNCIL: { body: "bg-violet-400", head: "border-violet-500 bg-violet-50 text-violet-700", glyph: Users, glyphTone: "border-violet-300 bg-violet-50 text-violet-600", bob: "kingdom-bob", resting: false, pill: "border-violet-300 bg-violet-100 text-violet-700" },
  WORKING: { body: "bg-indigo-400", head: "border-indigo-500 bg-indigo-50 text-indigo-700", glyph: Hammer, glyphTone: "border-indigo-300 bg-indigo-50 text-indigo-600", bob: "kingdom-bob", resting: false, pill: "border-indigo-300 bg-indigo-100 text-indigo-700" },
  RUNNING: { body: "bg-emerald-500", head: "border-emerald-600 bg-emerald-50 text-emerald-700", glyph: Cog, glyphTone: "border-emerald-300 bg-emerald-50 text-emerald-600", bob: "kingdom-bob-fast", resting: false, pill: "border-emerald-300 bg-emerald-100 text-emerald-700" },
  WAITING_REVIEW: { body: "bg-amber-400", head: "border-amber-500 bg-amber-50 text-amber-700", glyph: Bell, glyphTone: "border-amber-300 bg-amber-50 text-amber-600", bob: "kingdom-bob", resting: false, pill: "border-amber-400 bg-amber-100 text-amber-800" },
  BLOCKED: { body: "bg-orange-500", head: "border-orange-600 bg-orange-50 text-orange-700", glyph: AlertTriangle, glyphTone: "border-orange-300 bg-orange-50 text-orange-600", bob: "kingdom-bob", resting: false, pill: "border-orange-400 bg-orange-100 text-orange-800" },
  ERROR: { body: "bg-red-500", head: "border-red-600 bg-red-50 text-red-700", glyph: AlertTriangle, glyphTone: "border-red-300 bg-red-50 text-red-600", bob: "kingdom-bob", resting: false, pill: "border-red-400 bg-red-100 text-red-800" }
};

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
    <div className="rounded-lg border border-amber-900/15 bg-white/70 px-3 py-2 text-center shadow-sm">
      <div className={cn("text-2xl font-bold leading-none", count > 0 ? tone : "text-stone-300")}>{count}</div>
      <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-stone-500">{label}</div>
    </div>
  );
}

// ── Character figure (a little person standing in their hall) ────────────────────

function Character({
  agent,
  selected,
  onSelect
}: {
  agent: AgentPresenceDto;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const displayName = agent.displayName ?? agent.name;
  const fig = STATE_FIGURE[agent.state];
  const Glyph = fig.glyph;

  return (
    <button
      type="button"
      data-state={agent.state}
      aria-pressed={selected}
      aria-label={`${displayName} — ${STATE_LABEL[agent.state]}`}
      title={agent.currentTask ?? STATE_LABEL[agent.state]}
      onClick={() => onSelect(agent.id)}
      className={cn(
        "group flex w-[4.75rem] shrink-0 flex-col items-center gap-1 rounded-lg p-1 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500/60",
        selected && "bg-white/70 ring-2 ring-amber-400"
      )}
    >
      {/* Figure stage: shadow stays put while the body bobs */}
      <div className={cn("relative flex h-[3.25rem] w-full items-end justify-center", fig.resting && "opacity-75")}>
        <span className="absolute bottom-0 h-2 w-9 rounded-[50%] bg-black/15 blur-[1px]" />
        <span className={cn("relative flex flex-col items-center", fig.bob)}>
          {Glyph && (
            <span className={cn("absolute -top-2 -right-2 z-10 flex h-4 w-4 items-center justify-center rounded-full border shadow-sm", fig.glyphTone)}>
              <Glyph className="h-2.5 w-2.5" />
            </span>
          )}
          <span className={cn("flex h-7 w-7 items-center justify-center rounded-full border-2 text-[10px] font-bold shadow-sm", fig.head)}>
            {initials(displayName)}
          </span>
          {/* Torso — shorter & lower when resting */}
          <span className={cn("mt-0.5 rounded-t-[0.6rem] rounded-b-sm shadow-sm", fig.body, fig.resting ? "h-3.5 w-6" : "h-5 w-7")} />
        </span>
      </div>
      <span className="w-full truncate text-center text-[11px] font-semibold leading-tight text-stone-800">{displayName}</span>
      <span className={cn("rounded-full border px-1.5 py-px text-[8px] font-semibold uppercase tracking-wide", fig.pill)}>
        {STATE_LABEL[agent.state]}
      </span>
    </button>
  );
}

// ── A room in the kingdom (a hall on the floor-plan) ─────────────────────────────

function RoomCard({
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
  const theme = LOCATION_THEME[locationKey];
  const Icon = location.icon;
  const activeCount = agents.filter((a) => a.state !== "IDLE").length;

  return (
    <div className={cn("relative flex min-h-[11rem] flex-col overflow-hidden rounded-xl border-2 p-3", theme.floor, theme.border)}>
      {/* Wooden hall sign */}
      <div className="flex items-center gap-2">
        <span className={cn("flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-bold shadow-sm", theme.sign)}>
          <Icon className="h-3.5 w-3.5" />
          {location.label}
        </span>
        {activeCount > 0 && (
          <span className="rounded-full border border-amber-900/20 bg-white/80 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
            {activeCount} active
          </span>
        )}
      </div>
      <p className="mt-1 text-[11px] text-stone-500">{location.blurb}</p>

      {/* Faint floor emblem */}
      <Icon className={cn("pointer-events-none absolute bottom-1 right-2 h-24 w-24 opacity-[0.07]", theme.emblem)} />

      {/* Residents standing on the floor */}
      <div className="relative mt-auto flex flex-wrap items-end justify-center gap-1.5 pt-3">
        {agents.length === 0 ? (
          <p className="py-3 text-center text-[11px] italic text-stone-400">Quiet for now</p>
        ) : (
          agents.map((agent) => (
            <Character key={agent.id} agent={agent} selected={agent.id === selectedId} onSelect={onSelect} />
          ))
        )}
      </div>
    </div>
  );
}

// ── Agent detail (Phase 4 + 6: real work + provenance) ──────────────────────────

function AgentDetail({ agent, onClose }: { agent: AgentPresenceDto; onClose: () => void }) {
  const displayName = agent.displayName ?? agent.name;
  const fig = STATE_FIGURE[agent.state];

  return (
    <div className="rounded-xl border-2 border-amber-300 bg-amber-50/90 p-4 text-stone-700 shadow-sm">
      <div className="mb-3 flex items-start gap-3">
        <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold", fig.head)}>
          {initials(displayName)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-base font-semibold text-stone-900">{displayName}</div>
          <div className="truncate text-xs text-stone-500">{agent.role || "Royal agent"}</div>
        </div>
        <span className={cn("inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider", fig.pill)}>
          {STATE_LABEL[agent.state]}
        </span>
        <button type="button" onClick={onClose} aria-label="Close agent detail" className="shrink-0 text-stone-400 hover:text-stone-700">
          <X className="h-4 w-4" />
        </button>
      </div>

      <dl className="space-y-2 text-sm">
        <div>
          <dt className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Current task</dt>
          <dd className="text-stone-700">{agent.currentTask ?? "Idle — no active task"}</dd>
        </div>
        {agent.progress && (
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Progress</dt>
            <dd className="text-stone-700">{agent.progress}</dd>
          </div>
        )}
        {agent.blockingReason && (
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Blocker</dt>
            <dd className="font-medium text-red-700">{agent.blockingReason}</dd>
          </div>
        )}
      </dl>

      {/* Provenance — where this work comes from (explicit colors for the warm surface) */}
      <div className="mt-3 space-y-1 border-t border-amber-300/60 pt-2">
        {agent.currentWorkOrder && (
          <div className="flex items-baseline gap-2">
            <span className="w-20 shrink-0 text-[10px] font-bold uppercase tracking-wider text-stone-400">Source</span>
            <Link to="/work-orders" className="min-w-0 flex-1 truncate text-xs font-semibold text-amber-800 underline-offset-2 hover:underline">
              {agent.currentWorkOrder.title}
            </Link>
          </div>
        )}
        {agent.lastActivityAt && (
          <div className="flex items-baseline gap-2">
            <span className="w-20 shrink-0 text-[10px] font-bold uppercase tracking-wider text-stone-400">Updated</span>
            <span className="text-xs text-stone-600">{timeAgo(agent.lastActivityAt)}</span>
          </div>
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

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* The cozy world */}
        <div className="rounded-2xl border-4 border-amber-900/20 bg-[#e7dabb] p-4 shadow-inner">
          {/* At-a-glance counts */}
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <GlanceChip label="Working" count={stats.working} tone="text-emerald-600" />
            <GlanceChip label="Awaiting Review" count={stats.awaiting} tone="text-amber-600" />
            <GlanceChip label="Blocked" count={stats.blocked} tone="text-red-600" />
            <GlanceChip label="Resting" count={stats.idle} tone="text-stone-500" />
          </div>

          {allIdle && (
            <div className="mb-3 rounded-lg border border-amber-900/15 bg-white/60 px-4 py-3 text-center text-sm text-stone-600">
              The kingdom rests — no active operations. Issue a decree from the Command view to set the court in motion.
            </div>
          )}

          {selectedAgent && (
            <div className="mb-3">
              <AgentDetail agent={selectedAgent} onClose={() => setSelectedId(null)} />
            </div>
          )}

          {/* Floor-plan: connected halls */}
          <div className="kingdom-floor rounded-xl border-2 border-amber-900/15 p-2">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {LOCATIONS.map((location) => (
                <RoomCard
                  key={location.key}
                  locationKey={location.key}
                  agents={byLocation.get(location.key) ?? []}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                />
              ))}
            </div>
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
