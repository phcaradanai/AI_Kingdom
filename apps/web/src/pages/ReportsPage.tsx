import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Archive, BookOpen, CalendarClock, Edit3, ExternalLink, FileText, Filter, Search, ShieldAlert, Tags, Trash2, UserRound, X } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/input";
import { MarkdownDocument } from "@/components/ui/MarkdownDocument";
import { Textarea } from "@/components/ui/textarea";
import { useTk } from "@/lib/i18n";
import { cn, formatDate } from "@/lib/utils";
import { useKingdomStore } from "@/stores/kingdomStore";
import type { ReportCategory, ReportDto, ReportImportance, ReportPayload } from "@/types/api";

const categories: ReportCategory[] = ["STRATEGY", "RESEARCH", "ARCHITECTURE", "FINANCE", "GENERAL", "OTHER"];
const importanceLevels: ReportImportance[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const selectClass = "h-11 w-full rounded-md border border-border bg-input px-3 text-sm text-foreground outline-none transition focus:ring-2 focus:ring-primary";

export function ReportsPage() {
  const tk = useTk();
  const reports = useKingdomStore((state) => state.reports);
  const isLoading = useKingdomStore((state) => state.isLoading);
  const error = useKingdomStore((state) => state.error);
  const searchReports = useKingdomStore((state) => state.searchReports);
  const updateReport = useKingdomStore((state) => state.updateReport);
  const deleteReport = useKingdomStore((state) => state.deleteReport);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<ReportCategory | "ALL">("ALL");
  const [importanceFilter, setImportanceFilter] = useState<ReportImportance | "ALL">("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(reports[0]?.id ?? null);
  const [editing, setEditing] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ReportDto | null>(null);

  const filteredReports = useMemo(
    () =>
      reports.filter(
        (report) =>
          (categoryFilter === "ALL" || report.category === categoryFilter) &&
          (importanceFilter === "ALL" || report.importance === importanceFilter)
      ),
    [reports, categoryFilter, importanceFilter]
  );
  const selectedReport = filteredReports.find((report) => report.id === selectedId) ?? filteredReports[0] ?? null;
  const hasFilters = categoryFilter !== "ALL" || importanceFilter !== "ALL" || query.trim().length > 0;

  async function onSearch(event: FormEvent) {
    event.preventDefault();
    setEditing(false);
    await searchReports(query);
  }

  async function onSave(payload: Partial<ReportPayload>) {
    if (!selectedReport) return;
    await updateReport(selectedReport.id, payload);
    setEditing(false);
  }

  async function onDeleteConfirmed() {
    if (!deleteTarget) return;
    const nextReport = filteredReports.find((report) => report.id !== deleteTarget.id);
    await deleteReport(deleteTarget.id);
    setDeleteTarget(null);
    setSelectedId(nextReport?.id ?? null);
    setEditing(false);
  }

  function clearFilters() {
    setQuery("");
    setCategoryFilter("ALL");
    setImportanceFilter("ALL");
    setEditing(false);
    void searchReports("");
  }

  return (
    <div className="min-w-0 animate-in fade-in slide-in-from-bottom-3 duration-500">
      <PageHeader
        eyebrow={tk("reports.eyebrow")}
        title={tk("reports.title")}
        description={tk("reports.description")}
      />

      <div className={cn("grid min-w-0 gap-5", selectedReport && "lg:grid-cols-[minmax(290px,360px)_minmax(0,1fr)] xl:grid-cols-[360px_minmax(0,1fr)]")} data-testid="reports-master-detail">
        <aside className={cn("self-start overflow-hidden rounded-lg border border-border bg-card", selectedReport && "lg:sticky lg:top-4")} aria-label={tk("reports.archiveAria")}>
          <div className="flex min-h-14 items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Archive className="h-4 w-4 text-primary" />
                {tk("reports.archiveTitle")}
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">{tk("reports.newestFirst")}</p>
            </div>
            <span className="rounded-md border border-border bg-muted/20 px-2 py-1 font-mono text-xs tabular-nums text-muted-foreground">{filteredReports.length}</span>
          </div>

          <form className="space-y-3 border-b border-border p-4" onSubmit={onSearch}>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={tk("reports.searchPlaceholder")}
                className="pl-9"
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
              <label className="sr-only" htmlFor="report-category-filter">{tk("reports.filter.category")}</label>
              <select id="report-category-filter" className={selectClass} value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value as ReportCategory | "ALL")}>
                <option value="ALL">{tk("reports.allCategories")}</option>
                {categories.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
              <label className="sr-only" htmlFor="report-importance-filter">{tk("reports.filter.importance")}</label>
              <select id="report-importance-filter" className={selectClass} value={importanceFilter} onChange={(event) => setImportanceFilter(event.target.value as ReportImportance | "ALL")}>
                <option value="ALL">{tk("reports.allImportance")}</option>
                {importanceLevels.map((level) => <option key={level} value={level}>{level}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <Button className="min-h-11 flex-1 gap-2" disabled={isLoading}>
                <Search className="h-4 w-4" />
                {tk(isLoading ? "reports.searching" : "reports.search")}
              </Button>
              {hasFilters ? (
                <Button type="button" variant="outline" className="h-11 w-11 px-0" onClick={clearFilters} aria-label={tk("reports.clearFilters")} title={tk("reports.clearFilters")}>
                  <X className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
          </form>

          {error ? <ErrorState title={tk("reports.loadError")} message={error} className="m-4" /> : null}

          <div className="max-h-[420px] overflow-y-auto overscroll-contain lg:max-h-[calc(100vh-23rem)]">
            {filteredReports.map((report) => {
              const isSelected = selectedReport?.id === report.id;
              return (
                <button
                  key={report.id}
                  type="button"
                  aria-pressed={isSelected}
                  className={cn(
                    "group relative block min-h-[128px] w-full border-b border-border px-4 py-3.5 text-left transition duration-200 last:border-b-0 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
                    isSelected ? "bg-primary/10" : "bg-card hover:bg-muted/25 active:bg-muted/35"
                  )}
                  onClick={() => {
                    setSelectedId(report.id);
                    setEditing(false);
                  }}
                >
                  <span className={cn("absolute inset-y-0 left-0 w-0.5 bg-primary transition-opacity", isSelected ? "opacity-100" : "opacity-0")} />
                  <div className="flex items-start justify-between gap-3">
                    <h3 className={cn("min-w-0 line-clamp-2 break-words text-sm font-semibold leading-5", isSelected ? "text-primary" : "text-foreground")}>{report.title}</h3>
                    <Badge label={report.importance} highlight={report.importance === "HIGH" || report.importance === "CRITICAL"} />
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{report.summary}</p>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                    <Badge label={report.category} />
                    <span className="tabular-nums">{formatDate(report.updatedAt)}</span>
                  </div>
                </button>
              );
            })}

            {!isLoading && filteredReports.length === 0 ? (
              <EmptyState
                icon={Filter}
                title={tk("reports.noMatch")}
                description={tk("reports.noMatchDescription")}
                className="m-4 min-h-[260px]"
                action={hasFilters ? <Button variant="outline" onClick={clearFilters}>{tk("reports.clearFilters")}</Button> : undefined}
              />
            ) : null}
          </div>
        </aside>

        {selectedReport ? (
          <main className="min-w-0">
            <ReportDetail
              report={selectedReport}
              editing={editing}
              onEdit={() => setEditing(true)}
              onCancel={() => setEditing(false)}
              onSave={onSave}
              onDelete={() => setDeleteTarget(selectedReport)}
            />
          </main>
        ) : null}
      </div>

      {deleteTarget ? (
        <DeleteReportDialog report={deleteTarget} onCancel={() => setDeleteTarget(null)} onConfirm={() => void onDeleteConfirmed()} />
      ) : null}
    </div>
  );
}

function ReportDetail({ report, editing, onEdit, onCancel, onSave, onDelete }: {
  report: ReportDto;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (payload: Partial<ReportPayload>) => Promise<void>;
  onDelete: () => void;
}) {
  const tk = useTk();
  const [draft, setDraft] = useState<ReportPayload>(() => toDraft(report));

  useEffect(() => {
    setDraft(toDraft(report));
  }, [report]);

  if (editing) {
    return (
      <section className="overflow-hidden rounded-lg border border-primary/25 bg-card shadow-sm">
        <header className="border-b border-border px-5 py-4 sm:px-6">
          <div className="flex items-center gap-2 text-sm font-semibold text-primary">
            <Edit3 className="h-4 w-4" />
            {tk("reports.editTitle")}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{tk("reports.editDescription")}</p>
        </header>
        <form className="space-y-4 p-5 sm:p-6" onSubmit={(event) => { event.preventDefault(); void onSave(draft); }}>
          <FormField id="report-title" label={tk("reports.field.title")} required>
            <Input id="report-title" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
          </FormField>
          <FormField id="report-summary" label={tk("reports.field.summary")}>
            <Textarea id="report-summary" className="min-h-28" value={draft.summary} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} />
          </FormField>
          <FormField id="report-content" label={tk("reports.field.content")}>
            <Textarea id="report-content" className="min-h-80" value={draft.content} onChange={(event) => setDraft({ ...draft, content: event.target.value })} />
          </FormField>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField id="report-category" label={tk("reports.filter.category")}>
              <select id="report-category" className={selectClass} value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value as ReportCategory })}>
                {categories.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </FormField>
            <FormField id="report-importance" label={tk("reports.filter.importance")}>
              <select id="report-importance" className={selectClass} value={draft.importance} onChange={(event) => setDraft({ ...draft, importance: event.target.value as ReportImportance })}>
                {importanceLevels.map((level) => <option key={level} value={level}>{level}</option>)}
              </select>
            </FormField>
          </div>
          <FormField id="report-tags" label={tk("reports.field.tags")} description={tk("reports.tagsDescription")}>
            <Input id="report-tags" value={draft.tags.join(", ")} onChange={(event) => setDraft({ ...draft, tags: event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean) })} />
          </FormField>
          <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="outline" onClick={onCancel}>{tk("reports.cancel")}</Button>
            <Button className="gap-2"><Edit3 className="h-4 w-4" />{tk("reports.save")}</Button>
          </div>
        </form>
      </section>
    );
  }

  return (
    <article className="min-w-0 overflow-hidden rounded-lg border border-border bg-card shadow-sm" data-testid="report-detail">
      <header className="border-b border-border p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md border border-primary/25 bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">{tk("reports.detailRecord")}</span>
          <Badge label={report.category} />
          <Badge label={report.importance} highlight={report.importance === "HIGH" || report.importance === "CRITICAL"} />
        </div>
        <h2 className="mt-4 max-w-4xl break-words text-xl font-semibold leading-7 text-foreground sm:text-2xl">{report.title}</h2>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><CalendarClock className="h-3.5 w-3.5" />{tk("reports.created", { date: formatDate(report.createdAt) })}</span>
          <span>{tk("reports.updated", { date: formatDate(report.updatedAt) })}</span>
        </div>
      </header>

      <div className="grid min-w-0 gap-0 xl:grid-cols-[minmax(0,1fr)_240px]">
        <div className="min-w-0 p-5 sm:p-6">
          <section className="border-l-2 border-primary bg-primary/5 px-4 py-3">
            <h3 className="text-sm font-semibold text-primary">{tk("reports.finalCounsel")}</h3>
            <MarkdownDocument content={report.summary} className="mt-3 max-w-none" />
          </section>

          {report.task ? (
            <section className="mt-6 border-t border-border pt-5">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <FileText className="h-4 w-4 text-primary" />
                {tk("reports.sourceDecree")}
              </h3>
              <p className="mt-3 break-words text-sm leading-6 text-muted-foreground">{report.task.command}</p>
            </section>
          ) : null}

          {report.councilSession?.responses?.length ? (
            <section className="mt-6 border-t border-border pt-5">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <UserRound className="h-4 w-4 text-primary" />
                {tk("reports.agentContributors")}
              </h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {report.councilSession.responses.map((response) => <Badge key={response.id} label={response.role} />)}
              </div>
            </section>
          ) : null}

          <section className="mt-6 border-t border-border pt-5">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
              <BookOpen className="h-4 w-4 text-primary" />
              {tk("reports.archiveBody")}
            </h3>
            <div className="min-w-0 overflow-hidden rounded-md border border-border bg-background/30 p-4 sm:p-5">
              <MarkdownDocument content={report.content} className="max-w-none" />
            </div>
          </section>

          {report.tags.length > 0 ? (
            <section className="mt-5 flex min-w-0 flex-wrap items-center gap-2" aria-label={tk("reports.tagsLabel")}>
              <Tags className="h-4 w-4 text-muted-foreground" />
              {report.tags.map((tag) => <Badge key={tag} label={tag} />)}
            </section>
          ) : null}
        </div>

        <aside className="border-t border-border bg-muted/10 p-5 xl:border-l xl:border-t-0" aria-label={tk("reports.provenance")}>
          <h3 className="text-xs font-bold uppercase text-muted-foreground">{tk("reports.provenance")}</h3>
          <dl className="mt-4 space-y-4 text-xs">
            <ProvenanceItem label={tk("reports.createdBy")} value={report.createdBy} />
            <ProvenanceItem label={tk("reports.sourceTask")} value={report.sourceTaskId ?? tk("reports.notLinked")} mono />
            <ProvenanceItem label={tk("reports.sourceCouncil")} value={report.sourceCouncilSessionId ?? tk("reports.notLinked")} mono />
          </dl>
          <div className="mt-5 grid gap-2">
            {report.sourceCouncilSessionId ? <SourceLink to="/council" label={tk("reports.openCouncil")} /> : null}
            {report.sourceTaskId ? <SourceLink to="/throne-room?view=command" label={tk("reports.openCommand")} /> : null}
            {report.projectId ? <SourceLink to={`/projects/${report.projectId}`} label={tk("reports.openProject")} /> : null}
          </div>
        </aside>
      </div>

      <footer className="flex flex-wrap justify-end gap-2 border-t border-border bg-muted/10 px-5 py-4 sm:px-6">
        <Button variant="outline" className="gap-2" onClick={onEdit}><Edit3 className="h-4 w-4" />{tk("reports.edit")}</Button>
        <Button variant="outline" className="gap-2 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={onDelete}><Trash2 className="h-4 w-4" />{tk("reports.delete")}</Button>
      </footer>
    </article>
  );
}

function DeleteReportDialog({ report, onCancel, onConfirm }: { report: ReportDto; onCancel: () => void; onConfirm: () => void }) {
  const tk = useTk();
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm motion-safe:animate-in motion-safe:fade-in sm:items-center" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onCancel(); }}>
      <section role="alertdialog" aria-modal="true" aria-labelledby="delete-report-title" className="w-full max-w-md overflow-hidden rounded-lg border border-destructive/35 bg-card shadow-2xl motion-safe:animate-in motion-safe:slide-in-from-bottom-3 motion-safe:zoom-in-95">
        <div className="p-5 sm:p-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-md border border-destructive/30 bg-destructive/10 text-destructive">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <h2 id="delete-report-title" className="mt-4 text-lg font-semibold text-foreground">{tk("reports.deleteTitle")}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{tk("reports.deleteDescription", { title: report.title })}</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-border bg-muted/15 px-5 py-4">
          <Button variant="outline" onClick={onCancel}>{tk("reports.cancel")}</Button>
          <Button className="gap-2 bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={onConfirm}><Trash2 className="h-4 w-4" />{tk("reports.confirmDelete")}</Button>
        </div>
      </section>
    </div>
  );
}

function SourceLink({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="inline-flex min-h-11 items-center justify-between gap-2 rounded-md border border-border bg-background/35 px-3 text-xs font-semibold text-foreground transition hover:border-primary/40 hover:bg-primary/5 hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary">
      <span>{label}</span>
      <ExternalLink className="h-3.5 w-3.5 shrink-0" />
    </Link>
  );
}

function ProvenanceItem({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("mt-1 break-all text-foreground", mono && "font-mono text-[11px]")}>{value}</dd>
    </div>
  );
}

function toDraft(report: ReportDto): ReportPayload {
  return {
    title: report.title,
    summary: report.summary,
    content: report.content,
    projectId: report.projectId,
    category: report.category,
    importance: report.importance,
    tags: report.tags,
    sourceTaskId: report.sourceTaskId,
    sourceCouncilSessionId: report.sourceCouncilSessionId
  };
}

function Badge({ label, highlight = false }: { label: string; highlight?: boolean }) {
  return (
    <span title={label} className={cn("inline-flex max-w-full rounded-md border px-2 py-1 text-[10px] font-bold uppercase", highlight ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-muted/35 text-muted-foreground")}>
      <span className="truncate">{label}</span>
    </span>
  );
}
