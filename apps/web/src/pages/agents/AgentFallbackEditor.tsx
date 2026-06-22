import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTk } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { selectClass } from "./agentModels";
import type { AgentsController } from "./useAgentsController";

export function AgentFallbackEditor({ controller }: { controller: AgentsController }) {
  const tk = useTk();
  const models = controller.draft.fallbackModels ?? [];
  const providerIds = controller.draft.fallbackProviderIds ?? [];
  return <div className="space-y-6">
    <section>
      <div className="border-b border-border pb-3"><h3 className="text-sm font-semibold">{tk("agents.field.fallbackModels")}</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{tk("agents.fallbacks.description")}</p></div>
      <div className="mt-3 space-y-2">{models.map((model, index) => { const validation = controller.getFallbackValidation(model); return <div className="grid min-w-0 gap-2 rounded-md border border-border p-2 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center" key={`${index}-${model}`}>
        <div className="min-w-0"><Input aria-label={tk("agents.fallback.modelLabel", { index: index + 1 })} className="min-h-11 font-mono text-xs" value={model} onChange={(event) => controller.updateFallbackModel(index, event.target.value)} />{validation.reason ? <p className="mt-1 break-words text-[11px] leading-4 text-muted-foreground">{validation.reason}</p> : null}</div>
        <Status status={validation.status} />
        <div className="flex justify-end gap-1"><IconButton label="Move up" disabled={index === 0} onClick={() => controller.moveFallbackModel(index, -1)}><ArrowUp className="h-4 w-4" /></IconButton><IconButton label="Move down" disabled={index === models.length - 1} onClick={() => controller.moveFallbackModel(index, 1)}><ArrowDown className="h-4 w-4" /></IconButton><IconButton label="Remove model" onClick={() => controller.removeFallbackModel(index)}><Trash2 className="h-4 w-4" /></IconButton></div>
      </div>; })}</div>
      <div className="mt-3 flex min-w-0 gap-2">{controller.openRouterModels.length > 0 ? <select aria-label={tk("agents.fallback.addModel")} className={cn(selectClass, "min-w-0 flex-1")} value={controller.newFallbackModel} onChange={(event) => controller.setNewFallbackModel(event.target.value)}><option value="">{tk("agents.fallback.addModel")}</option>{controller.openRouterModels.filter((model) => !models.includes(model)).map((model) => <option key={model} value={model}>{model}</option>)}</select> : <Input aria-label={tk("agents.fallback.addModel")} className="min-w-0 flex-1" value={controller.newFallbackModel} onChange={(event) => controller.setNewFallbackModel(event.target.value)} />}
        <Button aria-label={tk("agents.fallback.addModel")} className="min-h-11 min-w-11 px-3" type="button" variant="outline" disabled={!controller.newFallbackModel.trim()} onClick={controller.addFallbackModel}><Plus className="h-4 w-4" /></Button>
      </div>
    </section>
    <section>
      <div className="border-b border-border pb-3"><h3 className="text-sm font-semibold">{tk("agents.field.fallbackProviders")}</h3></div>
      <div className="mt-3 space-y-2">{providerIds.map((id, index) => { const provider = controller.providers.find((item) => item.id === id); return <div className="flex min-w-0 items-center gap-2 rounded-md border border-border p-2" key={id}><div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold">{provider?.name ?? id}</div><div className="mt-1 text-[10px] text-muted-foreground">{provider?.environmentMode ?? "UNKNOWN"} · {provider?.hasCredentials ? tk("agents.routing.credentialsOk") : tk("agents.routing.noCredentials")}</div></div><IconButton label="Move up" disabled={index === 0} onClick={() => controller.moveFallbackProvider(index, -1)}><ArrowUp className="h-4 w-4" /></IconButton><IconButton label="Move down" disabled={index === providerIds.length - 1} onClick={() => controller.moveFallbackProvider(index, 1)}><ArrowDown className="h-4 w-4" /></IconButton><IconButton label="Remove provider" onClick={() => controller.removeFallbackProvider(id)}><Trash2 className="h-4 w-4" /></IconButton></div>; })}</div>
      <div className="mt-3 flex min-w-0 gap-2"><select aria-label={tk("agents.fallback.addProvider")} className={cn(selectClass, "min-w-0 flex-1")} value={controller.newFallbackProvider} onChange={(event) => controller.setNewFallbackProvider(event.target.value)}><option value="">{tk("agents.fallback.addProvider")}</option>{controller.providers.filter((provider) => !providerIds.includes(provider.id)).map((provider) => <option key={provider.id} value={provider.id}>{provider.name} ({provider.environmentMode})</option>)}</select><Button aria-label={tk("agents.fallback.addProvider")} className="min-h-11 min-w-11 px-3" type="button" variant="outline" disabled={!controller.newFallbackProvider.trim()} onClick={controller.addFallbackProvider}><Plus className="h-4 w-4" /></Button></div>
    </section>
    {controller.fallbackWarning ? <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">{tk("agents.fallback.warning", { count: controller.fallbackWarning })}</div> : null}
  </div>;
}

function Status({ status }: { status: string }) {
  const tk = useTk();
  const key = status === "VALID" ? "valid" : status === "INVALID" ? "invalid" : status === "CHECKING" ? "checking" : "notChecked";
  return <span className={cn("justify-self-start rounded border px-2 py-1 text-[10px] font-semibold sm:justify-self-end", status === "VALID" ? "border-emerald-500/25 text-emerald-300" : status === "INVALID" ? "border-red-500/25 text-red-300" : "border-amber-500/25 text-amber-300")}>{tk(`agents.fallback.${key}`)}</span>;
}

function IconButton({ label, disabled = false, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button aria-label={label} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-30" disabled={disabled} onClick={onClick} type="button">{children}</button>;
}
