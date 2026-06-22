import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useTk } from "@/lib/i18n";
import { defaultModelParameters, selectClass, splitLines } from "./agentModels";
import type { AgentsController } from "./useAgentsController";

export function AgentParametersEditor({ controller }: { controller: AgentsController }) {
  const tk = useTk();
  const { draft, setDraft, updateModelParameters } = controller;
  if (draft.parameterMode === "ROLE_DEFAULT") return <p className="rounded-md border border-border bg-muted/15 p-3 text-xs text-muted-foreground">{tk("agents.parameters.roleHelp")}</p>;
  if (draft.parameterMode === "PROVIDER_DEFAULT") return <p className="rounded-md border border-border bg-muted/15 p-3 text-xs text-muted-foreground">{tk("agents.parameters.providerHelp")}</p>;
  const params = draft.modelParameters ?? defaultModelParameters;
  return <section className="space-y-5 border-t border-border pt-5">
    <h3 className="text-sm font-semibold">{tk("agents.parameters.title")}</h3>
    <div className="space-y-3 rounded-md border border-border p-3">
      <h4 className="text-xs font-semibold uppercase text-muted-foreground">{tk("agents.parameters.reasoning")}</h4>
      <div className="flex flex-wrap gap-3">
        <Check checked={params.reasoning?.enabled ?? true} label={tk("agents.parameters.reasoningEnabled")} onChange={(checked) => setDraft({ ...draft, modelParameters: { ...params, reasoning: { ...params.reasoning, enabled: checked } } })} />
        <Check checked={params.reasoning?.exclude ?? true} label={tk("agents.parameters.excludeReasoning")} onChange={(checked) => setDraft({ ...draft, modelParameters: { ...params, reasoning: { ...params.reasoning, exclude: checked } } })} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="agent-reasoning-effort" label={tk("agents.parameters.reasoningEffort")}><select id="agent-reasoning-effort" className={selectClass} value={params.reasoning?.effort ?? "medium"} onChange={(event) => setDraft({ ...draft, modelParameters: { ...params, reasoning: { ...params.reasoning, effort: event.target.value as "none" | "minimal" | "low" | "medium" | "high" | "xhigh" } } })}>{["none", "minimal", "low", "medium", "high", "xhigh"].map((effort) => <option key={effort} value={effort}>{effort}</option>)}</select></FormField>
        <FormField id="agent-reasoning-max-tokens" label={tk("agents.parameters.reasoningTokens")}><Input id="agent-reasoning-max-tokens" type="number" value={params.reasoning?.max_tokens ?? ""} onChange={(event) => setDraft({ ...draft, modelParameters: { ...params, reasoning: { ...params.reasoning, max_tokens: numberOrNull(event.target.value) } } })} /></FormField>
      </div>
    </div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <NumberField id="mp-temperature" label={tk("agents.field.temperature")} value={params.temperature} onChange={(value) => updateModelParameters({ temperature: value })} step="0.05" />
      <NumberField id="mp-max-tokens" label={tk("agents.field.maxTokens")} value={params.max_tokens} onChange={(value) => updateModelParameters({ max_tokens: value })} />
      <NumberField id="mp-top-p" label="top_p" value={params.top_p} onChange={(value) => updateModelParameters({ top_p: value })} step="0.01" />
      <NumberField id="mp-seed" label="seed" value={params.seed} onChange={(value) => updateModelParameters({ seed: value })} />
    </div>
    <div className="grid gap-3 sm:grid-cols-3">
      <Check checked={params.stream ?? false} label="stream" onChange={(checked) => updateModelParameters({ stream: checked })} />
      <Check checked={params.tools?.enabled ?? false} label="tools" onChange={(checked) => updateModelParameters({ tools: { ...params.tools, enabled: checked } })} />
      <FormField id="mp-tool-choice" label="tool_choice"><select id="mp-tool-choice" className={selectClass} value={params.tools?.tool_choice ?? "auto"} onChange={(event) => updateModelParameters({ tools: { ...params.tools, tool_choice: event.target.value as "auto" | "none" | "required" } })}><option value="auto">auto</option><option value="none">none</option><option value="required">required</option></select></FormField>
    </div>
    <details className="border-y border-border py-2">
      <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">{tk("agents.parameters.advanced")}</summary>
      <div className="grid gap-4 py-3 sm:grid-cols-2 xl:grid-cols-3">
        <FormField id="mp-response-format" label="response_format"><select id="mp-response-format" className={selectClass} value={params.response_format ?? "none"} onChange={(event) => updateModelParameters({ response_format: event.target.value as "none" | "json_object" | "json_schema" })}><option value="none">none</option><option value="json_object">json_object</option><option value="json_schema">json_schema</option></select></FormField>
        <FormField id="mp-openrouter-route" label="openrouter_route"><select id="mp-openrouter-route" className={selectClass} value={params.openrouter_route ?? "none"} onChange={(event) => updateModelParameters({ openrouter_route: event.target.value as "none" | "fallback" })}><option value="none">none</option><option value="fallback">fallback</option></select></FormField>
        <NumberField id="mp-frequency-penalty" label="frequency_penalty" value={params.frequency_penalty} onChange={(value) => updateModelParameters({ frequency_penalty: value })} step="0.1" />
        <NumberField id="mp-presence-penalty" label="presence_penalty" value={params.presence_penalty} onChange={(value) => updateModelParameters({ presence_penalty: value })} step="0.1" />
        <NumberField id="mp-repetition-penalty" label="repetition_penalty" value={params.repetition_penalty} onChange={(value) => updateModelParameters({ repetition_penalty: value })} step="0.05" />
        <NumberField id="mp-top-k" label="top_k" value={params.top_k} onChange={(value) => updateModelParameters({ top_k: value })} />
        <NumberField id="mp-min-p" label="min_p" value={params.min_p} onChange={(value) => updateModelParameters({ min_p: value })} step="0.01" />
        <FormField id="mp-stop" label="stop"><Textarea id="mp-stop" value={(params.stop ?? []).join("\n")} onChange={(event) => updateModelParameters({ stop: splitLines(event.target.value) })} /></FormField>
        <FormField id="mp-provider-preferences" label="openrouter_provider_preferences"><Textarea id="mp-provider-preferences" value={(params.openrouter_provider_preferences ?? []).join("\n")} onChange={(event) => updateModelParameters({ openrouter_provider_preferences: splitLines(event.target.value) })} /></FormField>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">{(["web", "file-parser", "response-healing", "context-compression"] as const).map((plugin) => <Check key={plugin} checked={(params.plugins ?? []).includes(plugin)} label={plugin} onChange={(checked) => { const current = params.plugins ?? []; const plugins = checked ? [...new Set([...current, plugin])] : current.filter((item) => item !== plugin); updateModelParameters({ plugins: plugins.length ? plugins : null }); }} />)}</div>
    </details>
  </section>;
}

function NumberField({ id, label, value, onChange, step }: { id: string; label: string; value: number | null | undefined; onChange: (value: number | null) => void; step?: string }) {
  return <FormField id={id} label={label}><Input id={id} type="number" step={step} value={value ?? ""} onChange={(event) => onChange(numberOrNull(event.target.value))} /></FormField>;
}

function Check({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-border px-3 text-xs"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />{label}</label>;
}

function numberOrNull(value: string) { return value === "" ? null : Number(value); }
