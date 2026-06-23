import { Clock3, Search, UserRound } from "lucide-react";
import { AgentPortrait } from "@/components/AgentPortrait";
import { Input } from "@/components/ui/input";
import { useTk } from "@/lib/i18n";
import { cn, formatDate } from "@/lib/utils";
import { agentName, agentTitle } from "./agentChatModels";
import type { AgentChatController } from "./useAgentChatController";

export function AgentChatRail({ controller }: { controller: AgentChatController }) {
  const tk = useTk();
  const showAgents = controller.railMode === "agents";
  return <aside aria-label={tk("agentChat.browser.aria")} className="flex h-full min-h-[560px] min-w-0 flex-col overflow-hidden border border-border bg-card/45 xl:min-h-0">
    <div className="grid grid-cols-2 border-b border-border p-2" role="group" aria-label={tk("agentChat.browser.mode")}> 
      <RailModeButton active={showAgents} icon={UserRound} label={tk("agentChat.browser.agents")} onClick={() => controller.setRailMode("agents")} />
      <RailModeButton active={!showAgents} icon={Clock3} label={tk("agentChat.browser.sessions")} onClick={() => controller.setRailMode("sessions")} />
    </div>

    {showAgents ? <>
      <div className="border-b border-border p-3">
        <label className="sr-only" htmlFor="agent-chat-search">{tk("agentChat.browser.search")}</label>
        <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input id="agent-chat-search" className="h-11 pl-9" placeholder={tk("agentChat.browser.searchPlaceholder")} value={controller.agentSearch} onChange={(event) => controller.setAgentSearch(event.target.value)} />
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {controller.loading ? <LoadingRows label={tk("agentChat.loadingAgents")} /> : null}
        {!controller.loading && controller.filteredAgents.length === 0 ? <Empty text={tk("agentChat.browser.noAgents")} /> : null}
        {controller.filteredAgents.map((agent) => <button
          aria-label={tk("agentChat.agent.start", { agent: agentTitle(agent) })}
          className={cn("group flex min-h-16 w-full min-w-0 items-center gap-3 border px-3 py-2 text-left transition-colors duration-200", controller.selectedAgentId === agent.id && !controller.selectedSession ? "border-primary/50 bg-primary/10" : "border-border bg-background/35 hover:border-primary/30 hover:bg-muted/45")}
          key={agent.id}
          onClick={() => controller.startNew(agent.id)}
          type="button"
        >
          <AgentPortrait agent={agent} size="xs" showStatusRing={false} />
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-foreground">{agentTitle(agent)}</span><span className="mt-0.5 block truncate text-xs text-muted-foreground">{agentName(agent)}</span></span>
          <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary opacity-0 transition-opacity group-hover:opacity-100" />
        </button>)}
      </div>
    </> : <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
      {controller.loading ? <LoadingRows label={tk("agentChat.loadingSessions")} /> : null}
      {!controller.loading && controller.sessions.length === 0 ? <Empty text={tk("agentChat.browser.noSessions")} /> : null}
      {controller.sessions.map((session) => <button
        aria-label={tk("agentChat.session.open", { title: session.title })}
        className={cn("w-full min-w-0 border px-3 py-3 text-left transition-colors duration-200", controller.selectedSession?.id === session.id ? "border-primary/50 bg-primary/10" : "border-border bg-background/35 hover:border-primary/30 hover:bg-muted/45")}
        key={session.id}
        onClick={() => void controller.loadSession(session.id)}
        type="button"
      >
        <span className="block truncate text-sm font-semibold text-foreground">{session.title}</span>
        <span className="mt-1.5 flex min-w-0 items-center justify-between gap-2 text-[11px] text-muted-foreground"><span className="truncate">{agentTitle(session.agent) || tk("agentChat.agent.fallback")}</span><span className="shrink-0 tabular-nums">{formatDate(session.updatedAt)}</span></span>
      </button>)}
    </div>}
  </aside>;
}

function RailModeButton({ active, icon: Icon, label, onClick }: { active: boolean; icon: typeof UserRound; label: string; onClick: () => void }) {
  return <button aria-pressed={active} className={cn("flex min-h-11 items-center justify-center gap-2 border-b-2 px-2 text-xs font-semibold transition-colors", active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")} onClick={onClick} type="button"><Icon className="h-4 w-4" />{label}</button>;
}

function LoadingRows({ label }: { label: string }) {
  return <div className="space-y-2" aria-label={label}><div className="h-16 animate-pulse bg-muted/40 motion-reduce:animate-none" /><div className="h-16 animate-pulse bg-muted/25 motion-reduce:animate-none" /><span className="sr-only">{label}</span></div>;
}

function Empty({ text }: { text: string }) {
  return <div className="border border-dashed border-border px-4 py-8 text-center text-sm leading-6 text-muted-foreground">{text}</div>;
}
