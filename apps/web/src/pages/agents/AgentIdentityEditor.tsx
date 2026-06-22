import { Image, RotateCcw, ShieldAlert } from "lucide-react";
import { useRef } from "react";
import { AgentPortrait } from "@/components/AgentPortrait";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useTk } from "@/lib/i18n";
import { splitLines } from "./agentModels";
import type { AgentsController } from "./useAgentsController";

export function AgentIdentityEditor({ controller }: { controller: AgentsController }) {
  if (controller.activeSection === "prompt") return <PromptFields controller={controller} />;
  if (controller.activeSection === "skills") return <SkillsFields controller={controller} />;
  return <IdentityFields controller={controller} />;
}

function IdentityFields({ controller }: { controller: AgentsController }) {
  const tk = useTk();
  const { draft, setDraft } = controller;
  return <div className="space-y-5">
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField id="agent-name" label={tk("agents.field.name")} required><Input id="agent-name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></FormField>
      <FormField id="agent-title" label={tk("agents.field.title")}><Input id="agent-title" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></FormField>
      <FormField id="agent-role" label={tk("agents.field.role")}><Input id="agent-role" value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value })} /></FormField>
      <FormField id="agent-specialty" label={tk("agents.field.specialty")}><Input id="agent-specialty" value={draft.specialty} onChange={(event) => setDraft({ ...draft, specialty: event.target.value })} /></FormField>
    </div>
    <FormField id="agent-description" label={tk("agents.field.description")}><Textarea id="agent-description" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></FormField>
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField id="agent-personal-detail" label={tk("agents.field.personalDetail")}><Textarea id="agent-personal-detail" value={draft.personalDetail ?? ""} onChange={(event) => setDraft({ ...draft, personalDetail: event.target.value })} /></FormField>
      <FormField id="agent-personality" label={tk("agents.field.personality")}><Textarea id="agent-personality" value={draft.personality ?? ""} onChange={(event) => setDraft({ ...draft, personality: event.target.value })} /></FormField>
      <FormField id="agent-king-relationship" label={tk("agents.field.kingRelationship")}><Textarea id="agent-king-relationship" value={draft.relationshipWithKing ?? ""} onChange={(event) => setDraft({ ...draft, relationshipWithKing: event.target.value })} /></FormField>
      <FormField id="agent-council-relationship" label={tk("agents.field.councilRelationship")}><Textarea id="agent-council-relationship" value={draft.relationshipWithCouncil ?? ""} onChange={(event) => setDraft({ ...draft, relationshipWithCouncil: event.target.value })} /></FormField>
    </div>
    {controller.selected ? <DisplayProfileFields controller={controller} /> : null}
  </div>;
}

function DisplayProfileFields({ controller }: { controller: AgentsController }) {
  const tk = useTk();
  const fileInput = useRef<HTMLInputElement>(null);
  const agent = controller.selected!;
  const display = controller.displayDraft;
  return <section className="space-y-4 border-t border-border pt-5">
    <div className="rounded-md border border-amber-500/25 bg-amber-500/5 p-3 text-xs text-amber-100">{tk("agents.display.boundary")}</div>
    <div className="grid gap-5 sm:grid-cols-[160px_minmax(0,1fr)]">
      <AgentPortrait agent={agent} size="hero" shape="portrait-card" showStatusRing={false} clickToView />
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <FormField id="dp-display-name" label={tk("agents.field.displayName")}><Input id="dp-display-name" value={display.displayName ?? ""} onChange={(event) => controller.setDisplayDraft({ ...display, displayName: event.target.value || null })} placeholder={agent.canonicalName ?? agent.name} /></FormField>
        <FormField id="dp-display-title" label={tk("agents.field.displayTitle")}><Input id="dp-display-title" value={display.displayTitle ?? ""} onChange={(event) => controller.setDisplayDraft({ ...display, displayTitle: event.target.value || null })} placeholder={agent.canonicalTitle ?? agent.title} /></FormField>
        <div className="sm:col-span-2"><FormField id="dp-avatar-url" label={tk("agents.field.avatarUrl")}><Input id="dp-avatar-url" value={display.avatarUrl ?? ""} onChange={(event) => controller.setDisplayDraft({ ...display, avatarUrl: event.target.value || null })} /></FormField></div>
      </div>
    </div>
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField id="dp-avatar-prompt" label={tk("agents.field.avatarPrompt")}><Textarea id="dp-avatar-prompt" value={display.avatarPrompt ?? ""} onChange={(event) => controller.setDisplayDraft({ ...display, avatarPrompt: event.target.value || null })} /></FormField>
      <FormField id="dp-avatar-style" label={tk("agents.field.avatarStyle")}><Input id="dp-avatar-style" value={display.avatarStyle ?? ""} onChange={(event) => controller.setDisplayDraft({ ...display, avatarStyle: event.target.value || null })} /></FormField>
    </div>
    <input ref={fileInput} className="hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void controller.uploadAvatar(file); event.currentTarget.value = ""; }} />
    <div className="flex flex-wrap gap-2">
      <Button className="min-h-11" type="button" variant="outline" disabled={controller.displaySaving} onClick={() => fileInput.current?.click()}><Image className="h-4 w-4" />{tk("agents.display.upload")}</Button>
      <Button className="min-h-11" type="button" disabled={controller.displaySaving} onClick={() => void controller.saveDisplayProfile()}>{controller.displaySaving ? tk("agents.display.saving") : tk("agents.display.save")}</Button>
      <Button className="min-h-11" type="button" variant="outline" disabled={controller.displaySaving || !agent.avatarUrl} onClick={() => void controller.resetPortrait()}><Image className="h-4 w-4" />{tk("agents.display.resetPortrait")}</Button>
      <Button className="min-h-11" type="button" variant="ghost" disabled={controller.displaySaving} onClick={() => controller.setDisplayDraft({ ...display, displayName: null, displayTitle: null })}><RotateCcw className="h-4 w-4" />{tk("agents.display.resetCanonical")}</Button>
    </div>
    <p className="text-xs text-muted-foreground">{tk("agents.display.help")}</p>
    {controller.displayError ? <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">{controller.displayError}</div> : null}
  </section>;
}

function PromptFields({ controller }: { controller: AgentsController }) {
  const tk = useTk();
  const { draft, setDraft } = controller;
  return <div className="space-y-5">
    <FormField id="agent-system-prompt" label={tk("agents.field.systemPrompt")}><Textarea className="min-h-64 font-mono text-xs leading-6" id="agent-system-prompt" value={draft.systemPrompt} onChange={(event) => setDraft({ ...draft, systemPrompt: event.target.value })} /></FormField>
    <FormField id="agent-response-style" label={tk("agents.field.responseStyle")}><Textarea id="agent-response-style" value={draft.responseStyle} onChange={(event) => setDraft({ ...draft, responseStyle: event.target.value })} /></FormField>
  </div>;
}

function SkillsFields({ controller }: { controller: AgentsController }) {
  const tk = useTk();
  const { draft, setDraft } = controller;
  return <div className="space-y-5">
    <FormField id="agent-skills" label={tk("agents.field.skills")}><Input id="agent-skills" value={draft.skills.join(", ")} onChange={(event) => setDraft({ ...draft, skills: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} /></FormField>
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField id="agent-allowed-actions" label={tk("agents.field.allowedActions")}><Textarea id="agent-allowed-actions" value={(draft.allowedActions ?? []).join("\n")} onChange={(event) => setDraft({ ...draft, allowedActions: splitLines(event.target.value) })} /></FormField>
      <FormField id="agent-forbidden-actions" label={tk("agents.field.forbiddenActions")}><Textarea id="agent-forbidden-actions" value={(draft.forbiddenActions ?? []).join("\n")} onChange={(event) => setDraft({ ...draft, forbiddenActions: splitLines(event.target.value) })} /></FormField>
      <FormField id="agent-approval-required" label={tk("agents.field.approvalRequired")}><Textarea id="agent-approval-required" value={(draft.approvalRequiredFor ?? []).join("\n")} onChange={(event) => setDraft({ ...draft, approvalRequiredFor: splitLines(event.target.value) })} /></FormField>
      <FormField id="agent-role-boundaries" label={tk("agents.field.roleBoundaries")}><Textarea id="agent-role-boundaries" value={draft.roleBoundaries ?? ""} onChange={(event) => setDraft({ ...draft, roleBoundaries: event.target.value })} /></FormField>
    </div>
    <div className="grid gap-2 sm:grid-cols-3">
      <Check label={tk("agents.memory.propose")} checked={draft.canProposeMemoryCandidates ?? true} onChange={(checked) => setDraft({ ...draft, canProposeMemoryCandidates: checked })} />
      <Check label={tk("agents.memory.autoSave")} checked={draft.canAutoSaveTrustedMemory ?? false} onChange={(checked) => setDraft({ ...draft, canAutoSaveTrustedMemory: checked })} />
      <Check label={tk("agents.memory.approval")} checked={draft.memoryRequiresApproval ?? true} onChange={(checked) => setDraft({ ...draft, memoryRequiresApproval: checked })} />
    </div>
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField id="agent-memory-categories" label={tk("agents.field.memoryCategories")}><Textarea id="agent-memory-categories" value={(draft.allowedMemoryCategories ?? []).join("\n")} onChange={(event) => setDraft({ ...draft, allowedMemoryCategories: splitLines(event.target.value) })} /></FormField>
      <FormField id="agent-retention-policy" label={tk("agents.field.retentionPolicy")}><Textarea id="agent-retention-policy" value={draft.retentionPolicy ?? ""} onChange={(event) => setDraft({ ...draft, retentionPolicy: event.target.value })} /></FormField>
    </div>
    <div className="rounded-md border border-amber-500/25 bg-amber-500/5 p-3 text-xs text-amber-100"><ShieldAlert className="mr-2 inline h-4 w-4" />{tk("agents.memory.safety")}</div>
  </div>;
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-border px-3 text-xs"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />{label}</label>;
}
