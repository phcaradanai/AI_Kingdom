import { Activity, AlertCircle, ArrowUpRight, Bot, Boxes, CheckCircle2, Edit3, ExternalLink, FileCheck2, Link2, Loader2, Play, Power, Radar, Trash2, UserRoundCog } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useTk } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { CliProbeResultDto, CliProbeStatus, ExternalAgentDto, ExternalAgentReadinessDto, ExternalAgentType } from "@/types/api";
import { AGENT_INSTALL_HINTS, type AgentInstallHint } from "./externalAgentModels";
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
  if (controller.section === "capabilities") return <Section title={tk("externalAgents.capabilities.title")} description={tk("externalAgents.capabilities.description")}><div className="flex flex-wrap gap-2">{agent.capabilities.map((capability) => <span className="rounded-md border border-border bg-muted/15 px-3 py-2 text-sm" key={capability}>{capability}</span>)}{agent.capabilities.length === 0 ? <p className="text-sm text-muted-foreground">{tk("externalAgents.capabilities.empty")}</p> : null}</div><ReadinessGrid agentType={agent.type as ExternalAgentType} evidence={evidence} /></Section>;
  if (controller.section === "handoff") return <Section title={tk("externalAgents.handoff.title")} description={tk("externalAgents.handoff.description")}><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"><Data label={tk("externalAgents.field.mode")} value={agent.executionMode} mono /><Data label={tk("externalAgents.field.safety")} value={agent.safetyLevel} mono /><BooleanData label={tk("externalAgents.field.approval")} value={agent.requiresApproval} /><Data label={tk("externalAgents.field.runtime")} value={tk("externalAgents.seconds", { count: agent.maxRuntimeSeconds })} /><Data label={tk("externalAgents.field.directory")} value={agent.workingDirectory || tk("externalAgents.none")} mono /><Data label={tk("externalAgents.field.environment")} value={agent.environmentProfile || tk("externalAgents.none")} mono /></div><TextBlock label={tk("externalAgents.field.command")} value={agent.command || tk("externalAgents.validation.notConfigured")} mono /><InstallHintPanel agentType={agent.type as ExternalAgentType} evidence={evidence} tk={tk} /></Section>;
  if (controller.section === "validation") return <Section title={tk("externalAgents.validation.title")} description={tk("externalAgents.validation.description")}><ReadinessGrid agentType={agent.type as ExternalAgentType} evidence={evidence} />{isKing ? <div className="flex flex-wrap gap-2"><Button className="min-h-11" disabled={controller.testing} onClick={() => void controller.testAgent()}><Play className="h-4 w-4" />{controller.testing ? tk("externalAgents.validation.running") : tk("externalAgents.validation.run")}</Button><Button className="min-h-11" disabled={controller.liveProbeLoading || !controller.runnerOnline} onClick={() => void controller.runLiveProbe()} variant="outline"><Radar className="h-4 w-4" />{controller.liveProbeLoading ? (evidence?.runnerAvailable ? tk("externalAgents.probe.running") : tk("externalAgents.probe.waiting")) : tk("externalAgents.probe.run")}</Button></div> : null}{controller.testResult ? <div className={cn("border-l-2 p-4 text-sm", controller.testResult.status === "READY" ? "border-emerald-400 bg-emerald-500/10" : "border-amber-400 bg-amber-500/10")}><div className="font-semibold">{tk("externalAgents.validation.result", { status: controller.testResult.status })}</div>{controller.testResult.issues.length ? <p className="mt-2 text-xs leading-5">{controller.testResult.issues.join(" · ")}</p> : null}<div className="mt-3 text-xs text-muted-foreground"><span className="font-semibold">{tk("externalAgents.validation.command")}:</span> {controller.testResult.commandTemplate ?? tk("externalAgents.validation.notConfigured")}</div></div> : <p className="text-sm text-muted-foreground">{tk("externalAgents.validation.notRun")}</p>}<LiveProbePanel liveProbeResult={controller.liveProbeResult} liveProbeLoading={controller.liveProbeLoading} runnerOnline={controller.runnerOnline} tk={tk} /></Section>;
  return <SourceSection />;
}

function ReadinessRail({ evidence }: { evidence?: ExternalAgentReadinessDto }) {
  const tk = useTk();
  return <div className="mt-4 grid gap-2 border-y border-border py-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center"><div className="flex items-center gap-2 text-xs font-semibold"><Activity className="h-4 w-4 text-primary" />{tk("externalAgents.readiness.title")}</div><p className="text-xs leading-5 text-muted-foreground">{evidence?.reason ?? tk("externalAgents.noReadiness")}</p></div>;
}

function ReadinessGrid({ evidence, agentType }: { evidence?: ExternalAgentReadinessDto; agentType?: ExternalAgentType }) {
  const tk = useTk();
  if (!evidence) return <div className="border-y border-border py-4 text-sm text-muted-foreground">{tk("externalAgents.noReadiness")}</div>;
  const showInstallHint = !evidence.runnerAvailable && !!agentType;
  return <div className="space-y-4"><div><h4 className="text-sm font-semibold">{tk("externalAgents.readiness.title")}</h4><p className="mt-1 text-xs leading-5 text-muted-foreground">{tk("externalAgents.readiness.description")}</p></div><div className="grid gap-3 sm:grid-cols-2"><BooleanData label={tk("externalAgents.readiness.config")} value={evidence.configReady} /><BooleanData label={tk("externalAgents.readiness.runner")} value={evidence.runnerAvailable} /><Data label={tk("externalAgents.readiness.lastRun")} value={evidence.lastRunStatus ?? tk("externalAgents.none")} mono /><Data label={tk("externalAgents.readiness.reason")} value={evidence.reason} /></div>{showInstallHint ? <InstallHintPanel agentType={agentType} evidence={evidence} tk={tk} /> : null}</div>;
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

function InstallHintPanel({ agentType, evidence, tk }: { agentType: ExternalAgentType; evidence?: ExternalAgentReadinessDto; tk: (key: string) => string }) {
  const hint: AgentInstallHint | undefined = AGENT_INSTALL_HINTS[agentType];
  if (!hint) return null;
  const showNotAvailable = evidence && !evidence.runnerAvailable;
  return <div className="space-y-2 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-3 text-xs leading-5">
    <div className="font-semibold text-amber-200">{tk("externalAgents.install.title")}</div>
    {showNotAvailable ? <p className="text-amber-100/80">{tk("externalAgents.install.notAvailable")}</p> : null}
    <div className="space-y-1.5">
      <HintRow label={tk("externalAgents.install.command")} value={hint.installCommand} mono />
      <HintRow label={tk("externalAgents.install.check")} value={hint.checkCommand} mono />
      {hint.note ? <HintRow label={tk("externalAgents.install.note")} value={hint.note} /> : null}
    </div>
    {hint.docsUrl ? <a className="inline-flex items-center gap-1 text-primary hover:underline" href={hint.docsUrl} rel="noreferrer" target="_blank"><ExternalLink className="h-3 w-3" />{tk("externalAgents.install.openDocs")}</a> : null}
  </div>;
}

function HintRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="flex flex-wrap gap-1.5"><span className="shrink-0 text-muted-foreground">{label}:</span><span className={mono ? "font-mono text-foreground" : "text-foreground"}>{value}</span></div>;
}

const PROBE_STATUS_COLORS: Record<CliProbeStatus, string> = {
  READY: "border-emerald-400 bg-emerald-500/10",
  NOT_INSTALLED: "border-red-400 bg-red-500/10",
  AGENT_CLI_DISABLED: "border-amber-400 bg-amber-500/10",
  AUTH_ERROR: "border-red-400 bg-red-500/10",
  CREDIT_EXHAUSTED: "border-red-400 bg-red-500/10",
  RATE_LIMITED: "border-amber-400 bg-amber-500/10",
  EXEC_FAILED: "border-red-400 bg-red-500/10",
  TIMEOUT: "border-amber-400 bg-amber-500/10",
  UNKNOWN_ERROR: "border-amber-400 bg-amber-500/10",
};

function ProbeStatusIcon({ status }: { status: CliProbeStatus }) {
  if (status === "READY") return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" />;
  if (status === "AGENT_CLI_DISABLED" || status === "RATE_LIMITED" || status === "TIMEOUT" || status === "UNKNOWN_ERROR") {
    return <AlertCircle className="h-4 w-4 shrink-0 text-amber-300" />;
  }
  return <AlertCircle className="h-4 w-4 shrink-0 text-red-300" />;
}

function LiveProbePanel({
  liveProbeResult,
  liveProbeLoading,
  runnerOnline,
  tk,
}: {
  liveProbeResult: CliProbeResultDto | null;
  liveProbeLoading: boolean;
  runnerOnline: boolean;
  tk: (key: string, params?: Record<string, string | number>) => string;
}) {
  if (!liveProbeLoading && !liveProbeResult) return null;

  if (liveProbeLoading) {
    return <div className="flex items-center gap-2 border-l-2 border-primary/50 bg-primary/5 p-4 text-sm">
      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
      <span className="text-muted-foreground">{runnerOnline ? tk("externalAgents.probe.running") : tk("externalAgents.probe.waiting")}</span>
    </div>;
  }

  if (!liveProbeResult) return null;

  const colorClass = PROBE_STATUS_COLORS[liveProbeResult.status] ?? "border-border bg-muted/10";
  const checkedAt = new Date(liveProbeResult.checkedAt).toLocaleTimeString();

  return <div className={cn("space-y-3 border-l-2 p-4 text-sm", colorClass)}>
    <div className="flex items-start gap-2">
      <ProbeStatusIcon status={liveProbeResult.status} />
      <div className="min-w-0">
        <div className="font-semibold">{tk("externalAgents.probe.result")}</div>
        <p className="mt-1 text-xs leading-5">{tk(`externalAgents.probe.status.${liveProbeResult.status}`)}</p>
      </div>
    </div>
    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
      <span>{liveProbeResult.isDeepProbe ? tk("externalAgents.probe.isDeepProbe") : tk("externalAgents.probe.versionOnly")}</span>
      <span>{tk("externalAgents.probe.checkedAt", { time: checkedAt })}</span>
    </div>
    {liveProbeResult.output ? <div><div className="mb-1 text-xs font-semibold text-muted-foreground">{tk("externalAgents.probe.output")}</div><pre className="max-h-32 overflow-y-auto whitespace-pre-wrap break-words rounded bg-black/20 px-2 py-1.5 font-mono text-[11px] leading-5">{liveProbeResult.output}</pre></div> : null}
  </div>;
}
