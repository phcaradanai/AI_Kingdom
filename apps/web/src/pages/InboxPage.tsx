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
import { ProvenanceLinks, provenanceFromNextAction } from "@/components/ProvenanceLinks";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageSection } from "@/components/ui/PageSection";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatCard } from "@/components/ui/StatCard";
import { api } from "@/lib/api";
import { useTk, type TranslationVars } from "@/lib/i18n";
import { cn, formatDate } from "@/lib/utils";
import type { NextActionItem, NextActionQueueDto } from "@/types/api";

type Tk = (key: string, vars?: TranslationVars) => string;

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
  { type: "WorkOrder", to: "/work-orders" },
  { type: "AutomationJob", to: "/automation-jobs" },
  { type: "CouncilSession", to: "/throne-room?view=command" },
  { type: "ProjectContext", to: "/projects" },
  { type: "RoyalBrief", to: "/royal-brief" },
  { type: "Report", to: "/reports" }
];

function RiskBadge({ riskLevel }: { riskLevel: RiskLevel }) {
  const tk = useTk();
  return (
    <span title={`Risk: ${riskLevel}`} className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider", RISK_COLORS[riskLevel])}>
      {tk(`risk.${riskLevel}`)}
    </span>
  );
}

function StateBadge({ state }: { state: NextActionItem["abstractState"] }) {
  const tk = useTk();
  return (
    <span title={`State: ${state}`} className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold", STATE_COLORS[state] ?? STATE_COLORS.AWAITING_INPUT)}>
      {tk(`state.${state}`)}
    </span>
  );
}

function EntityTypeBadge({ type }: { type: string }) {
  const tk = useTk();
  return (
    <span title={`Entity type: ${type}`} className="inline-flex items-center rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
      {entityLabel(type, tk)}
    </span>
  );
}

function StatusBadges({ item }: { item: NextActionItem }) {
  const tk = useTk();
  return (
    <>
      {item.isEscalated && (
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/50 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-400">
          <AlertCircle className="h-3 w-3" /> {tk("inbox.escalated")}
        </span>
      )}
      {(item.abstractState === "BLOCKED" || item.isBlocking > 0) && (
        <span className="inline-flex items-center gap-1 rounded-full border border-destructive/50 bg-destructive/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-destructive">
          <ShieldAlert className="h-3 w-3" /> {tk("inbox.blocking")}
        </span>
      )}
    </>
  );
}

function formatAge(hours: number, tk: Tk): string {
  if (hours < 1) return tk("inbox.age.m", { n: Math.max(1, Math.round(hours * 60)) });
  if (hours < 24) return tk("inbox.age.h", { n: Math.round(hours) });
  return tk("inbox.age.d", { n: Math.round(hours / 24) });
}

/** Translated entity label, falling back to a humanized form for unkeyed types. */
function entityLabel(type: string, tk: Tk): string {
  const key = `entity.${type}`;
  const translated = tk(key);
  return translated === key ? type.replace(/([a-z])([A-Z])/g, "$1 $2") : translated;
}

function isContextRefreshItem(item: NextActionItem): boolean {
  return item.id.startsWith("WorkOrder:ctx:");
}

type ActionButtonProps = {
  item: NextActionItem;
  busy: boolean;
  onRefreshContext: (item: NextActionItem) => void;
  size?: "primary" | "compact";
};

function ActionButton({ item, busy, onRefreshContext, size = "compact" }: ActionButtonProps) {
  const tk = useTk();
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
        <span className="min-w-0 break-words">{busy ? tk("inbox.refreshing") : item.actionLabel}</span>
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
  const tk = useTk();
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={tk("inbox.eyebrow")}
        title={tk("inbox.title")}
        description={tk("inbox.descriptionShort")}
      />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="h-24 animate-pulse rounded-lg border border-border bg-card/50" />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-lg border border-primary/25 bg-primary/5" />
      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <div className="h-56 animate-pulse rounded-lg border border-border bg-card/50" />
        <div className="space-y-3">
          <div className="h-24 animate-pulse rounded-lg border border-border bg-card/50" />
          <div className="h-24 animate-pulse rounded-lg border border-border bg-card/50" />
        </div>
      </div>
    </div>
  );
}

function TopActionCard({ item, busy, onRefreshContext }: { item: NextActionItem; busy: boolean; onRefreshContext: (item: NextActionItem) => void }) {
  const tk = useTk();
  const provenance = provenanceFromNextAction(item);
  const sourceRoute = provenance.source?.to ?? item.routeTo;

  return (
    <div className="rounded-lg border border-border border-l-2 border-l-primary bg-card p-5 sm:p-6">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(220px,300px)]">
        <div className="min-w-0 space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <RiskBadge riskLevel={item.riskLevel} />
            <EntityTypeBadge type={item.entityType} />
            <StateBadge state={item.abstractState} />
            <StatusBadges item={item} />
          </div>

          <div className="min-w-0">
            <h2 className="text-xl font-semibold leading-tight text-foreground sm:text-2xl">{item.title}</h2>
            <div className="mt-3 max-w-3xl">
              <div className="text-xs font-semibold text-muted-foreground">{tk("inbox.whyLabel")}</div>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.why}</p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-border/70 bg-background/35 p-4">
              <div className="text-xs font-medium text-muted-foreground">{tk("inbox.recommendedAction")}</div>
              <div className="mt-2 text-sm font-semibold text-foreground">{item.actionLabel}</div>
            </div>
            <Link to={sourceRoute} className="rounded-lg border border-border/70 bg-background/35 p-4 transition hover:border-primary/40 hover:bg-primary/5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-medium text-muted-foreground">{tk("inbox.sourceOfTruth")}</div>
                  <div className="mt-2 text-sm font-semibold text-primary">{tk("inbox.openEntity", { entity: entityLabel(item.entityType, tk) })}</div>
                </div>
                <ExternalLink className="h-4 w-4 shrink-0 text-primary" />
              </div>
            </Link>
          </div>

          <ProvenanceLinks {...provenance} />
        </div>

        <div className="flex min-w-0 flex-col justify-between gap-4 border-t border-border pt-5 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
          <div>
            <div className="text-xs font-medium text-muted-foreground">{tk("inbox.priorityScore")}</div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-4xl font-semibold tabular-nums text-primary" aria-label={tk("inbox.priorityAria", { priority: item.priority })}>{item.priority}</span>
              <span className="text-sm text-muted-foreground">/100</span>
            </div>
            <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              {tk("inbox.observed", { age: formatAge(item.ageHours, tk) })}
            </div>
          </div>
          <ActionButton item={item} busy={busy} onRefreshContext={onRefreshContext} size="primary" />
        </div>
      </div>
    </div>
  );
}

function QueueItem({ item, busy, onRefreshContext }: { item: NextActionItem; busy: boolean; onRefreshContext: (item: NextActionItem) => void }) {
  const tk = useTk();
  const provenance = provenanceFromNextAction(item);
  const sourceRoute = provenance.source?.to ?? item.routeTo;

  return (
    <div className="grid gap-3 rounded-lg border border-border bg-background/35 p-4 md:grid-cols-[minmax(0,1fr)_minmax(160px,auto)] md:items-center">
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <EntityTypeBadge type={item.entityType} />
          <StateBadge state={item.abstractState} />
          <StatusBadges item={item} />
        </div>
        <div className="min-w-0">
          <h4 className="line-clamp-2 text-sm font-semibold leading-5 text-foreground">{item.title}</h4>
          <p className="mt-1 line-clamp-3 text-xs leading-5 text-muted-foreground">
            <span className="font-semibold text-foreground/80">{tk("inbox.whyLabel")}</span> {item.why}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {formatAge(item.ageHours, tk)}</span>
          <span>{tk("inbox.priority")} <span className="font-semibold text-foreground">{item.priority}</span></span>
          <Link to={sourceRoute} className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
            {tk("inbox.openSource")} <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
        <ProvenanceLinks {...provenance} />
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
  const tk = useTk();
  const selectCls = "h-10 w-full rounded-md border border-border bg-input px-3 text-sm";

  return (
    <SectionCard title={tk("inbox.filters")} icon={Filter} contentClassName="space-y-4">
      <label className="block space-y-1.5">
        <span className="text-xs font-semibold text-muted-foreground">{tk("inbox.filterRisk")}</span>
        <select className={selectCls} value={riskFilter} onChange={(event) => onRiskChange(event.target.value as RiskFilter)}>
          <option value="ALL">{tk("inbox.allRisks")}</option>
          {RISK_LEVELS.map((risk) => <option key={risk} value={risk}>{tk(`risk.${risk}`)}</option>)}
        </select>
      </label>
      <label className="block space-y-1.5">
        <span className="text-xs font-semibold text-muted-foreground">{tk("inbox.filterEntity")}</span>
        <select className={selectCls} value={entityFilter} onChange={(event) => onEntityChange(event.target.value)}>
          <option value="ALL">{tk("inbox.allEntities")}</option>
          {entityTypes.map((type) => <option key={type} value={type}>{entityLabel(type, tk)}</option>)}
        </select>
      </label>
      <div className="space-y-2">
        <label className="flex items-center gap-2 rounded-lg border border-border bg-background/30 px-3 py-2 text-sm">
          <input type="checkbox" checked={escalatedOnly} onChange={(event) => onEscalatedChange(event.target.checked)} />
          {tk("inbox.escalatedOnly")}
        </label>
        <label className="flex items-center gap-2 rounded-lg border border-border bg-background/30 px-3 py-2 text-sm">
          <input type="checkbox" checked={blockedOnly} onChange={(event) => onBlockedChange(event.target.checked)} />
          {tk("inbox.blockedOnly")}
        </label>
      </div>
      <Button variant="outline" className="h-9 w-full text-xs" onClick={onClear}>{tk("inbox.clearFilters")}</Button>
    </SectionCard>
  );
}

function SourceReferenceCards() {
  const tk = useTk();
  return (
    <PageSection title={tk("inbox.sourceRefTitle")} icon={Layers3}>
      <div className="grid auto-rows-fr gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {SOURCE_LINKS.map((source) => (
          <Link
            key={source.type}
            to={source.to}
            className="flex min-h-[112px] flex-col justify-between rounded-lg border border-border bg-background/35 p-4 transition hover:border-primary/40 hover:bg-primary/5"
          >
            <div className="min-w-0">
              <div className="flex items-center justify-between gap-3">
                <h4 className="font-semibold text-foreground">{tk(`inbox.source.${source.type}.label`)}</h4>
                <ExternalLink className="h-4 w-4 shrink-0 text-primary" />
              </div>
              <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{tk(`inbox.source.${source.type}.desc`)}</p>
            </div>
            <span className="mt-3 text-xs font-semibold text-primary">{tk("inbox.openSource")}</span>
          </Link>
        ))}
      </div>
    </PageSection>
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
  const tk = useTk();
  if (items.length === 0) return null;

  return (
    <div className={cn("rounded-lg border p-3", RISK_SECTION_STYLES[risk])}>
      <div className="mb-3 flex items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-2">
          <RiskBadge riskLevel={risk} />
          <span className="text-sm font-semibold text-foreground">{tk(`inbox.riskGroup.${risk}`)}</span>
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
  const tk = useTk();
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
        setActionWarning(msgs.length > 0 ? msgs[0]! : tk("inbox.contextNotFresh", { status: result.newStatus ?? "unchanged" }));
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
          eyebrow={tk("inbox.eyebrow")}
          title={tk("inbox.title")}
          description={tk("inbox.descriptionShort")}
          action={
            <Button variant="outline" onClick={handleRefresh} disabled={refreshing} className="h-9 px-3 text-xs">
              <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
              {tk("inbox.retry")}
            </Button>
          }
        />
        <SectionCard title={tk("inbox.unavailableTitle")} icon={AlertCircle}>
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4">
            <p className="text-sm font-semibold text-destructive">{tk("inbox.unavailableMessage")}</p>
            <p className="mt-1 text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" onClick={handleRefresh} disabled={refreshing} className="mt-4 h-9 px-3 text-xs">
              <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
              {tk("inbox.retry")}
            </Button>
          </div>
        </SectionCard>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={tk("inbox.eyebrow")}
        title={tk("inbox.title")}
        description={tk("inbox.description")}
        action={
          <Button variant="outline" onClick={handleRefresh} disabled={refreshing} className="h-9 px-3 text-xs">
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
            {refreshing ? tk("inbox.refreshing") : tk("inbox.refresh")}
          </Button>
        }
      />

      {data && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card/40 px-4 py-3 text-xs text-muted-foreground">
          <span>{tk("inbox.computed", { date: formatDate(data.computedAt) })}</span>
          <span>{tk("inbox.noAutoPolling")}</span>
        </div>
      )}

      {actionWarning && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
          {actionWarning}
        </div>
      )}

      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <StatCard title={tk("inbox.stat.pending")} value={summary.totalPending} />
          <StatCard title={tk("inbox.stat.critical")} value={summary.criticalCount} className={summary.criticalCount > 0 ? "border-destructive/40" : undefined} />
          <StatCard title={tk("inbox.stat.high")} value={summary.highCount} className={summary.highCount > 0 ? "border-amber-500/40" : undefined} />
          <StatCard title={tk("inbox.stat.blocked")} value={summary.blockedCount} className={summary.blockedCount > 0 ? "border-destructive/30" : undefined} />
          <StatCard title={tk("inbox.stat.escalated")} value={summary.escalatedCount} className={cn("col-span-2 sm:col-span-1", summary.escalatedCount > 0 && "border-amber-500/30")} />
        </div>
      )}

      {topAction ? (
        <PageSection title={tk("inbox.topActionTitle")} icon={Zap}>
          <TopActionCard
            item={topAction}
            busy={actionBusy[topAction.id] ?? false}
            onRefreshContext={handleContextRefresh}
          />
        </PageSection>
      ) : (
        <EmptyState
          icon={CheckCircle2}
          title={tk("inbox.emptyTitle")}
          description={tk("inbox.emptyDescription")}
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

          <PageSection
            title={tk("inbox.actionQueueTitle", { count: filteredQueue.length })}
            icon={Layers3}
            action={<span className="text-xs text-muted-foreground">{tk("inbox.totalCount", { count: queue.length })}</span>}
          >
            {filteredQueue.length === 0 ? (
              <EmptyState
                icon={Filter}
                title={tk("inbox.noMatchTitle")}
                description={tk("inbox.noMatchDescription")}
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
          </PageSection>
        </div>
      )}
    </div>
  );
}
