import { AlertTriangle, ChevronRight, Inbox, RefreshCw, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTk } from "@/lib/i18n";
import { cn, formatDate } from "@/lib/utils";
import type { ProjectDto, ProjectInboxItemDto } from "@/types/api";
import {
  candidateProjects,
  confidenceBand,
  confidenceClass,
  displayReason,
  displayTitle,
  humanize,
  qualityClass
} from "./projectInboxModels";

type Props = {
  items: ProjectInboxItemDto[];
  projects: ProjectDto[];
  selectedId: string | null;
  checked: Record<string, boolean>;
  canAssign: boolean;
  loading: boolean;
  error: string | null;
  onSelect: (id: string) => void;
  onCheck: (id: string, checked: boolean) => void;
  onRetry: () => void;
};

export function ProjectInboxQueue(props: Props) {
  const tk = useTk();
  const projectById = new Map(props.projects.map((project) => [project.id, project]));
  return (
    <section aria-label={tk("projectInbox.queueAria")} className="min-w-0 overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-end justify-between gap-3 border-b border-border p-4">
        <div><h2 className="text-sm font-semibold">{tk("projectInbox.queueTitle")}</h2><p className="mt-1 text-xs text-muted-foreground">{tk("projectInbox.queueDescription")}</p></div>
        <span className="text-xs text-muted-foreground">{tk("projectInbox.resultCount", { count: props.items.length })}</span>
      </div>
      {props.loading ? <QueueSkeleton /> : null}
      {props.error ? <div className="m-4 rounded-md border border-red-500/40 bg-red-500/10 p-4"><div className="flex gap-3"><ShieldAlert className="h-5 w-5 text-red-300" /><div><h3 className="font-semibold">{tk("projectInbox.loadError")}</h3><p className="mt-1 text-sm text-red-100">{props.error}</p></div></div><Button className="mt-3" variant="outline" onClick={props.onRetry}><RefreshCw className="h-4 w-4" />{tk("projectInbox.retry")}</Button></div> : null}
      {!props.loading && !props.error && props.items.length === 0 ? <div className="p-8 text-center"><Inbox className="mx-auto h-8 w-8 text-primary" /><h3 className="mt-3 font-semibold">{tk("projectInbox.emptyTitle")}</h3><p className="mt-1 text-sm text-muted-foreground">{tk("projectInbox.emptyDescription")}</p></div> : null}
      {!props.loading && !props.error ? (
        <div className="max-h-[760px] divide-y divide-border overflow-y-auto">
          {props.items.map((item) => {
            const candidates = candidateProjects(item, projectById);
            const selected = item.id === props.selectedId;
            const selectable = props.canAssign && item.status === "PENDING";
            return (
              <article className={cn("grid min-w-0 grid-cols-[28px_minmax(0,1fr)_24px] gap-2 p-4 transition-colors hover:bg-muted/20", selected && "bg-primary/10 shadow-[inset_3px_0_0_hsl(var(--primary))]")} key={item.id}>
                <input aria-label={tk("projectInbox.selectItem", { title: displayTitle(item) })} checked={props.checked[item.id] ?? false} className="mt-1 h-4 w-4" disabled={!selectable} type="checkbox" onChange={(event) => props.onCheck(item.id, event.target.checked)} />
                <button aria-pressed={selected} className="min-w-0 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary" type="button" onClick={() => props.onSelect(item.id)}>
                  <div className="flex flex-wrap items-center gap-2"><h3 className="break-words text-sm font-semibold">{displayTitle(item)}</h3><span className={confidenceClass(item.confidenceScore)} title={String(item.confidenceScore ?? 0)}>{item.confidenceScore ?? 0}%</span></div>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{displayReason(item) || tk("projectInbox.noReason")}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span title={item.status}>{humanize(item.status)}</span><span aria-hidden="true">·</span><span>{candidates[0]?.name || tk("projectInbox.manualProject")}</span><span aria-hidden="true">·</span><span>{formatDate(item.createdAt)}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5"><span className={qualityClass(item.dataQualityLabel || item.dataQuality)}>{humanize(item.dataQualityLabel || item.dataQuality)}</span>{confidenceBand(item.confidenceScore) === "none" ? <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs text-amber-300"><AlertTriangle className="h-3 w-3" />{tk("projectInbox.manualReview")}</span> : null}</div>
                </button>
                <ChevronRight className={cn("mt-1 h-4 w-4 text-muted-foreground transition-transform", selected && "translate-x-0.5 text-primary")} />
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

function QueueSkeleton() {
  return <div className="divide-y divide-border">{[0, 1, 2].map((item) => <div className="p-4" key={item}><div className="h-4 w-1/2 animate-pulse rounded bg-muted/50" /><div className="mt-3 h-3 w-3/4 animate-pulse rounded bg-muted/30" /></div>)}</div>;
}
