import { Activity, AlertTriangle, ArrowUpRight, Bot, CheckCircle2, Clock3, Cpu, FileSearch, FolderKanban, Gauge, ShieldCheck, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import { AgentPortrait } from "@/components/AgentPortrait";
import { STATE_COLORS, STATE_DOT } from "@/components/kingdom/agentPresence";
import { getModelDisplayName, getProviderDisplayName } from "@/lib/providerDisplay";
import { useTk } from "@/lib/i18n";
import { cn, formatDate } from "@/lib/utils";
import { formatTokens, getAgentName, getAgentTitle, getEffectivePresenceState, getPortraitStatus } from "./livingAgentModels";
import type { LivingAgentRecord } from "./livingAgentModels";
import type { LivingAgentsController } from "./useLivingAgentsController";

export function LivingAgentEvidence({ controller }: { controller: LivingAgentsController }) {
  const tk = useTk();
  const record = controller.selected;
  return (
    <section aria-label={tk("livingAgents.detail.aria")} className={cn("min-w-0 overflow-hidden border border-border bg-card/35", controller.pane === "details" ? "block" : "hidden xl:block")}>
      {record ? <EvidenceContent controller={controller} record={record} /> : <div className="flex min-h-[420px] items-center justify-center p-8 text-sm text-muted-foreground">{tk("livingAgents.detail.empty")}</div>}
    </section>
  );
}

function EvidenceContent({ controller, record }: { controller: LivingAgentsController; record: LivingAgentRecord }) {
  const tk = useTk();
  const { agent, presence } = record;
  const name = getAgentName(agent);
  const title = getAgentTitle(agent);
  const state = getEffectivePresenceState(record);
  const stateLabel = agent.isActive ? tk(`presence.state.${state}`) : tk("livingAgents.state.inactive");
  const workOrder = presence?.currentWorkOrder;
  const attributionTotal = agent.trustedTraceCount + agent.partialTraceCount + agent.legacyUnattributedCount;
  return (
    <div className="max-h-[760px] overflow-y-auto overscroll-contain xl:h-[calc(100dvh-22rem)] xl:min-h-[420px] xl:max-h-none">
      <header className="flex min-w-0 flex-col gap-4 border-b border-border p-4 sm:flex-row sm:items-center">
        <AgentPortrait agent={agent} size="md" status={getPortraitStatus(agent.currentStatus)} showStatusRing />
        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="break-words text-xl font-semibold text-foreground">{title}</h2><span className={cn("inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2 text-xs font-semibold", STATE_COLORS[state])}><span className={cn("h-2 w-2 rounded-full", STATE_DOT[state], agent.isActive && state !== "IDLE" && "motion-safe:animate-pulse")} />{stateLabel}</span></div><p className="mt-1 text-sm text-muted-foreground">{name} · {agent.role.replaceAll("_", " ")}</p><p className="mt-2 max-w-2xl text-sm leading-6 text-foreground/75">{agent.description}</p></div>
        <Link className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-md border border-primary/35 bg-primary/8 px-3 text-sm font-semibold text-primary transition-colors hover:bg-primary/15 focus:outline-none focus:ring-2 focus:ring-primary" to={`/living-agents/${agent.id}`}>{tk("livingAgents.source.openProfile")}<ArrowUpRight className="h-4 w-4" /></Link>
      </header>

      <div className="grid min-w-0 gap-px bg-border sm:grid-cols-2 xl:grid-cols-4" data-testid="living-agent-detail-metrics">
        <Metric icon={Zap} label={tk("livingAgents.metric.calls")} value={String(agent.totalCalls)} />
        <Metric icon={Gauge} label={tk("livingAgents.metric.tokensToday")} value={formatTokens(agent.tokensToday)} />
        <Metric icon={Cpu} label={tk("livingAgents.metric.costToday")} value={`$${agent.costToday.toFixed(4)}`} />
        <Metric icon={FolderKanban} label={tk("livingAgents.metric.projects")} value={String(agent.linkedProjectCount)} />
      </div>

      <div className="grid min-w-0 gap-0 lg:grid-cols-2">
        <div className="min-w-0 border-b border-border p-4 lg:border-r">
          <SectionTitle icon={Activity} title={tk("livingAgents.assignment.title")} />
          {!controller.presenceAvailable ? <Notice icon={AlertTriangle} tone="muted" text={tk("livingAgents.assignment.unavailable")} /> : workOrder ? <Link aria-label={tk("livingAgents.source.openWorkOrder", { title: workOrder.title })} className="mt-3 flex min-h-14 min-w-0 items-center gap-3 rounded-md border border-primary/25 bg-primary/5 px-3 transition-colors hover:bg-primary/10" to={`/work-orders?focus=${encodeURIComponent(workOrder.id)}`}><FileSearch className="h-4 w-4 shrink-0 text-primary" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-foreground">{workOrder.title}</span><span className="block text-xs text-muted-foreground">{presence?.progress ?? tk("livingAgents.assignment.reported")}</span></span><ArrowUpRight className="h-4 w-4 shrink-0 text-primary" /></Link> : <Notice icon={CheckCircle2} tone="muted" text={tk("livingAgents.assignment.none")} />}
          {presence?.currentTask ? <Fact label={tk("livingAgents.assignment.activity")} value={presence.currentTask} /> : null}
          {presence?.blockingReason ? <Notice icon={AlertTriangle} tone="danger" text={presence.blockingReason} /> : null}
          {controller.presenceComputedAt ? <p className="mt-3 flex items-center gap-1 text-[11px] text-muted-foreground"><Clock3 className="h-3 w-3" />{tk("livingAgents.presence.computed", { date: formatDate(controller.presenceComputedAt) })}</p> : null}
        </div>

        <div className="min-w-0 border-b border-border p-4">
          <SectionTitle icon={ShieldCheck} title={tk("livingAgents.evidence.title")} />
          <div className="mt-3 grid grid-cols-3 gap-px overflow-hidden rounded-md border border-border bg-border text-center"><EvidenceCount label={tk("livingAgents.evidence.verified")} value={agent.trustedTraceCount} tone="text-emerald-400" /><EvidenceCount label={tk("livingAgents.evidence.partial")} value={agent.partialTraceCount} tone="text-blue-400" /><EvidenceCount label={tk("livingAgents.evidence.legacy")} value={agent.legacyUnattributedCount} tone="text-amber-400" /></div>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">{attributionTotal ? tk("livingAgents.evidence.description") : tk("livingAgents.evidence.none")}</p>
        </div>

        <div className="min-w-0 border-b border-border p-4 lg:border-r lg:border-b-0">
          <SectionTitle icon={Cpu} title={tk("livingAgents.routing.title")} />
          <div className="mt-3 space-y-2">{agent.providerSummary.length ? agent.providerSummary.slice(0, 3).map((item) => <div className="flex min-w-0 items-center justify-between gap-3 text-sm" key={item.provider}><span className="truncate text-foreground">{getProviderDisplayName(item.provider)}</span><span className="shrink-0 text-xs text-muted-foreground">{tk("livingAgents.routing.calls", { count: item.callCount })}</span></div>) : <p className="text-sm text-muted-foreground">{tk("livingAgents.routing.none")}</p>}{agent.modelSummary[0] ? <Fact label={tk("livingAgents.routing.model")} value={getModelDisplayName(agent.modelSummary[0].model)} /> : null}</div>
        </div>

        <div className="min-w-0 p-4">
          <SectionTitle icon={Bot} title={tk("livingAgents.source.title")} />
          <div className="mt-2 divide-y divide-border"><SourceLink icon={Bot} label={tk("livingAgents.source.agentRegistry")} openLabel={tk("livingAgents.source.openRegistry")} to="/agents" /><SourceLink icon={FolderKanban} label={tk("livingAgents.source.workOrders")} openLabel={tk("livingAgents.source.openWorkOrders")} to={workOrder ? `/work-orders?focus=${encodeURIComponent(workOrder.id)}` : "/work-orders"} /><SourceLink icon={Cpu} label={tk("livingAgents.source.providers")} openLabel={tk("livingAgents.source.openProviders")} to="/providers" /><SourceLink icon={FileSearch} label={tk("livingAgents.source.profileEvidence")} openLabel={tk("livingAgents.source.openProfileEvidence")} to={`/living-agents/${agent.id}`} /></div>
        </div>
      </div>
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Activity; label: string; value: string }) { return <div className="flex min-h-16 min-w-0 items-center gap-3 bg-card/70 px-4"><Icon className="h-4 w-4 shrink-0 text-primary" /><span className="min-w-0"><strong className="block truncate text-base font-semibold text-foreground">{value}</strong><span className="block truncate text-[11px] text-muted-foreground">{label}</span></span></div>; }
function SectionTitle({ icon: Icon, title }: { icon: typeof Activity; title: string }) { return <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground"><Icon className="h-4 w-4 text-primary" />{title}</h3>; }
function Fact({ label, value }: { label: string; value: string }) { return <div className="mt-3 min-w-0"><div className="text-[11px] font-semibold text-muted-foreground">{label}</div><div className="mt-1 break-words text-sm text-foreground">{value}</div></div>; }
function Notice({ icon: Icon, tone, text }: { icon: typeof Activity; tone: "muted" | "danger"; text: string }) { return <div className={cn("mt-3 flex min-w-0 items-start gap-2 rounded-md border px-3 py-2 text-sm", tone === "danger" ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-border bg-muted/20 text-muted-foreground")}><Icon className="mt-0.5 h-4 w-4 shrink-0" /><span className="break-words">{text}</span></div>; }
function EvidenceCount({ label, value, tone }: { label: string; value: number; tone: string }) { return <div className="min-w-0 bg-card/80 p-2"><strong className={cn("block text-base", tone)}>{value}</strong><span className="block truncate text-[10px] text-muted-foreground">{label}</span></div>; }
function SourceLink({ icon: Icon, label, openLabel, to }: { icon: typeof Activity; label: string; openLabel: string; to: string }) { return <Link aria-label={openLabel} className="flex min-h-11 min-w-0 items-center gap-2 text-sm transition-colors hover:text-primary" to={to}><Icon className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1 truncate">{label}</span><ArrowUpRight className="h-4 w-4 shrink-0" /></Link>; }
