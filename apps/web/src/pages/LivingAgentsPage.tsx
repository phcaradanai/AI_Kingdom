import { Activity, AlertTriangle, CheckCircle2, Clock, ExternalLink, Filter, Search, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AgentPortrait } from "@/components/AgentPortrait";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { api } from "@/lib/api";
import { getProviderDisplayName } from "@/lib/providerDisplay";
import { cn, formatDate } from "@/lib/utils";
import type { AgentActivityStatus, LivingAgentSummaryDto } from "@/types/api";

const KNOWN_STATUSES: AgentActivityStatus[] = [
  "IDLE", "QUEUED", "THINKING", "WAITING_PROVIDER", "RESPONDING",
  "SUMMARIZING", "EXTRACTING_MEMORY", "GENERATING_REPORT", "COMPLETED", "FAILED"
];

function toPortraitStatus(status: string): AgentActivityStatus {
  return KNOWN_STATUSES.includes(status as AgentActivityStatus) ? (status as AgentActivityStatus) : "IDLE";
}

function AttributionBadge({ trusted, legacy }: { trusted: number; legacy: number }) {
  if (trusted > 0 && legacy === 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
        <CheckCircle2 className="h-3 w-3" /> Verified
      </span>
    );
  }
  if (legacy > 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold text-amber-400">
        <AlertTriangle className="h-3 w-3" /> Legacy
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-muted-foreground/20 bg-muted/30 px-2 py-0.5 text-[10px] text-muted-foreground">
      No traces
    </span>
  );
}

function StatusDot({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    IDLE: "bg-muted-foreground/40",
    COMPLETED: "bg-emerald-400",
    FAILED: "bg-destructive",
    STALE: "bg-amber-400",
  };
  const activeStatuses = ["QUEUED", "THINKING", "WAITING_PROVIDER", "RESPONDING", "SUMMARIZING", "EXTRACTING_MEMORY", "GENERATING_REPORT"];
  const color = colorMap[status] ?? (activeStatuses.includes(status) ? "bg-primary animate-pulse" : "bg-muted-foreground/40");
  return <span className={cn("inline-block h-2 w-2 rounded-full", color)} />;
}

export function LivingAgentsPage() {
  const [agents, setAgents] = useState<LivingAgentSummaryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [attributionFilter, setAttributionFilter] = useState("all");

  useEffect(() => {
    setLoading(true);
    api
      .getLivingAgents()
      .then(({ agents }) => setAgents(agents))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = agents.filter((a) => {
    const matchesSearch =
      !search ||
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.title.toLowerCase().includes(search.toLowerCase()) ||
      a.role.toLowerCase().includes(search.toLowerCase());

    const activeStatuses = ["QUEUED", "THINKING", "WAITING_PROVIDER", "RESPONDING", "SUMMARIZING", "EXTRACTING_MEMORY", "GENERATING_REPORT"];
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && activeStatuses.includes(a.currentStatus)) ||
      (statusFilter === "idle" && a.currentStatus === "IDLE") ||
      (statusFilter === "completed" && a.currentStatus === "COMPLETED") ||
      (statusFilter === "failed" && a.currentStatus === "FAILED");

    const matchesAttribution =
      attributionFilter === "all" ||
      (attributionFilter === "trusted" && a.trustedTraceCount > 0) ||
      (attributionFilter === "legacy" && a.legacyUnattributedCount > 0);

    return matchesSearch && matchesStatus && matchesAttribution;
  });

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/30 bg-primary/10">
            <Activity className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="font-display text-3xl font-bold tracking-wide text-foreground">Living Agents</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Observe every royal agent's activity, traces, usage, and relationships.
            </p>
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
            placeholder="Search agents..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <select
            className="h-9 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="idle">Idle</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
          </select>
          <select
            className="h-9 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
            value={attributionFilter}
            onChange={(e) => setAttributionFilter(e.target.value)}
          >
            <option value="all">All attribution</option>
            <option value="trusted">Verified only</option>
            <option value="legacy">Has legacy</option>
          </select>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <LoadingState message="Loading living agents..." />
      ) : error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-sm text-destructive">{error}</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Activity} title="No agents found" description="Try adjusting your filters." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      )}
    </div>
  );
}

function AgentCard({ agent }: { agent: LivingAgentSummaryDto }) {
  const portraitStatus = toPortraitStatus(agent.currentStatus);
  const topProvider = agent.providerSummary[0];

  return (
    <div className="group relative flex flex-col gap-4 rounded-2xl border border-border/60 bg-card/60 p-5 backdrop-blur-sm transition-all hover:border-primary/30 hover:bg-card/80">
      {/* Header */}
      <div className="flex items-start gap-4">
        <AgentPortrait agent={agent} size="md" status={portraitStatus} showStatusRing />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <StatusDot status={agent.currentStatus} />
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
              {agent.currentStatus.replace("_", " ")}
            </span>
          </div>
          <div className="mt-0.5 truncate font-display text-base font-semibold text-foreground">{agent.title}</div>
          <div className="truncate text-xs text-muted-foreground">{agent.name} · {agent.role}</div>
        </div>
      </div>

      {/* Last activity */}
      <div className="text-xs text-muted-foreground">
        {agent.lastActivityTitle ? (
          <span className="truncate block">
            <span className="text-foreground/70">Last:</span> {agent.lastActivityTitle}
          </span>
        ) : (
          <span className="italic">No recorded activity</span>
        )}
        {agent.lastActivityAt && (
          <span className="mt-0.5 block text-[11px]">
            <Clock className="inline h-3 w-3 mr-0.5 -mt-0.5" />
            {formatDate(agent.lastActivityAt)}
          </span>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-muted/30 p-2">
          <div className="text-sm font-bold text-foreground">{agent.totalCalls}</div>
          <div className="text-[10px] text-muted-foreground">Calls</div>
        </div>
        <div className="rounded-lg bg-muted/30 p-2">
          <div className="text-sm font-bold text-foreground">{formatTokens(agent.tokensToday)}</div>
          <div className="text-[10px] text-muted-foreground">Tokens today</div>
        </div>
        <div className="rounded-lg bg-muted/30 p-2">
          <div className="text-sm font-bold text-foreground">${agent.costToday.toFixed(4)}</div>
          <div className="text-[10px] text-muted-foreground">Cost today</div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AttributionBadge trusted={agent.trustedTraceCount} legacy={agent.legacyUnattributedCount} />
          {topProvider && (
            <span className="inline-flex items-center gap-1 rounded-full border border-muted-foreground/20 bg-muted/20 px-2 py-0.5 text-[10px] text-muted-foreground">
              <Zap className="h-2.5 w-2.5" />
              {getProviderDisplayName(topProvider.provider)}
            </span>
          )}
        </div>
        <Link
          to={`/living-agents/${agent.id}`}
          className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-transparent px-2.5 text-xs font-semibold text-foreground transition hover:bg-muted"
        >
          Profile <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
