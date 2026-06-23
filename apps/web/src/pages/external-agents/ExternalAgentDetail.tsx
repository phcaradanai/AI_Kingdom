import { Activity, ArrowUpRight, Bot, Boxes, CheckCircle2, Edit3, FileCheck2, Link2, Play, Power, ShieldAlert, Trash2, UserRoundCog } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useTk } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { ExternalAgentDto, ExternalAgentReadinessDto } from "@/types/api";
import type { ExternalAgentSection } from "./externalAgentModels";
import type { ExternalAgentsController } from "./useExternalAgentsController";

const sections: Array<{ id: ExternalAgentSection; icon: typeof Bot }> = [
  { id: "identity", icon: Bot },
  { id: "capabilities", icon: Boxes },
  { id: "handoff", icon: UserRoundCog },
  { id: "validation", icon: FileCheck2 },
  { id: "source", icon: Link2 },
];

export function ExternalAgentDetail({ controller, isKing }: { controller: ExternalAgentsController; isKing: boolean }) {
  const tk = useTk();
  const agent = controller.selected;
  if (!agent) return <section className="flex min-h-[420px] items-center justify-center text-center text-sm text-muted-foreground"><div><Bot className="mx-auto mb-3 h-7 w-7" />{tk("externalAgents.selectPrompt")}</div></section>;
  const evidence = controller.readiness[agent.id];
  return <section aria-label={agent.name} className="min-w-0 scroll-mt-20" id="external-agent-detail">
    <header className="min-w-0 border-b border-border pb-5">
      <div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="break-words font-display text-2xl">{agent.name}</h2><StatusBadge active={agent.isActive} /><ReadinessBadge evidence={evidence} /></div><p className="mt-1 text-sm text-muted-foreground">{agent.roleTitle} · {agent.type}</p><p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{agent.description || "-"}</p></div>{isKing ? <div className="flex flex-wrap gap-2"><Button className="min-h-11" onClick={controller.openEdit}><Edit3 className="h-4 w-4" />{tk("externalAgents.edit")}</Button><Button className="min-h-11" onClick={() => void controller.toggleActive()} variant="outline"><Power className="h-4 w-4" />{agent.isActive ? tk("externalAgents.deactivate") : tk("externalAgents.activate")}</Button><Button aria-label={tk("externalAgents.delete")} className="min-h-11 min-w-11 px-3" onClick={() => controller.setDeleteTarget(agent)} variant="outline"><Trash2 className="h-4 w-4" /></Button></div> : <p className="text-xs text-muted-foreground">{tk("externalAgents.readOnly")}</p>}</div>
      <ReadinessRail evidence={evidence} />
    </header>

    <nav aria-label={tk("externalAgents.sections")} className="mt-4 overflow-x-auto border-b border-border"><div className="flex min-w-max gap-1">{sections.map(({ id, icon: Icon }) => <button aria-pressed={controller.section === id} className={cn("inline-flex min-h-11 min-w-28 items-center justify-center gap-2 border-b-2 px-3 py-2 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-inset", controller.section === id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:border-border hover:text-foreground")} key={id} onClick={() => controller.setSection(id)} type="button"><Icon className="h-4 w-4" />{tk(`externalAgents.section.${id}`)}</button>)}</div></nav>
    {controller.error ? <div className="mt-4 border-l-2 border-red-400 bg-red-500/10 p-3 text-sm text-red-100">{controller.error}</div> : null}
    <div className="min-w-0 py-5 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1" key={controller.section}><SectionContent agent={agent} controller={controller} isKing={isKing} /></div>
  </section>;
}

function SectionContent({ agent, controller, isKing }: { agent: ExternalAgentDto; controller: ExternalAgentsController; isKing: boolean }) {
  const tk = useTk();
  const evidence = controller.readiness[agent.id];
  if (controller.section === "identity") return <Section title={tk("externalAgents.identity.title")} description={tk("externalAgents.identity.description")}><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"><Data label={tk("externalAgents.field.name")} value={agent.name} /><Data label={tk("externalAgents.field.type")} value={agent.type} mono /><Data label={tk("externalAgents.field.role")} value={agent.roleTitle} /><Data label={tk("externalAgents.field.updated")} value={formatDate(agent.updatedAt)} /><BooleanData label={tk("externalAgents.active")} value={agent.isActive} /><BooleanData label={tk("externalAgents.field.bridge")} value={agent.bridgeEnabled} /></div><TextBlock label={tk("externalAgents.field.description")} value={agent.description} /></Section>;
  if (controller.section === "capabilities") return <Section title={tk("externalAgents.capabilities.title")} description={tk("externalAgents.capabilities.description")}><div className="flex flex-wrap gap-2">{agent.capabilities.map((capability) => <span className="rounded-md border border-border bg-muted/15 px-3 py-2 text-sm" key={capability}>{capability}</span>)}{agent.capabilities.length === 0 ? <p className="text-sm text-muted-foreground">{tk("externalAgents.capabilities.empty")}</p> : null}</div><ReadinessGrid evidence={evidence} /></Section>;
  if (controller.section === "handoff") return <Section title={tk("externalAgents.handoff.title")} description={tk("externalAgents.handoff.description")}><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"><Data label={tk("externalAgents.field.mode")} value={agent.executionMode} mono /><Data label={tk("externalAgents.field.safety")} value={agent.safetyLevel} mono /><BooleanData label={tk("externalAgents.field.approval")} value={agent.requiresApproval} /><Data label={tk("externalAgents.field.runtime")} value={tk("externalAgents.seconds", { count: agent.maxRuntimeSeconds })} /><Data label={tk("externalAgents.field.directory")} value={agent.workingDirectory || tk("externalAgents.none")} mono /><Data label={tk("externalAgents.field.environment")} value={agent.environmentProfile || tk("externalAgents.none")} mono /></div><TextBlock label={tk("externalAgents.field.command")} value={agent.command || tk("externalAgents.validation.notConfigured")} mono /></Section>;
  if (controller.section === "validation") return <Section title={tk("externalAgents.validation.title")} description={tk("externalAgents.validation.description")}><ReadinessGrid evidence={evidence} />{isKing ? <Button className="min-h-11" disabled={controller.testing} onClick={() => void controller.testAgent()}><Play className="h-4 w-4" />{controller.testing ? tk("externalAgents.validation.running") : tk("externalAgents.validation.run")}</Button> : null}{controller.testResult ? <div className={cn("border-l-2 p-4 text-sm", controller.testResult.status === "READY" ? "border-emerald-400 bg-emerald-500/10" : "border-amber-400 bg-amber-500/10")}><div className="font-semibold">{tk("externalAgents.validation.result", { status: controller.testResult.status })}</div>{controller.testResult.issues.length ? <p className="mt-2 text-xs leading-5">{controller.testResult.issues.join(" · ")}</p> : null}<div className="mt-3 text-xs text-muted-foreground"><span className="font-semibold">{tk("externalAgents.validation.command")}:</span> {controller.testResult.commandTemplate ?? tk("externalAgents.validation.notConfigured")}</div></div> : <p className="text-sm text-muted-foreground">{tk("externalAgents.validation.notRun")}</p>}</Section>;
  return <SourceSection />;
}

function ReadinessRail({ evidence }: { evidence?: ExternalAgentReadinessDto }) {
  const tk = useTk();
  return <div className="mt-4 grid gap-2 border-y border-border py-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center"><div className="flex items-center gap-2 text-xs font-semibold"><Activity className="h-4 w-4 text-primary" />{tk("externalAgents.readiness.title")}</div><p className="text-xs leading-5 text-muted-foreground">{evidence?.reason ?? tk("externalAgents.noReadiness")}</p></div>;
}

function ReadinessGrid({ evidence }: { evidence?: ExternalAgentReadinessDto }) {
  const tk = useTk();
  if (!evidence) return <div className="border-y border-border py-4 text-sm text-muted-foreground">{tk("externalAgents.noReadiness")}</div>;
  return <div><div><h4 className="text-sm font-semibold">{tk("externalAgents.readiness.title")}</h4><p className="mt-1 text-xs leading-5 text-muted-foreground">{tk("externalAgents.readiness.description")}</p></div><div className="mt-3 grid gap-3 sm:grid-cols-2"><BooleanData label={tk("externalAgents.readiness.config")} value={evidence.configReady} /><BooleanData label={tk("externalAgents.readiness.runner")} value={evidence.runnerAvailable} /><Data label={tk("externalAgents.readiness.lastRun")} value={evidence.lastRunStatus ?? tk("externalAgents.none")} mono /><Data label={tk("externalAgents.readiness.reason")} value={evidence.reason} /></div></div>;
}

function SourceSection() {
  const tk = useTk();
  const sources = [
    { to: "/work-orders", title: tk("externalAgents.source.workOrders"), description: tk("externalAgents.source.workOrdersDescription") },
    { to: "/automation-jobs", title: tk("externalAgents.source.automation"), description: tk("externalAgents.source.automationDescription") },
    { to: "/matters", title: tk("externalAgents.source.matters"), description: tk("externalAgents.source.mattersDescription") },
  ];
  return <Section title={tk("externalAgents.source.title")} description={tk("externalAgents.source.description")}><div className="divide-y divide-border border-y border-border">{sources.map((source) => <Link className="group grid min-h-16 gap-1 py-3 transition-colors hover:text-primary sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center" key={source.to} to={source.to}><div><h4 className="text-sm font-semibold">{source.title}</h4><p className="mt-1 text-xs leading-5 text-muted-foreground">{source.description}</p></div><ArrowUpRight className="h-4 w-4 text-muted-foreground transition-transform motion-safe:group-hover:-translate-y-0.5 motion-safe:group-hover:translate-x-0.5" /></Link>)}</div></Section>;
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <section className="space-y-5"><div className="border-b border-border pb-3"><h3 className="text-lg font-semibold">{title}</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p></div>{children}</section>;
}

function Data({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="min-w-0 border-l-2 border-primary/30 bg-muted/10 px-3 py-2"><div className="text-[10px] font-semibold uppercase text-muted-foreground">{label}</div><div className={cn("mt-1 break-words text-sm", mono && "font-mono text-xs")}>{value}</div></div>;
}

function BooleanData({ label, value }: { label: string; value: boolean }) {
  const tk = useTk();
  return <div className="flex min-h-12 items-center gap-2 border-l-2 border-primary/30 bg-muted/10 px-3 py-2"><CheckCircle2 className={cn("h-4 w-4", value ? "text-emerald-300" : "text-muted-foreground/40")} /><div><div className="text-[10px] font-semibold uppercase text-muted-foreground">{label}</div><div className="mt-0.5 text-sm">{value ? tk("externalAgents.yes") : tk("externalAgents.no")}</div></div></div>;
}

function TextBlock({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div><h4 className="text-xs font-semibold uppercase text-muted-foreground">{label}</h4><p className={cn("mt-2 whitespace-pre-wrap break-words border-y border-border py-3 text-sm leading-6", mono && "font-mono text-xs")}>{value || "-"}</p></div>;
}

function StatusBadge({ active }: { active: boolean }) {
  const tk = useTk();
  return <span className={cn("rounded border px-2 py-1 text-[10px] font-semibold uppercase", active ? "border-emerald-500/30 text-emerald-300" : "border-border text-muted-foreground")}>{active ? tk("externalAgents.active") : tk("externalAgents.inactive")}</span>;
}

function ReadinessBadge({ evidence }: { evidence?: ExternalAgentReadinessDto }) {
  const tk = useTk();
  return <span className={cn("rounded border px-2 py-1 text-[10px] font-semibold", evidence?.ready ? "border-emerald-500/30 text-emerald-300" : "border-amber-500/30 text-amber-300")}>{evidence?.ready ? tk("externalAgents.ready") : evidence?.reason ?? tk("externalAgents.noReadiness")}</span>;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(document.documentElement.lang === "th" ? "th-TH" : "en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
