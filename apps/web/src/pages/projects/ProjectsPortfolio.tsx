import { AlertTriangle, ArrowUpRight, CheckCircle2, Clock3, Edit3, FileText, FolderKanban, Inbox, PackageOpen, RefreshCw, ScanSearch, Search, ShieldAlert } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTk } from "@/lib/i18n";
import { cn, formatDate } from "@/lib/utils";
import type { ProjectDto } from "@/types/api";
import { contextStatusClass, projectPriorities, projectStatuses, selectClassName, type ProjectFilters, type ProjectSummary } from "./projectModels";

type PortfolioProps = {
  projects: ProjectDto[];
  selectedId: string | null;
  summaries: Record<string, ProjectSummary>;
  filters: ProjectFilters;
  loading: boolean;
  error: string | null;
  onFiltersChange: (filters: ProjectFilters) => void;
  onSelect: (project: ProjectDto) => void;
  onRetry: () => void;
};

export function ProjectsPortfolio(props: PortfolioProps) {
  const tk = useTk();
  return (
    <section aria-label={tk("projects.portfolioAria")} className="min-w-0 overflow-hidden rounded-lg border border-border bg-card" role="region">
      <div className="border-b border-border p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">{tk("projects.portfolioTitle")}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{tk("projects.portfolioDescription")}</p>
          </div>
          <span className="text-xs text-muted-foreground">{tk("projects.resultCount", { count: props.projects.length })}</span>
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-[minmax(220px,1fr)_170px_170px]">
          <label className="relative block">
            <span className="sr-only">{tk("projects.search")}</span>
            <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
            <Input
              aria-label={tk("projects.search")}
              className="pl-9"
              value={props.filters.query}
              onChange={(event) => props.onFiltersChange({ ...props.filters, query: event.target.value })}
              placeholder={tk("projects.searchPlaceholder")}
            />
          </label>
          <select aria-label={tk("projects.filterStatus")} className={selectClassName} value={props.filters.status} onChange={(event) => props.onFiltersChange({ ...props.filters, status: event.target.value as ProjectFilters["status"] })}>
            <option value="">{tk("projects.allStatuses")}</option>
            {projectStatuses.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select aria-label={tk("projects.filterPriority")} className={selectClassName} value={props.filters.priority} onChange={(event) => props.onFiltersChange({ ...props.filters, priority: event.target.value as ProjectFilters["priority"] })}>
            <option value="">{tk("projects.allPriorities")}</option>
            {projectPriorities.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>
      </div>

      {props.error ? (
        <div className="m-4 rounded-md border border-red-500/40 bg-red-500/10 p-4">
          <div className="flex items-start gap-3"><ShieldAlert className="mt-0.5 h-5 w-5 text-red-300" /><div><h3 className="font-semibold">{tk("projects.loadError")}</h3><p className="mt-1 text-sm text-red-100">{props.error}</p></div></div>
          <Button className="mt-3" variant="outline" onClick={props.onRetry}><RefreshCw className="h-4 w-4" />{tk("projects.retry")}</Button>
        </div>
      ) : null}
      {props.loading ? <ProjectSkeletons /> : null}
      {!props.loading && !props.error && props.projects.length === 0 ? (
        <div className="p-8 text-center"><FolderKanban className="mx-auto h-8 w-8 text-primary" /><h3 className="mt-3 font-semibold">{tk("projects.emptyTitle")}</h3><p className="mt-1 text-sm text-muted-foreground">{tk("projects.emptyDescription")}</p></div>
      ) : null}
      {!props.loading && !props.error ? (
        <div className="max-h-[720px] divide-y divide-border overflow-y-auto">
          {props.projects.map((project) => (
            <ProjectRow key={project.id} project={project} summary={props.summaries[project.id]} selected={props.selectedId === project.id} onSelect={() => props.onSelect(project)} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function PortfolioMetrics({ projects, summaries }: { projects: ProjectDto[]; summaries: Record<string, ProjectSummary> }) {
  const tk = useTk();
  const values = Object.values(summaries);
  const metrics = [
    [tk("projects.metric.total"), projects.length],
    [tk("projects.metric.attention"), values.filter((item) => item.contextStatus !== "FRESH").length],
    [tk("projects.metric.activeWork"), values.reduce((total, item) => total + item.activeWorkCount, 0)],
    [tk("projects.metric.fresh"), values.filter((item) => item.contextStatus === "FRESH").length]
  ] as const;
  return <div className="mb-5 grid grid-cols-2 border-y border-border lg:grid-cols-4">{metrics.map(([label, value], index) => <div key={label} className={cn("min-w-0 px-4 py-3", index % 2 === 0 ? "border-r border-border" : "", index > 1 && "border-t border-border lg:border-t-0", index > 0 && "lg:border-l lg:border-border lg:border-r-0")}><div className="text-xl font-semibold tabular-nums">{value}</div><div className="mt-0.5 text-xs text-muted-foreground">{label}</div></div>)}</div>;
}

function ProjectRow({ project, summary, selected, onSelect }: { project: ProjectDto; summary?: ProjectSummary; selected: boolean; onSelect: () => void }) {
  const tk = useTk();
  const contextStatus = summary?.contextStatus ?? "UNKNOWN";
  return (
    <article className={cn("group relative grid gap-3 p-4 transition-colors hover:bg-muted/20 md:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)_44px] md:items-center", selected && "bg-primary/10 shadow-[inset_3px_0_0_hsl(var(--primary))]")}>
      <button aria-pressed={selected} className="min-w-0 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary" onClick={onSelect} type="button">
        <div className="flex flex-wrap items-center gap-2"><h3 className="min-w-0 break-words text-sm font-semibold">{project.name}</h3><Badge value={project.status} /><Badge value={project.priority} /></div>
        <p className="mt-1 break-words text-xs text-muted-foreground">{project.activeMilestone || project.codename || tk("projects.noMilestone")}</p>
        <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{project.description || tk("projects.noDescription")}</p>
      </button>
      <div className="grid min-w-0 grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <StatusPill status={contextStatus} />
        <span className="text-muted-foreground">{tk("projects.activeWork", { count: summary?.activeWorkCount ?? "..." })}</span>
        <span className="text-muted-foreground">{tk("projects.affected", { count: summary?.affectedWorkCount ?? "..." })}</span>
        <span className="truncate text-muted-foreground" title={formatDate(project.updatedAt)}><Clock3 className="mr-1 inline h-3.5 w-3.5" />{formatDate(project.updatedAt)}</span>
      </div>
      <Link aria-label={tk("projects.openWorkspace")} className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-border text-primary transition hover:border-primary/60 hover:bg-primary/10 focus:outline-none focus:ring-2 focus:ring-primary" to={`/projects/${project.id}`}><ArrowUpRight className="h-4 w-4" /></Link>
    </article>
  );
}

export function SelectedProjectPanel({ project, summary, canEdit, busy, statusMessage, onEdit, onScan, onRefresh }: { project: ProjectDto | null; summary?: ProjectSummary; canEdit: boolean; busy: "scan" | "refresh" | null; statusMessage: string | null; onEdit: () => void; onScan: () => void; onRefresh: () => void }) {
  const tk = useTk();
  if (!project) return <aside className="rounded-lg border border-border bg-card p-6"><h2 className="font-semibold">{tk("projects.selectTitle")}</h2><p className="mt-2 text-sm text-muted-foreground">{tk("projects.selectDescription")}</p></aside>;
  const contextStatus = summary?.contextStatus ?? "UNKNOWN";
  return (
    <aside className="min-w-0 rounded-lg border border-border bg-card p-5 xl:sticky xl:top-5 xl:self-start">
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-semibold text-primary">{tk("projects.selectedEyebrow")}</p><h2 className="mt-1 break-words text-xl font-semibold">{project.name}</h2><p className="mt-1 text-xs text-muted-foreground">{project.activeMilestone || project.codename || tk("projects.noMilestone")}</p></div>{canEdit ? <button aria-label={tk("projects.edit")} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:border-primary/50 hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary" onClick={onEdit}><Edit3 className="h-4 w-4" /></button> : null}</div>
      <div className="mt-5 grid grid-cols-3 border-y border-border py-3 text-center"><Fact label={tk("projects.contextHealth")} value={contextStatus} /><Fact label={tk("projects.activeWorkLabel")} value={String(summary?.activeWorkCount ?? 0)} /><Fact label={tk("projects.needsRefresh")} value={String(summary?.affectedWorkCount ?? 0)} /></div>
      <div className="mt-5 rounded-md border border-border bg-muted/15 p-3"><h3 className="text-xs font-semibold">{tk("projects.nextAction")}</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">{tk(contextStatus === "FRESH" ? "projects.next.fresh" : "projects.next.attention")}</p></div>
      <div className="mt-4 flex flex-wrap gap-2">
        {canEdit ? <><IconAction label={tk("projects.action.scan")} disabled={busy !== null} onClick={onScan}><ScanSearch className="h-4 w-4" /></IconAction><IconAction label={tk("projects.action.refresh")} disabled={busy !== null} onClick={onRefresh}><RefreshCw className={cn("h-4 w-4", busy === "refresh" && "animate-spin")} /></IconAction></> : null}
        <SourceIcon to="/work-orders" label={tk("projects.action.openWorkOrders")}><FolderKanban className="h-4 w-4" /></SourceIcon>
        <SourceIcon to="/inbox" label={tk("projects.action.openInbox")}><Inbox className="h-4 w-4" /></SourceIcon>
        <SourceIcon to="/artifacts" label={tk("projects.action.openArtifacts")}><PackageOpen className="h-4 w-4" /></SourceIcon>
      </div>
      {statusMessage ? <p className="mt-3 text-xs text-muted-foreground">{statusMessage}</p> : null}
      <div className="mt-5 border-t border-border pt-4"><h3 className="text-xs font-semibold">{tk("projects.sourceTruth")}</h3><div className="mt-3 grid gap-2"><SourceLink to={`/projects/${project.id}`} label={tk("projects.source.projectLabel")} description={tk("projects.source.project")} /><SourceLink to="/work-orders" label={tk("projects.source.workLabel")} description={tk("projects.source.work")} /><SourceLink to="/inbox" label={tk("projects.source.inboxLabel")} description={tk("projects.source.inbox")} /><SourceLink to="/artifacts" label={tk("projects.source.artifactsLabel")} description={tk("projects.source.artifacts")} /></div></div>
      <Link className="mt-5 inline-flex w-full" to={`/projects/${project.id}`}><Button className="min-h-11 w-full">{tk("projects.openWorkspace")}<ArrowUpRight className="h-4 w-4" /></Button></Link>
    </aside>
  );
}

function StatusPill({ status }: { status: ProjectSummary["contextStatus"] }) { const tk = useTk(); const Icon = status === "FRESH" ? CheckCircle2 : status === "UNKNOWN" ? AlertTriangle : ShieldAlert; return <span className={cn("inline-flex w-fit items-center gap-1 rounded-full border px-2 py-1", contextStatusClass(status))} title={status}><Icon className="h-3.5 w-3.5" />{tk("projects.contextStatus", { status })}</span>; }
function Badge({ value }: { value: string }) { return <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold text-muted-foreground" title={value}>{value}</span>; }
function Fact({ label, value }: { label: string; value: string }) { return <div className="min-w-0 px-2"><div className="truncate text-[10px] text-muted-foreground" title={label}>{label}</div><div className="mt-1 break-words text-sm font-semibold">{value}</div></div>; }
function IconAction({ label, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) { return <button aria-label={label} title={label} className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-border text-primary transition hover:border-primary/50 hover:bg-primary/10 focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50" {...props}>{children}</button>; }
function SourceIcon({ to, label, children }: { to: string; label: string; children: React.ReactNode }) { return <Link aria-label={label} title={label} to={to} className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-border text-primary transition hover:border-primary/50 hover:bg-primary/10 focus:outline-none focus:ring-2 focus:ring-primary">{children}</Link>; }
function SourceLink({ to, label, description }: { to: string; label: string; description: string }) { return <Link to={to} className="flex items-start justify-between gap-3 rounded-md border border-border bg-muted/15 p-3 transition hover:border-primary/50 hover:bg-primary/10"><div><div className="text-sm font-semibold">{label}</div><div className="mt-1 text-xs leading-5 text-muted-foreground">{description}</div></div><ArrowUpRight className="h-4 w-4 shrink-0 text-primary" /></Link>; }
function ProjectSkeletons() { return <div className="divide-y divide-border">{[0, 1, 2].map((item) => <div className="p-4" key={item}><div className="h-4 w-1/3 animate-pulse rounded bg-muted/50" /><div className="mt-3 h-3 w-2/3 animate-pulse rounded bg-muted/30" /></div>)}</div>; }
