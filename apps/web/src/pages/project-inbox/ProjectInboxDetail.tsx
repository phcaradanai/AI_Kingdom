import { Archive, ArrowUpRight, Check, FileSearch, Route, X } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useTk } from "@/lib/i18n";
import { formatDate } from "@/lib/utils";
import type { ProjectDto, ProjectInboxItemDto } from "@/types/api";
import {
  candidateProjects,
  confidenceBand,
  confidenceClass,
  displayReason,
  displayTitle,
  evidenceLabel,
  humanize,
  ignoredSignals,
  qualityClass,
  routingEvidence,
  selectClassName
} from "./projectInboxModels";

type Props = {
  item: ProjectInboxItemDto | null;
  projects: ProjectDto[];
  assignmentTarget: string;
  canAssign: boolean;
  busy: boolean;
  error: string | null;
  onAssignmentTargetChange: (projectId: string) => void;
  onAssign: () => void;
  onDismiss: () => void;
  onArchive: () => void;
};

export function ProjectInboxDetail(props: Props) {
  const tk = useTk();
  if (!props.item) return <aside className="rounded-lg border border-border bg-card p-6"><Route className="h-7 w-7 text-primary" /><h2 className="mt-4 font-semibold">{tk("projectInbox.selectTitle")}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{tk("projectInbox.selectDescription")}</p></aside>;

  const item = props.item;
  const projectById = new Map(props.projects.map((project) => [project.id, project]));
  const candidates = candidateProjects(item, projectById);
  const evidence = routingEvidence(item);
  const ignored = ignoredSignals(item);
  const assignmentTarget = props.assignmentTarget || candidates[0]?.id || "";
  const isPending = item.status === "PENDING";
  const recommendedProject = projectById.get(assignmentTarget) ?? candidates[0] ?? null;

  return (
    <aside className="min-w-0 rounded-lg border border-border bg-card xl:sticky xl:top-5 xl:self-start">
      <div className="border-b border-border p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0"><p className="text-xs font-semibold text-primary">{tk("projectInbox.detailEyebrow")}</p><h2 className="mt-1 break-words text-xl font-semibold">{displayTitle(item)}</h2><p className="mt-1 text-xs text-muted-foreground">{item.humanReadableSource || humanize(item.sourceType)}</p></div>
          <span className={confidenceClass(item.confidenceScore)}>{item.confidenceScore ?? 0}%</span>
        </div>
        <div className="mt-4 grid grid-cols-3 border-y border-border py-3 text-center">
          <Fact label={tk("projectInbox.fact.status")} value={humanize(item.status)} />
          <Fact label={tk("projectInbox.fact.confidence")} value={tk(`projectInbox.band.${confidenceBand(item.confidenceScore)}`)} />
          <Fact label={tk("projectInbox.fact.candidate")} value={recommendedProject?.name || tk("projectInbox.manualProject")} />
        </div>
      </div>

      <div className="space-y-5 p-5">
        <section><h3 className="text-xs font-semibold">{tk("projectInbox.whyTitle")}</h3><p className="mt-2 break-words rounded-md border border-border bg-muted/15 p-3 text-sm leading-6 text-muted-foreground">{displayReason(item) || tk("projectInbox.noReason")}</p></section>
        <section><h3 className="text-xs font-semibold">{tk("projectInbox.summaryTitle")}</h3><p className="mt-2 break-words text-sm leading-6 text-muted-foreground">{item.summary || tk("projectInbox.noSummary")}</p></section>

        <section>
          <div className="flex items-center justify-between gap-3"><h3 className="text-xs font-semibold">{tk("projectInbox.evidenceTitle")}</h3><span className="text-xs text-muted-foreground">{tk("projectInbox.evidenceCount", { count: evidence.length })}</span></div>
          {evidence.length ? <div className="mt-2 flex flex-wrap gap-2">{evidence.map((entry, index) => <span className="max-w-full break-words rounded-md border border-primary/30 bg-primary/5 px-2.5 py-1.5 text-xs text-primary" key={`${entry.type}-${entry.value}-${index}`}>{evidenceLabel(entry)}</span>)}</div> : <p className="mt-2 text-sm text-muted-foreground">{tk("projectInbox.noEvidence")}</p>}
          {ignored.length ? <details className="mt-3 rounded-md border border-border"><summary className="min-h-11 cursor-pointer px-3 py-3 text-xs font-semibold text-muted-foreground">{tk("projectInbox.ignoredSignals", { count: ignored.length })}</summary><p className="border-t border-border px-3 py-3 text-xs leading-5 text-muted-foreground">{ignored.join(", ")}</p></details> : null}
        </section>

        <section><h3 className="text-xs font-semibold">{tk("projectInbox.sourceTruth")}</h3><div className="mt-2 grid gap-2">
          {item.sourceLink?.href ? <SourceLink label={item.sourceLink.label || tk("projectInbox.openSource")} description={item.sourceLink.title || item.humanReadableSource || item.sourceId} to={item.sourceLink.href} /> : <StaticSource label={tk("projectInbox.sourceRecord")} description={`${humanize(item.sourceType)} · ${item.sourceId}`} />}
          {recommendedProject ? <SourceLink label={tk("projectInbox.suggestedProject")} description={recommendedProject.name} to={`/projects/${recommendedProject.id}`} /> : null}
          {item.assignedProjectId && projectById.get(item.assignedProjectId) ? <SourceLink label={tk("projectInbox.assignedProject")} description={projectById.get(item.assignedProjectId)!.name} to={`/projects/${item.assignedProjectId}`} /> : null}
          {item.traceId ? <SourceLink label={tk("projectInbox.routingTrace")} description={item.traceId} to={`/usage-traces/${item.traceId}`} /> : null}
        </div></section>

        {props.canAssign && isPending ? <section className="rounded-md border border-primary/30 bg-primary/5 p-4"><h3 className="text-xs font-semibold">{tk("projectInbox.safeAction")}</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{tk("projectInbox.safeActionDescription")}</p><select aria-label={tk("projectInbox.assignmentProject")} className={`${selectClassName} mt-3`} value={assignmentTarget} onChange={(event) => props.onAssignmentTargetChange(event.target.value)}><option value="">{tk("projectInbox.selectProject")}</option>{props.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select><div className="mt-3 grid gap-2 sm:grid-cols-3"><Button className="min-h-11" disabled={props.busy || !assignmentTarget} onClick={props.onAssign}><Check className="h-4 w-4" />{tk("projectInbox.assign")}</Button><Button className="min-h-11" disabled={props.busy} variant="outline" onClick={props.onDismiss}><X className="h-4 w-4" />{tk("projectInbox.dismiss")}</Button><Button className="min-h-11" disabled={props.busy} variant="outline" onClick={props.onArchive}><Archive className="h-4 w-4" />{tk("projectInbox.archive")}</Button></div></section> : <p className="rounded-md border border-border bg-muted/15 p-3 text-sm text-muted-foreground">{tk("projectInbox.closedDecision", { status: humanize(item.status) })}</p>}
        {props.error ? <p className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">{props.error}</p> : null}

        <details className="rounded-md border border-border"><summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 py-3 text-xs font-semibold text-muted-foreground"><FileSearch className="h-4 w-4" />{tk("projectInbox.technicalDetails")}</summary><dl className="grid gap-2 border-t border-border p-3 text-xs text-muted-foreground"><Technical label="ID" value={item.id} /><Technical label={tk("projectInbox.sourceRecord")} value={`${item.sourceType} · ${item.sourceId}`} /><Technical label={tk("projectInbox.routingQuality")} value={item.routingQuality || "N/A"} /><Technical label={tk("projectInbox.created")} value={formatDate(item.createdAt)} /><Technical label={tk("projectInbox.provenanceFields")} value={item.provenance ? Object.keys(item.provenance).join(", ") : "N/A"} /></dl></details>
      </div>
    </aside>
  );
}

function Fact({ label, value }: { label: string; value: string }) { return <div className="min-w-0 px-2"><div className="break-words text-[10px] text-muted-foreground">{label}</div><div className="mt-1 break-words text-xs font-semibold">{value}</div></div>; }
function SourceLink({ label, description, to }: { label: string; description: string; to: string }) { return <Link className="flex min-w-0 items-start justify-between gap-3 rounded-md border border-border bg-muted/10 p-3 transition hover:border-primary/50 hover:bg-primary/10" to={to}><span className="min-w-0"><span className="block text-sm font-semibold">{label}</span><span className="mt-1 block break-all text-xs leading-5 text-muted-foreground">{description}</span></span><ArrowUpRight className="h-4 w-4 shrink-0 text-primary" /></Link>; }
function StaticSource({ label, description }: { label: string; description: string }) { return <div className="rounded-md border border-border bg-muted/10 p-3"><div className="text-sm font-semibold">{label}</div><div className="mt-1 break-all text-xs text-muted-foreground">{description}</div></div>; }
function Technical({ label, value }: { label: string; value: string }) { return <div className="grid min-w-0 gap-1 sm:grid-cols-[130px_minmax(0,1fr)]"><dt>{label}</dt><dd className="break-all font-mono text-foreground/80">{value}</dd></div>; }
