import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  ExternalLink,
  Filter,
  Layers3,
  RefreshCw,
  ShieldAlert,
  Zap
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatCard } from "@/components/ui/StatCard";
import { api } from "@/lib/api";
import { cn, formatDate } from "@/lib/utils";
import type { NextActionItem, NextActionQueueDto } from "@/types/api";

type RiskLevel = NextActionItem["riskLevel"];
type RiskFilter = RiskLevel | "ALL";

const RISK_LEVELS: RiskLevel[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

const RISK_COLORS: Record<RiskLevel, string> = {
  CRITICAL: "border-destructive/50 bg-destructive/10 text-destructive",
  HIGH: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  MEDIUM: "border-primary/30 bg-primary/10 text-primary",
  LOW: "border-border bg-muted/20 text-muted-foreground"
};

const RISK_SECTION_STYLES: Record<RiskLevel, string> = {
  CRITICAL: "border-destructive/35 bg-destructive/[0.04]",
  HIGH: "border-amber-500/30 bg-amber-500/[0.04]",
  MEDIUM: "border-primary/25 bg-primary/[0.035]",
  LOW: "border-border bg-card/30"
};

const STATE_COLORS: Record<string, string> = {
  AWAITING_DECISION: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  AWAITING_ACTION: "border-blue-500/40 bg-blue-500/10 text-blue-400",
  BLOCKED: "border-destructive/50 bg-destructive/10 text-destructive",
  AWAITING_INPUT: "border-border bg-muted/20 text-muted-foreground"
};

const SOURCE_LINKS = [
  { type: "WorkOrder", label: "Work Orders", to: "/work-orders", description: "Implementation queue, handoffs, reports, and review state." },
  { type: "AutomationJob", label: "Automation Jobs", to: "/automation-jobs", description: "Runner jobs, patch validation, approval, and execution state." },
  { type: "CouncilSession", label: "Royal Command", to: "/throne-room", description: "Council progress, synthesis, and created work orders." },
  { type: "ProjectContext", label: "Projects", to: "/projects", description: "Project context, source documents, and local docs bindings." },
  { type: "RoyalBrief", label: "Royal Brief", to: "/royal-brief", description: "Generated daily summary and decisions needing review." },
  { type: "Report", label: "Reports", to: "/reports", description: "Generated reports, artifacts, and supporting analysis." }
];

function RiskBadge({ riskLevel }: { riskLevel: RiskLevel }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider", RISK_COLORS[riskLevel])}>
      {riskLevel}
    </span>
  );
}

function StateBadge({ state }: { state: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider", STATE_COLORS[state] ?? STATE_COLORS.AWAITING_INPUT)}>
      {state.replace(/_/g, " ")}
    </span>
  );
}

function EntityTypeBadge({ type }: { type: string }) {
  return (
    <span className="inline-flex items-center rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
      {entityLabel(type)}
    </span>
  );
}

function StatusBadges({ item }: { item: NextActionItem }) {
  return (
    <>
      {item.isEscalated && (
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/50 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-400">
          <AlertCircle className="h-3 w-3" /> Escalated
        </span>
      )}
      {(item.abstractState === "BLOCKED" || item.isBlocking > 0) && (
        <span className="inline-flex items-center gap-1 rounded-full border border-destructive/50 bg-destructive/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-destructive">
          <ShieldAlert className="h-3 w-3" /> Blocking
        </span>
      )}
    </>
  );
}

function formatAge(hours: number): string {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m ago`;
  if (hours < 24) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function entityLabel(type: string): string {
  return type.replace(/([a-z])([A-Z])/g, "$1 $2");
}

function isContextRefreshItem(item: NextActionItem): boolean {
  return item.id.startsWith("WorkOrder:ctx:");
}

function routeForSource(type: string): string {
  if (type === "WorkOrder" || type === "HandoffBrief") return "/work-orders";
  if (type === "AutomationJob" || type === "PatchArtifact" || type === "AgentRunner") return "/automation-jobs";
  if (type === "CouncilSession") return "/throne-room";
  if (type === "ProjectContext" || type === "Project") return "/projects";
  if (type === "Report") return "/reports";
  if (type === "RoyalBrief") return "/royal-brief";
  if (type === "AgentKnowledgeCandidate") return "/knowledge-lab/candidates";
  return "/dashboard";
}

type ActionButtonProps = {
  item: NextActionItem;
  busy: boolean;
  onRefreshContext: (item: NextActionItem) => void;
  size?: "primary" | "compact";
};

function ActionButton({ item, busy, onRefreshContext, size = "compact" }: ActionButtonProps) {
  const className = size === "primary"
    ? "min-h-11 w-full px-4 py-2 text-sm sm:w-auto"
    : "min-h-9 w-full px-3 py-2 text-xs sm:w-auto";

  if (isContextRefreshItem(item)) {
    return (
      <Button
        variant={size === "primary" ? "primary" : "outline"}
        className={className}
        disabled={busy}
        onClick={() => onRefreshContext(item)}
      >
        <RefreshCw className={cn("h-4 w-4 shrink-0", busy && "animate-spin")} />
        <span className="min-w-0 break-words">{busy ? "Refreshing..." : item.actionLabel}</span>
      </Button>
    );
  }

  return (
    <Link to={item.routeTo} className="block w-full sm:w-auto">
      <Button variant={size === "primary" ? "primary" : "outline"} className={className}>
        {size === "primary" ? <Zap className="h-4 w-4 shrink-0" /> : <CheckCircle2 className="h-4 w-4 shrink-0" />}
        <span className="min-w-0 break-words">{item.actionLabel}</span>
        {size === "primary" && <ArrowRight className="h-4 w-4 shrink-0" />}
      </Button>
    </Link>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Kingdom Inbox"
        title="What should the King do next?"
        description="Live next actions from the Kingdom's source-of-truth pages."
      />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-xl border border-border bg-card/50" />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-xl border border-primary/25 bg-primary/5" />
      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <div className="h-56 animate-pulse rounded-xl border border-border bg-card/50" />
        <div className="space-y-3">
          <div className="h-24 animate-pulse rounded-xl border border-border bg-card/50" />
          <div className="h-24 animate-pulse rounded-xl border border-border bg-card/50" />
        </div>
      </div>
    </div>
  );
}

function TopActionCard({ item, busy, onRefreshContext }: { item: NextActionItem; busy: boolean; onRefreshContext: (item: NextActionItem) => void }) {
  const sourceRoute = routeForSource(item.entityType);

  return (
    <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-5 shadow-[0_0_20px_rgba(214,170,87,0.08)] sm:p-6">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(220px,300px)]">
        <div className="min-w-0 space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <RiskBadge riskLevel={item.riskLevel} />
            <EntityTypeBadge type={item.entityType} />
            <StateBadge state={item.abstractState} />
            <StatusBadges item={item} />
          </div>

          <div className="min-w-0">
            <h2 className="font-display text-2xl leading-tight text-foreground sm:text-3xl">{item.title}</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">{item.why}</p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-border/70 bg-background/35 p-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Recommended Action</div>
              <div className="mt-2 text-sm font-semibold text-foreground">{item.actionLabel}</div>
            </div>
            <Link to={sourceRoute} className="rounded-lg border border-border/70 bg-background/35 p-4 transition hover:border-primary/40 hover:bg-primary/5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Source of Truth</div>
                  <div className="mt-2 text-sm font-semibold text-primary">Open {entityLabel(item.entityType)}</div>
                </div>
                <ExternalLink className="h-4 w-4 shrink-0 text-primary" />
              </div>
            </Link>
          </div>
        </div>

        <div className="flex min-w-0 flex-col justify-between gap-4 rounded-xl border border-primary/20 bg-background/35 p-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Priority Score</div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="font-display text-5xl font-bold text-primary" aria-label={`Priority ${item.priority}`}>{item.priority}</span>
              <span className="text-sm text-muted-foreground">/100</span>
            </div>
            <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              Observed {formatAge(item.ageHours)}
            </div>
          </div>
          <ActionButton item={item} busy={busy} onRefreshContext={onRefreshContext} size="primary" />
        </div>
      </div>
    </div>
  );
}

function QueueItem({ item, busy, onRefreshContext }: { item: NextActionItem; busy: boolean; onRefreshContext: (item: NextActionItem) => void }) {
  const sourceRoute = routeForSource(item.entityType);

  return (
    <div className="grid gap-3 rounded-xl border border-border bg-card/45 p-4 md:grid-cols-[minmax(0,1fr)_minmax(160px,auto)] md:items-center">
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <EntityTypeBadge type={item.entityType} />
          <StateBadge state={item.abstractState} />
          <StatusBadges item={item} />
        </div>
        <div className="min-w-0">
          <h4 className="line-clamp-2 text-sm font-semibold leading-5 text-foreground">{item.title}</h4>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.why}</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {formatAge(item.ageHours)}</span>
          <span>Priority <span className="font-semibold text-foreground">{item.priority}</span></span>
          <Link to={sourceRoute} className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
            Open source <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </div>
      <div className="min-w-0 md:justify-self-end">
        <ActionButton item={item} busy={busy} onRefreshContext={onRefreshContext} />
      </div>
    </div>
  );
}

function FilterPanel({
  riskFilter,
  entityFilter,
  escalatedOnly,
  blockedOnly,
  entityTypes,
  onRiskChange,
  onEntityChange,
  onEscalatedChange,
  onBlockedChange,
  onClear
}: {
  riskFilter: RiskFilter;
  entityFilter: string;
  escalatedOnly: boolean;
  blockedOnly: boolean;
  entityTypes: string[];
  onRiskChange: (value: RiskFilter) => void;
  onEntityChange: (value: string) => void;
  onEscalatedChange: (value: boolean) => void;
  onBlockedChange: (value: boolean) => void;
  onClear: () => void;
}) {
  const selectCls = "h-10 w-full rounded-md border border-border bg-input px-3 text-sm";

  return (
    <SectionCard title="Filters" icon={Filter} contentClassName="space-y-4">
      <label className="block space-y-1.5">
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Risk</span>
        <select className={selectCls} value={riskFilter} onChange={(event) => onRiskChange(event.target.value as RiskFilter)}>
          <option value="ALL">All risks</option>
          {RISK_LEVELS.map((risk) => <option key={risk} value={risk}>{risk}</option>)}
        </select>
      </label>
      <label className="block space-y-1.5">
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Entity Type</span>
        <select className={selectCls} value={entityFilter} onChange={(event) => onEntityChange(event.target.value)}>
          <option value="ALL">All entities</option>
          {entityTypes.map((type) => <option key={type} value={type}>{entityLabel(type)}</option>)}
        </select>
      </label>
      <div className="space-y-2">
        <label className="flex items-center gap-2 rounded-lg border border-border bg-background/30 px-3 py-2 text-sm">
          <input type="checkbox" checked={escalatedOnly} onChange={(event) => onEscalatedChange(event.target.checked)} />
          Escalated only
        </label>
        <label className="flex items-center gap-2 rounded-lg border border-border bg-background/30 px-3 py-2 text-sm">
          <input type="checkbox" checked={blockedOnly} onChange={(event) => onBlockedChange(event.target.checked)} />
          Blocked only
        </label>
      </div>
      <Button variant="outline" className="h-9 w-full text-xs" onClick={onClear}>Clear Filters</Button>
    </SectionCard>
  );
}

function SourceReferenceCards() {
  return (
    <SectionCard title="Source of Truth References" icon={Layers3}>
      <div className="grid auto-rows-fr gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {SOURCE_LINKS.map((source) => (
          <Link
            key={source.type}
            to={source.to}
            className="flex min-h-[112px] flex-col justify-between rounded-lg border border-border bg-background/35 p-4 transition hover:border-primary/40 hover:bg-primary/5"
          >
            <div className="min-w-0">
              <div className="flex items-center justify-between gap-3">
                <h4 className="font-semibold text-foreground">{source.label}</h4>
                <ExternalLink className="h-4 w-4 shrink-0 text-primary" />
              </div>
              <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{source.description}</p>
            </div>
            <span className="mt-3 text-xs font-bold uppercase tracking-wider text-primary">Open source</span>
          </Link>
        ))}
      </div>
    </SectionCard>
  );
}

function RiskGroup({
  risk,
  items,
  actionBusy,
  onRefreshContext
}: {
  risk: RiskLevel;
  items: NextActionItem[];
  actionBusy: Record<string, boolean>;
  onRefreshContext: (item: NextActionItem) => void;
}) {
  if (items.length === 0) return null;

  return (
    <div className={cn("rounded-xl border p-3", RISK_SECTION_STYLES[risk])}>
      <div className="mb-3 flex items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-2">
          <RiskBadge riskLevel={risk} />
          <span className="text-sm font-semibold text-foreground">{riskTitle(risk)}</span>
        </div>
        <span className="rounded-full border border-border bg-background/50 px-2 py-0.5 text-xs text-muted-foreground">{items.length}</span>
      </div>
      <div className="space-y-3">
        {items.map((item) => (
          <QueueItem
            key={item.id}
            item={item}
            busy={actionBusy[item.id] ?? false}
            onRefreshContext={onRefreshContext}
          />
        ))}
      </div>
    </div>
  );
}

function riskTitle(risk: RiskLevel): string {
  if (risk === "CRITICAL") return "Act now";
  if (risk === "HIGH") return "Review soon";
  if (risk === "MEDIUM") return "Keep moving";
  return "Lower urgency";
}

function filterItems(items: NextActionItem[], riskFilter: RiskFilter, entityFilter: string, escalatedOnly: boolean, blockedOnly: boolean): NextActionItem[] {
  return items.filter((item) => {
    if (riskFilter !== "ALL" && item.riskLevel !== riskFilter) return false;
    if (entityFilter !== "ALL" && item.entityType !== entityFilter) return false;
    if (escalatedOnly && !item.isEscalated) return false;
    if (blockedOnly && item.abstractState !== "BLOCKED" && item.isBlocking <= 0) return false;
    return true;
  });
}

export function InboxPage() {
  const [data, setData] = useState<NextActionQueueDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [actionBusy, setActionBusy] = useState<Record<string, boolean>>({});
  const [actionWarning, setActionWarning] = useState<string | null>(null);
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("ALL");
  const [entityFilter, setEntityFilter] = useState("ALL");
  const [escalatedOnly, setEscalatedOnly] = useState(false);
  const [blockedOnly, setBlockedOnly] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const result = await api.getNextActions({ limit: 100 });
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load inbox");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleRefresh = () => {
    void load(true);
  };

  const handleContextRefresh = useCallback(async (item: NextActionItem) => {
    setActionBusy((prev) => ({ ...prev, [item.id]: true }));
    setActionWarning(null);
    try {
      const { result } = await api.refreshWorkOrderContext(item.entityId);
      if (result.newStatus !== "FRESH") {
        const msgs = result.scanFailures.length > 0 ? result.scanFailures : result.warnings;
        setActionWarning(msgs.length > 0 ? msgs[0]! : `Context is ${result.newStatus ?? "unchanged"} after refresh — check project local docs.`);
      }
      await load(true);
    } finally {
      setActionBusy((prev) => ({ ...prev, [item.id]: false }));
    }
  }, [load]);

  const queue = data?.queue ?? [];
  const topAction = data?.topAction ?? null;
  const summary = data?.summary;
  const entityTypes = useMemo(() => Array.from(new Set(queue.map((item) => item.entityType))).sort(), [queue]);
  const filteredQueue = useMemo(
    () => filterItems(queue, riskFilter, entityFilter, escalatedOnly, blockedOnly),
    [blockedOnly, entityFilter, escalatedOnly, queue, riskFilter]
  );
  const groupedQueue = useMemo(
    () => Object.fromEntries(RISK_LEVELS.map((risk) => [risk, filteredQueue.filter((item) => item.riskLevel === risk)])) as Record<RiskLevel, NextActionItem[]>,
    [filteredQueue]
  );

  if (loading) return <DashboardSkeleton />;

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Kingdom Inbox"
          title="What should the King do next?"
          description="Live next actions from the Kingdom's source-of-truth pages."
          action={
            <Button variant="outline" onClick={handleRefresh} disabled={refreshing} className="h-9 px-3 text-xs">
              <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
              Retry
            </Button>
          }
        />
        <SectionCard title="Inbox Unavailable" icon={AlertCircle}>
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4">
            <p className="text-sm font-semibold text-destructive">Unable to load Kingdom Inbox.</p>
            <p className="mt-1 text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" onClick={handleRefresh} disabled={refreshing} className="mt-4 h-9 px-3 text-xs">
              <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
              Retry
            </Button>
          </div>
        </SectionCard>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Kingdom Inbox"
        title="What should the King do next?"
        description="Live next actions across work orders, automation jobs, council output, project context, and reports."
        action={
          <Button variant="outline" onClick={handleRefresh} disabled={refreshing} className="h-9 px-3 text-xs">
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
            {refreshing ? "Refreshing..." : "Refresh"}
          </Button>
        }
      />

      {data && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card/40 px-4 py-3 text-xs text-muted-foreground">
          <span>Computed {formatDate(data.computedAt)}</span>
          <span>No auto-polling</span>
        </div>
      )}

      {actionWarning && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
          {actionWarning}
        </div>
      )}

      {summary && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          <StatCard title="Pending" value={summary.totalPending} />
          <StatCard title="Critical" value={summary.criticalCount} className={summary.criticalCount > 0 ? "border-destructive/40" : undefined} />
          <StatCard title="High" value={summary.highCount} className={summary.highCount > 0 ? "border-amber-500/40" : undefined} />
          <StatCard title="Blocked" value={summary.blockedCount} className={summary.blockedCount > 0 ? "border-destructive/30" : undefined} />
          <StatCard title="Escalated" value={summary.escalatedCount} className={summary.escalatedCount > 0 ? "border-amber-500/30" : undefined} />
        </div>
      )}

      {topAction ? (
        <SectionCard title="Top Action" icon={Zap} contentClassName="p-0">
          <TopActionCard
            item={topAction}
            busy={actionBusy[topAction.id] ?? false}
            onRefreshContext={handleContextRefresh}
          />
        </SectionCard>
      ) : (
        <EmptyState
          icon={CheckCircle2}
          title="No pending royal actions."
          description="The Kingdom has no pending next actions."
        />
      )}

      <SourceReferenceCards />

      {queue.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <FilterPanel
            riskFilter={riskFilter}
            entityFilter={entityFilter}
            escalatedOnly={escalatedOnly}
            blockedOnly={blockedOnly}
            entityTypes={entityTypes}
            onRiskChange={setRiskFilter}
            onEntityChange={setEntityFilter}
            onEscalatedChange={setEscalatedOnly}
            onBlockedChange={setBlockedOnly}
            onClear={() => {
              setRiskFilter("ALL");
              setEntityFilter("ALL");
              setEscalatedOnly(false);
              setBlockedOnly(false);
            }}
          />

          <SectionCard
            title={`Action Queue (${filteredQueue.length})`}
            icon={Layers3}
            action={<span className="text-xs text-muted-foreground">{queue.length} total</span>}
          >
            {filteredQueue.length === 0 ? (
              <EmptyState
                icon={Filter}
                title="No actions match these filters."
                description="Clear filters to review the full Kingdom Inbox."
              />
            ) : (
              <div className="space-y-4">
                {RISK_LEVELS.map((risk) => (
                  <RiskGroup
                    key={risk}
                    risk={risk}
                    items={groupedQueue[risk]}
                    actionBusy={actionBusy}
                    onRefreshContext={handleContextRefresh}
                  />
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      )}
    </div>
  );
}
