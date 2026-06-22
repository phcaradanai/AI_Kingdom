import { ArrowUpRight, Bot, BrainCircuit, Braces, Cable, CheckCircle2, Edit3, Network, Power, ShieldAlert, Sparkles, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { AgentPortrait } from "@/components/AgentPortrait";
import { Button } from "@/components/ui/button";
import { useTk } from "@/lib/i18n";
import { getProviderDisplayName } from "@/lib/providerDisplay";
import { cn } from "@/lib/utils";
import { agentName, agentTitle, type AgentSection } from "./agentModels";
import { AgentRequestEvidence, AgentRoutingEvidence } from "./AgentPreview";
import type { AgentsController } from "./useAgentsController";

const sections: Array<{ id: AgentSection; icon: typeof Bot }> = [
  { id: "identity", icon: Bot },
  { id: "prompt", icon: Braces },
  { id: "skills", icon: Sparkles },
  { id: "routing", icon: Cable },
  { id: "fallbacks", icon: Network },
  { id: "preview", icon: BrainCircuit },
];

export function AgentDetail({ controller }: { controller: AgentsController }) {
  const tk = useTk();
  const agent = controller.selected;
  if (!agent) return <section className="flex min-h-[420px] items-center justify-center text-center text-sm text-muted-foreground"><div><Bot className="mx-auto mb-3 h-7 w-7" />{tk("agents.selectPrompt")}</div></section>;

  return (
    <section className="min-w-0 scroll-mt-20 lg:pl-1" aria-label={agentTitle(agent)} id="agent-detail">
      <header className="grid min-w-0 gap-4 border-b border-border pb-5 sm:grid-cols-[auto_minmax(0,1fr)]">
        <AgentPortrait agent={agent} size="lg" shape="portrait-card" status={agent.isActive ? "IDLE" : "COMPLETED"} clickToView />
        <div className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="break-words font-display text-2xl">{agentTitle(agent)}</h2>
                <span className={cn("rounded border px-2 py-1 text-[10px] font-semibold uppercase", agent.isActive ? "border-emerald-500/30 text-emerald-300" : "border-border text-muted-foreground")}>{agent.isActive ? tk("agents.active") : tk("agents.inactive")}</span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{agentName(agent)} · {agent.role} · {tk("agents.priority", { priority: agent.priority })}</p>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{agent.description || agent.specialty}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button className="min-h-11" onClick={() => controller.openEdit()}><Edit3 className="h-4 w-4" />{tk("agents.edit")}</Button>
              <Button className="min-h-11" variant="outline" disabled={agent.slug === "grand-vizier"} onClick={() => void controller.toggleActive(agent)}><Power className="h-4 w-4" />{agent.isActive ? tk("agents.deactivate") : tk("agents.activate")}</Button>
              <Button aria-label={tk("agents.delete")} className="min-h-11 min-w-11 px-3" variant="outline" disabled={agent.slug === "grand-vizier"} onClick={() => controller.setDeleteTarget(agent)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          </div>
        </div>
      </header>

      <SourceRail agentId={agent.id} />
      <nav className="mt-5 overflow-x-auto border-b border-border" aria-label={tk("agents.sections")}>
        <div className="flex min-w-max gap-1">
          {sections.map(({ id, icon: Icon }) => (
            <button
              aria-pressed={controller.activeSection === id}
              className={cn("inline-flex min-h-11 min-w-28 items-center justify-center gap-2 border-b-2 px-3 py-2 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-inset", controller.activeSection === id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:border-border hover:text-foreground")}
              key={id}
              onClick={() => controller.setActiveSection(id)}
              type="button"
            ><Icon className="h-4 w-4" />{tk(`agents.section.${id}`)}</button>
          ))}
        </div>
      </nav>
      <div className="min-w-0 py-5 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1" key={controller.activeSection}>
        <SectionContent controller={controller} />
      </div>
    </section>
  );
}

function SourceRail({ agentId }: { agentId: string }) {
  const tk = useTk();
  const links: Array<[string, string]> = [
    [`/living-agents/${agentId}`, tk("agents.openLivingProfile")],
    ["/providers", tk("agents.openProviders")],
    ["/routing", tk("agents.openRouting")],
  ];
  return (
    <div className="mt-4 grid gap-3 border-y border-border py-3 xl:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0"><h3 className="text-xs font-semibold">{tk("agents.sourceTitle")}</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{tk("agents.sourceDescription")}</p></div>
      <div className="flex flex-wrap items-center gap-2">{links.map(([to, label]) => <Link className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-semibold text-muted-foreground transition hover:border-primary/40 hover:text-foreground" key={to} to={to}><ArrowUpRight className="h-3.5 w-3.5" />{label}</Link>)}</div>
    </div>
  );
}

function SectionContent({ controller }: { controller: AgentsController }) {
  const tk = useTk();
  const agent = controller.selected!;
  if (controller.activeSection === "identity") return (
    <Section title={tk("agents.identity.title")} description={tk("agents.identity.description")}>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Data label={tk("agents.field.name")} value={agent.canonicalName ?? agent.name} />
        <Data label={tk("agents.field.title")} value={agent.canonicalTitle ?? agent.title} />
        <Data label="Slug" value={agent.coreSlug ?? agent.slug} mono />
        <Data label={tk("agents.field.displayName")} value={agent.displayName ?? "-"} />
        <Data label={tk("agents.field.displayTitle")} value={agent.displayTitle ?? "-"} />
        <Data label={tk("agents.field.specialty")} value={agent.specialty || "-"} />
      </div>
      <TextBlock label={tk("agents.field.personalDetail")} value={agent.personalDetail} />
      <div className="grid gap-3 sm:grid-cols-2"><TextBlock label={tk("agents.field.personality")} value={agent.personality} /><TextBlock label={tk("agents.field.kingRelationship")} value={agent.relationshipWithKing} /></div>
    </Section>
  );
  if (controller.activeSection === "prompt") return (
    <Section title={tk("agents.prompt.title")} description={tk("agents.prompt.description")}>
      <TextBlock label={tk("agents.field.systemPrompt")} value={agent.systemPrompt || agent.prompt} mono />
      <TextBlock label={tk("agents.field.responseStyle")} value={agent.responseStyle} />
    </Section>
  );
  if (controller.activeSection === "skills") return (
    <Section title={tk("agents.skills.title")} description={tk("agents.skills.description")}>
      <TagGroup label={tk("agents.field.skills")} values={agent.skills} />
      <div className="grid gap-4 lg:grid-cols-3"><TagGroup label={tk("agents.field.allowedActions")} values={agent.allowedActions} /><TagGroup label={tk("agents.field.forbiddenActions")} values={agent.forbiddenActions} tone="danger" /><TagGroup label={tk("agents.field.approvalRequired")} values={agent.approvalRequiredFor} tone="warn" /></div>
      <TextBlock label={tk("agents.field.roleBoundaries")} value={agent.roleBoundaries} />
      <div className="grid gap-3 sm:grid-cols-3">
        <BooleanSignal value={agent.canProposeMemoryCandidates} label={tk("agents.memory.propose")} />
        <BooleanSignal value={agent.canAutoSaveTrustedMemory} label={tk("agents.memory.autoSave")} />
        <BooleanSignal value={agent.memoryRequiresApproval} label={tk("agents.memory.approval")} />
      </div>
      <div className="rounded-md border border-amber-500/25 bg-amber-500/5 p-3 text-xs text-amber-100"><ShieldAlert className="mr-2 inline h-4 w-4" />{tk("agents.memory.safety")}</div>
    </Section>
  );
  if (controller.activeSection === "routing") return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Data label={tk("agents.field.provider")} value={controller.selectedProvider ? getProviderDisplayName(controller.selectedProvider) : tk("agents.routeInherited")} />
        <Data label={tk("agents.field.model")} value={agent.defaultModel || tk("agents.routing.providerDefault")} mono />
        <Data label={tk("agents.field.routingPolicy")} value={agent.routingPolicy || "GLOBAL_ROUTING"} mono />
        <Data label={tk("agents.field.parameterMode")} value={agent.parameterMode || "ROLE_DEFAULT"} mono />
      </div>
      <AgentRoutingEvidence preview={controller.routingPreview} loading={controller.loadingPreview} onRefresh={() => void controller.loadRoutingPreview()} onHelp={() => controller.setRoutingHelpOpen(true)} />
    </div>
  );
  if (controller.activeSection === "fallbacks") return <FallbackSummary controller={controller} />;
  return <AgentRequestEvidence preview={controller.effectivePreview} loading={controller.loadingEffectivePreview} onRefresh={() => void controller.loadEffectivePreview()} />;
}

function FallbackSummary({ controller }: { controller: AgentsController }) {
  const tk = useTk();
  const agent = controller.selected!;
  return <Section title={tk("agents.fallbacks.title")} description={tk("agents.fallbacks.description")}>
    <div className="grid gap-4 lg:grid-cols-2">
      <div><h4 className="text-xs font-semibold uppercase text-muted-foreground">{tk("agents.field.fallbackModels")}</h4><div className="mt-2 divide-y divide-border border-y border-border">{agent.fallbackModels.map((model, index) => { const state = controller.getFallbackValidation(model); return <div className="flex min-w-0 items-center justify-between gap-3 py-3" key={`${model}-${index}`}><span className="break-all font-mono text-xs">{model}</span><ValidationState status={state.status} /></div>; })}{agent.fallbackModels.length === 0 ? <p className="py-4 text-xs text-muted-foreground">-</p> : null}</div></div>
      <div><h4 className="text-xs font-semibold uppercase text-muted-foreground">{tk("agents.field.fallbackProviders")}</h4><div className="mt-2 divide-y divide-border border-y border-border">{agent.fallbackProviderIds.map((id) => <div className="py-3 text-xs" key={id}>{controller.providers.find((provider) => provider.id === id)?.name ?? id}</div>)}{agent.fallbackProviderIds.length === 0 ? <p className="py-4 text-xs text-muted-foreground">{tk("agents.routeInherited")}</p> : null}</div></div>
    </div>
  </Section>;
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <section className="space-y-4"><div className="border-b border-border pb-3"><h3 className="text-lg font-semibold">{title}</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p></div>{children}</section>;
}

function Data({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="min-w-0 border-l-2 border-primary/30 bg-muted/10 px-3 py-2"><div className="text-[10px] uppercase text-muted-foreground">{label}</div><div className={cn("mt-1 break-words text-sm", mono && "font-mono text-xs")}>{value}</div></div>;
}

function TextBlock({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div><h4 className="text-xs font-semibold uppercase text-muted-foreground">{label}</h4><p className={cn("mt-2 whitespace-pre-wrap break-words border-y border-border py-3 text-sm leading-6", mono && "font-mono text-xs")}>{value || "-"}</p></div>;
}

function TagGroup({ label, values, tone = "default" }: { label: string; values: string[]; tone?: "default" | "warn" | "danger" }) {
  return <div><h4 className="text-xs font-semibold uppercase text-muted-foreground">{label}</h4><div className="mt-2 flex flex-wrap gap-2">{values.map((value) => <span className={cn("rounded border px-2 py-1 text-xs", tone === "danger" ? "border-red-500/25 text-red-200" : tone === "warn" ? "border-amber-500/25 text-amber-200" : "border-border text-muted-foreground")} key={value}>{value}</span>)}{values.length === 0 ? <span className="text-xs text-muted-foreground">-</span> : null}</div></div>;
}

function BooleanSignal({ value, label }: { value: boolean; label: string }) {
  return <div className="flex min-h-11 items-center gap-2 border-y border-border px-1 text-xs"><CheckCircle2 className={cn("h-4 w-4", value ? "text-emerald-300" : "text-muted-foreground/40")} />{label}</div>;
}

function ValidationState({ status }: { status: string }) {
  const tk = useTk();
  const key = status === "VALID" ? "valid" : status === "INVALID" ? "invalid" : status === "CHECKING" ? "checking" : "notChecked";
  return <span className={cn("shrink-0 rounded border px-2 py-1 text-[10px] font-semibold", status === "VALID" ? "border-emerald-500/25 text-emerald-300" : status === "INVALID" ? "border-red-500/25 text-red-300" : "border-amber-500/25 text-amber-300")}>{tk(`agents.fallback.${key}`)}</span>;
}
