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
  Activity,
  ExternalLink
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useTk } from "@/lib/i18n";
import { getModelDisplayName, getProviderDisplayName, getProviderTerminologyText } from "@/lib/providerDisplay";
import { cn, formatDate } from "@/lib/utils";
import type { AttributionStatus, AIUsageTraceStepDto, UsageTraceDetailsDto } from "@/types/api";

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

function formatDurationMs(ms: number) {
  if (ms <= 0) return "—";
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
    case "PROVIDER_CALL_SUCCESS": return <CheckCircle2 className="h-3.5 w-3.5" />;
    case "PROVIDER_CALL_FAILED": return <XCircle className="h-3.5 w-3.5" />;
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
    case "PROVIDER_CALL_SUCCESS": return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
    case "PROVIDER_CALL_FAILED": return "bg-red-500/15 text-red-300 border-red-500/30";
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

function TraceBadge({ status }: { status: AttributionStatus }) {
  const tk = useTk();
  const trusted = status === "TRUSTED";
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider",
      trusted ? "border-emerald-400/35 bg-emerald-400/10 text-emerald-300" : "border-amber-400/35 bg-amber-400/10 text-amber-300"
    )}>
      {trusted ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
      {tk(`trace.attribution.${status}` as Parameters<typeof tk>[0])}
    </span>
  );
}

function StepCard({ step, isLast }: { step: AIUsageTraceStepDto; isLast: boolean }) {
  const tk = useTk();
  const [expanded, setExpanded] = useState(false);
  const hasPreview = Boolean(step.promptPreview || step.responsePreview);
  const dur = step.durationMs != null
    ? formatDurationMs(step.durationMs)
    : duration(step.startedAt, step.endedAt);

  const isBlockedType = step.stepType === "HEALTH_BLOCKED" || step.stepType === "BUDGET_BLOCKED" || step.stepType === "CHAIN_SKIPPED";

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-card text-xs font-bold text-foreground/80">
          {step.sequence}
        </div>
        {!isLast && <div className="w-px flex-1 bg-border/60" />}
      </div>

      <div className="mb-4 flex-1 min-w-0 rounded-lg border bg-card/50 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {stepStatusIcon(step.status)}
            <h4 className="truncate text-sm font-semibold text-foreground">{getProviderTerminologyText(step.title)}</h4>
          </div>
          <span className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
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
            <span className="font-mono text-[10px]">{getModelDisplayName(step.model)}</span>
          )}
          {step.tokensUsed != null && step.tokensUsed > 0 && (
            <span>{step.tokensUsed.toLocaleString()} tokens</span>
          )}
          {step.estimatedCostUSD != null && step.estimatedCostUSD > 0 && (
            <span className="font-mono">${step.estimatedCostUSD.toFixed(4)}</span>
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
        {isBlockedType && step.detail && (
          <div className={cn("mt-2 rounded-md border px-3 py-2 text-xs",
            step.stepType === "HEALTH_BLOCKED" ? "border-orange-500/30 bg-orange-500/10 text-orange-300"
            : step.stepType === "BUDGET_BLOCKED" ? "border-yellow-500/30 bg-yellow-500/10 text-yellow-300"
            : "border-slate-500/30 bg-slate-500/10 text-slate-400"
          )}>
            <span className="font-semibold">{tk("trace.step.skipReason")} </span>{step.detail}
          </div>
        )}

        <div className="mt-2 flex flex-wrap gap-2">
          {step.taskId && (
            <Link to="/throne-room?view=command" className="text-[10px] text-primary/70 hover:text-primary underline">
              {tk("trace.step.viewTask")}
            </Link>
          )}
          {step.councilSessionId && (
            <Link to="/council" className="text-[10px] text-primary/70 hover:text-primary underline">
              {tk("trace.step.viewCouncil")}
            </Link>
          )}
          {step.reportId && (
            <Link to="/reports" className="text-[10px] text-primary/70 hover:text-primary underline">
              {tk("trace.step.viewReport")}
            </Link>
          )}
          {step.projectId && (
            <Link to={`/projects/${step.projectId}`} className="text-[10px] text-primary/70 hover:text-primary underline">
              {tk("trace.step.viewProject")}
            </Link>
          )}
        </div>

        {hasPreview && (
          <div className="mt-2">
            <button
              onClick={() => setExpanded(!expanded)}
              className="inline-flex min-h-[44px] items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
            >
              {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              {tk("trace.step.safePreview")}
            </button>
            {expanded && (
              <div className="space-y-2">
                {step.promptPreview && (
                  <div className="rounded-md bg-muted/20 p-2.5 text-xs leading-relaxed text-foreground/75">
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{tk("trace.step.prompt")}</div>
                    {step.promptPreview}
                  </div>
                )}
                {step.responsePreview && (
                  <div className="rounded-md bg-muted/20 p-2.5 text-xs leading-relaxed text-foreground/75">
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{tk("trace.step.response")}</div>
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
  const tk = useTk();
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
    const failedSteps = details.steps.filter((s) => s.stepType === "PROVIDER_CALL_FAILED");
    const lastSuccess = successSteps[successSteps.length - 1] ?? null;
    const totalDurationMs = [...successSteps, ...failedSteps]
      .reduce((sum, s) => sum + (s.durationMs ?? 0), 0);
    const finalIsSandbox = (lastSuccess?.providerType ?? "") === "sandbox";
    const apiAttempted = [...successSteps, ...failedSteps].some((s) => (s.providerType ?? "") !== "sandbox");
    return {
      finalProvider: lastSuccess?.providerName
        ? getProviderDisplayName(lastSuccess.providerId ?? lastSuccess.providerName)
        : (trace?.providerName ? getProviderDisplayName(trace.providerId ?? trace.providerName) : null),
      finalModel: lastSuccess?.model
        ? getModelDisplayName(lastSuccess.model)
        : (trace?.model ? getModelDisplayName(trace.model) : null),
      finalCost: details.totals.totalEstimatedCostUSD,
      finalTokens: details.totals.totalTokens,
      totalDurationMs,
      fallbackCount: details.totals.fallbackCount,
      attemptCount: successSteps.length + failedSteps.length,
      finalIsSandbox,
      apiAttempted
    };
  })() : null;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={tk("trace.eyebrow")}
        title={tk("trace.title")}
        description={tk("trace.description")}
        action={
          <Link to="/treasury">
            <Button variant="outline" className="min-h-[44px]">
              <ArrowLeft className="h-4 w-4" />
              {tk("trace.backToTreasury")}
            </Button>
          </Link>
        }
      />

      {loading && (
        <div className="py-12 text-center text-sm text-muted-foreground">{tk("trace.loading")}</div>
      )}
      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
      )}

      {trace && details && (
        <>
          {/* Legacy state banner with recovery message */}
          {!details.hasTimelineSteps && (
            <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-3">
              <div className="flex items-start gap-2 text-sm text-amber-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-medium">{tk("trace.legacyWarning")}</p>
                  <p className="mt-1 text-xs text-amber-300/75">{tk("trace.legacyRecovery")}</p>
                </div>
              </div>
            </div>
          )}

          {/* Partial attribution warning */}
          {details.hasTimelineSteps && attributionStatus !== "TRUSTED" && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-sm text-amber-300/80">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {tk("trace.partialWarning")}
            </div>
          )}

          {/* Attribution Summary Card */}
          <Card className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                  <Fingerprint className="h-4 w-4 shrink-0" />
                  <span className="truncate font-mono text-xs">{trace.traceId}</span>
                </div>
                <h2 className="mt-2 font-display text-xl font-semibold leading-tight">{trace.purpose}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {readable(trace.operation)}
                  {trace.triggerType ? ` · ${readable(trace.triggerType)}` : ""}
                </p>
              </div>
              <TraceBadge status={attributionStatus} />
            </div>

            <div className="mt-5 grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-4">
              <div>
                <div className="text-xs text-muted-foreground">{tk("trace.field.actor")}</div>
                <div className="mt-0.5 text-sm">{trace.actorDisplayName ?? trace.actorUserId ?? "—"}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">{tk("trace.field.status")}</div>
                <div className="mt-0.5 text-sm">{readable(trace.status)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">{tk("trace.field.provider")}</div>
                <div className="mt-0.5 text-sm">
                  {trace.providerName ? getProviderDisplayName(trace.providerId ?? trace.providerName) : "—"}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">{tk("trace.field.model")}</div>
                <div className="mt-0.5 font-mono text-xs">{trace.model ? getModelDisplayName(trace.model) : "—"}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">{tk("trace.field.started")}</div>
                <div className="mt-0.5 text-sm">{formatDate(trace.startedAt)}</div>
              </div>
              {trace.completedAt && (
                <div>
                  <div className="text-xs text-muted-foreground">{tk("trace.field.completed")}</div>
                  <div className="mt-0.5 text-sm">{formatDate(trace.completedAt)}</div>
                </div>
              )}
              {duration(trace.startedAt, trace.completedAt) && (
                <div>
                  <div className="text-xs text-muted-foreground">{tk("trace.field.duration")}</div>
                  <div className="mt-0.5 text-sm">{duration(trace.startedAt, trace.completedAt)}</div>
                </div>
              )}
              {trace.errorMessage && (
                <div className="col-span-full mt-1 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                  {trace.errorMessage}
                </div>
              )}
            </div>
          </Card>

          {/* Token / Cost Evidence Strip */}
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 xl:grid-cols-5">
            <Card className="p-4 text-center">
              <div className="text-xs text-muted-foreground">{tk("trace.totals.tokens")}</div>
              <div className="mt-1 text-lg font-bold">{details.totals.totalTokens.toLocaleString()}</div>
            </Card>
            <Card className="p-4 text-center">
              <div className="text-xs text-muted-foreground">{tk("trace.totals.cost")}</div>
              <div className="mt-1 font-mono text-lg font-bold">${details.totals.totalEstimatedCostUSD.toFixed(4)}</div>
            </Card>
            <Card className="p-4 text-center">
              <div className="text-xs text-muted-foreground">{tk("trace.totals.calls")}</div>
              <div className="mt-1 text-lg font-bold">{details.totals.providerCallCount}</div>
            </Card>
            <Card className="p-4 text-center">
              <div className="text-xs text-muted-foreground">{tk("trace.totals.fallbacks")}</div>
              <div className={cn("mt-1 text-lg font-bold", details.totals.fallbackCount > 0 ? "text-amber-400" : "")}>
                {details.totals.fallbackCount}
              </div>
            </Card>
            <Card className="p-4 text-center">
              <div className="text-xs text-muted-foreground">{tk("trace.totals.agents")}</div>
              <div className="mt-1 text-lg font-bold">{details.totals.agentCount}</div>
            </Card>
          </div>

          {/* Final Resolution / Failure-Fallback Explanation */}
          {finalResolution && (
            <Card className="border-primary/25 p-5">
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                {tk("trace.resolution.title")}
              </h3>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                <div>
                  <div className="text-xs text-muted-foreground">{tk("trace.resolution.finalProvider")}</div>
                  <div className="mt-0.5 font-medium text-sm">{finalResolution.finalProvider ?? "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{tk("trace.resolution.finalModel")}</div>
                  <div className="mt-0.5 font-mono text-xs">{finalResolution.finalModel ?? "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{tk("trace.resolution.totalCost")}</div>
                  <div className="mt-0.5 font-mono font-bold text-sm">${finalResolution.finalCost.toFixed(4)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{tk("trace.resolution.totalTokens")}</div>
                  <div className="mt-0.5 font-bold text-sm">{finalResolution.finalTokens.toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{tk("trace.resolution.totalDuration")}</div>
                  <div className="mt-0.5 font-medium text-sm">{formatDurationMs(finalResolution.totalDurationMs)}</div>
                </div>
              </div>
              {finalResolution.fallbackCount > 0 && (
                <div className="mt-3 flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                  <RefreshCw className="h-3.5 w-3.5 shrink-0" />
                  {finalResolution.fallbackCount} fallback{finalResolution.fallbackCount > 1 ? "s" : ""} used across {finalResolution.attemptCount} attempt{finalResolution.attemptCount !== 1 ? "s" : ""}
                </div>
              )}
              {finalResolution.finalIsSandbox && finalResolution.apiAttempted && (
                <div className="mt-2 flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                  <RefreshCw className="h-3.5 w-3.5 shrink-0" />
                  {tk("trace.resolution.sandboxAfterApi")}
                </div>
              )}
              {finalResolution.finalIsSandbox && !finalResolution.apiAttempted && (
                <div className="mt-2 flex items-center gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                  <XCircle className="h-3.5 w-3.5 shrink-0" />
                  {tk("trace.resolution.sandboxNoApi")}
                </div>
              )}
            </Card>
          )}

          {/* Operation Timeline */}
          {details.hasTimelineSteps && (
            <Card className="p-5">
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                {tk("trace.timeline.title")}
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

          {/* Source Links */}
          <div className="grid gap-6 xl:grid-cols-2">
            {/* Related Records */}
            <Card className="p-5">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                {tk("trace.links.relatedTitle")}
              </h3>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {details.links.project && (
                  <Link
                    to={`/projects/${details.links.project.id}`}
                    className="rounded-lg border border-border bg-muted/10 px-3 py-2 text-sm hover:border-primary/40 hover:bg-muted/20 transition-colors"
                  >
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{tk("trace.links.project")}</div>
                    <div className="mt-0.5 truncate">{details.links.project.name}</div>
                  </Link>
                )}
                {details.links.task && (
                  <Link
                    to="/throne-room?view=command"
                    className="rounded-lg border border-border bg-muted/10 px-3 py-2 text-sm hover:border-primary/40 hover:bg-muted/20 transition-colors"
                  >
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{tk("trace.links.task")}</div>
                    <div className="mt-0.5 truncate">{details.links.task.title}</div>
                  </Link>
                )}
                {details.links.councilSession && (
                  <Link
                    to="/council"
                    className="rounded-lg border border-border bg-muted/10 px-3 py-2 text-sm hover:border-primary/40 hover:bg-muted/20 transition-colors"
                  >
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{tk("trace.links.council")}</div>
                    <div className="mt-0.5 truncate font-mono text-xs">{details.links.councilSession.id.slice(0, 8)}</div>
                  </Link>
                )}
                {details.links.agent && (
                  <div className="rounded-lg border border-border bg-muted/10 px-3 py-2 text-sm">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{tk("trace.links.agent")}</div>
                    <div className="mt-0.5 truncate">{details.links.agent.title}</div>
                  </div>
                )}
                {details.links.reports.filter((r) => r.id).length > 0 && (
                  <Link
                    to="/reports"
                    className="rounded-lg border border-border bg-muted/10 px-3 py-2 text-sm hover:border-primary/40 hover:bg-muted/20 transition-colors"
                  >
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {tk("trace.links.reports").replace("{count}", String(details.links.reports.filter((r) => r.id).length))}
                    </div>
                  </Link>
                )}
              </div>
            </Card>

            {/* Source Ownership */}
            <Card className="p-5">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                {tk("trace.links.ownershipTitle")}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">{tk("trace.links.ownershipDescription")}</p>
              <div className="mt-3 space-y-2">
                {[
                  { to: "/providers", labelKey: "trace.links.providerConfig" as const, descKey: "trace.links.providerConfigDescription" as const },
                  { to: "/routing", labelKey: "trace.links.routeChain" as const, descKey: "trace.links.routeChainDescription" as const },
                  { to: "/treasury", labelKey: "trace.links.treasury" as const, descKey: "trace.links.treasuryDescription" as const },
                  { to: "/audit", labelKey: "trace.links.audit" as const, descKey: "trace.links.auditDescription" as const },
                ].map(({ to, labelKey, descKey }) => (
                  <div key={to} className="flex items-center justify-between gap-3 rounded-md border border-border/50 bg-muted/5 px-3 py-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{tk(labelKey)}</div>
                      <div className="text-xs text-muted-foreground">{tk(descKey)}</div>
                    </div>
                    <Link
                      to={to}
                      aria-label={tk("trace.links.open")}
                      className="shrink-0 inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Safe Prompt / Response Preview */}
          <div className="grid gap-6 xl:grid-cols-2">
            <Card className="p-5">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                {tk("trace.preview.promptTitle")}
              </h3>
              {trace.promptPreview ? (
                <p className="mt-3 text-sm leading-relaxed text-foreground/85">{trace.promptPreview}</p>
              ) : (
                <div className="mt-3">
                  <p className="text-sm text-muted-foreground">{tk("trace.preview.empty")}</p>
                  <p className="mt-1 text-xs text-muted-foreground/70">{tk("trace.preview.sanitizedNote")}</p>
                </div>
              )}
            </Card>
            <Card className="p-5">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                {tk("trace.preview.responseTitle")}
              </h3>
              {trace.responsePreview ? (
                <p className="mt-3 text-sm leading-relaxed text-foreground/85">{trace.responsePreview}</p>
              ) : (
                <div className="mt-3">
                  <p className="text-sm text-muted-foreground">{tk("trace.preview.empty")}</p>
                  <p className="mt-1 text-xs text-muted-foreground/70">{tk("trace.preview.sanitizedNote")}</p>
                </div>
              )}
            </Card>
          </div>

          {/* Usage Records */}
          {details.usageRecords.length > 0 && (
            <Card className="p-5">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                {tk("trace.usage.title")}
              </h3>
              <div className="mt-3 space-y-2 text-sm">
                {details.usageRecords.map((record) => (
                  <div
                    key={record.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/10 px-3 py-2"
                  >
                    <span className="min-w-0 truncate">
                      {getProviderDisplayName(record.providerId ?? record.provider)}
                      {" · "}
                      <span className="font-mono text-xs">{getModelDisplayName(record.model)}</span>
                    </span>
                    <span className="shrink-0 font-mono text-xs">
                      {record.totalTokens.toLocaleString()} tokens · ${record.estimatedCostUSD.toFixed(4)}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
