import { BookOpenCheck, Check, CircleDashed, Crown, ExternalLink, FileText, LockKeyhole, MessageSquareReply, ScrollText, Send, ShieldCheck, Users } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { api } from "@/lib/api";
import { useTk } from "@/lib/i18n";
import { cn, formatDate } from "@/lib/utils";
import type { DecreeLineageDto } from "@/types/api";

const fmt = (iso: string) => formatDate(iso);

export function DecreeLineagePage() {
  const tk = useTk();
  const { workOrderId } = useParams<{ workOrderId: string }>();
  const [searchParams] = useSearchParams();
  const taskId = searchParams.get("taskId") ?? undefined;
  const loadFailedText = tk("lineage.loadFailed");
  const [lineage, setLineage] = useState<DecreeLineageDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    api
      .getDecreeLineage({ workOrderId, taskId })
      .then((res) => {
        if (active) setLineage(res.lineage);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : loadFailedText);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadFailedText, workOrderId, taskId]);

  if (loading) return <LoadingState message={tk("lineage.loading")} className="min-h-[50vh]" />;
  if (error) return <ErrorState title={tk("lineage.errorTitle")} message={error} />;
  if (!lineage) return <EmptyState icon={CircleDashed} title={tk("lineage.emptyTitle")} description={tk("lineage.emptyDescription")} />;

  const { decree, council, owner, externalPrompt, externalResult, review, secretarySummary } = lineage;
  const stageState = [Boolean(decree), Boolean(council), Boolean(owner), Boolean(externalPrompt), Boolean(externalResult), Boolean(review), Boolean(secretarySummary)];
  const completedStages = stageState.filter(Boolean).length;

  return (
    <div className="min-w-0 animate-in fade-in slide-in-from-bottom-3 duration-500">
      <PageHeader
        eyebrow={tk("lineage.eyebrow")}
        title={tk("lineage.title")}
        description={tk("lineage.description")}
        action={(
          <span className="inline-flex min-h-10 items-center gap-2 rounded-md border border-border bg-muted/20 px-3 text-xs font-semibold text-muted-foreground">
            <LockKeyhole className="h-4 w-4 text-primary" />
            {tk("lineage.readOnly")}
          </span>
        )}
      />

      <JourneySummary states={stageState} completed={completedStages} />

      <div className="mt-5 grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_260px]">
        <ol className="relative min-w-0 space-y-3 border-l border-border/70 pl-5 sm:pl-7" aria-label={tk("lineage.journeyAria")}>
          <Stage n={1} icon={Crown} title={tk("lineage.stage.decree")} description={tk("lineage.stage.decreeDescription")} present={Boolean(decree)} source={decree ? { to: "/throne-room?view=command", label: tk("lineage.openCommand") } : undefined}>
            {decree ? (
              <div className="space-y-2">
                <div className="break-words font-semibold text-foreground">{decree.title}</div>
                <Meta>{tk("lineage.decreeMeta", { mode: decree.mode, actor: decree.createdByName ?? tk("lineage.king"), date: fmt(decree.createdAt) })}</Meta>
                <Quote>{decree.command}</Quote>
              </div>
            ) : <Absent>{tk("lineage.absent.decree")}</Absent>}
          </Stage>

          <Stage n={2} icon={Users} title={tk("lineage.stage.council")} description={tk("lineage.stage.councilDescription")} present={Boolean(council)} source={council ? { to: "/council", label: tk("lineage.openCouncil") } : undefined}>
            {council ? (
              <div className="space-y-2">
                {council.responses.map((response, index) => (
                  <details key={`${response.role}-${index}`} className="group rounded-md border border-border/60 bg-background/30 px-3 py-2 open:bg-background/50">
                    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-sm marker:hidden">
                      <span className="min-w-0 break-words font-semibold text-foreground">{response.role}{response.agent ? <span className="font-normal text-muted-foreground"> · {response.agent.name}</span> : null}</span>
                      <span className="shrink-0 text-xs text-primary">{tk("lineage.viewEvidence")}</span>
                    </summary>
                    <p className="mt-2 whitespace-pre-wrap border-t border-border/60 pt-2 text-xs leading-5 text-muted-foreground">{response.response}</p>
                  </details>
                ))}
                {council.finalSummary ? (
                  <div className="border-l-2 border-primary bg-primary/5 px-3 py-2">
                    <div className="text-[11px] font-bold uppercase text-primary">{tk("lineage.finalSynthesis")}</div>
                    <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-foreground/90">{council.finalSummary}</p>
                  </div>
                ) : null}
              </div>
            ) : <Absent>{tk("lineage.absent.council")}</Absent>}
          </Stage>

          <Stage n={3} icon={ShieldCheck} title={tk("lineage.stage.owner")} description={tk("lineage.stage.ownerDescription")} present={Boolean(owner)} source={owner ? { to: `/work-orders?focus=${owner.workOrderId}`, label: tk("lineage.openWorkOrder") } : undefined}>
            {owner ? (
              <div className="space-y-2">
                <div className="break-words font-semibold text-foreground">{owner.title}</div>
                <div className="flex flex-wrap gap-2">
                  <EvidenceBadge label={owner.status} tone={owner.status === "FAILED" ? "danger" : "primary"} />
                  {owner.contextBindingStatus ? <EvidenceBadge label={owner.contextBindingStatus} tone={owner.contextBindingStatus === "FRESH" ? "success" : "warning"} /> : null}
                  {owner.executionTarget ? <EvidenceBadge label={owner.executionTarget} /> : null}
                </div>
                <Meta>{tk("lineage.responsible", { actor: owner.assignedAgent?.name ?? owner.assignedExternalAgentName ?? tk("lineage.unassigned") })}</Meta>
                {owner.assignedAgentReason ? <Quote>{owner.assignedAgentReason}</Quote> : null}
              </div>
            ) : <Absent>{tk("lineage.absent.owner")}</Absent>}
          </Stage>

          <Stage n={4} icon={Send} title={tk("lineage.stage.prompt")} description={tk("lineage.stage.promptDescription")} present={Boolean(externalPrompt)} source={externalPrompt ? { to: "/automation-jobs", label: tk("lineage.openAutomation") } : undefined}>
            {externalPrompt ? (
              <div className="space-y-2">
                <Meta>{tk("lineage.agent", { actor: externalPrompt.externalAgentName ?? tk("lineage.unknown") })}</Meta>
                <EvidenceDisclosure label={tk("lineage.viewPrompt")} content={externalPrompt.inputPrompt} />
              </div>
            ) : <Absent>{tk("lineage.absent.prompt")}</Absent>}
          </Stage>

          <Stage n={5} icon={MessageSquareReply} title={tk("lineage.stage.result")} description={tk("lineage.stage.resultDescription")} present={Boolean(externalResult)} source={externalResult ? { to: "/automation-jobs", label: tk("lineage.reviewExecution") } : undefined}>
            {externalResult ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <EvidenceBadge label={externalResult.status} tone={externalResult.status === "SUCCEEDED" ? "success" : externalResult.status === "FAILED" ? "danger" : "primary"} />
                  <Meta>{tk("lineage.exitCode", { code: externalResult.exitCode ?? tk("lineage.notAvailable") })}{externalResult.completedAt ? ` · ${fmt(externalResult.completedAt)}` : ""}</Meta>
                </div>
                {externalResult.patches.map((patch) => (
                  <div key={patch.id} className="min-w-0 rounded-md border border-border/60 bg-background/30 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-foreground">{tk("lineage.patch")}</span>
                      <EvidenceBadge label={patch.validationStatus ?? tk("lineage.notAvailable")} />
                      <EvidenceBadge label={patch.riskLevel ?? tk("lineage.notAvailable")} tone={patch.riskLevel === "HIGH" || patch.riskLevel === "CRITICAL" ? "warning" : "default"} />
                      <span className="text-[11px] text-muted-foreground">{tk("lineage.fileCount", { count: patch.filesChanged.length })}</span>
                    </div>
                    {patch.diffStat ? <pre className="mt-2 max-h-56 max-w-full overflow-auto whitespace-pre-wrap break-words border-t border-border/60 pt-2 text-[11px] leading-5 text-muted-foreground">{patch.diffStat}</pre> : null}
                  </div>
                ))}
                {externalResult.outputText ? <EvidenceDisclosure label={tk("lineage.viewReport")} content={externalResult.outputText} /> : null}
              </div>
            ) : <Absent>{tk("lineage.absent.result")}</Absent>}
          </Stage>

          <Stage n={6} icon={BookOpenCheck} title={tk("lineage.stage.review")} description={tk("lineage.stage.reviewDescription")} present={Boolean(review)} source={review ? { to: "/knowledge-lab/candidates", label: tk("lineage.openKnowledge") } : undefined}>
            {review ? (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <EvidenceBadge label={review.verdict} tone={review.verdict === "PASS" ? "success" : "warning"} />
                  <EvidenceBadge label={review.confidence} />
                </div>
                <Meta>{tk("lineage.reviewer", { actor: review.reviewerAgent?.name ?? tk("lineage.unknown") })}</Meta>
                {review.kingRecommendation && review.kingRecommendation !== "—" ? (
                  <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">{tk("lineage.recommendation", { recommendation: review.kingRecommendation })}</div>
                ) : null}
                {review.summary ? <Quote>{review.summary}</Quote> : null}
                {review.knowledge.length > 0 ? (
                  <div className="space-y-2 border-t border-border/60 pt-3">
                    <div className="text-[11px] font-bold uppercase text-muted-foreground">{tk("lineage.knowledgeCaptured")}</div>
                    {review.knowledge.map((knowledge) => (
                      <div key={knowledge.id} className="rounded-md border border-border/60 bg-background/30 px-3 py-2">
                        <div className="break-words text-sm font-semibold text-foreground">{knowledge.title}</div>
                        <Meta>{[knowledge.status, knowledge.category, knowledge.proposedByAgent?.name].filter(Boolean).join(" · ")}</Meta>
                        {knowledge.summary ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{knowledge.summary}</p> : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : <Absent>{tk("lineage.absent.review")}</Absent>}
          </Stage>

          <Stage n={7} icon={ScrollText} title={tk("lineage.stage.summary")} description={tk("lineage.stage.summaryDescription")} present={Boolean(secretarySummary)} source={secretarySummary ? { to: "/reports", label: tk("lineage.openReports") } : undefined}>
            {secretarySummary ? (
              <div className="space-y-2">
                <div className="break-words font-semibold text-foreground">{secretarySummary.title}</div>
                <p className="whitespace-pre-wrap text-sm leading-6 text-foreground/90">{secretarySummary.summary}</p>
                {secretarySummary.synthesized ? <Meta>{tk("lineage.synthesized")}</Meta> : null}
              </div>
            ) : <Absent>{tk("lineage.absent.summary")}</Absent>}
          </Stage>
        </ol>

        <EvidenceIndex states={stageState} />
      </div>
    </div>
  );
}

function JourneySummary({ states, completed }: { states: boolean[]; completed: number }) {
  const tk = useTk();
  const labels = useMemo(() => ["decree", "council", "owner", "prompt", "result", "review", "summary"].map((stage) => tk(`lineage.stage.${stage}`)), [tk]);
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card" aria-label={tk("lineage.journeyAria")}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{tk("lineage.journeyTitle")}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{tk("lineage.journeyDescription")}</p>
        </div>
        <span className="rounded-md border border-primary/30 bg-primary/10 px-2.5 py-1 font-mono text-xs tabular-nums text-primary">{tk("lineage.completeCount", { count: completed })}</span>
      </header>
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7">
        {labels.map((label, index) => (
          <a key={label} href={`#lineage-stage-${index + 1}`} className="group flex min-h-16 items-center gap-2 border-b border-r border-border px-3 py-2 transition hover:bg-muted/20 sm:last:border-r-0 xl:border-b-0">
            <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md border", states[index] ? "border-emerald-400/35 bg-emerald-400/10 text-emerald-300" : "border-border bg-muted/20 text-muted-foreground")}>
              {states[index] ? <Check className="h-3.5 w-3.5" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
            </span>
            <span className="min-w-0 text-[11px] font-medium leading-4 text-muted-foreground group-hover:text-foreground">{label}</span>
          </a>
        ))}
      </div>
    </section>
  );
}

function EvidenceIndex({ states }: { states: boolean[] }) {
  const tk = useTk();
  const labels = ["decree", "council", "owner", "prompt", "result", "review", "summary"];
  return (
    <aside className="self-start overflow-hidden rounded-lg border border-border bg-card xl:sticky xl:top-4" aria-label={tk("lineage.evidenceIndex")}>
      <header className="border-b border-border px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground"><FileText className="h-4 w-4 text-primary" />{tk("lineage.evidenceIndex")}</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{tk("lineage.evidenceIndexDescription")}</p>
      </header>
      <nav className="p-2">
        {labels.map((label, index) => (
          <a key={label} href={`#lineage-stage-${index + 1}`} className="flex min-h-11 items-center justify-between gap-3 rounded-md px-2.5 text-xs text-muted-foreground transition hover:bg-muted/25 hover:text-foreground">
            <span className="min-w-0 break-words">{index + 1}. {tk(`lineage.stage.${label}`)}</span>
            <span className={cn("h-2 w-2 shrink-0 rounded-full", states[index] ? "bg-emerald-400" : "bg-muted-foreground/35")} title={tk(states[index] ? "lineage.present" : "lineage.missing")} />
          </a>
        ))}
      </nav>
      <div className="border-t border-border bg-muted/10 px-4 py-3 text-[11px] leading-5 text-muted-foreground">{tk("lineage.ownershipNote")}</div>
    </aside>
  );
}

function Stage({ n, icon: Icon, title, description, present, source, children }: {
  n: number;
  icon: typeof Crown;
  title: string;
  description: string;
  present: boolean;
  source?: { to: string; label: string };
  children: ReactNode;
}) {
  const tk = useTk();
  return (
    <li id={`lineage-stage-${n}`} className="relative scroll-mt-5" data-testid="lineage-stage">
      <span data-testid="lineage-stage-number" className={cn("absolute -left-[2.05rem] top-4 flex h-7 w-7 items-center justify-center rounded-md border text-xs font-bold sm:-left-[2.7rem]", present ? "border-primary/45 bg-background text-primary shadow-[0_0_0_4px_hsl(var(--background))]" : "border-border bg-background text-muted-foreground")}>{n}</span>
      <section className={cn("overflow-hidden rounded-lg border bg-card transition duration-200 hover:border-border/90", present ? "border-border" : "border-border/60 opacity-80")}>
        <header className="flex flex-col gap-3 border-b border-border/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border", present ? "border-primary/30 bg-primary/10 text-primary" : "border-border bg-muted/20 text-muted-foreground")}><Icon className="h-4 w-4" /></span>
            <div className="min-w-0">
              <h3 className="break-words text-sm font-semibold text-foreground">{title}</h3>
              <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{description}</p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2 pl-11 sm:pl-0">
            <span className={cn("rounded-md border px-2 py-1 text-[10px] font-bold uppercase", present ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : "border-border bg-muted/20 text-muted-foreground")}>{tk(present ? "lineage.present" : "lineage.missing")}</span>
            {source ? (
              <Link to={source.to} className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-border px-2.5 text-[11px] font-semibold text-foreground transition hover:border-primary/40 hover:bg-primary/5 hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary">
                {source.label}<ExternalLink className="h-3 w-3" />
              </Link>
            ) : null}
          </div>
        </header>
        <div className="min-w-0 p-4">{children}</div>
      </section>
    </li>
  );
}

function EvidenceDisclosure({ label, content }: { label: string; content: string }) {
  return (
    <details className="group min-w-0 rounded-md border border-border/60 bg-background/30 px-3 py-2 open:bg-background/50">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-sm text-muted-foreground marker:hidden">
        <span>{label}</span><span className="text-xs text-primary">+</span>
      </summary>
      <pre className="mt-2 max-h-96 max-w-full overflow-auto whitespace-pre-wrap break-words border-t border-border/60 pt-2 text-[11px] leading-5 text-muted-foreground">{content}</pre>
    </details>
  );
}

function EvidenceBadge({ label, tone = "default" }: { label: string; tone?: "default" | "primary" | "success" | "warning" | "danger" }) {
  return <span title={label} className={cn("inline-flex max-w-full rounded-md border px-2 py-1 text-[10px] font-bold uppercase", tone === "default" && "border-border bg-muted/25 text-muted-foreground", tone === "primary" && "border-primary/35 bg-primary/10 text-primary", tone === "success" && "border-emerald-400/35 bg-emerald-400/10 text-emerald-300", tone === "warning" && "border-amber-400/35 bg-amber-400/10 text-amber-300", tone === "danger" && "border-destructive/35 bg-destructive/10 text-destructive")}><span className="truncate">{label}</span></span>;
}

function Meta({ children }: { children: ReactNode }) {
  return <div className="break-words text-[11px] leading-5 text-muted-foreground">{children}</div>;
}

function Quote({ children }: { children: ReactNode }) {
  return <p className="whitespace-pre-wrap border-l-2 border-border pl-3 text-xs leading-5 text-muted-foreground">{children}</p>;
}

function Absent({ children }: { children: ReactNode }) {
  return <div className="text-xs italic leading-5 text-muted-foreground/75">{children}</div>;
}
