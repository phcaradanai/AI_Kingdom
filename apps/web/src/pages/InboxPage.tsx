import { AlertCircle, CheckCircle2, Clock, RefreshCw, Zap } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatCard } from "@/components/ui/StatCard";
import { api } from "@/lib/api";
import { cn, formatDate } from "@/lib/utils";
import type { NextActionItem, NextActionQueueDto } from "@/types/api";

const RISK_COLORS: Record<string, string> = {
  CRITICAL: "border-destructive/50 bg-destructive/10 text-destructive",
  HIGH: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  MEDIUM: "border-primary/30 bg-primary/10 text-primary",
  LOW: "border-border bg-muted/20 text-muted-foreground"
};

const STATE_COLORS: Record<string, string> = {
  AWAITING_DECISION: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  AWAITING_ACTION: "border-blue-500/40 bg-blue-500/10 text-blue-400",
  BLOCKED: "border-destructive/50 bg-destructive/10 text-destructive",
  AWAITING_INPUT: "border-border bg-muted/20 text-muted-foreground"
};

function RiskBadge({ riskLevel }: { riskLevel: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider", RISK_COLORS[riskLevel] ?? RISK_COLORS.LOW)}>
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
      {type}
    </span>
  );
}

function formatAge(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m ago`;
  if (hours < 24) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function TopActionCard({ item }: { item: NextActionItem }) {
  return (
    <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-6 space-y-4 shadow-[0_0_20px_rgba(214,170,87,0.08)]">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2 flex-wrap">
          <RiskBadge riskLevel={item.riskLevel} />
          <EntityTypeBadge type={item.entityType} />
          <StateBadge state={item.abstractState} />
          {item.isEscalated && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/50 bg-amber-500/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-amber-400">
              <AlertCircle className="h-3 w-3" /> Escalated
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-1 shrink-0">
          <span className="font-display text-3xl font-bold text-primary" aria-label={`Priority ${item.priority}`}>{item.priority}</span>
          <span className="text-xs text-muted-foreground">/100</span>
        </div>
      </div>
      <div>
        <h3 className="font-display text-lg font-semibold text-foreground">{item.title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{item.why}</p>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          <Clock className="h-3 w-3" /> {formatAge(item.ageHours)}
        </span>
        <Link to={item.routeTo}>
          <Button className="h-8 px-3 text-xs gap-2">
            <Zap className="h-3.5 w-3.5" />
            {item.actionLabel}
          </Button>
        </Link>
      </div>
    </div>
  );
}

function QueueItem({ item }: { item: NextActionItem }) {
  return (
    <div className="flex items-start gap-4 rounded-xl border border-border bg-card/40 p-4">
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <RiskBadge riskLevel={item.riskLevel} />
          <EntityTypeBadge type={item.entityType} />
          <StateBadge state={item.abstractState} />
          {item.isEscalated && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/50 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-400">
              <AlertCircle className="h-3 w-3" /> Escalated
            </span>
          )}
        </div>
        <h4 className="text-sm font-semibold text-foreground">{item.title}</h4>
        <p className="text-xs text-muted-foreground">{item.why}</p>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {formatAge(item.ageHours)}</span>
          <span>Priority: <span className="font-semibold text-foreground">{item.priority}</span></span>
        </div>
      </div>
      <Link to={item.routeTo} className="shrink-0">
        <Button variant="outline" className="h-8 px-3 gap-1.5 text-xs">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {item.actionLabel}
        </Button>
      </Link>
    </div>
  );
}

export function InboxPage() {
  const [data, setData] = useState<NextActionQueueDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const result = await api.getNextActions();
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

  if (loading) return <LoadingState message="Computing royal priorities..." />;

  if (error) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-destructive">Error: {error}</p>
        <Button variant="outline" onClick={handleRefresh} className="h-8 px-3 text-xs">Retry</Button>
      </div>
    );
  }

  const summary = data?.summary;
  const queue = data?.queue ?? [];
  const topAction = data?.topAction ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Kingdom Inbox"
        title="Kingdom Inbox"
        description="Highest-priority royal actions across the Kingdom"
        action={
          <Button variant="outline" onClick={handleRefresh} disabled={refreshing} className="h-8 px-3 text-xs">
            <RefreshCw className={cn("h-4 w-4 mr-1.5", refreshing && "animate-spin")} />
            {refreshing ? "Refreshing..." : "Refresh"}
          </Button>
        }
      />

      {data && (
        <p className="text-xs text-muted-foreground">
          Computed {formatDate(data.computedAt)}
        </p>
      )}

      {summary && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          <StatCard title="Pending" value={summary.totalPending} />
          <StatCard
            title="Critical"
            value={summary.criticalCount}
            className={summary.criticalCount > 0 ? "border-destructive/40" : undefined}
          />
          <StatCard
            title="High"
            value={summary.highCount}
            className={summary.highCount > 0 ? "border-amber-500/40" : undefined}
          />
          <StatCard title="Blocked" value={summary.blockedCount} />
          <StatCard title="Escalated" value={summary.escalatedCount} />
        </div>
      )}

      {topAction ? (
        <SectionCard title="Top Priority Action" icon={Zap}>
          <TopActionCard item={topAction} />
        </SectionCard>
      ) : (
        <EmptyState
          icon={CheckCircle2}
          title="No pending royal actions"
          description="The Kingdom is in good standing. All items are resolved."
        />
      )}

      {queue.length > 0 && (
        <SectionCard title={`Action Queue (${queue.length})`}>
          <div className="space-y-3">
            {queue.map((item) => (
              <QueueItem key={item.id} item={item} />
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}
