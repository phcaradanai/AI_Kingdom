import { Activity, AlertTriangle, List, PanelRight, Radio, Users } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { useTk } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { LivingAgentEvidence } from "./LivingAgentEvidence";
import { LivingAgentsRoster } from "./LivingAgentsRoster";
import { LivingAgentsToolbar } from "./LivingAgentsToolbar";
import type { LivingAgentsController } from "./useLivingAgentsController";

export function LivingAgentsWorkspace({ controller }: { controller: LivingAgentsController }) {
  const tk = useTk();
  return (
    <div className="min-w-0 space-y-4">
      <PageHeader eyebrow={tk("livingAgents.eyebrow")} title={tk("livingAgents.title")} description={tk("livingAgents.description")} />
      <div className="grid min-w-0 grid-cols-2 gap-px overflow-hidden border border-border bg-border sm:grid-cols-4" data-testid="living-agent-metrics">
        <SummaryMetric icon={Users} label={tk("livingAgents.metrics.total", { count: controller.metrics.total })} value={controller.metrics.total} />
        <SummaryMetric active icon={Radio} label={tk("livingAgents.metrics.active")} value={controller.metrics.active} />
        <SummaryMetric icon={AlertTriangle} label={tk("livingAgents.metrics.attention")} value={controller.metrics.attention} />
        <SummaryMetric icon={Activity} label={tk("livingAgents.metrics.available")} value={controller.metrics.available} />
      </div>
      <LivingAgentsToolbar controller={controller} />
      <nav aria-label={tk("livingAgents.panes.aria")} className="grid grid-cols-2 gap-1 border border-border bg-card/35 p-1 xl:hidden">
        <PaneButton active={controller.pane === "roster"} icon={List} label={tk("livingAgents.panes.roster")} onClick={() => controller.setPane("roster")} />
        <PaneButton active={controller.pane === "details"} icon={PanelRight} label={tk("livingAgents.panes.details")} onClick={() => controller.setPane("details")} />
      </nav>
      {controller.loading ? <LoadingState message={tk("livingAgents.loading")} /> : controller.error ? <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/8 p-5 text-sm text-destructive">{controller.error}</div> : <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(360px,0.78fr)_minmax(0,1.22fr)]"><LivingAgentsRoster controller={controller} /><LivingAgentEvidence controller={controller} /></div>}
    </div>
  );
}

function SummaryMetric({ active, icon: Icon, label, value }: { active?: boolean; icon: typeof Activity; label: string; value: number }) { return <div className="flex min-h-16 min-w-0 items-center gap-3 bg-card/65 px-3 sm:px-4"><span className="relative flex h-8 w-8 shrink-0 items-center justify-center border border-border bg-background/50"><Icon className="h-4 w-4 text-primary" />{active && value > 0 ? <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-emerald-400 motion-safe:animate-pulse" /> : null}</span><span className="min-w-0"><strong className="block text-lg font-semibold leading-5 text-foreground">{value}</strong><span className="block truncate text-[11px] text-muted-foreground">{label}</span></span></div>; }
function PaneButton({ active, icon: Icon, label, onClick }: { active: boolean; icon: typeof Activity; label: string; onClick: () => void }) { return <button aria-pressed={active} className={cn("inline-flex min-h-11 items-center justify-center gap-2 px-3 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-primary", active ? "bg-primary/12 text-primary" : "text-muted-foreground hover:bg-muted/40 hover:text-foreground")} onClick={onClick} type="button"><Icon className="h-4 w-4" />{label}</button>; }
