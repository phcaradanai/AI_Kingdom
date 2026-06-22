import { Bot, BrainCircuit, Braces, Cable, Network, Save, Sparkles, X } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useTk } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { AgentSection } from "./agentModels";
import { AgentFallbackEditor } from "./AgentFallbackEditor";
import { AgentIdentityEditor } from "./AgentIdentityEditor";
import { AgentRequestEvidence, AgentRoutingEvidence } from "./AgentPreview";
import { AgentRoutingEditor } from "./AgentRoutingEditor";
import type { AgentsController } from "./useAgentsController";

const sections: Array<{ id: AgentSection; icon: typeof Bot }> = [
  { id: "identity", icon: Bot },
  { id: "prompt", icon: Braces },
  { id: "skills", icon: Sparkles },
  { id: "routing", icon: Cable },
  { id: "fallbacks", icon: Network },
  { id: "preview", icon: BrainCircuit },
];

export function AgentEditorDialog({ controller }: { controller: AgentsController }) {
  const tk = useTk();
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, []);
  const title = controller.editorMode === "create" ? tk("agents.editor.createTitle") : tk("agents.editor.editTitle", { name: controller.selected?.title ?? controller.draft.title });
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-5" role="presentation">
    <section aria-label={title} aria-modal="true" className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden border border-border bg-card shadow-2xl sm:rounded-lg" role="dialog">
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-4 py-4 sm:px-5">
        <div className="min-w-0"><h2 className="break-words text-lg font-semibold">{title}</h2><p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">{tk("agents.editor.description")}</p></div>
        <button aria-label={tk("agents.editor.close")} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary" onClick={controller.closeEditor} type="button"><X className="h-4 w-4" /></button>
      </header>
      <nav className="shrink-0 overflow-x-auto border-b border-border" aria-label={tk("agents.sections")}><div className="flex min-w-max gap-1 px-3">{sections.map(({ id, icon: Icon }) => <button aria-pressed={controller.activeSection === id} className={cn("inline-flex min-h-11 min-w-28 items-center justify-center gap-2 border-b-2 px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary focus:ring-inset", controller.activeSection === id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")} key={id} onClick={() => controller.setActiveSection(id)} type="button"><Icon className="h-4 w-4" />{tk(`agents.section.${id}`)}</button>)}</div></nav>
      <form className="flex min-h-0 flex-1 flex-col" onSubmit={(event) => void controller.submit(event)}>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-5">
          <SectionIntro section={controller.activeSection} />
          <div className="mt-5 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1" key={controller.activeSection}>
            {controller.activeSection === "identity" || controller.activeSection === "prompt" || controller.activeSection === "skills" ? <AgentIdentityEditor controller={controller} /> : null}
            {controller.activeSection === "routing" ? <AgentRoutingEditor controller={controller} /> : null}
            {controller.activeSection === "fallbacks" ? <AgentFallbackEditor controller={controller} /> : null}
            {controller.activeSection === "preview" ? <div className="space-y-8"><AgentRoutingEvidence preview={controller.routingPreview} loading={controller.loadingPreview} onRefresh={() => void controller.loadRoutingPreview()} onHelp={() => controller.setRoutingHelpOpen(true)} /><AgentRequestEvidence preview={controller.effectivePreview} loading={controller.loadingEffectivePreview} onRefresh={() => void controller.loadEffectivePreview()} /></div> : null}
          </div>
          {controller.error ? <div className="mt-5 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">{controller.error}</div> : null}
        </div>
        <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border bg-card/95 px-4 py-3 backdrop-blur sm:px-5">
          <Button className="min-h-11" type="button" variant="outline" onClick={controller.closeEditor}>{tk("agents.editor.cancel")}</Button>
          <Button className="min-h-11" disabled={controller.saving || !controller.draft.name.trim()} type="submit"><Save className="h-4 w-4" />{controller.saving ? tk("agents.editor.saving") : tk("agents.editor.save")}</Button>
        </footer>
      </form>
    </section>
  </div>;
}

function SectionIntro({ section }: { section: AgentSection }) {
  const tk = useTk();
  const titles: Record<AgentSection, string> = { identity: "identity", prompt: "prompt", skills: "skills", routing: "routing", fallbacks: "fallbacks", preview: "preview" };
  return <div className="border-b border-border pb-3"><h3 className="text-base font-semibold">{tk(`agents.${titles[section]}.title`)}</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">{tk(`agents.${titles[section]}.description`)}</p></div>;
}
