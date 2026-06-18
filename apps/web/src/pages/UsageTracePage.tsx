import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Fingerprint,
  Layers,
  XCircle,
  RefreshCw,
  MinusCircle,
  Zap,
  Database,
  Brain,
  FileText,
  Users,
  Activity
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { getModelDisplayName, getProviderDisplayName, getProviderTerminologyText } from "@/lib/providerDisplay";
import { cn, formatDate } from "@/lib/utils";
import type { AttributionStatus, AIUsageTraceStepDto, UsageTraceDetailsDto } from "@/types/api";

function attributionLabel(status: AttributionStatus) {
  if (status === "TRUSTED") return "Verified source";
  if (status === "PARTIAL") return "Partial source";
  if (status === "UNKNOWN_SOURCE") return "Unknown source";
  return "Legacy / source unknown";
}

function TraceBadge({ status }: { status: AttributionStatus }) {
  const trusted = status === "TRUSTED";
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-bold uppercase tracking-wider",
      trusted ? "border-emerald-400/35 bg-emerald-400/10 text-emerald-300" : "border-amber-400/35 bg-amber-400/10 text-amber-300"
    )}>
      {trusted ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
      {attributionLabel(status)}
    </span>
  );
}

function readable(value?: string | null) {
  if (!value) return "—";
  return value.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function duration(start?: string | null, end?: string | null) {
  if (!start || !end) return null;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function stepStatusIcon(status: string) {
  switch (status) {
    case "COMPLETED": return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
    case "FAILED": return <XCircle className="h-4 w-4 text-red-400" />;
    case "STARTED": return <Clock className="h-4 w-4 text-blue-400 animate-pulse" />;
    case "SKIPPED": return <MinusCircle className="h-4 w-4 text-muted-foreground" />;
    case "FALLBACK_USED": return <RefreshCw className="h-4 w-4 text-amber-400" />;
    case "HEALTH_BLOCKED": return <XCircle className="h-4 w-4 text-orange-400" />;
    case "BUDGET_BLOCKED": return <XCircle className="h-4 w-4 text-yellow-400" />;
    case "CHAIN_SKIPPED": return <MinusCircle className="h-4 w-4 text-slate-400" />;
    case "PROVIDER_SKIPPED": return <MinusCircle className="h-4 w-4 text-rose-400" />;
    default: return <Activity className="h-4 w-4 text-muted-foreground" />;
  }
}

function stepTypeIcon(stepType: string) {
  switch (stepType) {
    case "PROVIDER_CALL": return <Zap className="h-3.5 w-3.5" />;
    case "PROVIDER_FALLBACK": return <RefreshCw className="h-3.5 w-3.5" />;
    case "USAGE_RECORDED": return <Database className="h-3.5 w-3.5" />;
    case "AGENT_RESPONSE": return <Users className="h-3.5 w-3.5" />;
    case "FINAL_COUNSEL": return <Users className="h-3.5 w-3.5" />;
    case "MEMORY_EXTRACTION": return <Brain className="h-3.5 w-3.5" />;
    case "REPORT_GENERATION": return <FileText className="h-3.5 w-3.5" />;
    case "TRACE_COMPLETED": return <CheckCircle2 className="h-3.5 w-3.5" />;
    default: return <Layers className="h-3.5 w-3.5" />;
  }
}

function stepTypeBgColor(stepType: string) {
  switch (stepType) {
    case "PROVIDER_CALL": return "bg-blue-500/15 text-blue-300 border-blue-500/30";
    case "PROVIDER_FALLBACK": return "bg-amber-500/15 text-amber-300 border-amber-500/30";
    case "USAGE_RECORDED": return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
    case "AGENT_RESPONSE": return "bg-violet-500/15 text-violet-300 border-violet-500/30";
    case "FINAL_COUNSEL": return "bg-violet-500/15 text-violet-300 border-violet-500/30";
    case "MEMORY_EXTRACTION": return "bg-pink-500/15 text-pink-300 border-pink-500/30";
    case "REPORT_GENERATION": return "bg-cyan-500/15 text-cyan-300 border-cyan-500/30";
    case "TRACE_COMPLETED": return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
    case "TRACE_FAILED": return "bg-red-500/15 text-red-300 border-red-500/30";
    case "HEALTH_BLOCKED": return "bg-orange-500/15 text-orange-300 border-orange-500/30";
    case "BUDGET_BLOCKED": return "bg-yellow-500/15 text-yellow-300 border-yellow-500/30";
    case "CHAIN_SKIPPED": return "bg-slate-500/15 text-slate-400 border-slate-500/30";
    case "PROVIDER_SKIPPED": return "bg-rose-500/15 text-rose-300 border-rose-500/30";
    default: return "bg-muted/20 text-muted-foreground border-border";
  }
}

function StepCard({ step, isLast }: { step: AIUsageTraceStepDto; isLast: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const hasPreview = Boolean(step.promptPreview || step.responsePreview);
  const dur = step.durationMs != null
    ? (step.durationMs < 1000 ? `${step.durationMs}ms` : `${(step.durationMs / 1000).toFixed(1)}s`)
    : duration(step.startedAt, step.endedAt);

  return (
    <div className="flex gap-3">
      {/* Vertical timeline connector */}
      <div className="flex flex-col items-center">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-card text-xs font-bold text-foreground/80">
          {step.sequence}
        </div>
        {!isLast && <div className="w-px flex-1 bg-border/60" />}
      </div>

      {/* Step content */}
      <div className={cn("mb-4 flex-1 rounded-lg border bg-card/50 p-4", isLast ? "" : "")}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            {stepStatusIcon(step.status)}
            <h4 className="text-sm font-semibold text-foreground">{getProviderTerminologyText(step.title)}</h4>
          </div>
          <span className={cn(
            "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
            stepTypeBgColor(step.stepType)
          )}>
            {stepTypeIcon(step.stepType)}
            {step.stepType.replace(/_/g, " ")}
          </span>
        </div>

        {step.detail && (
          <p className="mt-1.5 text-xs text-muted-foreground">{getProviderTerminologyText(step.detail)}</p>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {step.agent && (
            <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-primary">
              <Users className="h-3 w-3" />
              {step.agent.title}
            </span>
          )}
          {step.providerName && (
            <span>{getProviderDisplayName(step.providerId ?? step.providerName)}</span>
          )}
          {step.model && (
            <span className="text-[10px]">{getModelDisplayName(step.model)}</span>
          )}
          {step.tokensUsed != null && step.tokensUsed > 0 && (
            <span>{step.tokensUsed.toLocaleString()} tokens</span>
          )}
          {step.estimatedCostUSD != null && step.estimatedCostUSD > 0 && (
            <span>${step.estimatedCostUSD.toFixed(4)}</span>
          )}
          {dur && (
            <span className="inline-flex items-center gap-0.5">
              <Clock className="h-3 w-3" />
              {dur}
            </span>
          )}
        </div>

        {step.errorMessage && (
          <div className="mt-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {step.errorMessage}
          </div>
        )}
        {(step.stepType === "HEALTH_BLOCKED" || step.stepType === "BUDGET_BLOCKED" || step.stepType === "CHAIN_SKIPPED") && step.detail && (
          <div className={cn("mt-2 rounded-md border px-3 py-2 text-xs",
            step.stepType === "HEALTH_BLOCKED" ? "border-orange-500/30 bg-orange-500/10 text-orange-300"
            : step.stepType === "BUDGET_BLOCKED" ? "border-yellow-500/30 bg-yellow-500/10 text-yellow-300"
            : "border-slate-500/30 bg-slate-500/10 text-slate-400"
          )}>
            <span className="font-semibold">Skip reason: </span>{step.detail}
          </div>
        )}

        {/* Step links */}
        <div className="mt-2 flex flex-wrap gap-2">
          {step.taskId && (
            <Link to="/throne-room" className="text-[10px] text-primary/70 hover:text-primary underline">View Task</Link>
          )}
          {step.councilSessionId && (
            <Link to="/council" className="text-[10px] text-primary/70 hover:text-primary underline">View Council</Link>
          )}
          {step.reportId && (
            <Link to="/reports" className="text-[10px] text-primary/70 hover:text-primary underline">View Report</Link>
          )}
          {step.projectId && (
            <Link to={`/projects/${step.projectId}`} className="text-[10px] text-primary/70 hover:text-primary underline">View Project</Link>
          )}
        </div>

        {/* Expandable preview */}
        {hasPreview && (
          <div className="mt-2">
            <button
              onClick={() => setExpanded(!expanded)}
              className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
            >
              {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              Safe Preview
            </button>
            {expanded && (
              <div className="mt-2 space-y-2">
                {step.promptPreview && (
                  <div className="rounded-md bg-muted/20 p-2.5 text-xs leading-relaxed text-foreground/75">
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Prompt</div>
                    {step.promptPreview}
                  </div>
                )}
                {step.responsePreview && (
                  <div className="rounded-md bg-muted/20 p-2.5 text-xs leading-relaxed text-foreground/75">
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Response</div>
                    {step.responsePreview}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function UsageTracePage() {
  const { traceId } = useParams();
  const [details, setDetails] = useState<UsageTraceDetailsDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!traceId) return;
      setLoading(true);
      setError(null);
      try {
        setDetails(await api.usageTrace(traceId));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load usage trace");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [traceId]);

  const trace = details?.trace;
  const attributionStatus = (trace?.metadata as { attributionStatus?: AttributionStatus } | null)?.attributionStatus ?? "PARTIAL";

  const finalResolution = details ? (() => {
    const successSteps = details.steps.filter((s) => s.stepType === "PROVIDER_CALL_SUCCESS");
    const lastSuccess = successSteps[successSteps.length - 1] ?? null;
    const totalDurationMs = details.steps
      .filter((s) => s.stepType === "PROVIDER_CALL_SUCCESS" || s.stepType === "PROVIDER_CALL_FAILED")
      .reduce((sum, s) => sum + (s.durationMs ?? 0), 0);
    const costSources = details.usageRecords.map((r) => (r as { costSource?: string | null }).costSource).filter(Boolean);
    const dominantCostSource = costSources.includes("PROVIDER_REPORTED") ? "PROVIDER_REPORTED"
      : costSources.includes("FREE") && costSources.every((s) => s === "FREE") ? "FREE"
      : costSources.length > 0 ? "ESTIMATED"
      : null;
    const providerCallSteps = details.steps.filter((s) => s.stepType === "PROVIDER_CALL_SUCCESS" || s.stepType === "PROVIDER_CALL_FAILED");
    const finalIsSandbox = (lastSuccess?.providerType ?? "") === "sandbox";
    const apiAttempted = providerCallSteps.some((s) => (s.providerType ?? "") !== "sandbox");
    return {
      finalProvider: lastSuccess?.providerName ? getProviderDisplayName(lastSuccess.providerId ?? lastSuccess.providerName) : (trace?.providerName ? getProviderDisplayName(trace.providerId ?? trace.providerName) : null),
      finalModel: lastSuccess?.model ? getModelDisplayName(lastSuccess.model) : (trace?.model ? getModelDisplayName(trace.model) : null),
      finalCost: details.totals.totalEstimatedCostUSD,
      finalTokens: details.totals.totalTokens,
      totalDurationMs,
      fallbackCount: details.totals.fallbackCount,
      attemptCount: successSteps.length + details.steps.filter((s) => s.stepType === "PROVIDER_CALL_FAILED").length,
      costSource: dominantCostSource,
      finalIsSandbox,
      apiAttempted
    };
  })() : null;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="AI Usage Audit"
        title="Usage Trace"
        description="Full audit timeline from trigger to provider usage. Only sanitized previews are shown."
        action={<Link to="/treasury"><Button variant="outline"><ArrowLeft className="h-4 w-4" />Treasury</Button></Link>}
      />

      {loading && <div className="py-12 text-center text-sm text-muted-foreground">Loading trace…</div>}
      {error && <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

      {trace && details && (
        <>
          {/* Legacy warning */}
          {!details.hasTimelineSteps && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-300">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              This trace was created before timeline steps were available. Full audit trail is not verifiable.
            </div>
          )}

          {/* Header card */}
          <Card className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                  <Fingerprint className="h-4 w-4" />
                  {trace.traceId}
                </div>
                <h2 className="mt-2 font-display text-2xl">{trace.purpose}</h2>
                <div className="mt-2 text-sm text-muted-foreground">
                  {readable(trace.operation)} · {readable(trace.triggerType)}
                </div>
              </div>
              <TraceBadge status={attributionStatus} />
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div><div className="text-xs text-muted-foreground">Started</div><div className="mt-1 text-sm">{formatDate(trace.startedAt)}</div></div>
              {trace.completedAt && <div><div className="text-xs text-muted-foreground">Completed</div><div className="mt-1 text-sm">{formatDate(trace.completedAt)}</div></div>}
              <div><div className="text-xs text-muted-foreground">Provider</div><div className="mt-1 text-sm">{trace.providerName ? getProviderDisplayName(trace.providerId ?? trace.providerName) : "—"}</div></div>
              <div><div className="text-xs text-muted-foreground">Model</div><div className="mt-1 text-xs">{trace.model ? getModelDisplayName(trace.model) : "—"}</div></div>
              <div><div className="text-xs text-muted-foreground">Actor</div><div className="mt-1 text-sm">{trace.actorDisplayName ?? trace.actorUserId ?? "—"}</div></div>
              <div><div className="text-xs text-muted-foreground">Status</div><div className="mt-1 text-sm">{readable(trace.status)}</div></div>
              {duration(trace.startedAt, trace.completedAt) && (
                <div><div className="text-xs text-muted-foreground">Duration</div><div className="mt-1 text-sm">{duration(trace.startedAt, trace.completedAt)}</div></div>
              )}
            </div>
          </Card>

          {/* Totals card */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <Card className="p-4 text-center">
              <div className="text-xs text-muted-foreground">Total Tokens</div>
              <div className="mt-1 text-lg font-bold">{details.totals.totalTokens.toLocaleString()}</div>
            </Card>
            <Card className="p-4 text-center">
              <div className="text-xs text-muted-foreground">Estimated Cost</div>
              <div className="mt-1 text-lg font-bold">${details.totals.totalEstimatedCostUSD.toFixed(4)}</div>
            </Card>
            <Card className="p-4 text-center">
              <div className="text-xs text-muted-foreground">Provider Calls</div>
              <div className="mt-1 text-lg font-bold">{details.totals.providerCallCount}</div>
            </Card>
            <Card className="p-4 text-center">
              <div className="text-xs text-muted-foreground">Fallbacks</div>
              <div className={cn("mt-1 text-lg font-bold", details.totals.fallbackCount > 0 ? "text-amber-400" : "")}>
                {details.totals.fallbackCount}
              </div>
            </Card>
            <Card className="p-4 text-center">
              <div className="text-xs text-muted-foreground">Agents</div>
              <div className="mt-1 text-lg font-bold">{details.totals.agentCount}</div>
            </Card>
          </div>

          {/* Final Resolution Summary */}
          {finalResolution && (
            <Card className="p-5 border-primary/30">
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Final Resolution</h3>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
                <div>
                  <div className="text-xs text-muted-foreground">Final Provider</div>
                  <div className="mt-1 font-medium text-sm">{finalResolution.finalProvider ?? "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Final Model</div>
                  <div className="mt-1 font-medium text-xs font-mono">{finalResolution.finalModel ?? "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Total Cost</div>
                  <div className="mt-1 font-bold font-mono text-sm">${finalResolution.finalCost.toFixed(4)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Total Tokens</div>
                  <div className="mt-1 font-bold text-sm">{finalResolution.finalTokens.toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Total Duration</div>
                  <div className="mt-1 font-medium text-sm">
                    {finalResolution.totalDurationMs > 0
                      ? finalResolution.totalDurationMs < 1000
                        ? `${finalResolution.totalDurationMs}ms`
                        : `${(finalResolution.totalDurationMs / 1000).toFixed(1)}s`
                      : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Cost Source</div>
                  <div className={cn("mt-1 text-xs font-semibold",
                    finalResolution.costSource === "FREE" ? "text-emerald-400"
                    : finalResolution.costSource === "PROVIDER_REPORTED" ? "text-blue-400"
                    : "text-amber-400"
                  )}>
                    {finalResolution.costSource ?? "—"}
                  </div>
                </div>
              </div>
              {finalResolution.fallbackCount > 0 && (
                <div className="mt-3 flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                  <RefreshCw className="h-3.5 w-3.5 shrink-0" />
                  {finalResolution.fallbackCount} fallback{finalResolution.fallbackCount > 1 ? "s" : ""} used across {finalResolution.attemptCount} attempt{finalResolution.attemptCount !== 1 ? "s" : ""}
                </div>
              )}
              {finalResolution.finalIsSandbox && finalResolution.apiAttempted && (
                <div className="mt-3 flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                  <RefreshCw className="h-3.5 w-3.5 shrink-0" />
                  Used Local Sandbox only after all configured API models failed.
                </div>
              )}
              {finalResolution.finalIsSandbox && !finalResolution.apiAttempted && (
                <div className="mt-3 flex items-center gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                  <XCircle className="h-3.5 w-3.5 shrink-0" />
                  Local Sandbox was used without attempting configured API models. Check the agent's preferred provider and routing settings.
                </div>
              )}
            </Card>
          )}

          {/* Related Records */}
          <Card className="p-5">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Related Records</h3>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {details.links.project && <Link className="rounded-lg border border-border bg-muted/10 p-3 text-sm hover:border-primary/40" to={`/projects/${details.links.project.id}`}>Project: {details.links.project.name}</Link>}
              {details.links.task && <Link className="rounded-lg border border-border bg-muted/10 p-3 text-sm hover:border-primary/40" to="/throne-room">Task: {details.links.task.title}</Link>}
              {details.links.councilSession && <Link className="rounded-lg border border-border bg-muted/10 p-3 text-sm hover:border-primary/40" to="/council">Council: {details.links.councilSession.id.slice(0, 8)}</Link>}
              {details.links.agent && (
                <div className="rounded-lg border border-border bg-muted/10 p-3 text-sm">
                  Agent: {details.links.agent.title}
                </div>
              )}
              {details.links.reports.filter((r) => r.id).length > 0 && (
                <Link className="rounded-lg border border-border bg-muted/10 p-3 text-sm hover:border-primary/40" to="/reports">
                  Reports: {details.links.reports.filter((r) => r.id).length}
                </Link>
              )}
            </div>
          </Card>

          {/* Operation Timeline */}
          {details.hasTimelineSteps && (
            <Card className="p-5">
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Operation Timeline
              </h3>
              <div>
                {details.steps.map((step, index) => (
                  <StepCard
                    key={step.id}
                    step={step}
                    isLast={index === details.steps.length - 1}
                  />
                ))}
              </div>
            </Card>
          )}

          {/* Safe Prompt/Response Preview (header-level, always shown) */}
          <div className="grid gap-6 xl:grid-cols-2">
            <Card className="p-5">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Safe Prompt Preview</h3>
              <p className="mt-3 text-sm leading-relaxed text-foreground/85">{trace.promptPreview ?? "No sanitized preview available."}</p>
            </Card>
            <Card className="p-5">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Safe Response Preview</h3>
              <p className="mt-3 text-sm leading-relaxed text-foreground/85">{trace.responsePreview ?? "No sanitized preview available."}</p>
            </Card>
          </div>

          {/* Usage Summary */}
          <Card className="p-5">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Usage Summary</h3>
            <div className="mt-3 space-y-2 text-sm">
              {details.usageRecords.map((record) => (
                <div key={record.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/10 px-3 py-2">
                  <span>{getProviderDisplayName(record.providerId ?? record.provider)} · <span className="text-xs">{getModelDisplayName(record.model)}</span></span>
                  <span className="font-mono text-xs">{record.totalTokens.toLocaleString()} tokens · ${record.estimatedCostUSD.toFixed(4)}</span>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
