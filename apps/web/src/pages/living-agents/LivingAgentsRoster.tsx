import { AlertTriangle, ChevronRight, Clock3 } from "lucide-react";
import { AgentPortrait } from "@/components/AgentPortrait";
import { STATE_COLORS, STATE_DOT } from "@/components/kingdom/agentPresence";
import { EmptyState } from "@/components/ui/EmptyState";
import { getProviderDisplayName } from "@/lib/providerDisplay";
import { useTk } from "@/lib/i18n";
import { cn, timeAgo } from "@/lib/utils";
import { getAgentName, getAgentTitle, getEffectivePresenceState, getPortraitStatus } from "./livingAgentModels";
import type { LivingAgentRecord } from "./livingAgentModels";
import type { LivingAgentsController } from "./useLivingAgentsController";

export function LivingAgentsRoster({ controller }: { controller: LivingAgentsController }) {
  const tk = useTk();
  return (
    <aside aria-label={tk("livingAgents.roster.aria")} className={cn("min-w-0 overflow-hidden border border-border bg-card/35", controller.pane === "roster" ? "block" : "hidden xl:block")}>
      <div className="flex min-h-14 items-center justify-between border-b border-border px-4">
        <div><h2 className="text-sm font-semibold text-foreground">{tk("livingAgents.roster.title")}</h2><p className="text-xs text-muted-foreground">{tk("livingAgents.roster.count", { count: controller.filteredRecords.length })}</p></div>
        <span className="text-xs font-medium text-muted-foreground">{controller.presenceAvailable ? tk("livingAgents.live") : tk("livingAgents.summaryOnly")}</span>
      </div>
      <div className="max-h-[680px] overflow-y-auto overscroll-contain p-2 xl:h-[calc(100dvh-22rem)] xl:min-h-[420px] xl:max-h-none">
        {controller.filteredRecords.length ? controller.filteredRecords.map((record) => <RosterRow key={record.agent.id} record={record} selected={controller.selectedId === record.agent.id} onSelect={() => controller.selectAgent(record.agent.id)} />) : <EmptyState className="border-0 py-16" icon={AlertTriangle} title={tk("livingAgents.empty.title")} description={tk("livingAgents.empty.description")} />}
      </div>
    </aside>
  );
}

function RosterRow({ record, selected, onSelect }: { record: LivingAgentRecord; selected: boolean; onSelect: () => void }) {
  const tk = useTk();
  const state = getEffectivePresenceState(record);
  const name = getAgentName(record.agent);
  const title = getAgentTitle(record.agent);
  const activity = record.presence?.currentTask ?? record.agent.lastActivityTitle;
  const provider = record.agent.providerSummary[0]?.provider;
  const stateLabel = record.agent.isActive ? tk(`presence.state.${state}`) : tk("livingAgents.state.inactive");
  return (
    <button aria-label={tk("livingAgents.roster.select", { title })} aria-pressed={selected} className={cn("group mb-1 grid min-h-[84px] w-full min-w-0 grid-cols-[48px_minmax(0,1fr)_20px] items-center gap-3 border-l-2 px-3 py-2 text-left transition-all focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary motion-safe:hover:translate-x-0.5", selected ? "border-l-primary bg-primary/8" : "border-l-transparent hover:bg-muted/35")} onClick={onSelect} type="button">
      <AgentPortrait agent={record.agent} size="xs" status={getPortraitStatus(record.agent.currentStatus)} showStatusRing={false} />
      <span className="min-w-0">
        <span className="flex min-w-0 items-center gap-2"><span className="truncate text-sm font-semibold text-foreground">{title}</span><span className={cn("ml-auto inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold", STATE_COLORS[state])}><span className={cn("h-1.5 w-1.5 rounded-full", STATE_DOT[state], record.agent.isActive && state !== "IDLE" && "motion-safe:animate-pulse")} />{stateLabel}</span></span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">{name} · {record.agent.role.replaceAll("_", " ")}</span>
        <span className="mt-1 flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground"><Clock3 className="h-3 w-3 shrink-0" /><span className="truncate">{activity ?? tk("livingAgents.activity.none")}</span>{provider ? <span className="ml-auto shrink-0 text-foreground/65">{getProviderDisplayName(provider)}</span> : null}</span>
        {record.agent.lastActivityAt ? <span className="sr-only">{timeAgo(record.agent.lastActivityAt)}</span> : null}
      </span>
      <ChevronRight className={cn("h-4 w-4 text-muted-foreground transition-transform", selected && "translate-x-0.5 text-primary")} />
    </button>
  );
}
