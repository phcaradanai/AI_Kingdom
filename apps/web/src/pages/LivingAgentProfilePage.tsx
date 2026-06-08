import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  Clock,
  Cpu,
  ExternalLink,
  Eye,
  FileText,
  FolderKanban,
  Network,
  ScrollText,
  Shield,
  Sparkles,
  Vault,
  Zap
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AgentPortrait } from "@/components/AgentPortrait";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { api } from "@/lib/api";
import { getModelDisplayName, getProviderDisplayName } from "@/lib/providerDisplay";
import { cn, formatDate } from "@/lib/utils";
import type {
  AgentActivityStatus,
  KnowledgeCandidateDto,
  KnowledgeMemoryDto,
  LivingAgentProfileDto,
  LivingAgentRelationsDto,
  LivingAgentTimelineFilters,
  LivingAgentTimelineItemDto
} from "@/types/api";

const KNOWN_STATUSES: AgentActivityStatus[] = [
  "IDLE", "QUEUED", "THINKING", "WAITING_PROVIDER", "RESPONDING",
  "SUMMARIZING", "EXTRACTING_MEMORY", "GENERATING_REPORT", "COMPLETED", "FAILED"
];

function toPortraitStatus(status: string): AgentActivityStatus {
  return KNOWN_STATUSES.includes(status as AgentActivityStatus) ? (status as AgentActivityStatus) : "IDLE";
}

type Tab = "overview" | "timeline" | "usage" | "traces" | "relations" | "council" | "reports" | "memory" | "knowledge" | "projects" | "providers" | "audit";

const TABS: { id: Tab; label: string; icon: typeof Activity }[] = [
  { id: "overview", label: "Overview", icon: Eye },
  { id: "timeline", label: "Activity Timeline", icon: Activity },
  { id: "usage", label: "Usage & Cost", icon: BarChart3 },
  { id: "traces", label: "Traces", icon: Zap },
  { id: "relations", label: "Relations", icon: Network },
  { id: "council", label: "Council Work", icon: ScrollText },
  { id: "reports", label: "Reports", icon: FileText },
  { id: "memory", label: "Memory", icon: Vault },
  { id: "knowledge", label: "Knowledge", icon: Sparkles },
  { id: "projects", label: "Projects", icon: FolderKanban },
  { id: "providers", label: "Provider / Model", icon: Cpu },
  { id: "audit", label: "Audit", icon: Shield }
];

function AttributionBadge({ status }: { status: string }) {
  if (status === "TRUSTED") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
        <CheckCircle2 className="h-3 w-3" /> Verified
      </span>
    );
  }
  if (status === "PARTIAL") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-blue-400/30 bg-blue-400/10 px-2 py-0.5 text-[10px] font-semibold text-blue-400">
        <AlertTriangle className="h-3 w-3" /> Partial
      </span>
    );
  }
  if (status === "LEGACY_UNATTRIBUTED") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold text-amber-400">
        <AlertTriangle className="h-3 w-3" /> Legacy / source unknown
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-muted-foreground/20 bg-muted/30 px-2 py-0.5 text-[10px] text-muted-foreground">
      Unknown source
    </span>
  );
}

function TimelineItem({ item }: { item: LivingAgentTimelineItemDto }) {
  const isLegacy = item.attributionStatus === "LEGACY_UNATTRIBUTED";
  const sourceLabel: Record<string, string> = {
    TRACE_STEP: "Trace Step",
    TRACE: "Trace",
    USAGE_RECORD: "Usage Record",
    AGENT_ACTIVITY: "Activity",
    COUNCIL_RESPONSE: "Council"
  };

  return (
    <div className={cn(
      "rounded-xl border p-4 transition-all",
      isLegacy ? "border-amber-400/20 bg-amber-400/5" : "border-border/50 bg-card/50"
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <AttributionBadge status={item.attributionStatus} />
            <span className="rounded-full border border-muted-foreground/20 bg-muted/20 px-2 py-0.5 text-[10px] text-muted-foreground">
              {sourceLabel[item.type] ?? item.type}
            </span>
            {item.provider && (
              <span className="rounded-full border border-muted-foreground/10 bg-muted/10 px-2 py-0.5 text-[10px] text-muted-foreground">
                {getProviderDisplayName(item.provider)}{item.model ? ` · ${getModelDisplayName(item.model)}` : ""}
              </span>
            )}
          </div>
          <div className="font-medium text-sm text-foreground truncate">{item.title}</div>
          {item.detail && <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.detail}</div>}
          {isLegacy && (
            <div className="mt-1 text-[10px] text-amber-400/80 italic">
              This record was created before trace attribution was available.
            </div>
          )}
          {item.tokensUsed != null && (
            <div className="mt-1.5 flex items-center gap-3 text-[11px] text-muted-foreground">
              <span>{item.tokensUsed.toLocaleString()} tokens</span>
              {item.estimatedCostUSD != null && <span>${item.estimatedCostUSD.toFixed(5)}</span>}
            </div>
          )}
          {item.promptPreview && (
            <div className="mt-2 rounded-lg border border-muted/30 bg-muted/10 p-2 text-[11px] text-muted-foreground font-mono line-clamp-2">
              <span className="text-primary/60 font-bold">Prompt: </span>{item.promptPreview}
            </div>
          )}
          {item.responsePreview && (
            <div className="mt-1 rounded-lg border border-muted/30 bg-muted/10 p-2 text-[11px] text-muted-foreground font-mono line-clamp-2">
              <span className="text-emerald-400/60 font-bold">Response: </span>{item.responsePreview}
            </div>
          )}
        </div>
        <div className="shrink-0 text-right text-[11px] text-muted-foreground">
          <div>{formatDate(item.timestamp)}</div>
          <div className="mt-0.5 uppercase tracking-wider text-[10px]">{item.status}</div>
        </div>
      </div>

      {/* Action links */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {item.links.trace ? (
          <Link to={item.links.trace} className="inline-flex items-center gap-1 rounded-md border border-primary/20 bg-primary/5 px-2 py-0.5 text-[11px] text-primary hover:bg-primary/10 transition-colors">
            <Zap className="h-2.5 w-2.5" /> View Trace
          </Link>
        ) : null}
        {item.links.task ? (
          <Link to={item.links.task} className="inline-flex items-center gap-1 rounded-md border border-muted-foreground/20 bg-muted/10 px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted/20 transition-colors">
            <ScrollText className="h-2.5 w-2.5" /> View Task
          </Link>
        ) : null}
        {item.links.council ? (
          <Link to={item.links.council} className="inline-flex items-center gap-1 rounded-md border border-muted-foreground/20 bg-muted/10 px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted/20 transition-colors">
            <ScrollText className="h-2.5 w-2.5" /> View Council
          </Link>
        ) : null}
        {item.links.report ? (
          <Link to={item.links.report} className="inline-flex items-center gap-1 rounded-md border border-muted-foreground/20 bg-muted/10 px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted/20 transition-colors">
            <FileText className="h-2.5 w-2.5" /> View Report
          </Link>
        ) : null}
        {item.links.project ? (
          <Link to={item.links.project} className="inline-flex items-center gap-1 rounded-md border border-muted-foreground/20 bg-muted/10 px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted/20 transition-colors">
            <FolderKanban className="h-2.5 w-2.5" /> View Project
          </Link>
        ) : null}
        {!item.links.trace && !item.links.task && !item.links.council && !item.links.report && !item.links.project && (
          <span className="text-[11px] text-muted-foreground/60 italic">No verified source link</span>
        )}
      </div>
    </div>
  );
}

export function LivingAgentProfilePage() {
  const { agentId } = useParams<{ agentId: string }>();
  const [profile, setProfile] = useState<LivingAgentProfileDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  const [timelineItems, setTimelineItems] = useState<LivingAgentTimelineItemDto[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineFilters, setTimelineFilters] = useState<LivingAgentTimelineFilters>({ limit: 50 });

  const [relations, setRelations] = useState<LivingAgentRelationsDto | null>(null);
  const [relationsLoading, setRelationsLoading] = useState(false);

  useEffect(() => {
    if (!agentId) return;
    setLoading(true);
    api
      .getLivingAgentProfile(agentId)
      .then(({ profile }) => {
        setProfile(profile);
        setTimelineItems(profile.recentTimeline);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [agentId]);

  useEffect(() => {
    if (activeTab !== "timeline" || !agentId) return;
    setTimelineLoading(true);
    api
      .getLivingAgentTimeline(agentId, timelineFilters)
      .then(({ items }) => setTimelineItems(items))
      .catch(() => undefined)
      .finally(() => setTimelineLoading(false));
  }, [activeTab, agentId, timelineFilters]);

  useEffect(() => {
    if (activeTab !== "relations" || !agentId || relations) return;
    setRelationsLoading(true);
    api
      .getLivingAgentRelations(agentId)
      .then(({ relations }) => setRelations(relations))
      .catch(() => undefined)
      .finally(() => setRelationsLoading(false));
  }, [activeTab, agentId, relations]);

  if (loading) return <LoadingState message="Loading agent profile..." />;
  if (error || !profile) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-sm text-destructive">
        {error ?? "Agent not found"}
      </div>
    );
  }

  const { agent } = profile;
  const portraitStatus = toPortraitStatus(agent.currentStatus);

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link to="/living-agents" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" /> Living Agents
      </Link>

      {/* Header card */}
      <div className="rounded-2xl border border-border/60 bg-card/60 p-6 backdrop-blur-sm">
        <div className="flex flex-col sm:flex-row gap-6 items-start">
          <AgentPortrait agent={agent} size="hero" shape="portrait-card" status={portraitStatus} showStatusRing clickToView />
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold">{agent.role}</span>
              {!agent.isActive && (
                <span className="rounded-full border border-muted-foreground/30 bg-muted/30 px-2 py-0.5 text-[10px] text-muted-foreground">Inactive</span>
              )}
            </div>
            <h1 className="font-display text-2xl font-bold text-foreground">{agent.displayTitle ?? agent.canonicalTitle ?? agent.title}</h1>
            <div className="text-sm text-muted-foreground">{agent.displayName ?? agent.canonicalName ?? agent.name} · {agent.specialty}</div>

            <div className="mt-4 flex flex-wrap gap-3">
              <div className="flex items-center gap-1.5 text-sm">
                <div className={cn(
                  "h-2.5 w-2.5 rounded-full",
                  agent.currentStatus === "IDLE" ? "bg-muted-foreground/40" :
                  ["QUEUED","THINKING","WAITING_PROVIDER","RESPONDING","SUMMARIZING","EXTRACTING_MEMORY","GENERATING_REPORT"].includes(agent.currentStatus) ? "bg-primary animate-pulse" :
                  agent.currentStatus === "COMPLETED" ? "bg-emerald-400" :
                  agent.currentStatus === "FAILED" ? "bg-destructive" : "bg-muted-foreground/40"
                )} />
                <span className="text-muted-foreground">{agent.currentStatus.replace("_", " ")}</span>
              </div>
              {agent.defaultModel && (
                <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                  <Cpu className="h-3.5 w-3.5" /> {agent.defaultModel}
                </span>
              )}
              {agent.lastActivityAt && (
                <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" /> Last active {formatDate(agent.lastActivityAt)}
                </span>
              )}
            </div>

            {/* Trust summary */}
            <div className="mt-3 flex flex-wrap gap-2">
              {agent.trustedTraceCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">
                  <CheckCircle2 className="h-3 w-3" /> {agent.trustedTraceCount} verified traces
                </span>
              )}
              {agent.legacyUnattributedCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-0.5 text-xs font-semibold text-amber-400">
                  <AlertTriangle className="h-3 w-3" /> {agent.legacyUnattributedCount} legacy records
                </span>
              )}
              {agent.totalCalls > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full border border-muted-foreground/20 bg-muted/20 px-2.5 py-0.5 text-xs text-muted-foreground">
                  {agent.totalCalls} total calls
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border/50 overflow-x-auto scrollbar-none">
        <nav className="flex gap-0.5 pb-0">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-1.5 shrink-0 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
              )}
            >
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      <div className="min-h-64">
        {activeTab === "overview" && <OverviewTab profile={profile} onSwitchTab={setActiveTab} />}
        {activeTab === "timeline" && (
          <TimelineTab
            agentId={agent.id}
            items={timelineItems}
            loading={timelineLoading}
            filters={timelineFilters}
            onFiltersChange={setTimelineFilters}
          />
        )}
        {activeTab === "usage" && <UsageTab profile={profile} />}
        {activeTab === "traces" && <TracesTab profile={profile} />}
        {activeTab === "relations" && <RelationsTab relations={relations} loading={relationsLoading} />}
        {activeTab === "council" && <CouncilTab profile={profile} />}
        {activeTab === "reports" && <ReportsTab profile={profile} />}
        {activeTab === "memory" && <MemoryTab profile={profile} />}
        {activeTab === "knowledge" && <KnowledgeTab agentId={agentId ?? ""} />}
        {activeTab === "projects" && <ProjectsTab profile={profile} />}
        {activeTab === "providers" && <ProvidersTab profile={profile} />}
        {activeTab === "audit" && <AuditTab profile={profile} />}
      </div>
    </div>
  );
}

function OverviewTab({ profile, onSwitchTab }: { profile: LivingAgentProfileDto; onSwitchTab: (tab: Tab) => void }) {
  const { agent, currentActivity, usageSummary, traceSummary } = profile;

  return (
    <div className="space-y-6">
      {/* Current activity */}
      {currentActivity && (
        <div className={cn(
          "rounded-xl border p-4",
          currentActivity.isStale ? "border-amber-400/30 bg-amber-400/5" : "border-primary/20 bg-primary/5"
        )}>
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-4 w-4 text-primary animate-pulse" />
            <span className="text-sm font-semibold text-primary">Current Activity</span>
            {currentActivity.isStale && (
              <span className="text-[10px] text-amber-400 border border-amber-400/30 bg-amber-400/10 rounded-full px-2 py-0.5">Stale heartbeat</span>
            )}
          </div>
          <div className="text-sm font-medium">{currentActivity.title}</div>
          {currentActivity.detail && <div className="text-xs text-muted-foreground mt-0.5">{currentActivity.detail}</div>}
          <div className="mt-2 flex gap-3 text-xs text-muted-foreground">
            <span>{currentActivity.status}</span>
            {currentActivity.providerName && <span>{getProviderDisplayName(currentActivity.providerName)}{currentActivity.model ? ` · ${getModelDisplayName(currentActivity.model)}` : ""}</span>}
            {currentActivity.startedAt && <span>Started {formatDate(currentActivity.startedAt)}</span>}
          </div>
        </div>
      )}

      {!currentActivity && agent.totalCalls === 0 && (
        <div className="rounded-xl border border-muted/30 bg-muted/10 p-6 text-center text-sm text-muted-foreground">
          <Activity className="mx-auto h-8 w-8 mb-2 opacity-30" />
          No recorded activity yet. This agent has not been called.
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Total Calls", value: usageSummary.totalCalls.toLocaleString() },
          { label: "Total Tokens", value: formatTokens(usageSummary.totalTokens) },
          { label: "Total Cost", value: `$${usageSummary.totalEstimatedCostUSD.toFixed(4)}` },
          { label: "Verified Traces", value: traceSummary.trustedCount.toString() }
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-border/50 bg-card/50 p-4 text-center">
            <div className="text-xl font-bold font-display text-foreground">{stat.value}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Description */}
      {agent.description && (
        <div className="rounded-xl border border-border/40 bg-card/40 p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Description</div>
          <div className="text-sm text-foreground/80">{agent.description}</div>
        </div>
      )}

      {/* Quick links to other tabs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {([
          { tab: "timeline" as Tab, label: "Activity Timeline", icon: Activity },
          { tab: "usage" as Tab, label: "Usage & Cost", icon: BarChart3 },
          { tab: "traces" as Tab, label: "Traces", icon: Zap },
          { tab: "relations" as Tab, label: "Relations", icon: Network }
        ] as const).map(({ tab, label, icon: Icon }) => (
          <button
            key={tab}
            onClick={() => onSwitchTab(tab)}
            className="flex items-center gap-2 rounded-xl border border-border/50 bg-card/50 p-3 text-sm text-muted-foreground transition-all hover:border-primary/30 hover:bg-card/80 hover:text-foreground text-left"
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
            <ChevronRight className="ml-auto h-3.5 w-3.5" />
          </button>
        ))}
      </div>
    </div>
  );
}

function TimelineTab({
  items,
  loading,
  filters,
  onFiltersChange
}: {
  agentId: string;
  items: LivingAgentTimelineItemDto[];
  loading: boolean;
  filters: LivingAgentTimelineFilters;
  onFiltersChange: (f: LivingAgentTimelineFilters) => void;
}) {
  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <select
          className="h-8 rounded-lg border border-border bg-background px-3 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
          value={filters.attributionStatus ?? ""}
          onChange={(e) => onFiltersChange({ ...filters, attributionStatus: e.target.value || undefined })}
        >
          <option value="">All attribution</option>
          <option value="TRUSTED">Verified only</option>
          <option value="PARTIAL">Partial</option>
          <option value="LEGACY_UNATTRIBUTED">Legacy</option>
        </select>
        <select
          className="h-8 rounded-lg border border-border bg-background px-3 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
          value={filters.limit ?? 50}
          onChange={(e) => onFiltersChange({ ...filters, limit: Number(e.target.value) })}
        >
          <option value={20}>20 items</option>
          <option value={50}>50 items</option>
          <option value={100}>100 items</option>
        </select>
      </div>

      {loading ? (
        <LoadingState message="Loading timeline..." />
      ) : items.length === 0 ? (
        <EmptyState icon={Activity} title="No timeline items" description="No activity recorded for this agent with the current filters." />
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <TimelineItem key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function UsageTab({ profile }: { profile: LivingAgentProfileDto }) {
  const { usageSummary, agent } = profile;

  if (usageSummary.totalCalls === 0) {
    return <EmptyState icon={BarChart3} title="No usage data" description="This agent has no recorded usage." />;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {[
          { label: "Total Calls", value: usageSummary.totalCalls.toLocaleString() },
          { label: "Total Tokens", value: formatTokens(usageSummary.totalTokens) },
          { label: "Total Cost", value: `$${usageSummary.totalEstimatedCostUSD.toFixed(4)}` },
          { label: "Calls Today", value: usageSummary.callsToday.toString() },
          { label: "Tokens Today", value: formatTokens(usageSummary.tokensToday) },
          { label: "Cost Today", value: `$${usageSummary.costToday.toFixed(5)}` }
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-border/50 bg-card/50 p-4 text-center">
            <div className="text-xl font-bold font-display text-foreground">{stat.value}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{stat.label}</div>
          </div>
        ))}
      </div>

      {usageSummary.byProvider.length > 0 && (
        <div className="rounded-xl border border-border/50 bg-card/50 p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">By Provider / Model</div>
          <div className="divide-y divide-border/30">
            {usageSummary.byProvider.map((row, i) => (
              <div key={i} className="flex items-center justify-between py-2.5 text-sm">
                <div>
                  <span className="font-medium text-foreground">{getProviderDisplayName(row.provider)}</span>
                  <span className="text-muted-foreground"> · {getModelDisplayName(row.model)}</span>
                </div>
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span>{row.callCount} calls</span>
                  <span>{formatTokens(row.totalTokens)} tokens</span>
                  <span className="text-foreground">${row.totalCostUSD.toFixed(4)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {agent.topOperations.length > 0 && (
        <div className="rounded-xl border border-border/50 bg-card/50 p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Top Operations</div>
          <div className="space-y-2">
            {agent.topOperations.map((op, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="text-foreground font-mono text-xs">{op.operation}</span>
                <span className="text-muted-foreground">{op.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TracesTab({ profile }: { profile: LivingAgentProfileDto }) {
  const { traceSummary } = profile;

  if (traceSummary.totalCount === 0) {
    return <EmptyState icon={Zap} title="No traces" description="No AI usage traces found for this agent." />;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Total Traces", value: traceSummary.totalCount, color: "text-foreground" },
          { label: "Verified", value: traceSummary.trustedCount, color: "text-emerald-400" },
          { label: "Partial", value: traceSummary.partialCount, color: "text-blue-400" },
          { label: "Legacy", value: traceSummary.legacyUnattributedCount, color: "text-amber-400" }
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-border/50 bg-card/50 p-4 text-center">
            <div className={cn("text-xl font-bold font-display", stat.color)}>{stat.value}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{stat.label}</div>
          </div>
        ))}
      </div>
      {traceSummary.legacyUnattributedCount > 0 && (
        <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            <span className="text-sm font-semibold text-amber-400">Legacy / Unattributed Records</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {traceSummary.legacyUnattributedCount} records were created before trace attribution was available. They are preserved and labeled here but cannot be fully linked to their source.
          </p>
        </div>
      )}
    </div>
  );
}

function RelationsTab({ relations, loading }: { relations: LivingAgentRelationsDto | null; loading: boolean }) {
  if (loading) return <LoadingState message="Loading relations..." />;
  if (!relations) return <EmptyState icon={Network} title="No relations" description="No relationship data found." />;

  const { nodes } = relations;
  const sections = [
    { label: "Projects", items: nodes.projects, icon: FolderKanban, link: (id: string) => `/projects/${id}`, getText: (item: { name: string }) => item.name },
    { label: "Council Sessions", items: nodes.councilSessions, icon: ScrollText, link: () => "/council", getText: (item: { id: string; status: string; createdAt: string }) => `${item.status} · ${formatDate(item.createdAt)}` },
    { label: "Traces", items: nodes.usageTraces, icon: Zap, link: (id: string, item?: { traceId?: string }) => item?.traceId ? `/usage-traces/${item.traceId}` : "/treasury", getText: (item: { operation: string; status: string }) => `${item.operation} · ${item.status}` },
    { label: "Reports", items: nodes.reports, icon: FileText, link: () => "/reports", getText: (item: { title: string }) => item.title },
    { label: "Memories", items: nodes.memories, icon: Vault, link: () => "/memory", getText: (item: { title: string }) => item.title },
    { label: "Providers / Models", items: nodes.providers, icon: Cpu, link: () => "/providers", getText: (item: { provider: string; model: string; callCount: number }) => `${getProviderDisplayName(item.provider)} · ${getModelDisplayName(item.model)} (${item.callCount} calls)` }
  ] as const;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((section) => (
          <div key={section.label} className="rounded-xl border border-border/50 bg-card/50 p-4">
            <div className="flex items-center gap-2 mb-3">
              <section.icon className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{section.label}</span>
              <span className="ml-auto rounded-full bg-muted/50 px-2 py-0.5 text-[11px] text-muted-foreground">{section.items.length}</span>
            </div>
            {section.items.length === 0 ? (
              <div className="text-xs text-muted-foreground/60 italic">None linked</div>
            ) : (
              <div className="space-y-1.5">
                {(section.items as unknown[]).slice(0, 6).map((item, i) => {
                  const id = (item as { id?: string }).id ?? String(i);
                  const text = section.getText(item as never);
                  const href = section.link(id, item as never);
                  return (
                    <Link
                      key={id}
                      to={href}
                      className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted/30 hover:text-foreground transition-colors"
                    >
                      <ChevronRight className="h-3 w-3 shrink-0" />
                      <span className="truncate">{text}</span>
                      <ExternalLink className="ml-auto h-2.5 w-2.5 shrink-0 opacity-50" />
                    </Link>
                  );
                })}
                {section.items.length > 6 && (
                  <div className="text-[10px] text-muted-foreground/60 text-center pt-1">
                    +{section.items.length - 6} more
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function CouncilTab({ profile }: { profile: LivingAgentProfileDto }) {
  if (profile.relatedCouncilSessions.length === 0) {
    return <EmptyState icon={ScrollText} title="No council sessions" description="This agent has not participated in any council sessions." />;
  }
  return (
    <div className="space-y-2">
      {profile.relatedCouncilSessions.map((cs) => (
        <Link key={cs.id} to="/council" className="flex items-center justify-between rounded-xl border border-border/50 bg-card/50 p-4 hover:border-primary/30 transition-colors">
          <div>
            <div className="text-sm font-medium text-foreground">Council Session</div>
            <div className="text-xs text-muted-foreground mt-0.5">Status: {cs.status} · {formatDate(cs.createdAt)}</div>
          </div>
          <ExternalLink className="h-4 w-4 text-muted-foreground" />
        </Link>
      ))}
    </div>
  );
}

function ReportsTab({ profile }: { profile: LivingAgentProfileDto }) {
  if (profile.relatedReports.length === 0) {
    return <EmptyState icon={FileText} title="No reports" description="No reports linked to this agent." />;
  }
  return (
    <div className="space-y-2">
      {profile.relatedReports.map((r) => (
        <Link key={r.id} to="/reports" className="flex items-center justify-between rounded-xl border border-border/50 bg-card/50 p-4 hover:border-primary/30 transition-colors">
          <div>
            <div className="text-sm font-medium text-foreground">{r.title}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{r.category} · {formatDate(r.createdAt)}</div>
          </div>
          <ExternalLink className="h-4 w-4 text-muted-foreground" />
        </Link>
      ))}
    </div>
  );
}

function MemoryTab({ profile }: { profile: LivingAgentProfileDto }) {
  if (profile.relatedMemories.length === 0) {
    return <EmptyState icon={Vault} title="No memories" description="No memory records linked to this agent's council sessions." />;
  }
  return (
    <div className="space-y-2">
      {profile.relatedMemories.map((m) => (
        <Link key={m.id} to="/memory" className="flex items-center justify-between rounded-xl border border-border/50 bg-card/50 p-4 hover:border-primary/30 transition-colors">
          <div>
            <div className="text-sm font-medium text-foreground">{m.title}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{m.type} · {formatDate(m.createdAt)}</div>
          </div>
          <ExternalLink className="h-4 w-4 text-muted-foreground" />
        </Link>
      ))}
    </div>
  );
}

function ProjectsTab({ profile }: { profile: LivingAgentProfileDto }) {
  if (profile.relatedProjects.length === 0) {
    return <EmptyState icon={FolderKanban} title="No projects" description="No projects linked to this agent." />;
  }
  return (
    <div className="space-y-2">
      {profile.relatedProjects.map((p) => (
        <Link key={p.id} to={`/projects/${p.id}`} className="flex items-center justify-between rounded-xl border border-border/50 bg-card/50 p-4 hover:border-primary/30 transition-colors">
          <div className="text-sm font-medium text-foreground">{p.name}</div>
          <ExternalLink className="h-4 w-4 text-muted-foreground" />
        </Link>
      ))}
    </div>
  );
}

function ProvidersTab({ profile }: { profile: LivingAgentProfileDto }) {
  if (profile.providerModelSummary.length === 0) {
    return <EmptyState icon={Cpu} title="No provider data" description="No provider or model usage recorded." />;
  }
  return (
    <div className="rounded-xl border border-border/50 bg-card/50 p-4">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Provider / Model Usage</div>
      <div className="divide-y divide-border/30">
        {profile.providerModelSummary.map((row, i) => (
          <div key={i} className="flex items-center justify-between py-3 text-sm">
            <div>
              <span className="font-medium text-foreground">{getProviderDisplayName(row.provider)}</span>
              <span className="text-muted-foreground ml-1">· {getModelDisplayName(row.model)}</span>
            </div>
            <div className="flex gap-4 text-xs text-muted-foreground">
              <span>{row.callCount} calls</span>
              <span className="text-foreground">${row.totalCostUSD.toFixed(4)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AuditTab({ profile }: { profile: LivingAgentProfileDto }) {
  if (profile.auditSummary.length === 0) {
    return <EmptyState icon={Shield} title="No audit logs" description="No configuration changes recorded for this agent." />;
  }
  return (
    <div className="space-y-2">
      {profile.auditSummary.map((log, i) => (
        <div key={i} className="rounded-xl border border-border/50 bg-card/50 p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground font-mono">{log.action}</span>
            <span className="text-xs text-muted-foreground">{formatDate(log.createdAt)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function KnowledgeTab({ agentId }: { agentId: string }) {
  const [candidates, setCandidates] = useState<KnowledgeCandidateDto[]>([]);
  const [memories, setMemories] = useState<KnowledgeMemoryDto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!agentId) return;
    setLoading(true);
    Promise.all([
      api.agentKnowledgeCandidates(agentId).catch(() => ({ candidates: [] })),
      api.agentKnowledgeMemories(agentId).catch(() => ({ memories: [] }))
    ]).then(([c, m]) => {
      setCandidates(c.candidates);
      setMemories(m.memories);
    }).finally(() => setLoading(false));
  }, [agentId]);

  if (loading) return <LoadingState message="Loading knowledge..." />;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber-400" />
          Knowledge Candidates ({candidates.length})
        </h3>
        {candidates.length === 0 ? (
          <div className="rounded-xl border border-border/40 bg-muted/10 p-4 text-sm text-muted-foreground">
            No candidates proposed by this agent.
          </div>
        ) : (
          <div className="space-y-2">
            {candidates.slice(0, 10).map((c) => (
              <div key={c.id} className="rounded-xl border border-border/50 bg-card/50 p-4">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className={cn(
                    "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                    c.status === "PENDING" ? "text-amber-400 border-amber-400/30 bg-amber-400/10" :
                    c.status === "APPROVED" ? "text-emerald-400 border-emerald-400/30 bg-emerald-400/10" :
                    "text-muted-foreground border-muted-foreground/20 bg-muted/20"
                  )}>{c.status}</span>
                  <span className="text-[10px] text-muted-foreground">{c.category.replace(/_/g, " ")}</span>
                </div>
                <div className="text-sm font-medium text-foreground">{c.title}</div>
                <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{c.content}</div>
                <div className="flex flex-wrap gap-3 mt-2 text-[11px] text-muted-foreground">
                  {c.traceId && (
                    <Link to={`/usage-traces/${c.traceId}`} className="flex items-center gap-1 hover:text-primary">
                      <ExternalLink className="h-3 w-3" /> Trace
                    </Link>
                  )}
                  {c.taskId && <span>Task: {c.taskId.slice(-8)}</span>}
                  <span>{formatDate(c.createdAt)}</span>
                </div>
              </div>
            ))}
            {candidates.length > 10 && (
              <Link to={`/knowledge-lab/candidates?agentId=${agentId}`} className="block text-center text-xs text-primary hover:underline py-2">
                View all {candidates.length} candidates
              </Link>
            )}
          </div>
        )}
      </div>

      <div>
        <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          Approved Memories ({memories.length})
        </h3>
        {memories.length === 0 ? (
          <div className="rounded-xl border border-border/40 bg-muted/10 p-4 text-sm text-muted-foreground">
            No approved memories for this agent.
          </div>
        ) : (
          <div className="space-y-2">
            {memories.slice(0, 10).map((m) => (
              <div key={m.id} className="rounded-xl border border-border/50 bg-card/50 p-4">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-[10px] text-emerald-400 font-semibold">{m.trustLevel}</span>
                  <span className="text-[10px] text-muted-foreground">{m.category.replace(/_/g, " ")}</span>
                  {m.useCount > 0 && <span className="text-[10px] text-muted-foreground">Used {m.useCount}×</span>}
                </div>
                <div className="text-sm font-medium text-foreground">{m.title}</div>
                <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{m.content}</div>
                {m.createdFromTraceId && (
                  <Link to={`/usage-traces/${m.createdFromTraceId}`} className="flex items-center gap-1 mt-2 text-[11px] text-muted-foreground hover:text-primary">
                    <ExternalLink className="h-3 w-3" /> Source Trace
                  </Link>
                )}
              </div>
            ))}
            {memories.length > 10 && (
              <Link to={`/knowledge-lab/memories?agentId=${agentId}`} className="block text-center text-xs text-primary hover:underline py-2">
                View all {memories.length} memories
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
