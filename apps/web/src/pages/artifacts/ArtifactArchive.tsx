import { Archive, ChevronRight, PackageOpen, RefreshCw, Search, ShieldAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTk } from "@/lib/i18n";
import { cn, formatDate } from "@/lib/utils";
import type { ArtifactDto, ProjectDto } from "@/types/api";
import {
  artifactQualities,
  artifactTypes,
  groupArtifacts,
  humanize,
  qualityClass,
  selectClassName,
  sourceSummary,
  type ArtifactFilters
} from "./artifactModels";

type Props = {
  artifacts: ArtifactDto[];
  projects: ProjectDto[];
  selectedId: string | null;
  filters: ArtifactFilters;
  loading: boolean;
  error: string | null;
  onSelect: (id: string) => void;
  onFiltersChange: (filters: ArtifactFilters) => void;
  onClear: () => void;
  onRetry: () => void;
};

export function ArtifactArchive(props: Props) {
  const tk = useTk();
  const groups = groupArtifacts(props.artifacts);
  const update = (values: Partial<ArtifactFilters>) => props.onFiltersChange({ ...props.filters, ...values });
  return (
    <section aria-label={tk("artifacts.archiveAria")} className="min-w-0 overflow-hidden rounded-lg border border-border bg-card">
      <div className="border-b border-border p-4">
        <div className="flex items-end justify-between gap-3"><div><h2 className="text-sm font-semibold">{tk("artifacts.archiveTitle")}</h2><p className="mt-1 text-xs text-muted-foreground">{tk("artifacts.archiveDescription")}</p></div><span className="text-xs text-muted-foreground">{tk("artifacts.resultCount", { count: props.artifacts.length })}</span></div>
        <label className="relative mt-4 block"><span className="sr-only">{tk("artifacts.search")}</span><Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" /><Input aria-label={tk("artifacts.search")} className="pl-9" value={props.filters.query} onChange={(event) => update({ query: event.target.value })} placeholder={tk("artifacts.searchPlaceholder")} /></label>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <select aria-label={tk("artifacts.filterProject")} className={selectClassName} value={props.filters.projectId} onChange={(event) => update({ projectId: event.target.value })}><option value="">{tk("artifacts.allProjects")}</option>{props.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select>
          <select aria-label={tk("artifacts.filterType")} className={selectClassName} value={props.filters.type} onChange={(event) => update({ type: event.target.value as ArtifactFilters["type"] })}><option value="">{tk("artifacts.allTypes")}</option>{artifactTypes.map((type) => <option key={type} value={type}>{humanize(type)}</option>)}</select>
        </div>
        <details className="mt-2 rounded-md border border-border"><summary className="min-h-11 cursor-pointer list-none px-3 py-3 text-xs font-semibold text-muted-foreground">{tk("artifacts.moreFilters")}</summary><div className="grid gap-2 border-t border-border p-3 sm:grid-cols-2"><Input aria-label={tk("artifacts.filterTag")} value={props.filters.tag} onChange={(event) => update({ tag: event.target.value })} placeholder={tk("artifacts.tagPlaceholder")} /><select aria-label={tk("artifacts.filterQuality")} className={selectClassName} value={props.filters.dataQuality} onChange={(event) => update({ dataQuality: event.target.value as ArtifactFilters["dataQuality"] })}><option value="">{tk("artifacts.allQuality")}</option>{artifactQualities.map((quality) => <option key={quality} value={quality}>{humanize(quality)}</option>)}</select><label className="flex min-h-11 items-center gap-3 rounded-md border border-border px-3 text-sm text-muted-foreground"><input checked={props.filters.includeTestData} type="checkbox" onChange={(event) => update({ includeTestData: event.target.checked })} />{tk("artifacts.showTest")}</label><Button className="min-h-11" variant="ghost" onClick={props.onClear}><X className="h-4 w-4" />{tk("artifacts.clearFilters")}</Button></div></details>
      </div>

      {props.loading ? <ArchiveSkeleton /> : null}
      {props.error ? <div className="m-4 rounded-md border border-red-500/40 bg-red-500/10 p-4"><div className="flex gap-3"><ShieldAlert className="h-5 w-5 text-red-300" /><div><h3 className="font-semibold">{tk("artifacts.loadError")}</h3><p className="mt-1 text-sm text-red-100">{props.error}</p></div></div><Button className="mt-3" variant="outline" onClick={props.onRetry}><RefreshCw className="h-4 w-4" />{tk("artifacts.retry")}</Button></div> : null}
      {!props.loading && !props.error && props.artifacts.length === 0 ? <div className="p-8 text-center"><PackageOpen className="mx-auto h-8 w-8 text-primary" /><h3 className="mt-3 font-semibold">{tk("artifacts.emptyTitle")}</h3><p className="mt-1 text-sm text-muted-foreground">{tk("artifacts.emptyDescription")}</p></div> : null}
      {!props.loading && !props.error ? <div className="max-h-[760px] overflow-y-auto">{groups.map((group) => <div key={group.label}><h3 className="sticky top-0 z-[1] border-y border-border bg-card/95 px-4 py-2 text-[10px] font-semibold uppercase text-muted-foreground backdrop-blur">{humanize(group.label)}</h3><div className="divide-y divide-border">{group.items.map((artifact) => <ArtifactRow artifact={artifact} key={artifact.id} selected={artifact.id === props.selectedId} onSelect={() => props.onSelect(artifact.id)} />)}</div></div>)}</div> : null}
    </section>
  );
}

function ArtifactRow({ artifact, selected, onSelect }: { artifact: ArtifactDto; selected: boolean; onSelect: () => void }) {
  const tk = useTk();
  const source = sourceSummary(artifact) || tk("artifacts.unassigned");
  return <article className={cn("grid grid-cols-[minmax(0,1fr)_24px] gap-2 p-4 transition-colors hover:bg-muted/20", selected && "bg-primary/10 shadow-[inset_3px_0_0_hsl(var(--primary))]")}><button aria-pressed={selected} className="min-w-0 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary" onClick={onSelect}><div className="flex min-w-0 items-start gap-2"><Archive className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><h3 className="line-clamp-2 min-w-0 break-words text-sm font-semibold" title={artifact.title}>{artifact.title}</h3>{artifact.isDuplicate ? <span className="shrink-0 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs text-amber-300">{tk("artifacts.duplicate")}</span> : null}</div><p className="mt-1 truncate text-xs text-muted-foreground" title={source}>{source} · {formatDate(artifact.updatedAt)}</p><div className="mt-2 flex flex-wrap gap-1.5"><span className="rounded-full border border-border px-2 py-1 text-xs text-muted-foreground" title={artifact.type}>{humanize(artifact.type)}</span><span className={qualityClass(artifact.dataQuality)} title={artifact.dataQuality}>{humanize(artifact.dataQuality)}</span>{artifact.tags.slice(0, 3).map((tag) => <span className="max-w-32 truncate rounded-full bg-muted/40 px-2 py-1 text-xs text-muted-foreground" key={tag}>#{tag}</span>)}</div></button><ChevronRight className={cn("mt-1 h-4 w-4 text-muted-foreground", selected && "translate-x-0.5 text-primary")} /></article>;
}

export function ArtifactMetrics({ artifacts }: { artifacts: ArtifactDto[] }) {
  const tk = useTk();
  const metrics = [[tk("artifacts.metric.visible"), artifacts.length], [tk("artifacts.metric.projects"), new Set(artifacts.flatMap((item) => item.projectId ? [item.projectId] : [])).size], [tk("artifacts.metric.review"), artifacts.filter((item) => item.dataQuality === "REVIEW_REQUIRED").length], [tk("artifacts.metric.duplicates"), artifacts.filter((item) => item.isDuplicate).length]];
  return <div className="mb-5 grid grid-cols-2 border-y border-border lg:grid-cols-4">{metrics.map(([label, value], index) => <div className={`min-w-0 px-4 py-3 ${index % 2 === 0 ? "border-r border-border" : ""} ${index > 1 ? "border-t border-border lg:border-t-0" : ""} ${index > 0 ? "lg:border-l lg:border-border lg:border-r-0" : ""}`} key={label}><div className="text-xl font-semibold tabular-nums">{value}</div><div className="mt-0.5 text-xs text-muted-foreground">{label}</div></div>)}</div>;
}

function ArchiveSkeleton() { return <div className="divide-y divide-border">{[0, 1, 2].map((item) => <div className="p-4" key={item}><div className="h-4 w-1/2 animate-pulse rounded bg-muted/50" /><div className="mt-3 h-3 w-2/3 animate-pulse rounded bg-muted/30" /></div>)}</div>; }
