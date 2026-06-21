import { Crown, Users, ShieldCheck, Send, MessageSquareReply, BookOpenCheck, ScrollText } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import type { DecreeLineageDto } from "@/types/api";

const fmt = (iso: string) => formatDate(iso);

/**
 * Decree Lineage — one ordered, top-to-bottom trace for the King:
 * decree → council → owner → external prompt → external result → review → secretary.
 * Read-only. Backed by GET /api/decree-lineage.
 */
export function DecreeLineagePage() {
  const { workOrderId } = useParams<{ workOrderId: string }>();
  const [searchParams] = useSearchParams();
  const taskId = searchParams.get("taskId") ?? undefined;

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
        if (active) setError(err instanceof Error ? err.message : "Failed to load decree lineage");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [workOrderId, taskId]);

  if (loading) return <LoadingState message="Tracing the decree..." className="min-h-[50vh]" />;
  if (error) return <ErrorState title="Unable to load decree lineage." message={error} />;
  if (!lineage) return <EmptyState title="No lineage found." />;

  const { decree, council, owner, externalPrompt, externalResult, review, secretarySummary } = lineage;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Decree Lineage"
        title="What happened to this command"
        description="One ordered trace from the King's command to the Royal Secretary's summary."
      />

      <ol className="relative space-y-4 border-l border-border/60 pl-6">
        {/* 1 — Decree */}
        <Stage n={1} icon={Crown} title="King's command" present={Boolean(decree)}>
          {decree ? (
            <div className="space-y-1">
              <div className="font-semibold text-foreground">{decree.title}</div>
              <Meta>
                Mode {decree.mode} · by {decree.createdByName ?? "King"} · {fmt(decree.createdAt)}
              </Meta>
              <Quote>{decree.command}</Quote>
            </div>
          ) : (
            <Absent>No originating decree — this work began as a direct work order.</Absent>
          )}
        </Stage>

        {/* 2 — Council */}
        <Stage n={2} icon={Users} title="Council — who thought what" present={Boolean(council)}>
          {council ? (
            <div className="space-y-2">
              {council.responses.map((r, i) => (
                <details key={i} className="rounded-lg border border-border/50 bg-card/40 px-3 py-2">
                  <summary className="cursor-pointer text-sm">
                    <span className="font-semibold text-foreground">{r.role}</span>
                    {r.agent && <span className="text-muted-foreground"> · {r.agent.name}</span>}
                  </summary>
                  <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{r.response}</p>
                </details>
              ))}
              {council.finalSummary && (
                <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-primary">Grand Vizier — final synthesis</div>
                  <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-foreground/90">{council.finalSummary}</p>
                </div>
              )}
            </div>
          ) : (
            <Absent>No council session (not a council-born decree).</Absent>
          )}
        </Stage>

        {/* 3 — Owner */}
        <Stage n={3} icon={ShieldCheck} title="Who owns / controls this work" present={Boolean(owner)}>
          {owner ? (
            <div className="space-y-1">
              <div className="font-semibold text-foreground">{owner.title}</div>
              <Meta>
                Status {owner.status}
                {owner.contextBindingStatus ? ` · context ${owner.contextBindingStatus}` : ""}
                {owner.executionTarget ? ` · target ${owner.executionTarget}` : ""}
              </Meta>
              <Meta>
                Responsible: {owner.assignedAgent?.name ?? owner.assignedExternalAgentName ?? "unassigned"}
                {owner.assignedExternalAgentName ? ` (external: ${owner.assignedExternalAgentName})` : ""}
              </Meta>
              {owner.assignedAgentReason && <Quote>{owner.assignedAgentReason}</Quote>}
            </div>
          ) : (
            <Absent>No work order yet.</Absent>
          )}
        </Stage>

        {/* 4 — External agent prompt */}
        <Stage n={4} icon={Send} title="Prompt given to the external agent" present={Boolean(externalPrompt)}>
          {externalPrompt ? (
            <div className="space-y-1">
              <Meta>Agent: {externalPrompt.externalAgentName ?? "—"}</Meta>
              <details className="rounded-lg border border-border/50 bg-card/40 px-3 py-2">
                <summary className="cursor-pointer text-sm text-muted-foreground">View full prompt</summary>
                <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap text-[11px] leading-relaxed text-muted-foreground">{externalPrompt.inputPrompt}</pre>
              </details>
            </div>
          ) : (
            <Absent>No external agent has been dispatched.</Absent>
          )}
        </Stage>

        {/* 5 — External agent result */}
        <Stage n={5} icon={MessageSquareReply} title="What the external agent returned" present={Boolean(externalResult)}>
          {externalResult ? (
            <div className="space-y-2">
              <Meta>
                {externalResult.status} · exit {externalResult.exitCode ?? "—"}
                {externalResult.completedAt ? ` · ${fmt(externalResult.completedAt)}` : ""}
              </Meta>
              {externalResult.patches.map((p) => (
                <div key={p.id} className="rounded-lg border border-border/50 bg-card/40 px-3 py-2">
                  <Meta>
                    Patch · {p.validationStatus ?? "—"} · risk {p.riskLevel ?? "—"} · {p.filesChanged.length} file(s)
                  </Meta>
                  {p.diffStat && <pre className="mt-1 overflow-auto text-[11px] text-muted-foreground">{p.diffStat}</pre>}
                </div>
              ))}
              {externalResult.outputText && (
                <details className="rounded-lg border border-border/50 bg-card/40 px-3 py-2">
                  <summary className="cursor-pointer text-sm text-muted-foreground">View agent report</summary>
                  <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap text-[11px] leading-relaxed text-muted-foreground">{externalResult.outputText}</pre>
                </details>
              )}
            </div>
          ) : (
            <Absent>No result yet.</Absent>
          )}
        </Stage>

        {/* 6 — Review / knowledge */}
        <Stage n={6} icon={BookOpenCheck} title="Reviewed & knowledge captured" present={Boolean(review)}>
          {review ? (
            <div className="space-y-2">
              <Meta>
                Reviewer: {review.reviewerAgent?.name ?? "—"} · verdict {review.verdict} · confidence {review.confidence}
              </Meta>
              {review.kingRecommendation && review.kingRecommendation !== "—" && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                  Recommendation to the King: {review.kingRecommendation}
                </div>
              )}
              {review.summary && <Quote>{review.summary}</Quote>}
              {review.knowledge.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Knowledge captured</div>
                  {review.knowledge.map((k) => (
                    <div key={k.id} className="rounded-lg border border-border/50 bg-card/40 px-3 py-2">
                      <div className="text-sm font-semibold text-foreground">{k.title}</div>
                      <Meta>
                        {k.status}
                        {k.category ? ` · ${k.category}` : ""}
                        {k.proposedByAgent ? ` · by ${k.proposedByAgent.name}` : ""}
                      </Meta>
                      {k.summary && <p className="mt-1 text-xs text-muted-foreground">{k.summary}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <Absent>No review or captured knowledge yet.</Absent>
          )}
        </Stage>

        {/* 7 — Secretary summary */}
        <Stage n={7} icon={ScrollText} title="Royal Secretary — summary" present={Boolean(secretarySummary)}>
          {secretarySummary ? (
            <div className="space-y-1">
              <div className="font-semibold text-foreground">{secretarySummary.title}</div>
              <p className="whitespace-pre-wrap text-sm text-foreground/90">{secretarySummary.summary}</p>
              {secretarySummary.synthesized && <Meta>Auto-synthesized from the lineage above.</Meta>}
            </div>
          ) : (
            <Absent>No summary yet.</Absent>
          )}
        </Stage>
      </ol>
    </div>
  );
}

function Stage({
  n,
  icon: Icon,
  title,
  present,
  children
}: {
  n: number;
  icon: typeof Crown;
  title: string;
  present: boolean;
  children: ReactNode;
}) {
  return (
    <li className="relative">
      <span
        className={`absolute -left-[2.1rem] flex h-7 w-7 items-center justify-center rounded-full border text-xs font-bold ${
          present ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-muted/30 text-muted-foreground"
        }`}
      >
        {n}
      </span>
      <div className="rounded-xl border border-border bg-card/60 p-4">
        <div className="mb-2 flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        </div>
        {children}
      </div>
    </li>
  );
}

function Meta({ children }: { children: ReactNode }) {
  return <div className="text-[11px] text-muted-foreground">{children}</div>;
}

function Quote({ children }: { children: ReactNode }) {
  return (
    <p className="border-l-2 border-border/60 pl-3 text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap">{children}</p>
  );
}

function Absent({ children }: { children: ReactNode }) {
  return <div className="text-xs italic text-muted-foreground/70">{children}</div>;
}
