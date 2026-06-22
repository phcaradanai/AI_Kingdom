import { AlertTriangle, CheckCircle2, Search, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { AgentPortrait } from "@/components/AgentPortrait";
import { Input } from "@/components/ui/input";
import { useTk } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { agentName, agentTitle } from "./agentModels";
import type { AgentsController } from "./useAgentsController";

const filters = ["all", "active", "inactive", "attention"] as const;

export function AgentRegistry({ controller }: { controller: AgentsController }) {
  const tk = useTk();
  function selectAndReveal(agent: (typeof controller.agents)[number]) {
    controller.selectAgent(agent);
    if (!window.matchMedia("(max-width: 1023px)").matches) return;
    window.requestAnimationFrame(() => document.getElementById("agent-detail")?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start",
    }));
  }
  return (
    <aside className="min-w-0 border-b border-border lg:border-b-0 lg:border-r lg:pr-5" aria-label={tk("agents.registry")}>
      <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
        <div>
          <h2 className="text-sm font-semibold">{tk("agents.registry")}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{tk("agents.registryCount", { count: controller.visibleAgents.length })}</p>
        </div>
        <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="relative mt-3">
        <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
        <Input
          aria-label={tk("agents.search")}
          className="min-h-11 pl-9"
          placeholder={tk("agents.searchPlaceholder")}
          value={controller.query}
          onChange={(event) => controller.setQuery(event.target.value)}
        />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-1.5" aria-label={tk("agents.search")}>
        {filters.map((filter) => (
          <button
            aria-pressed={controller.statusFilter === filter}
            className={cn(
              "min-h-11 rounded-md border px-2 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-primary",
              controller.statusFilter === filter
                ? "border-primary/50 bg-primary/10 text-foreground"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
            key={filter}
            onClick={() => controller.setStatusFilter(filter)}
            type="button"
          >
            {tk(`agents.filter.${filter}`)}
          </button>
        ))}
      </div>
      <div className="mt-3 max-h-[min(68vh,760px)] space-y-2 overflow-y-auto pr-1 lg:sticky lg:top-4">
        {controller.visibleAgents.map((agent) => {
          const selected = controller.selected?.id === agent.id;
          const routeReady = Boolean(agent.preferredProviderId && agent.defaultModel);
          const fallbackReady = agent.fallbackModels.length > 0;
          return (
            <button
              aria-pressed={selected}
              className={cn(
                "group w-full min-w-0 rounded-md border p-3 text-left transition-all motion-safe:hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-primary",
                selected ? "border-primary/60 bg-primary/10 shadow-[0_12px_32px_rgba(0,0,0,0.16)]" : "border-border bg-card hover:border-primary/35",
              )}
              key={agent.id}
              onClick={() => selectAndReveal(agent)}
              type="button"
            >
              <div className="flex min-w-0 gap-3">
                <AgentPortrait agent={agent} size="md" status={agent.isActive ? "IDLE" : "COMPLETED"} />
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold">{agentTitle(agent)}</h3>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{agentName(agent)}</p>
                    </div>
                    <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", agent.isActive ? "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.7)]" : "bg-muted-foreground/50")} />
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{agent.specialty || agent.description}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]">
                    <span className="rounded border border-border px-1.5 py-0.5 text-muted-foreground">{tk("agents.priority", { priority: agent.priority })}</span>
                    <span className={cn("inline-flex items-center gap-1 rounded border px-1.5 py-0.5", routeReady ? "border-emerald-500/25 text-emerald-300" : "border-amber-500/25 text-amber-300")}>
                      {routeReady ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                      {routeReady ? tk("agents.routeReady") : tk("agents.routeInherited")}
                    </span>
                    {!fallbackReady ? <span className="inline-flex items-center gap-1 text-amber-300"><AlertTriangle className="h-3 w-3" />{tk("agents.noFallback")}</span> : null}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
        {controller.visibleAgents.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            <ShieldCheck className="mx-auto mb-2 h-5 w-5" />
            {tk("agents.empty")}
          </div>
        ) : null}
      </div>
    </aside>
  );
}
