import { useEffect, useMemo, useState } from "react";
import { Archive, Check, ChevronDown, ChevronRight, Eye, EyeOff, Inbox, X } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/EmptyState";
import { api } from "@/lib/api";
import { cn, formatDate } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import type { DataQuality, ProjectDto, ProjectInboxItemDto, ProjectInboxStatus, RoutingQuality } from "@/types/api";

const statuses: ProjectInboxStatus[] = ["PENDING", "ASSIGNED", "DISMISSED", "ARCHIVED"];
const qualities: DataQuality[] = ["TRUSTED", "REVIEW_REQUIRED", "TEST", "LEGACY", "UNKNOWN_SOURCE"];
const routingQualities: RoutingQuality[] = ["HIGH", "MEDIUM", "LOW", "DEBUG_ONLY", "NO_MATCH"];

export function ProjectInboxPage() {
  const user = useAuthStore((state) => state.user);
  const canAssign = user?.role === "KING" || user?.role === "CROWN_PRINCE";
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [items, setItems] = useState<ProjectInboxItemDto[]>([]);
  const [status, setStatus] = useState<ProjectInboxStatus | "">("PENDING");
  const [dataQuality, setDataQuality] = useState<DataQuality | "">("");
  const [routingQualityFilter, setRoutingQualityFilter] = useState<RoutingQuality | "">("");
  const [confidence, setConfidence] = useState("");
  const [sourceType, setSourceType] = useState("");
  const [suggestedProjectId, setSuggestedProjectId] = useState("");
  const [includeTestData, setIncludeTestData] = useState(false);
  const [includeDebug, setIncludeDebug] = useState(false);
  const [selection, setSelection] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const projectById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);

  async function load() {
    const [projectResponse, inboxResponse] = await Promise.all([
      api.projects(),
      api.projectInbox({
        status: status || undefined,
        dataQuality: dataQuality || undefined,
        routingQuality: routingQualityFilter || undefined,
        includeTestData,
        includeDebug,
        sourceType: sourceType || undefined,
        suggestedProjectId: suggestedProjectId || undefined,
        ...(confidence === "none" ? { confidenceMax: 0 } : {}),
        ...(confidence === "low" ? { confidenceMin: 1, confidenceMax: 39 } : {}),
        ...(confidence === "medium" ? { confidenceMin: 40, confidenceMax: 69 } : {}),
        ...(confidence === "high" ? { confidenceMin: 70 } : {})
      })
    ]);
    setProjects(projectResponse.projects);
    setItems(inboxResponse.inboxItems);
  }

  useEffect(() => {
    void load();
  }, [status, dataQuality, routingQualityFilter, confidence, sourceType, suggestedProjectId, includeTestData, includeDebug]);

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

  async function archiveItem(item: ProjectInboxItemDto) {
    await api.archiveProjectInboxItem(item.id);
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

  async function bulkArchive() {
    if (!selectedIds.length) return;
    await api.bulkArchiveProjectInboxItems(selectedIds);
    setChecked({});
    await load();
  }

  async function archiveLowConfidence() {
    await api.archiveLowConfidenceProjectInboxItems(39);
    setChecked({});
    await load();
  }

  function toggleExpanded(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <>
      <PageHeader
        eyebrow="Royal Secretary"
        title="Project Inbox"
        description="Review project routing decisions before they become official kingdom context. Only actionable, high-quality matches are shown by default."
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
              <option value="">All data quality</option>
              {qualities.map((item) => <option key={item} value={item}>{qualityLabel(item)}</option>)}
            </select>
            <select className="h-10 rounded-md border border-border bg-input px-3 text-sm" value={routingQualityFilter} onChange={(e) => setRoutingQualityFilter(e.target.value as RoutingQuality | "")}>
              <option value="">All routing quality</option>
              {routingQualities.map((item) => <option key={item} value={item}>{routingQualityLabel(item)}</option>)}
            </select>
            <select className="h-10 rounded-md border border-border bg-input px-3 text-sm" value={confidence} onChange={(e) => setConfidence(e.target.value)}>
              <option value="">All confidence</option>
              <option value="none">No match (0%)</option>
              <option value="low">Low (&lt;40%)</option>
              <option value="medium">Medium (40–69%)</option>
              <option value="high">High (≥70%)</option>
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
            <label className="flex h-10 items-center gap-2 rounded-md border border-border px-3 text-sm text-muted-foreground">
              <input type="checkbox" checked={includeDebug} onChange={(e) => setIncludeDebug(e.target.checked)} />
              {includeDebug ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              Show debug
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
            <Button disabled={!selectedIds.length} variant="outline" onClick={() => void bulkArchive()}><Archive className="h-4 w-4" />Archive selected</Button>
            <Button variant="outline" onClick={() => void archiveLowConfidence()}><Archive className="h-4 w-4" />Archive low-confidence</Button>
          </div>
        )}
      </Card>

      <div className="mt-5 space-y-4">
        {items.map((item) => {
          const candidates = item.candidateProjectIds.map((id) => projectById.get(id)).filter(Boolean) as ProjectDto[];
          const displayTitle = item.humanTitle || item.title;
          const displayReason = item.humanReason || item.reason || "No routing reason recorded.";
          const isExpanded = expanded[item.id] ?? false;
          const evidenceList = (item.evidence ?? []) as Array<{ type?: string; value?: string; projectName?: string }>;
          const ignoredList = (item.ignoredSignals ?? []) as Array<{ type?: string; value?: string }>;
          return (
            <Card key={item.id} className={cn(
              item.status === "PENDING" && (item.confidenceScore ?? 0) > 0 && "border-primary/40",
              (item.confidenceScore ?? 0) <= 0 && "bg-muted/20",
              item.routingQuality === "DEBUG_ONLY" && "opacity-60"
            )}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 gap-3">
                  <input
                    disabled={!canAssign || (item.status !== "PENDING")}
                    className="mt-1"
                    type="checkbox"
                    checked={checked[item.id] ?? false}
                    onChange={(e) => setChecked({ ...checked, [item.id]: e.target.checked })}
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Inbox className="h-4 w-4 text-primary" />
                      <h2 className="font-display text-lg">{displayTitle}</h2>
                      {item.dataQualityLabel && (
                        <span className={dataQualityLabelClass(item.dataQualityLabel)}>{dataQualityLabelText(item.dataQualityLabel)}</span>
                      )}
                      {!item.dataQualityLabel && item.dataQuality && (
                        <span className={qualityClass(item.dataQuality)}>{qualityLabel(item.dataQuality)}</span>
                      )}
                      {item.routingQuality && (
                        <span className={routingQualityClass(item.routingQuality as RoutingQuality)}>{routingQualityLabel(item.routingQuality as RoutingQuality)}</span>
                      )}
                      <span className={confidencePillClass(item.confidenceScore ?? 0)}>{item.confidenceScore ?? 0}%</span>
                    </div>
                    {/* Evidence tags */}
                    {evidenceList.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {evidenceList.map((e, i) => (
                          <span key={i} className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                            {e.type === "project_name" ? `name: ${e.value}` :
                             e.type === "alias" ? `alias: ${e.value}` :
                             e.type === "codename" ? `codename: ${e.value}` :
                             e.type === "keyword" ? `keyword: ${e.value}` :
                             e.type === "source_ancestry" ? "source ancestry" :
                             e.type === "repo_path" ? "repo path" : (e.value ?? e.type)}
                          </span>
                        ))}
                      </div>
                    )}
                    <p className="mt-2 text-sm text-muted-foreground">{item.summary}</p>
                    {(item.confidenceScore ?? 0) <= 0 ? <p className="mt-2 text-sm text-yellow-300">Needs manual review</p> : null}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="rounded-full border border-border px-2 py-1 text-xs">{item.status}</div>
                </div>
              </div>
              <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_220px]">
                <div className="space-y-2 text-sm">
                  <div className="text-muted-foreground">Source: {item.humanReadableSource ?? sourceTypeLabel(item.sourceType)}</div>
                  <div className="text-muted-foreground">Confidence: {confidenceLabel(item.confidenceScore)} ({item.confidenceScore ?? 0}%)</div>
                  <div className="rounded-md border border-border bg-muted/30 p-3 text-muted-foreground">{displayReason}</div>
                  {ignoredList.length > 0 && (
                    <div className="text-xs text-muted-foreground/60">
                      Ignored signals: {ignoredList.map((s) => s.value).join(", ")}
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground">{formatDate(item.createdAt)}</div>

                  {/* Expandable technical details */}
                  <button
                    type="button"
                    className="flex items-center gap-1 text-xs text-muted-foreground/70 hover:text-muted-foreground transition-colors"
                    onClick={() => toggleExpanded(item.id)}
                  >
                    {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    Technical details
                  </button>
                  {isExpanded && (
                    <div className="rounded-md border border-border/50 bg-muted/10 p-3 text-xs text-muted-foreground/60 space-y-1 font-mono">
                      <div>ID: {item.id}</div>
                      <div>Raw title: {item.title}</div>
                      <div>Source type: {item.sourceType}</div>
                      <div>Source ID: {item.sourceId}</div>
                      <div>Routing quality: {item.routingQuality ?? "N/A"}</div>
                      <div>Data quality label: {item.dataQualityLabel ?? "N/A"}</div>
                      <div>Raw reason: {item.reason ?? "N/A"}</div>
                      <div>Trace ID: {item.traceId ?? "N/A"}</div>
                      {item.provenance && <div>Provenance: {JSON.stringify(item.provenance)}</div>}
                    </div>
                  )}
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
                  <div className="flex flex-wrap gap-2">
                    <Button disabled={!canAssign || item.status !== "PENDING"} onClick={() => void assign(item)}><Check className="h-4 w-4" />Assign</Button>
                    <Button disabled={!canAssign || item.status !== "PENDING"} variant="outline" onClick={() => void dismiss(item)}><X className="h-4 w-4" />Dismiss</Button>
                    <Button disabled={!canAssign || item.status !== "PENDING"} variant="outline" onClick={() => void archiveItem(item)}><Archive className="h-4 w-4" />Archive</Button>
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
        {items.length === 0 ? (
          <EmptyState
            title="No inbox items"
            description="No actionable routing decisions. Low-confidence signals are not stored."
          />
        ) : null}
      </div>
    </>
  );
}

function confidenceLabel(score: number | null) {
  const value = score ?? 0;
  if (value <= 0) return "No match found";
  if (value < 40) return "Low confidence";
  if (value < 70) return "Medium confidence";
  return "High confidence";
}

function confidencePillClass(score: number) {
  const base = "rounded-full px-2 py-0.5 text-xs font-medium";
  if (score >= 70) return `${base} bg-green-500/15 text-green-300`;
  if (score >= 40) return `${base} bg-amber-500/15 text-amber-300`;
  if (score > 0) return `${base} bg-red-500/15 text-red-300`;
  return `${base} bg-muted text-muted-foreground`;
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

function routingQualityLabel(value: RoutingQuality) {
  switch (value) {
    case "HIGH": return "High quality";
    case "MEDIUM": return "Medium quality";
    case "LOW": return "Low quality";
    case "DEBUG_ONLY": return "Debug only";
    case "NO_MATCH": return "No match";
    default: return value;
  }
}

function routingQualityClass(value: RoutingQuality) {
  const base = "rounded-full px-2 py-0.5 text-xs font-medium";
  switch (value) {
    case "HIGH": return `${base} bg-green-500/15 text-green-300`;
    case "MEDIUM": return `${base} bg-amber-500/15 text-amber-300`;
    case "LOW": return `${base} bg-red-500/15 text-red-300`;
    case "DEBUG_ONLY": return `${base} bg-purple-500/15 text-purple-300`;
    case "NO_MATCH": return `${base} bg-muted text-muted-foreground`;
    default: return `${base} bg-muted text-muted-foreground`;
  }
}

function dataQualityLabelText(value: string) {
  return value.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function dataQualityLabelClass(value: string) {
  const base = "rounded-full px-2 py-0.5 text-xs font-medium";
  switch (value) {
    case "TRUSTED_SOURCE": return `${base} bg-green-500/15 text-green-300`;
    case "REVIEW_REQUIRED": return `${base} bg-yellow-500/15 text-yellow-300`;
    case "TEST": return `${base} bg-red-500/15 text-red-300`;
    case "LEGACY": return `${base} bg-blue-500/15 text-blue-300`;
    default: return `${base} bg-muted text-muted-foreground`;
  }
}
