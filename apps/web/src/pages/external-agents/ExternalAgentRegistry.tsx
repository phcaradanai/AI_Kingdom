import { AlertTriangle, CheckCircle2, Search, SlidersHorizontal, UserRoundCog } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useTk } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { isManualAgent, type ExternalAgentFilter } from "./externalAgentModels";
import type { ExternalAgentsController } from "./useExternalAgentsController";

const filters: ExternalAgentFilter[] = ["all", "ready", "manual", "attention", "inactive"];

export function ExternalAgentRegistry({ controller }: { controller: ExternalAgentsController }) {
  const tk = useTk();
  function selectAndReveal(agent: (typeof controller.agents)[number]) {
    controller.selectAgent(agent);
    if (!window.matchMedia("(max-width: 1023px)").matches) return;
    window.requestAnimationFrame(() => document.getElementById("external-agent-detail")?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start",
    }));
  }
  return <aside aria-label={tk("externalAgents.registry")} className="min-w-0 border-b border-border pb-5 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-5">
    <div className="flex items-center justify-between gap-3 border-b border-border pb-3"><div><h2 className="text-sm font-semibold">{tk("externalAgents.registry")}</h2><p className="mt-1 text-xs text-muted-foreground">{tk("externalAgents.registryCount", { count: controller.visibleAgents.length })}</p></div><SlidersHorizontal className="h-4 w-4 text-muted-foreground" /></div>
    <div className="relative mt-3"><Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" /><Input aria-label={tk("externalAgents.search")} className="pl-9" placeholder={tk("externalAgents.searchPlaceholder")} value={controller.query} onChange={(event) => controller.setQuery(event.target.value)} /></div>
    <div aria-label={tk("externalAgents.registry")} className="mt-3 flex flex-wrap gap-1.5">{filters.map((filter) => <button aria-pressed={controller.filter === filter} className={cn("min-h-11 rounded-md border px-3 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-primary", controller.filter === filter ? "border-primary/50 bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground")} key={filter} onClick={() => controller.setFilter(filter)} type="button">{tk(`externalAgents.filter.${filter}`)}</button>)}</div>
    <div className="mt-3 max-h-[min(68vh,760px)] space-y-2 overflow-y-auto pr-1">
      {controller.visibleAgents.map((agent) => {
        const evidence = controller.readiness[agent.id];
        const selected = controller.selected?.id === agent.id;
        return <button aria-pressed={selected} className={cn("group w-full min-w-0 rounded-md border p-3 text-left transition-all motion-safe:hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-primary", selected ? "border-primary/60 bg-primary/10 shadow-[0_12px_30px_rgba(0,0,0,.16)]" : "border-border bg-card hover:border-primary/35")} key={agent.id} onClick={() => selectAndReveal(agent)} type="button">
          <div className="flex min-w-0 items-start gap-3"><div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-md border", evidence?.ready ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-border bg-muted/20 text-muted-foreground")}>{isManualAgent(agent) ? <UserRoundCog className="h-5 w-5" /> : evidence?.ready ? <CheckCircle2 className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}</div><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><h3 className="truncate text-sm font-semibold">{agent.name}</h3><p className="mt-0.5 truncate text-xs text-muted-foreground">{agent.roleTitle}</p></div><span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", agent.isActive ? "bg-emerald-400" : "bg-muted-foreground/40")} /></div><div className="mt-2 flex flex-wrap gap-1.5 text-[10px]"><span className="rounded border border-border px-1.5 py-0.5 text-muted-foreground">{agent.type}</span><span className="rounded border border-border px-1.5 py-0.5 text-muted-foreground">{agent.executionMode}</span>{evidence ? <span className={cn("rounded border px-1.5 py-0.5", evidence.ready ? "border-emerald-500/30 text-emerald-300" : "border-amber-500/30 text-amber-300")} title={evidence.reason}>{evidence.ready ? tk("externalAgents.ready") : evidence.reason}</span> : <span className="rounded border border-border px-1.5 py-0.5 text-muted-foreground">{tk("externalAgents.noReadiness")}</span>}</div></div></div>
        </button>;
      })}
      {controller.visibleAgents.length === 0 ? <div className="border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{tk("externalAgents.empty")}</div> : null}
    </div>
  </aside>;
}
