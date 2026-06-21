import { Archive, ArrowUpRight, Edit3, GitMerge, PackageOpen, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useTk } from "@/lib/i18n";
import { formatDate } from "@/lib/utils";
import type { ArtifactDto } from "@/types/api";
import { humanize, qualityClass, sourceSummary } from "./artifactModels";

type Props = {
  artifact: ArtifactDto | null;
  canEdit: boolean;
  canDelete: boolean;
  busy: boolean;
  error: string | null;
  onEdit: () => void;
  onArchiveDuplicate: () => void;
  onDelete: () => void;
};

export function ArtifactDetail(props: Props) {
  const tk = useTk();
  if (!props.artifact) return <aside className="rounded-lg border border-border bg-card p-6"><PackageOpen className="h-7 w-7 text-primary" /><h2 className="mt-4 font-semibold">{tk("artifacts.selectTitle")}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{tk("artifacts.selectDescription")}</p></aside>;
  const artifact = props.artifact;
  const source = sourceSummary(artifact) || tk("artifacts.unassigned");
  return (
    <article className="min-w-0 rounded-lg border border-border bg-card xl:sticky xl:top-5 xl:self-start">
      <header className="border-b border-border p-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-semibold text-primary">{tk("artifacts.detailEyebrow")}</p><h2 className="mt-1 break-words text-xl font-semibold">{artifact.title}</h2><p className="mt-1 break-words text-xs text-muted-foreground">{source}</p></div><div className="flex gap-2">{props.canEdit ? <IconButton label={tk("artifacts.edit")} onClick={props.onEdit}><Edit3 className="h-4 w-4" /></IconButton> : null}{props.canDelete ? <IconButton destructive label={tk("artifacts.delete")} onClick={props.onDelete}><Trash2 className="h-4 w-4" /></IconButton> : null}</div></div>
        <div className="mt-4 flex flex-wrap gap-2"><span className="rounded-full border border-border px-2 py-1 text-xs text-muted-foreground" title={artifact.type}>{humanize(artifact.type)}</span><span className={qualityClass(artifact.dataQuality)} title={artifact.dataQuality}>{humanize(artifact.dataQuality)}</span>{artifact.isDuplicate ? <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs text-amber-300">{tk("artifacts.duplicate")}</span> : null}</div>
      </header>

      <div className="space-y-5 p-5">
        <section><div className="flex items-center justify-between gap-3"><h3 className="text-xs font-semibold">{tk("artifacts.contentTitle")}</h3><span className="text-xs text-muted-foreground">{tk("artifacts.updated", { date: formatDate(artifact.updatedAt) })}</span></div><div className="mt-2 max-h-[420px] overflow-auto rounded-md border border-border bg-background/50 p-4"><pre className="whitespace-pre-wrap break-words font-sans text-sm leading-6 text-foreground/90">{artifact.content}</pre></div></section>

        {artifact.tags.length ? <section><h3 className="text-xs font-semibold">{tk("artifacts.tags")}</h3><div className="mt-2 flex flex-wrap gap-2">{artifact.tags.map((tag) => <span className="max-w-full break-words rounded-full bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground" key={tag}>#{tag}</span>)}</div></section> : null}

        <section><h3 className="text-xs font-semibold">{tk("artifacts.sourceTruth")}</h3><div className="mt-2 grid gap-2">
          {artifact.sourceLink?.href ? <SourceLink label={artifact.sourceLink.label || tk("artifacts.openSource")} description={artifact.sourceLink.title || source} to={artifact.sourceLink.href} /> : <StaticSource label={tk("artifacts.sourceRecord")} description={artifact.sourceType && artifact.sourceId ? `${humanize(artifact.sourceType)} · ${artifact.sourceId}` : tk("artifacts.noSourceRecord")} />}
          {artifact.project ? <SourceLink label={tk("artifacts.owningProject")} description={artifact.project.name} to={`/projects/${artifact.project.id}`} /> : null}
          {artifact.traceId ? <SourceLink label={tk("artifacts.usageTrace")} description={artifact.traceId} to={`/usage-traces/${artifact.traceId}`} /> : null}
        </div></section>

        <section><h3 className="text-xs font-semibold">{tk("artifacts.provenance")}</h3><dl className="mt-2 grid gap-2 rounded-md border border-border bg-muted/10 p-3 text-xs"><Fact label={tk("artifacts.created")} value={formatDate(artifact.createdAt)} /><Fact label={tk("artifacts.updatedLabel")} value={formatDate(artifact.updatedAt)} /><Fact label={tk("artifacts.createdBy")} value={artifact.createdBySystem ? tk("artifacts.system") : tk("artifacts.user")} /><Fact label={tk("artifacts.provenanceFields")} value={artifact.provenance ? Object.keys(artifact.provenance).join(", ") : tk("artifacts.noneRecorded")} /></dl></section>

        {artifact.isDuplicate ? <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-4"><div className="flex gap-3"><GitMerge className="h-5 w-5 shrink-0 text-amber-300" /><div><h3 className="text-sm font-semibold">{tk("artifacts.duplicateTitle")}</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{tk("artifacts.duplicateDescription")}</p></div></div>{props.canEdit ? <Button className="mt-3 min-h-11" disabled={props.busy} variant="outline" onClick={props.onArchiveDuplicate}><Archive className="h-4 w-4" />{tk("artifacts.archiveDuplicate")}</Button> : null}</div> : null}
        {props.error ? <p className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">{props.error}</p> : null}
      </div>
    </article>
  );
}

function IconButton({ label, destructive, children, onClick }: { label: string; destructive?: boolean; children: React.ReactNode; onClick: () => void }) { return <button aria-label={label} title={label} className={`inline-flex h-11 w-11 items-center justify-center rounded-md border transition focus:outline-none focus:ring-2 focus:ring-primary ${destructive ? "border-red-500/30 text-red-300 hover:bg-red-500/10" : "border-border text-muted-foreground hover:border-primary/50 hover:text-primary"}`} onClick={onClick}>{children}</button>; }
function SourceLink({ label, description, to }: { label: string; description: string; to: string }) { return <Link className="flex min-w-0 items-start justify-between gap-3 rounded-md border border-border bg-muted/10 p-3 transition hover:border-primary/50 hover:bg-primary/10" to={to}><span className="min-w-0"><span className="block text-sm font-semibold">{label}</span><span className="mt-1 block break-all text-xs leading-5 text-muted-foreground">{description}</span></span><ArrowUpRight className="h-4 w-4 shrink-0 text-primary" /></Link>; }
function StaticSource({ label, description }: { label: string; description: string }) { return <div className="rounded-md border border-border bg-muted/10 p-3"><div className="text-sm font-semibold">{label}</div><div className="mt-1 break-all text-xs text-muted-foreground">{description}</div></div>; }
function Fact({ label, value }: { label: string; value: string }) { return <div className="grid min-w-0 gap-1 sm:grid-cols-[130px_minmax(0,1fr)]"><dt className="text-muted-foreground">{label}</dt><dd className="break-all text-foreground/80">{value}</dd></div>; }
