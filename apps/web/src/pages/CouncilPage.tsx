import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, ChevronDown, ChevronRight, ClipboardList, Cpu, ExternalLink, FileText, FolderKanban, ScrollText, Sparkles, UsersRound } from "lucide-react";
import { AgentPortrait } from "@/components/AgentPortrait";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/ui/SectionCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { MarkdownDocument } from "@/components/ui/MarkdownDocument";
import { getModelDisplayName, getProviderDisplayName, getProviderTerminologyText } from "@/lib/providerDisplay";
import { useTk } from "@/lib/i18n";
import { cn, formatDate } from "@/lib/utils";
import { useKingdomStore } from "@/stores/kingdomStore";
import { api } from "@/lib/api";
import type { CouncilSessionDto, PlannerResultDto } from "@/types/api";

export function CouncilPage() {
  const tk = useTk();
  const sessions = useKingdomStore((state) => state.councilSessions);
  const reports = useKingdomStore((state) => state.reports);
  const [selectedId, setSelectedId] = useState<string | null>(sessions[0]?.id ?? null);
  const selectedSession = sessions.find((session) => session.id === selectedId) ?? sessions[0] ?? null;
  const reportBySession = useMemo(
    () => new Map(reports.filter((report) => report.sourceCouncilSessionId).map((report) => [report.sourceCouncilSessionId, report])),
    [reports]
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-500 slide-in-from-bottom-4">
      <PageHeader
        eyebrow={tk("council.eyebrow")}
        title={tk("council.title")}
        description={tk("council.description")}
        action={(
          <Link to="/throne-room?view=command" className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-primary bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-amber-400 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background">
            <ScrollText className="h-4 w-4" />
            {tk("council.issue")}
          </Link>
        )}
      />

      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)] xl:grid-cols-[360px_minmax(0,1fr)]" data-testid="council-master-detail">
        <aside className="self-start overflow-hidden rounded-lg border border-border bg-card lg:sticky lg:top-4" aria-label={tk("council.history")}>
          <div className="flex min-h-14 items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">{tk("council.history")}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">{tk("council.newestFirst")}</p>
            </div>
            <span className="rounded-md border border-border bg-muted/20 px-2 py-1 font-mono text-xs tabular-nums text-muted-foreground">{sessions.length}</span>
          </div>

          <div className="max-h-[420px] overflow-y-auto overscroll-contain lg:max-h-[calc(100vh-15rem)]">
            {sessions.map((session) => {
              const linkedReport = session.reports?.[0] ?? reportBySession.get(session.id);
              const isSelected = selectedSession?.id === session.id;
              return (
                <button
                  key={session.id}
                  type="button"
                  aria-pressed={isSelected}
                  className={cn(
                    "group relative block min-h-[112px] w-full border-b border-border px-4 py-3.5 text-left transition duration-200 last:border-b-0 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary active:bg-muted/35",
                    isSelected ? "bg-primary/10" : "bg-card hover:bg-muted/25"
                  )}
                  onClick={() => setSelectedId(session.id)}
                >
                  <span className={cn("absolute inset-y-0 left-0 w-0.5 bg-primary transition-opacity duration-200", isSelected ? "opacity-100" : "opacity-0")} />
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className={cn("line-clamp-2 break-words text-sm font-semibold leading-5", isSelected ? "text-primary" : "text-foreground")}>
                        {session.task?.title ?? "Council Session"}
                      </h3>
                      <p className="mt-1.5 text-xs text-muted-foreground">{formatDate(session.createdAt)}</p>
                    </div>
                    <StatusBadge status={session.status} />
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                      <span>{tk("council.responseCount", { count: session.responses.length })}</span>
                      {linkedReport && (
                        <span className="flex items-center gap-1 text-primary">
                          <FileText className="h-3.5 w-3.5" />
                          {tk("council.reportLinked")}
                        </span>
                      )}
                    </div>
                    <ArrowRight className={cn("h-4 w-4 shrink-0 transition-transform duration-200", isSelected ? "translate-x-0 text-primary" : "-translate-x-1 opacity-45 group-hover:translate-x-0 group-hover:opacity-100")} />
                  </div>
                </button>
              );
            })}

            {sessions.length === 0 && (
              <EmptyState
                icon={UsersRound}
                title={tk("council.empty.title")}
                description={tk("council.empty.description")}
                className="m-4 min-h-[260px]"
                action={(
                  <Link to="/throne-room?view=command" className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-border bg-transparent px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background">
                    {tk("council.empty.action")}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                )}
              />
            )}
          </div>
        </aside>

        <div className="min-w-0" data-testid="council-detail-pane">
          {selectedSession ? (
            <CouncilDetail session={selectedSession} linkedReport={selectedSession.reports?.[0] ?? reportBySession.get(selectedSession.id) ?? null} />
          ) : (
            <div className="hidden min-h-[520px] items-center justify-center rounded-lg border border-dashed border-border bg-muted/5 lg:flex">
              <div className="text-center">
                <UsersRound className="mx-auto mb-4 h-10 w-10 text-muted-foreground/30" />
                <p className="text-sm font-medium text-muted-foreground">{tk("council.select")}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CouncilDetail({ session, linkedReport }: { session: CouncilSessionDto; linkedReport: ReportLike | null }) {
  const tk = useTk();
  const [plannerResult, setPlannerResult] = useState<PlannerResultDto | null>(null);
  const [plannerError, setPlannerError] = useState<string | null>(null);
  const [isPlanning, setIsPlanning] = useState(false);

  async function handleCreateWorkOrder() {
    setIsPlanning(true);
    setPlannerError(null);
    try {
      const result = await api.planCouncilWorkOrder(session.id);
      setPlannerResult(result);
    } catch (err) {
      setPlannerError(err instanceof Error ? err.message : "Failed to create work order");
    } finally {
      setIsPlanning(false);
    }
  }

  return (
    <SectionCard className="h-full border-primary/20 bg-card shadow-sm" contentClassName="p-0">
      <header className="border-b border-border p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md border border-primary/25 bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">{tk("council.detail.record")}</span>
          <StatusBadge status={session.status} />
          {session.task?.mode && (
            <span className="rounded-md border border-border bg-muted/20 px-2 py-1 font-mono text-xs text-muted-foreground" title={session.task.mode}>
              {tk("council.detail.mode", { mode: session.task.mode })}
            </span>
          )}
        </div>
        <h2 className="mt-4 max-w-3xl break-words text-xl font-semibold leading-7 text-foreground sm:text-2xl">{session.task?.title ?? "Council Session"}</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">{tk("council.detail.convened", { date: formatDate(session.createdAt) })}</p>

        <div className="mt-5 rounded-lg border border-border bg-muted/15 p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <ScrollText className="h-4 w-4 text-primary" />
            {tk("council.detail.sourceDecree")}
          </h3>
          <p className="mt-2 break-words text-sm font-medium leading-6 text-foreground/80">{session.task?.command}</p>
        </div>

        <div className="mt-4 grid gap-2 text-xs sm:grid-cols-3">
          {session.providerName && (
            <div className="flex min-h-11 items-center gap-2 rounded-md border border-border bg-background/35 px-3 text-muted-foreground">
              <Cpu className="h-4 w-4 shrink-0 text-sky-400" />
              <span className="min-w-0 break-words">{getProviderDisplayName(session.providerName)}{session.modelUsed ? ` · ${getModelDisplayName(session.modelUsed)}` : ""}</span>
            </div>
          )}
          <div className="flex min-h-11 items-center gap-2 rounded-md border border-border bg-background/35 px-3 text-muted-foreground">
            <span className="font-mono text-sm font-semibold tabular-nums text-foreground">{session.consultedMemoryIds.length}</span>
            {tk("council.detail.memories")}
          </div>
          <div className="flex min-h-11 items-center gap-2 rounded-md border border-border bg-background/35 px-3 text-muted-foreground">
            <span className="font-mono text-sm font-semibold tabular-nums text-foreground">{session.autoSavedMemoryIds.length}</span>
            {tk("council.detail.autoSaved")}
          </div>
        </div>

        <nav className="mt-4 flex flex-wrap gap-2" aria-label={tk("council.detail.sources")}>
          <Link to="/throne-room?view=command" className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border bg-background/35 px-3 text-sm font-semibold text-foreground transition-colors hover:border-primary/40 hover:text-primary">
            <ScrollText className="h-4 w-4" />
            {tk("council.detail.throne")}
          </Link>
          {session.projectId && (
            <Link to={`/projects/${session.projectId}`} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border bg-background/35 px-3 text-sm font-semibold text-foreground transition-colors hover:border-primary/40 hover:text-primary">
              <FolderKanban className="h-4 w-4" />
              {tk("council.detail.project")}
            </Link>
          )}
          {linkedReport && (
            <Link to="/reports" className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border bg-background/35 px-3 text-sm font-semibold text-foreground transition-colors hover:border-primary/40 hover:text-primary">
              <FileText className="h-4 w-4" />
              {tk("council.detail.report")}
            </Link>
          )}
          {session.finalTraceId && (
            <Link to={`/usage-traces/${session.finalTraceId}`} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border bg-background/35 px-3 text-sm font-semibold text-foreground transition-colors hover:border-primary/40 hover:text-primary">
              <ExternalLink className="h-4 w-4" />
              {tk("council.detail.trace")}
            </Link>
          )}
        </nav>
      </header>

      <div className="space-y-7 p-5 sm:p-6">
        {session.fallbackNotice && (
          <div className="flex gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
             <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
             <p className="text-sm leading-relaxed text-amber-500/90 font-medium">{getProviderTerminologyText(session.fallbackNotice)}</p>
          </div>
        )}

        {session.finalSummary && (
          <section className="relative overflow-hidden rounded-lg border border-primary/30 bg-primary/10 p-5 sm:p-6">
            <span className="absolute inset-y-0 left-0 w-1 bg-primary/70" />
            <div className="mb-4 flex items-center gap-3">
              <AgentPortrait agent={{ name: "Aurelian", title: "Grand Vizier" }} size="md" status="SUMMARIZING" />
              <h3 className="flex items-center gap-2 text-base font-semibold text-primary">
                <Sparkles className="h-4 w-4" />
                {tk("council.detail.synthesis")}
              </h3>
            </div>
            <MarkdownDocument content={session.finalSummary} className="max-w-none" />
            {session.finalTraceId && (
              <Link to={`/usage-traces/${session.finalTraceId}`} className="mt-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
                {tk("council.detail.viewSynthesisTrace")}
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            )}
          </section>
        )}

        <section className="space-y-3">
          <div className="flex items-end justify-between gap-3 border-b border-border pb-3">
            <div>
              <h3 className="text-base font-semibold text-foreground">{tk("council.detail.evidence")}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{tk("council.detail.evidenceDescription")}</p>
            </div>
            <span className="font-mono text-xs tabular-nums text-muted-foreground">{session.responses.length}</span>
          </div>
          <div className="grid gap-3 xl:grid-cols-2">
            {session.responses.map((response) => (
              <details key={response.id} className="group self-start rounded-lg border border-border bg-muted/10 transition-colors duration-200 open:border-primary/30 open:bg-muted/20">
                <summary className="flex min-h-[72px] cursor-pointer list-none items-center gap-3 px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary [&::-webkit-details-marker]:hidden">
                  <AgentPortrait agent={response.agent} size="sm" status="COMPLETED" />
                  <div className="min-w-0 flex-1">
                    <div className="break-words text-sm font-semibold text-foreground">{response.role}</div>
                    {response.agent.specialty && <div className="mt-0.5 break-words text-xs text-primary/75">{response.agent.specialty}</div>}
                  </div>
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
                </summary>
                <div className="border-t border-border px-4 py-4">
                  <MarkdownDocument content={response.response} className="max-w-none text-sm" />
                  {response.traceId && (
                    <Link to={`/usage-traces/${response.traceId}`} className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
                      {tk("council.detail.viewResponseTrace")}
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  )}
                </div>
              </details>
            ))}
          </div>
        </section>

        {linkedReport && (
          <div className="flex flex-col gap-4 rounded-lg border border-primary/30 bg-primary/5 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="rounded-lg bg-primary/15 p-2">
                <FileText className="h-6 w-6 text-primary" />
              </div>
              <div className="min-w-0">
                <div className="mb-1 text-xs font-semibold text-primary">{tk("council.detail.generatedReport")}</div>
                <p className="break-words text-sm font-semibold text-foreground">{linkedReport.title}</p>
              </div>
            </div>
            <Link to="/reports" className="inline-flex h-11 w-full shrink-0 items-center justify-center gap-2 rounded-md border border-border bg-muted/50 px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background sm:w-auto">
              {tk("council.detail.viewReport")}
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        )}

        {session.status === "COMPLETED" && (
          <section className="rounded-lg border border-border bg-muted/10 p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-4">
                <div className="rounded-lg bg-muted/30 p-2">
                  <ClipboardList className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <div className="mb-1 text-xs font-semibold text-muted-foreground">{tk("council.detail.nextRecord")}</div>
                  {plannerResult ? (
                    plannerResult.drafted > 0 ? (
                      <p className="text-sm font-semibold text-foreground">
                        {tk("council.detail.createdWorkOrders", { count: plannerResult.drafted, suffix: plannerResult.drafted !== 1 ? "s" : "" })}
                      </p>
                    ) : plannerResult.skipped > 0 ? (
                      <p className="text-sm text-muted-foreground">{tk("council.detail.skippedWorkOrder")}</p>
                    ) : (
                      <p className="text-sm text-muted-foreground">{tk("council.detail.noAction")}</p>
                    )
                  ) : plannerError ? (
                    <p className="text-sm text-destructive">{plannerError}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground">{tk("council.detail.generateWorkOrder")}</p>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                {plannerResult && plannerResult.drafted > 0 && (
                  <Link to="/work-orders" className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-border bg-muted/50 px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background">
                    {tk("council.detail.viewWorkOrders")}
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                )}
                {!plannerResult && (
                  <Button
                    variant="outline"
                    className="h-11"
                    onClick={handleCreateWorkOrder}
                    disabled={isPlanning}
                  >
                    {isPlanning ? tk("council.detail.creating") : tk("council.detail.createWorkOrder")}
                  </Button>
                )}
              </div>
            </div>
          </section>
        )}
      </div>
    </SectionCard>
  );
}

type ReportLike = {
  id: string;
  title: string;
};
