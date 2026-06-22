import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/input";
import { useTk } from "@/lib/i18n";
import { getProviderDisplayName } from "@/lib/providerDisplay";
import type { AgentPayload, ParameterMode } from "@/types/api";
import { routingPolicies, selectClass } from "./agentModels";
import { AgentParametersEditor } from "./AgentParametersEditor";
import type { AgentsController } from "./useAgentsController";

export function AgentRoutingEditor({ controller }: { controller: AgentsController }) {
  const tk = useTk();
  const { draft, setDraft, selectedProvider } = controller;
  return <div className="space-y-5">
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField id="agent-provider" label={tk("agents.field.provider")}>
        <select id="agent-provider" className={selectClass} value={draft.preferredProviderId ?? ""} onChange={(event) => setDraft({ ...draft, preferredProviderId: event.target.value || null, defaultModel: "" })}>
          <option value="">{tk("agents.routing.global")}</option>
          {controller.providers.map((provider) => <option key={provider.id} value={provider.id}>{getProviderDisplayName(provider)}</option>)}
        </select>
      </FormField>
      <FormField id="agent-model" label={tk("agents.field.model")}>
        {controller.openRouterModels.length > 0 ? <select id="agent-model" className={selectClass} value={draft.defaultModel ?? ""} onChange={(event) => setDraft({ ...draft, defaultModel: event.target.value || null })}>
          <option value="">{tk("agents.routing.providerDefault")}</option>
          {draft.defaultModel && !controller.openRouterModels.includes(draft.defaultModel) ? <option value={draft.defaultModel}>{draft.defaultModel}</option> : null}
          {controller.openRouterModels.map((model) => <option key={model} value={model}>{model}</option>)}
        </select> : <Input id="agent-model" value={draft.defaultModel ?? ""} onChange={(event) => setDraft({ ...draft, defaultModel: event.target.value })} />}
      </FormField>
    </div>
    {selectedProvider ? <div className="grid gap-3 border-y border-border py-3 text-xs sm:grid-cols-3">
      <Signal icon={selectedProvider.hasCredentials ? CheckCircle2 : AlertTriangle} good={selectedProvider.hasCredentials} label={selectedProvider.hasCredentials ? tk("agents.routing.credentialsOk") : tk("agents.routing.noCredentials")} />
      <Signal icon={CheckCircle2} good label={selectedProvider.environmentMode ?? "UNKNOWN"} />
      <Signal icon={CheckCircle2} good label={tk("agents.routing.modelsAvailable", { count: controller.providerModels?.count ?? controller.openRouterModels.length })} />
    </div> : null}
    {controller.primaryModelInvalid ? <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100"><AlertTriangle className="mr-2 inline h-4 w-4" />{tk("agents.routing.primaryInvalid")}</div> : null}
    <div className="grid gap-4 sm:grid-cols-3">
      <FormField id="agent-routing-policy" label={tk("agents.field.routingPolicy")}><select id="agent-routing-policy" className={selectClass} value={draft.routingPolicy ?? "GLOBAL_ROUTING"} onChange={(event) => setDraft({ ...draft, routingPolicy: event.target.value })}>{routingPolicies.map((policy) => <option key={policy} value={policy}>{policy}</option>)}</select></FormField>
      <FormField id="agent-cost-policy" label={tk("agents.field.costPolicy")}><select id="agent-cost-policy" className={selectClass} value={draft.costPreference ?? ""} onChange={(event) => setDraft({ ...draft, costPreference: (event.target.value || null) as AgentPayload["costPreference"] })}><option value="">GLOBAL</option><option value="LOW">LOW</option><option value="BALANCED">BALANCED</option><option value="QUALITY">QUALITY</option></select></FormField>
      <FormField id="agent-priority" label={tk("agents.field.priority")}><Input id="agent-priority" type="number" value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: Number(event.target.value) })} /></FormField>
    </div>
    <FormField id="agent-param-mode" label={tk("agents.field.parameterMode")}><select id="agent-param-mode" className={selectClass} value={draft.parameterMode ?? "ROLE_DEFAULT"} onChange={(event) => setDraft({ ...draft, parameterMode: event.target.value as ParameterMode })}><option value="ROLE_DEFAULT">{tk("agents.parameters.roleDefault")}</option><option value="MANUAL">{tk("agents.parameters.manual")}</option><option value="PROVIDER_DEFAULT">{tk("agents.parameters.providerDefault")}</option></select></FormField>
    <AgentParametersEditor controller={controller} />
  </div>;
}

function Signal({ icon: Icon, good, label }: { icon: typeof CheckCircle2; good: boolean; label: string }) {
  return <span className={good ? "text-emerald-300" : "text-amber-300"}><Icon className="mr-1.5 inline h-4 w-4" />{label}</span>;
}
