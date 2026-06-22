import { AlertTriangle, CheckCircle2, CircleDashed, HelpCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTk } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { AgentRoutingPreviewDto, EffectiveRequestPreviewDto } from "@/types/api";

export function AgentRoutingEvidence({
  preview,
  loading,
  onRefresh,
  onHelp,
}: {
  preview: AgentRoutingPreviewDto | null;
  loading: boolean;
  onRefresh: () => void;
  onHelp: () => void;
}) {
  const tk = useTk();
  return (
    <section className="space-y-4" aria-label={tk("agents.routing.title")}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
        <div>
          <h3 className="text-sm font-semibold">{tk("agents.routing.title")}</h3>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">{tk("agents.routing.description")}</p>
        </div>
        <div className="flex gap-2">
          <Button className="min-h-11" variant="ghost" onClick={onHelp} type="button"><HelpCircle className="h-4 w-4" />{tk("agents.routing.help")}</Button>
          <Button className="min-h-11" variant="outline" disabled={loading} onClick={onRefresh} type="button"><RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />{tk("agents.routing.refresh")}</Button>
        </div>
      </div>
      {loading ? <p className="text-sm text-muted-foreground">{tk("agents.routing.loading")}</p> : null}
      {!loading && !preview ? <p className="rounded-md border border-dashed border-border p-5 text-sm text-muted-foreground">{tk("agents.routing.noPreview")}</p> : null}
      {!loading && preview ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <EvidenceCell label={tk("agents.routing.primary")} value={preview.effectiveRoute ? `${preview.effectiveRoute.provider.name} / ${preview.effectiveRoute.model || preview.effectiveRoute.provider.defaultModel}` : "-"} />
            <EvidenceCell label={tk("agents.routing.fallbackChain")} value={preview.effectiveRoute?.fallbackProviders.map((provider) => provider.name).join(" -> ") || "-"} />
            <EvidenceCell label={tk("agents.routing.latestCall")} value={preview.latestUsage ? `${preview.latestUsage.provider} / ${preview.latestUsage.model}` : "-"} />
          </div>
          {preview.sandboxBeforeApiModels || preview.preferredProviderBlocked ? (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
              <AlertTriangle className="mr-2 inline h-4 w-4" />
              {preview.preferredProviderBlocked?.reason ?? "Sandbox is earlier than configured API models."}
            </div>
          ) : null}
          {preview.sandboxFallbackMode ? (
            <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-100">{tk("agents.routing.productionBlocked")}</div>
          ) : null}
          {preview.attemptPlan?.length ? (
            <div>
              <h4 className="text-xs font-semibold uppercase text-muted-foreground">{tk("agents.routing.attemptOrder")}</h4>
              <ol className="mt-2 divide-y divide-border border-y border-border">
                {preview.attemptPlan.map((entry, index) => (
                  <li className="grid min-w-0 grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-2 py-2.5 text-xs" key={`${entry.providerId}-${entry.model}-${index}`}>
                    <span className="font-mono text-muted-foreground">{index + 1}</span>
                    <span className="min-w-0"><strong>{entry.providerName}</strong><span className="mx-1 text-muted-foreground">/</span><span className="break-all font-mono">{entry.model}</span></span>
                    <span className={cn("inline-flex items-center gap-1", entry.status === "READY" ? "text-emerald-300" : entry.status === "BLOCKED" ? "text-red-300" : "text-muted-foreground")}>
                      {entry.status === "READY" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <CircleDashed className="h-3.5 w-3.5" />}{entry.status}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
          {preview.effectiveRoute?.fallbackProviders.length ? (
            <div className="text-xs text-muted-foreground">
              <strong className="text-foreground">{tk("agents.routing.fallbackChain")}</strong>{" "}
              {preview.effectiveRoute.fallbackProviders.map((provider, index) => (
                <span key={`${provider.id}-${provider.defaultModel}-${index}`}>{index > 0 ? " -> " : ""}{provider.name} ({provider.environmentMode})</span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export function AgentRequestEvidence({ preview, loading, onRefresh }: { preview: EffectiveRequestPreviewDto | null; loading: boolean; onRefresh: () => void }) {
  const tk = useTk();
  const fields: Array<[string, string]> = preview ? [
    ["configuredProvider", preview.preview.configuredProvider],
    ["configuredModel", preview.preview.configuredModel ?? "provider default"],
    ["actualSentModel", preview.preview.actualSentModel],
    ["finalResponseModel", preview.preview.finalResponseModel ?? "not available"],
    ["streamEnabled", String(preview.preview.streamEnabled)],
    ["reasoningEnabled", String(preview.preview.reasoningEnabled)],
    ["reasoningEffort", preview.preview.reasoningEffort ?? "none"],
    ["reasoningExcluded", String(preview.preview.reasoningExcluded)],
    ["response_format", preview.preview.response_format ?? "none"],
  ] : [];
  return (
    <section className="space-y-4" aria-label={tk("agents.preview.title")}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
        <div><h3 className="text-sm font-semibold">{tk("agents.preview.title")}</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{tk("agents.preview.description")}</p></div>
        <Button className="min-h-11" variant="outline" disabled={loading} onClick={onRefresh} type="button"><RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />{tk("agents.routing.refresh")}</Button>
      </div>
      {loading ? <p className="text-sm text-muted-foreground">{tk("agents.routing.loading")}</p> : null}
      {!loading && !preview ? <p className="rounded-md border border-dashed border-border p-5 text-sm text-muted-foreground">{tk("agents.routing.noPreview")}</p> : null}
      {!loading && preview ? (
        <>
          <div className="text-xs text-muted-foreground">{tk("agents.preview.mode")}: <strong className="text-foreground">{preview.parameterMode}</strong></div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{fields.map(([label, value]) => <EvidenceCell key={label} label={label} value={value} mono />)}</div>
          <JsonEvidence title={tk("agents.preview.validation")} value={preview.preview.validationState} />
          <JsonEvidence title={tk("agents.preview.body")} value={preview.preview.actualSentBodyPreview} />
        </>
      ) : null}
    </section>
  );
}

function EvidenceCell({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="min-w-0 border-l-2 border-primary/35 bg-muted/15 px-3 py-2"><div className="text-[10px] uppercase text-muted-foreground">{label}</div><div className={cn("mt-1 break-all text-xs text-foreground", mono && "font-mono")}>{value}</div></div>;
}

function JsonEvidence({ title, value }: { title: string; value: Record<string, unknown> }) {
  return <details className="border-y border-border py-3"><summary className="min-h-11 cursor-pointer py-3 text-xs font-semibold text-muted-foreground">{title}</summary><pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all bg-background/50 p-3 font-mono text-xs text-foreground">{JSON.stringify(value, null, 2)}</pre></details>;
}
