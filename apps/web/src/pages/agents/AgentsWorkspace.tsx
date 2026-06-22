import { AlertTriangle, Bot, CheckCircle2, Plus, Route, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { RoutingHelpModal } from "@/components/RoutingHelpModal";
import { Button } from "@/components/ui/button";
import { useTk } from "@/lib/i18n";
import { AgentDetail } from "./AgentDetail";
import { AgentEditorDialog } from "./AgentEditorDialog";
import { AgentRegistry } from "./AgentRegistry";
import type { AgentsController } from "./useAgentsController";

export function AgentsWorkspace({ controller }: { controller: AgentsController }) {
  const tk = useTk();
  return <>
    <PageHeader eyebrow={tk("agents.eyebrow")} title={tk("agents.title")} description={tk("agents.description")} action={<Button className="min-h-11" onClick={controller.openCreate}><Plus className="h-4 w-4" />{tk("agents.create")}</Button>} />
    {controller.error && !controller.editorMode ? <div className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">{controller.error}</div> : null}
    {controller.notice ? <div className="mb-4 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">{controller.notice === "displaySaved" ? tk("agents.displaySaved") : tk("agents.saved")}</div> : null}
    <Metrics controller={controller} />
    <div className="mt-5 grid min-w-0 gap-5 lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)]" data-testid="agents-workspace">
      <AgentRegistry controller={controller} />
      <AgentDetail controller={controller} />
    </div>
    {controller.editorMode ? <AgentEditorDialog controller={controller} /> : null}
    {controller.deleteTarget ? <DeleteDialog controller={controller} /> : null}
    <RoutingHelpModal open={controller.routingHelpOpen} onClose={() => controller.setRoutingHelpOpen(false)} preview={controller.routingPreview} agentName={controller.selected?.title ?? controller.selected?.name} />
  </>;
}

function Metrics({ controller }: { controller: AgentsController }) {
  const tk = useTk();
  const items = [
    [tk("agents.metric.total"), controller.counts.total, Bot],
    [tk("agents.metric.active"), controller.counts.active, CheckCircle2],
    [tk("agents.metric.routed"), controller.counts.routed, Route],
    [tk("agents.metric.attention"), controller.counts.attention, AlertTriangle],
  ] as const;
  return <section className="grid grid-cols-2 border-y border-border lg:grid-cols-4" aria-label={tk("agents.eyebrow")}>{items.map(([label, value, Icon], index) => <div className={`min-w-0 px-4 py-3 ${index % 2 === 0 ? "border-r border-border" : ""} ${index > 1 ? "border-t border-border lg:border-t-0" : ""} ${index > 0 ? "lg:border-l lg:border-border lg:border-r-0" : ""}`} key={label}><div className="flex items-center justify-between gap-2"><span className="text-2xl font-semibold tabular-nums">{value}</span><Icon className="h-4 w-4 text-primary" /></div><div className="mt-1 break-words text-xs text-muted-foreground">{label}</div></div>)}</section>;
}

function DeleteDialog({ controller }: { controller: AgentsController }) {
  const tk = useTk();
  const target = controller.deleteTarget!;
  return <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-5" role="presentation"><section aria-label={tk("agents.delete.title")} aria-modal="true" className="w-full max-w-lg border border-red-500/30 bg-card p-5 shadow-2xl sm:rounded-lg" role="alertdialog"><ShieldCheck className="h-5 w-5 text-red-300" /><h2 className="mt-3 text-lg font-semibold">{tk("agents.delete.title")}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{tk("agents.delete.description", { name: target.displayName ?? target.name })}</p><div className="mt-5 flex flex-wrap justify-end gap-2"><Button className="min-h-11" variant="outline" onClick={() => controller.setDeleteTarget(null)}>{tk("agents.delete.cancel")}</Button><Button className="min-h-11" variant="destructive" disabled={controller.saving} onClick={() => void controller.confirmDelete()}>{tk("agents.delete.confirm")}</Button></div></section></div>;
}
