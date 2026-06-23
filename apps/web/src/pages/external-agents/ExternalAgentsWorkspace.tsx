import { Bot, Plus, Radio, ShieldAlert, UserRoundCog } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { useTk } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { ExternalAgentsController } from "./useExternalAgentsController";
import { ExternalAgentDeleteDialog } from "./ExternalAgentDeleteDialog";
import { ExternalAgentDetail } from "./ExternalAgentDetail";
import { ExternalAgentEditorDialog } from "./ExternalAgentEditorDialog";
import { ExternalAgentRegistry } from "./ExternalAgentRegistry";

export function ExternalAgentsWorkspace({ controller, isKing }: { controller: ExternalAgentsController; isKing: boolean }) {
  const tk = useTk();
  return <>
    <PageHeader
      eyebrow={tk("externalAgents.eyebrow")}
      title={tk("externalAgents.title")}
      description={tk("externalAgents.description")}
      action={isKing ? <Button className="min-h-11" onClick={controller.openCreate}><Plus className="h-4 w-4" />{tk("externalAgents.create")}</Button> : undefined}
    />

    <div className="grid grid-cols-2 divide-x divide-y divide-border border-y border-border sm:grid-cols-4 sm:divide-y-0">
      <Metric icon={Bot} label={tk("externalAgents.total")} value={controller.counts.total} />
      <Metric icon={Radio} label={tk("externalAgents.ready")} tone="ready" value={controller.counts.ready} />
      <Metric icon={UserRoundCog} label={tk("externalAgents.manual")} value={controller.counts.manual} />
      <Metric icon={ShieldAlert} label={tk("externalAgents.attention")} tone={controller.counts.attention ? "attention" : "default"} value={controller.counts.attention} />
    </div>

    <RunnerSignal controller={controller} />

    {controller.loading ? <div className="flex min-h-72 items-center justify-center text-sm text-muted-foreground"><span className="mr-2 h-2 w-2 animate-pulse rounded-full bg-primary" />{tk("externalAgents.loading")}</div> : null}
    {!controller.loading && controller.error && controller.agents.length === 0 ? <div className="flex min-h-72 flex-col items-center justify-center gap-3 border-y border-red-500/20 text-center text-sm text-red-200"><ShieldAlert className="h-6 w-6" /><p>{tk("externalAgents.loadError")}</p><Button onClick={() => void controller.load()} variant="outline">{tk("externalAgents.retry")}</Button></div> : null}
    {!controller.loading && controller.agents.length > 0 ? <div className="mt-6 grid min-w-0 gap-5 lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)]">
      <ExternalAgentRegistry controller={controller} />
      <ExternalAgentDetail controller={controller} isKing={isKing} />
    </div> : null}

    {controller.editorMode ? <ExternalAgentEditorDialog controller={controller} /> : null}
    {controller.deleteTarget ? <ExternalAgentDeleteDialog controller={controller} /> : null}
  </>;
}

function Metric({ icon: Icon, label, value, tone = "default" }: { icon: typeof Bot; label: string; value: number; tone?: "default" | "ready" | "attention" }) {
  return <div className="min-w-0 px-3 py-3 sm:px-4">
    <div className="flex items-center gap-2 text-[10px] font-semibold uppercase text-muted-foreground"><Icon className={cn("h-3.5 w-3.5", tone === "ready" && "text-emerald-400", tone === "attention" && "text-amber-400")} /><span className="truncate">{label}</span></div>
    <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
  </div>;
}

function RunnerSignal({ controller }: { controller: ExternalAgentsController }) {
  const tk = useTk();
  return <div className={cn("mt-5 grid gap-2 border-l-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center", controller.runnerOnline ? "border-emerald-400 bg-emerald-500/5" : "border-amber-400 bg-amber-500/5")} data-testid="runner-readiness">
    <div className="min-w-0"><div className="flex items-center gap-2 text-sm font-semibold"><span className={cn("h-2 w-2 rounded-full", controller.runnerOnline ? "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,.7)] motion-safe:animate-pulse" : "bg-amber-400")} />{controller.runnerOnline ? tk("externalAgents.runnerOnline") : tk("externalAgents.runnerOffline")}</div><p className="mt-1 text-xs leading-5 text-muted-foreground">{controller.runnerOnline ? tk("externalAgents.runnerOnlineDescription") : tk("externalAgents.runnerOfflineDescription")}</p></div>
    <div className="text-xs text-muted-foreground">{controller.capabilitiesUpdatedAt ? tk("externalAgents.runnerUpdated", { time: formatDate(controller.capabilitiesUpdatedAt) }) : tk("externalAgents.runnerUnknown")}</div>
  </div>;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(document.documentElement.lang === "th" ? "th-TH" : "en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
