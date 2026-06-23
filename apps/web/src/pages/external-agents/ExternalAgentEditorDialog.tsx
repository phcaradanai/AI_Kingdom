import { Save, X } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useTk } from "@/lib/i18n";
import { EXECUTION_MODES, EXTERNAL_AGENT_TYPES, SAFETY_LEVELS } from "./externalAgentModels";
import type { ExternalAgentsController } from "./useExternalAgentsController";

const selectClass = "h-11 w-full rounded-md border border-border bg-input px-3 text-sm text-foreground outline-none transition focus:ring-2 focus:ring-primary";

export function ExternalAgentEditorDialog({ controller }: { controller: ExternalAgentsController }) {
  const tk = useTk();
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, []);
  const title = controller.editorMode === "create"
    ? tk("externalAgents.editor.createTitle")
    : tk("externalAgents.editor.editTitle", { name: controller.selected?.name ?? controller.draft.name });
  const draft = controller.draft;
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-5" role="presentation">
    <section aria-label={title} aria-modal="true" className="flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden border border-border bg-card shadow-2xl sm:rounded-lg" role="dialog">
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-4 py-4 sm:px-5"><div className="min-w-0"><h2 className="break-words text-lg font-semibold">{title}</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">{tk("externalAgents.editor.description")}</p></div><button aria-label={tk("externalAgents.editor.close")} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary" onClick={controller.closeEditor} type="button"><X className="h-4 w-4" /></button></header>
      <form className="flex min-h-0 flex-1 flex-col" onSubmit={(event) => void controller.submit(event)}>
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-5 sm:px-5">
          <fieldset className="space-y-4"><legend className="border-b border-border pb-2 text-sm font-semibold">{tk("externalAgents.section.identity")}</legend><div className="grid gap-4 sm:grid-cols-2"><Field label={tk("externalAgents.field.name")}><Input autoFocus required value={draft.name} onChange={(event) => controller.setDraft({ ...draft, name: event.target.value })} /></Field><Field label={tk("externalAgents.field.type")}><select className={selectClass} value={draft.type} onChange={(event) => controller.setDraft({ ...draft, type: event.target.value as typeof draft.type })}>{EXTERNAL_AGENT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select></Field><Field label={tk("externalAgents.field.role")}><Input required value={draft.roleTitle} onChange={(event) => controller.setDraft({ ...draft, roleTitle: event.target.value })} /></Field><Field label={tk("externalAgents.field.safety")}><select className={selectClass} value={draft.safetyLevel} onChange={(event) => controller.setDraft({ ...draft, safetyLevel: event.target.value as typeof draft.safetyLevel })}>{SAFETY_LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}</select></Field></div><Field label={tk("externalAgents.field.description")}><Textarea className="min-h-24" value={draft.description} onChange={(event) => controller.setDraft({ ...draft, description: event.target.value })} /></Field><Field label={tk("externalAgents.field.capabilities")}><Textarea className="min-h-24" placeholder={tk("externalAgents.editor.capabilitiesPlaceholder")} value={draft.capabilities.join("\n")} onChange={(event) => controller.setDraft({ ...draft, capabilities: lines(event.target.value) })} /></Field></fieldset>
          <fieldset className="space-y-4"><legend className="border-b border-border pb-2 text-sm font-semibold">{tk("externalAgents.section.handoff")}</legend><div className="grid gap-4 sm:grid-cols-2"><Field label={tk("externalAgents.field.mode")}><select className={selectClass} value={draft.executionMode} onChange={(event) => controller.setDraft({ ...draft, executionMode: event.target.value as typeof draft.executionMode })}>{EXECUTION_MODES.map((mode) => <option key={mode} value={mode}>{mode}</option>)}</select></Field><Field label={tk("externalAgents.field.runtime")}><Input max={7200} min={30} type="number" value={draft.maxRuntimeSeconds} onChange={(event) => controller.setDraft({ ...draft, maxRuntimeSeconds: Number(event.target.value) })} /></Field><Field label={tk("externalAgents.field.directory")}><Input value={draft.workingDirectory ?? ""} onChange={(event) => controller.setDraft({ ...draft, workingDirectory: event.target.value })} /></Field><Field label={tk("externalAgents.field.environment")}><Input value={draft.environmentProfile ?? ""} onChange={(event) => controller.setDraft({ ...draft, environmentProfile: event.target.value })} /></Field></div><Field label={tk("externalAgents.field.command")}><Textarea className="min-h-24 font-mono text-xs" placeholder={tk("externalAgents.editor.commandPlaceholder")} value={draft.command ?? ""} onChange={(event) => controller.setDraft({ ...draft, command: event.target.value })} /></Field><div className="grid gap-3 sm:grid-cols-3"><CheckField checked={draft.isActive} label={tk("externalAgents.active")} onChange={(checked) => controller.setDraft({ ...draft, isActive: checked })} /><CheckField checked={draft.bridgeEnabled} label={tk("externalAgents.field.bridge")} onChange={(checked) => controller.setDraft({ ...draft, bridgeEnabled: checked })} /><CheckField checked={draft.requiresApproval} label={tk("externalAgents.field.approval")} onChange={(checked) => controller.setDraft({ ...draft, requiresApproval: checked })} /></div></fieldset>
          {controller.error ? <div className="border-l-2 border-red-400 bg-red-500/10 p-3 text-sm text-red-100">{controller.error}</div> : null}
        </div>
        <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border bg-card/95 px-4 py-3 backdrop-blur sm:px-5"><Button className="min-h-11" onClick={controller.closeEditor} type="button" variant="outline">{tk("externalAgents.editor.cancel")}</Button><Button className="min-h-11" disabled={controller.saving || !draft.name.trim() || !draft.roleTitle.trim()} type="submit"><Save className="h-4 w-4" />{controller.saving ? tk("externalAgents.editor.saving") : tk("externalAgents.editor.save")}</Button></footer>
      </form>
    </section>
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block min-w-0 text-xs font-semibold text-muted-foreground"><span className="mb-2 block">{label}</span>{children}</label>;
}

function CheckField({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return <label className="flex min-h-11 items-center gap-3 rounded-md border border-border px-3 text-sm"><input className="h-4 w-4 accent-primary" checked={checked} onChange={(event) => onChange(event.target.checked)} type="checkbox" />{label}</label>;
}

function lines(value: string): string[] {
  return value.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean);
}
