import { FormEvent, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/input";
import { MarkdownDocument } from "@/components/ui/MarkdownDocument";
import { Textarea } from "@/components/ui/textarea";
import { cn, formatDate } from "@/lib/utils";
import { useKingdomStore } from "@/stores/kingdomStore";
import type { ReportCategory, ReportDto, ReportImportance, ReportPayload } from "@/types/api";

const categories: ReportCategory[] = ["STRATEGY", "RESEARCH", "ARCHITECTURE", "FINANCE", "GENERAL", "OTHER"];
const importanceLevels: ReportImportance[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

export function ReportsPage() {
  const reports = useKingdomStore((state) => state.reports);
  const searchReports = useKingdomStore((state) => state.searchReports);
  const updateReport = useKingdomStore((state) => state.updateReport);
  const deleteReport = useKingdomStore((state) => state.deleteReport);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<ReportCategory | "ALL">("ALL");
  const [importanceFilter, setImportanceFilter] = useState<ReportImportance | "ALL">("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(reports[0]?.id ?? null);
  const [editing, setEditing] = useState(false);

  const filteredReports = useMemo(
    () =>
      reports.filter(
        (report) =>
          (categoryFilter === "ALL" || report.category === categoryFilter) &&
          (importanceFilter === "ALL" || report.importance === importanceFilter)
      ),
    [reports, categoryFilter, importanceFilter]
  );
  const selectedReport = reports.find((report) => report.id === selectedId) ?? filteredReports[0] ?? null;

  async function onSearch(event: FormEvent) {
    event.preventDefault();
    await searchReports(query);
  }

  async function onSave(payload: Partial<ReportPayload>) {
    if (!selectedReport) return;
    await updateReport(selectedReport.id, payload);
    setEditing(false);
  }

  async function onDelete(report: ReportDto) {
    await deleteReport(report.id);
    setSelectedId(null);
  }

  return (
    <>
      <PageHeader
        eyebrow="Royal Archive"
        title="Royal Reports"
        description="Review completed council decisions, final counsel, source decrees, contributors, and archive metadata."
      />

      <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
        <div className="space-y-4">
          <Card>
            <form className="space-y-3" onSubmit={onSearch}>
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Royal Reports..." />
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <select className="h-11 rounded-md border border-border bg-input px-3 text-sm" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value as ReportCategory | "ALL")}>
                  <option value="ALL">ALL CATEGORIES</option>
                  {categories.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
                <select className="h-11 rounded-md border border-border bg-input px-3 text-sm" value={importanceFilter} onChange={(event) => setImportanceFilter(event.target.value as ReportImportance | "ALL")}>
                  <option value="ALL">ALL IMPORTANCE</option>
                  {importanceLevels.map((level) => <option key={level} value={level}>{level}</option>)}
                </select>
              </div>
              <Button className="w-full">Search</Button>
            </form>
          </Card>

          {filteredReports.map((report) => (
            <button key={report.id} className="block w-full text-left" onClick={() => { setSelectedId(report.id); setEditing(false); }}>
              <Card className={cn("transition", selectedReport?.id === report.id && "border-primary/60 bg-primary/10")}>
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-display text-lg">{report.title}</h2>
                  <Badge label={report.importance} highlight={report.importance === "HIGH" || report.importance === "CRITICAL"} />
                </div>
                <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">{report.summary}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge label={report.category} />
                  <span className="text-xs text-muted-foreground">{formatDate(report.updatedAt)}</span>
                </div>
              </Card>
            </button>
          ))}
        </div>

        {selectedReport ? (
          <ReportDetail report={selectedReport} editing={editing} onEdit={() => setEditing(true)} onCancel={() => setEditing(false)} onSave={onSave} onDelete={() => void onDelete(selectedReport)} />
        ) : (
          <Card>
            <p className="text-sm text-muted-foreground">No reports found.</p>
          </Card>
        )}
      </div>
    </>
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
  const [draft, setDraft] = useState<ReportPayload>({
    title: report.title,
    summary: report.summary,
    content: report.content,
    category: report.category,
    importance: report.importance,
    tags: report.tags,
    sourceTaskId: report.sourceTaskId,
    sourceCouncilSessionId: report.sourceCouncilSessionId
  });

  if (editing) {
    return (
      <Card>
        <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void onSave(draft); }}>
          <FormField id="report-title" label="Title" required>
            <Input id="report-title" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
          </FormField>
          <FormField id="report-summary" label="Summary">
            <Textarea id="report-summary" className="min-h-24" value={draft.summary} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} />
          </FormField>
          <FormField id="report-content" label="Content">
            <Textarea id="report-content" className="min-h-72" value={draft.content} onChange={(event) => setDraft({ ...draft, content: event.target.value })} />
          </FormField>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField id="report-category" label="Category">
              <select id="report-category" className="h-11 w-full rounded-md border border-border bg-input px-3 text-sm" value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value as ReportCategory })}>
                {categories.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </FormField>
            <FormField id="report-importance" label="Importance">
              <select id="report-importance" className="h-11 w-full rounded-md border border-border bg-input px-3 text-sm" value={draft.importance} onChange={(event) => setDraft({ ...draft, importance: event.target.value as ReportImportance })}>
                {importanceLevels.map((level) => <option key={level} value={level}>{level}</option>)}
              </select>
            </FormField>
          </div>
          <FormField id="report-tags" label="Tags" description="Comma-separated.">
            <Input id="report-tags" value={draft.tags.join(", ")} onChange={(event) => setDraft({ ...draft, tags: event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean) })} />
          </FormField>
          <div className="flex gap-2">
            <Button>Save Report</Button>
            <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
          </div>
        </form>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Royal Archive</div>
          <h2 className="mt-2 font-display text-3xl">{report.title}</h2>
          <p className="mt-2 text-xs text-muted-foreground">{formatDate(report.createdAt)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge label={report.category} />
          <Badge label={report.importance} highlight={report.importance === "HIGH" || report.importance === "CRITICAL"} />
        </div>
      </div>

      <section className="mt-6 rounded-lg border border-primary/30 bg-primary/10 p-4">
        <div className="text-sm font-semibold text-primary">Final Counsel</div>
        <MarkdownDocument content={report.summary} className="mt-3 max-w-none" />
      </section>

      {report.task ? (
        <section className="mt-5 rounded-lg border border-border bg-background/40 p-4">
          <div className="text-sm font-semibold text-primary">Source Decree</div>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{report.task.command}</p>
        </section>
      ) : null}

      {report.councilSession?.responses?.length ? (
        <section className="mt-5">
          <div className="text-sm font-semibold text-primary">Agent Contributors</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {report.councilSession.responses.map((response) => <Badge key={response.id} label={response.role} />)}
          </div>
        </section>
      ) : null}

      <div className="mt-5 rounded-lg border border-border bg-background/40 p-4">
        <MarkdownDocument content={report.content} className="max-w-none" />
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {report.tags.map((tag) => <Badge key={tag} label={tag} />)}
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="outline" onClick={onEdit}>Edit</Button>
        <Button variant="outline" onClick={onDelete}>Delete</Button>
      </div>
    </Card>
  );
}

function Badge({ label, highlight = false }: { label: string; highlight?: boolean }) {
  return (
    <span className={cn("rounded-full border px-2.5 py-1 text-xs", highlight ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-muted text-muted-foreground")}>
      {label}
    </span>
  );
}
