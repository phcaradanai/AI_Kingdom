import { useEffect, useMemo, useState } from "react";
import { Archive, Check, Inbox, X } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import { cn, formatDate } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import type { DataQuality, ProjectDto, ProjectInboxItemDto, ProjectInboxStatus } from "@/types/api";

const statuses: ProjectInboxStatus[] = ["PENDING", "ASSIGNED", "DISMISSED"];
const qualities: DataQuality[] = ["TRUSTED", "REVIEW_REQUIRED", "TEST", "LEGACY", "UNKNOWN_SOURCE"];

export function ProjectInboxPage() {
  const user = useAuthStore((state) => state.user);
  const canAssign = user?.role === "KING" || user?.role === "CROWN_PRINCE";
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [items, setItems] = useState<ProjectInboxItemDto[]>([]);
  const [status, setStatus] = useState<ProjectInboxStatus | "">("PENDING");
  const [dataQuality, setDataQuality] = useState<DataQuality | "">("");
  const [confidence, setConfidence] = useState("");
  const [sourceType, setSourceType] = useState("");
  const [suggestedProjectId, setSuggestedProjectId] = useState("");
  const [includeTestData, setIncludeTestData] = useState(false);
  const [selection, setSelection] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const projectById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);

  async function load() {
    const [projectResponse, inboxResponse] = await Promise.all([
      api.projects(),
      api.projectInbox({
        status: status || undefined,
        dataQuality: dataQuality || undefined,
        includeTestData,
        sourceType: sourceType || undefined,
        suggestedProjectId: suggestedProjectId || undefined,
        ...(confidence === "none" ? { confidenceMax: 0 } : {}),
        ...(confidence === "low" ? { confidenceMin: 1, confidenceMax: 49 } : {}),
        ...(confidence === "medium" ? { confidenceMin: 50, confidenceMax: 79 } : {}),
        ...(confidence === "high" ? { confidenceMin: 80 } : {})
      })
    ]);
    setProjects(projectResponse.projects);
    setItems(inboxResponse.inboxItems);
  }

  useEffect(() => {
    void load();
  }, [status, dataQuality, confidence, sourceType, suggestedProjectId, includeTestData]);

  const selectedIds = Object.entries(checked).filter(([, value]) => value).map(([id]) => id);

  async function assign(item: ProjectInboxItemDto) {
    const projectId = selection[item.id] || item.candidateProjectIds[0];
    if (!projectId) return;
    await api.assignProjectInboxItem(item.id, projectId);
    await load();
  }

  async function dismiss(item: ProjectInboxItemDto) {
    await api.dismissProjectInboxItem(item.id);
    await load();
  }

  async function bulkDismiss() {
    if (!selectedIds.length) return;
    await api.bulkDismissProjectInboxItems(selectedIds);
    setChecked({});
    await load();
  }

  async function bulkAssign() {
    if (!selectedIds.length) return;
    const projectId = selection.__bulk || suggestedProjectId;
    if (!projectId) return;
    await api.bulkAssignProjectInboxItems(selectedIds, projectId);
    setChecked({});
    await load();
  }

  async function archiveLowConfidence() {
    await api.archiveLowConfidenceProjectInboxItems(0);
    setChecked({});
    await load();
  }

  return (
    <>
      <PageHeader
        eyebrow="Royal Secretary"
        title="Project Inbox"
        description="Review low-confidence project routing decisions before they become official kingdom context."
      />

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg">Inbox Items</h2>
          <div className="flex flex-wrap items-center gap-2">
            <select className="h-10 rounded-md border border-border bg-input px-3 text-sm" value={status} onChange={(e) => setStatus(e.target.value as ProjectInboxStatus | "")}>
              <option value="">All statuses</option>
              {statuses.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <select className="h-10 rounded-md border border-border bg-input px-3 text-sm" value={dataQuality} onChange={(e) => setDataQuality(e.target.value as DataQuality | "")}>
              <option value="">All quality</option>
              {qualities.map((item) => <option key={item} value={item}>{qualityLabel(item)}</option>)}
            </select>
            <select className="h-10 rounded-md border border-border bg-input px-3 text-sm" value={confidence} onChange={(e) => setConfidence(e.target.value)}>
              <option value="">All confidence</option>
              <option value="none">No match found</option>
              <option value="low">Low confidence</option>
              <option value="medium">Medium confidence</option>
              <option value="high">High confidence</option>
            </select>
            <select className="h-10 rounded-md border border-border bg-input px-3 text-sm" value={sourceType} onChange={(e) => setSourceType(e.target.value)}>
              <option value="">All sources</option>
              {[...new Set(items.map((item) => item.sourceType))].map((type) => <option key={type} value={type}>{sourceTypeLabel(type)}</option>)}
            </select>
            <select className="h-10 rounded-md border border-border bg-input px-3 text-sm" value={suggestedProjectId} onChange={(e) => setSuggestedProjectId(e.target.value)}>
              <option value="">All suggested projects</option>
              {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
            <label className="flex h-10 items-center gap-2 rounded-md border border-border px-3 text-sm text-muted-foreground">
              <input type="checkbox" checked={includeTestData} onChange={(e) => setIncludeTestData(e.target.checked)} />
              Show test
            </label>
          </div>
        </div>
        {canAssign && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <select
              className="h-9 rounded-md border border-border bg-input px-3 text-sm"
              value={selection.__bulk ?? ""}
              onChange={(e) => setSelection({ ...selection, __bulk: e.target.value })}
            >
              <option value="">Bulk assign project</option>
              {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
            <Button disabled={!selectedIds.length || !(selection.__bulk || suggestedProjectId)} onClick={() => void bulkAssign()}><Check className="h-4 w-4" />Assign selected</Button>
            <Button disabled={!selectedIds.length} variant="outline" onClick={() => void bulkDismiss()}><X className="h-4 w-4" />Dismiss selected</Button>
            <Button variant="outline" onClick={() => void archiveLowConfidence()}><Archive className="h-4 w-4" />Archive low-confidence</Button>
          </div>
        )}
      </Card>

      <div className="mt-5 space-y-4">
        {items.map((item) => {
          const candidates = item.candidateProjectIds.map((id) => projectById.get(id)).filter(Boolean) as ProjectDto[];
          return (
            <Card key={item.id} className={cn(item.status === "PENDING" && (item.confidenceScore ?? 0) > 0 && "border-primary/40", (item.confidenceScore ?? 0) <= 0 && "bg-muted/20")}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 gap-3">
                  <input
                    disabled={!canAssign || item.status !== "PENDING"}
                    className="mt-1"
                    type="checkbox"
                    checked={checked[item.id] ?? false}
                    onChange={(e) => setChecked({ ...checked, [item.id]: e.target.checked })}
                  />
                  <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Inbox className="h-4 w-4 text-primary" />
                    <h2 className="font-display text-lg">{item.title}</h2>
                    <span className={qualityClass(item.dataQuality)}>{qualityLabel(item.dataQuality)}</span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{item.summary}</p>
                  {(item.confidenceScore ?? 0) <= 0 ? <p className="mt-2 text-sm text-yellow-300">Needs manual review</p> : null}
                  </div>
                </div>
                <div className="rounded-full border border-border px-2 py-1 text-xs">{item.status}</div>
              </div>
              <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_220px]">
                <div className="space-y-2 text-sm">
                  <div className="text-muted-foreground">Source: {item.humanReadableSource ?? sourceTypeLabel(item.sourceType)}</div>
                  <div className="text-muted-foreground">Confidence: {confidenceLabel(item.confidenceScore)} ({item.confidenceScore ?? 0}%)</div>
                  <div className="rounded-md border border-border bg-muted/30 p-3 text-muted-foreground">{item.reason || "No routing reason recorded."}</div>
                  <div className="text-xs text-muted-foreground">{formatDate(item.createdAt)}</div>
                </div>
                <div className="space-y-3">
                  <select
                    disabled={!canAssign || item.status !== "PENDING"}
                    className="h-10 w-full rounded-md border border-border bg-input px-3 text-sm"
                    value={selection[item.id] ?? candidates[0]?.id ?? ""}
                    onChange={(e) => setSelection({ ...selection, [item.id]: e.target.value })}
                  >
                    <option value="">Select project</option>
                    {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                  </select>
                  <div className="flex gap-2">
                    <Button disabled={!canAssign || item.status !== "PENDING"} onClick={() => void assign(item)}><Check className="h-4 w-4" />Assign</Button>
                    <Button disabled={!canAssign || item.status !== "PENDING"} variant="outline" onClick={() => void dismiss(item)}><X className="h-4 w-4" />Dismiss</Button>
                  </div>
                  {candidates.length ? (
                    <div className="text-xs text-muted-foreground">
                      Suggested: {candidates.map((project) => project.name).join(", ")}
                    </div>
                  ) : null}
                </div>
              </div>
            </Card>
          );
        })}
        {items.length === 0 ? <Card>No inbox items match this filter.</Card> : null}
      </div>
    </>
  );
}

function confidenceLabel(score: number | null) {
  const value = score ?? 0;
  if (value <= 0) return "No match found";
  if (value < 50) return "Low confidence";
  if (value < 80) return "Medium confidence";
  return "High confidence";
}

function sourceTypeLabel(value: string) {
  return value.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function qualityLabel(value: DataQuality) {
  return value.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function qualityClass(value: DataQuality) {
  const base = "rounded-full px-2 py-0.5 text-xs font-medium";
  if (value === "TRUSTED") return `${base} bg-green-500/15 text-green-300`;
  if (value === "REVIEW_REQUIRED") return `${base} bg-yellow-500/15 text-yellow-300`;
  if (value === "TEST") return `${base} bg-red-500/15 text-red-300`;
  if (value === "LEGACY") return `${base} bg-blue-500/15 text-blue-300`;
  return `${base} bg-muted text-muted-foreground`;
}
