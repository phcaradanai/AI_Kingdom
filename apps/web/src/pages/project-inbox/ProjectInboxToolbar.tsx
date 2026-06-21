import { Archive, Check, Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTk } from "@/lib/i18n";
import type { ProjectDto } from "@/types/api";
import {
  humanize,
  projectInboxQualities,
  projectInboxRoutingQualities,
  projectInboxStatuses,
  selectClassName,
  type ProjectInboxFilters
} from "./projectInboxModels";

type Props = {
  filters: ProjectInboxFilters;
  projects: ProjectDto[];
  sourceTypes: string[];
  selectedCount: number;
  assignmentTarget: string;
  canAssign: boolean;
  busy: boolean;
  onFiltersChange: (filters: ProjectInboxFilters) => void;
  onAssignmentTargetChange: (projectId: string) => void;
  onClear: () => void;
  onBulkAssign: () => void;
  onBulkDismiss: () => void;
  onBulkArchive: () => void;
  onArchiveLow: () => void;
};

export function ProjectInboxToolbar(props: Props) {
  const tk = useTk();
  const update = (values: Partial<ProjectInboxFilters>) => props.onFiltersChange({ ...props.filters, ...values });

  return (
    <section aria-label={tk("projectInbox.filtersAria")} className="mb-5 overflow-hidden rounded-lg border border-border bg-card">
      <div className="grid gap-2 p-4 lg:grid-cols-[minmax(220px,1fr)_180px_180px_auto]">
        <label className="relative block">
          <span className="sr-only">{tk("projectInbox.search")}</span>
          <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
          <Input aria-label={tk("projectInbox.search")} className="pl-9" value={props.filters.query} onChange={(event) => update({ query: event.target.value })} placeholder={tk("projectInbox.searchPlaceholder")} />
        </label>
        <select aria-label={tk("projectInbox.filterStatus")} className={selectClassName} value={props.filters.status} onChange={(event) => update({ status: event.target.value as ProjectInboxFilters["status"] })}>
          <option value="">{tk("projectInbox.allStatuses")}</option>
          {projectInboxStatuses.map((status) => <option key={status} value={status}>{humanize(status)}</option>)}
        </select>
        <select aria-label={tk("projectInbox.filterConfidence")} className={selectClassName} value={props.filters.confidence} onChange={(event) => update({ confidence: event.target.value as ProjectInboxFilters["confidence"] })}>
          <option value="">{tk("projectInbox.allConfidence")}</option>
          <option value="none">{tk("projectInbox.confidence.none")}</option>
          <option value="low">{tk("projectInbox.confidence.low")}</option>
          <option value="medium">{tk("projectInbox.confidence.medium")}</option>
          <option value="high">{tk("projectInbox.confidence.high")}</option>
        </select>
        <Button className="min-h-11" type="button" variant="ghost" onClick={props.onClear}><X className="h-4 w-4" />{tk("projectInbox.clearFilters")}</Button>
      </div>

      <details className="border-t border-border">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-muted-foreground transition hover:bg-muted/20 hover:text-foreground">
          <SlidersHorizontal className="h-4 w-4" />{tk("projectInbox.advancedFilters")}
        </summary>
        <div className="grid gap-3 border-t border-border p-4 md:grid-cols-2 xl:grid-cols-4">
          <select aria-label={tk("projectInbox.filterQuality")} className={selectClassName} value={props.filters.dataQuality} onChange={(event) => update({ dataQuality: event.target.value as ProjectInboxFilters["dataQuality"] })}>
            <option value="">{tk("projectInbox.allQuality")}</option>
            {projectInboxQualities.map((quality) => <option key={quality} value={quality}>{humanize(quality)}</option>)}
          </select>
          <select aria-label={tk("projectInbox.filterRoutingQuality")} className={selectClassName} value={props.filters.routingQuality} onChange={(event) => update({ routingQuality: event.target.value as ProjectInboxFilters["routingQuality"] })}>
            <option value="">{tk("projectInbox.allRoutingQuality")}</option>
            {projectInboxRoutingQualities.map((quality) => <option key={quality} value={quality}>{humanize(quality)}</option>)}
          </select>
          <select aria-label={tk("projectInbox.filterSource")} className={selectClassName} value={props.filters.sourceType} onChange={(event) => update({ sourceType: event.target.value })}>
            <option value="">{tk("projectInbox.allSources")}</option>
            {props.sourceTypes.map((source) => <option key={source} value={source}>{humanize(source)}</option>)}
          </select>
          <select aria-label={tk("projectInbox.filterProject")} className={selectClassName} value={props.filters.suggestedProjectId} onChange={(event) => update({ suggestedProjectId: event.target.value })}>
            <option value="">{tk("projectInbox.allProjects")}</option>
            {props.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
          <Toggle label={tk("projectInbox.showTest")} checked={props.filters.includeTestData} onChange={(checked) => update({ includeTestData: checked })} />
          <Toggle label={tk("projectInbox.showDebug")} checked={props.filters.includeDebug} onChange={(checked) => update({ includeDebug: checked })} />
          {props.canAssign ? <Button className="min-h-11 md:col-span-2" variant="outline" disabled={props.busy} onClick={props.onArchiveLow}><Archive className="h-4 w-4" />{tk("projectInbox.archiveLow")}</Button> : null}
        </div>
      </details>

      {props.canAssign && props.selectedCount > 0 ? (
        <div className="grid gap-2 border-t border-primary/30 bg-primary/5 p-4 md:grid-cols-[minmax(200px,1fr)_auto_auto_auto]">
          <select aria-label={tk("projectInbox.bulkProject")} className={selectClassName} value={props.assignmentTarget} onChange={(event) => props.onAssignmentTargetChange(event.target.value)}>
            <option value="">{tk("projectInbox.bulkProject")}</option>
            {props.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
          <Button className="min-h-11" disabled={props.busy || !props.assignmentTarget} onClick={props.onBulkAssign}><Check className="h-4 w-4" />{tk("projectInbox.assignCount", { count: props.selectedCount })}</Button>
          <Button className="min-h-11" disabled={props.busy} variant="outline" onClick={props.onBulkDismiss}><X className="h-4 w-4" />{tk("projectInbox.dismiss")}</Button>
          <Button className="min-h-11" disabled={props.busy} variant="outline" onClick={props.onBulkArchive}><Archive className="h-4 w-4" />{tk("projectInbox.archive")}</Button>
        </div>
      ) : null}
    </section>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="flex min-h-11 items-center gap-3 rounded-md border border-border px-3 text-sm text-muted-foreground"><input checked={checked} type="checkbox" onChange={(event) => onChange(event.target.checked)} /><span>{label}</span></label>;
}

export function ProjectInboxMetrics({ items }: { items: Array<{ status: string; confidenceScore: number | null }> }) {
  const tk = useTk();
  const metrics = [
    [tk("projectInbox.metric.visible"), items.length],
    [tk("projectInbox.metric.pending"), items.filter((item) => item.status === "PENDING").length],
    [tk("projectInbox.metric.uncertain"), items.filter((item) => (item.confidenceScore ?? 0) < 70).length],
    [tk("projectInbox.metric.noMatch"), items.filter((item) => (item.confidenceScore ?? 0) <= 0).length]
  ];
  return <div className="mb-5 grid grid-cols-2 border-y border-border lg:grid-cols-4">{metrics.map(([label, value], index) => <div className={`min-w-0 px-4 py-3 ${index % 2 === 0 ? "border-r border-border" : ""} ${index > 1 ? "border-t border-border lg:border-t-0" : ""} ${index > 0 ? "lg:border-l lg:border-border lg:border-r-0" : ""}`} key={label}><div className="text-xl font-semibold tabular-nums">{value}</div><div className="mt-0.5 text-xs text-muted-foreground">{label}</div></div>)}</div>;
}
