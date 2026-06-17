import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowUpRight, CheckCircle2, Download, FileText, FolderKanban, GitBranch, RefreshCw, ScanSearch, ShieldAlert } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { cn, formatDate } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import type { ArtifactDto, ContextBindingStatusDto, LocalDocumentRootDto, LocalDocumentSnapshotDto, MatterDto, MemoryDto, ObsidianExportDto, ProjectContextHealthDto, ProjectOverviewDto, RepositorySnapshotDto, ReportDto, TaskDto, WorkOrderDto } from "@/types/api";

type WorkspaceData = {
  overview: ProjectOverviewDto;
  tasks: TaskDto[];
  matters: MatterDto[];
  workOrders: WorkOrderDto[];
  reports: ReportDto[];
  memories: MemoryDto[];
  artifacts: ArtifactDto[];
};

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const user = useAuthStore((state) => state.user);
  const canEditLocalDocs = user?.role === "KING" || user?.role === "CROWN_PRINCE";
  const isKing = user?.role === "KING";
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [exportPayload, setExportPayload] = useState<ObsidianExportDto | null>(null);
  const [repoSnapshot, setRepoSnapshot] = useState<RepositorySnapshotDto | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [localDocRoots, setLocalDocRoots] = useState<LocalDocumentRootDto[]>([]);
  const [localDocSnapshot, setLocalDocSnapshot] = useState<LocalDocumentSnapshotDto | null>(null);
  const [localDocsError, setLocalDocsError] = useState<string | null>(null);
  const [contextHealth, setContextHealth] = useState<ProjectContextHealthDto | null>(null);
  const [contextActionStatus, setContextActionStatus] = useState<string | null>(null);
  const [contextActionLoading, setContextActionLoading] = useState(false);
  const [localDocsScanningRootId, setLocalDocsScanningRootId] = useState<string | null>(null);
  const [showAddRootForm, setShowAddRootForm] = useState(false);
  const [newRootName, setNewRootName] = useState("");
  const [newRootPath, setNewRootPath] = useState("");
  const [addingRoot, setAddingRoot] = useState(false);
  const [previewRootId, setPreviewRootId] = useState<string | null>(null);
  const [previewPath, setPreviewPath] = useState("");
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const project = data?.overview.project ?? null;
  const decisions = useMemo(() => data?.memories.filter((memory) => memory.type === "DECISION").slice(0, 5) ?? [], [data]);

  async function load() {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [overview, tasks, matters, workOrders, reports, memories, artifacts, repoResult, localDocsResult] = await Promise.all([
        api.projectOverview(id),
        api.projectTasks(id),
        api.projectMatters(id),
        api.projectWorkOrders(id),
        api.projectReports(id),
        api.projectMemories(id),
        api.projectArtifacts(id),
        api.getProjectRepositorySnapshot(id).catch(() => ({ snapshot: null })),
        api.getProjectLocalDocs(id).catch(() => ({ roots: [], snapshot: null }))
      ]);
      setData({
        overview,
        tasks: tasks.tasks,
        matters: matters.matters,
        workOrders: workOrders.workOrders,
        reports: reports.reports,
        memories: memories.memories,
        artifacts: artifacts.artifacts
      });
      setRepoSnapshot(repoResult.snapshot);
      setLocalDocRoots(localDocsResult.roots);
      setLocalDocSnapshot(localDocsResult.snapshot);
      void loadContextHealth();
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load project");
    } finally {
      setLoading(false);
    }
  }

  async function loadContextHealth() {
    if (!id) return;
    try {
      setContextHealth(await api.getProjectContextHealth(id));
    } catch {
      setContextHealth(null);
    }
  }

  async function scanLocalDocsRoot(rootId: string) {
    if (!id) return;
    setLocalDocsScanningRootId(rootId);
    setLocalDocsError(null);
    try {
      const snapshot = await api.scanProjectLocalDocumentRoot(id, rootId);
      setLocalDocSnapshot(snapshot);
      const refreshed = await api.getProjectLocalDocs(id);
      setLocalDocRoots(refreshed.roots);
      setLocalDocSnapshot(refreshed.snapshot ?? snapshot);
      await loadContextHealth();
    } catch (err) {
      setLocalDocsError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setLocalDocsScanningRootId(null);
    }
  }

  async function addLocalDocRoot() {
    if (!id || !newRootName.trim() || !newRootPath.trim()) return;
    setAddingRoot(true);
    setLocalDocsError(null);
    try {
      const root = await api.addProjectLocalDocumentRoot(id, { name: newRootName.trim(), rootPath: newRootPath.trim() });
      setLocalDocRoots((prev) => [...prev, root]);
      setNewRootName("");
      setNewRootPath("");
      setShowAddRootForm(false);
    } catch (err) {
      setLocalDocsError(err instanceof Error ? err.message : "Failed to add local document root");
    } finally {
      setAddingRoot(false);
    }
  }

  async function previewLocalDocFile() {
    if (!id || !previewRootId || !previewPath.trim()) return;
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewContent(null);
    try {
      const result = await api.readProjectLocalDocumentFile(id, { rootId: previewRootId, relativePath: previewPath.trim() });
      setPreviewContent(result.content);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : "Unable to read file");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function scanRepository() {
    if (!id) return;
    setScanning(true);
    setScanError(null);
    try {
      const result = await api.scanProjectRepository(id);
      setRepoSnapshot(result.snapshot);
      await loadContextHealth();
    } catch (err) {
      setScanError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  }

  useEffect(() => {
    void load();
  }, [id]);

  async function exportObsidian() {
    if (!id) return;
    setExportPayload(await api.exportProjectObsidian(id));
  }

  async function runLocalDocsScan() {
    const root = localDocRoots.find((item) => item.isActive) ?? localDocRoots[0];
    if (!root) {
      setLocalDocsError("No local document root is configured for this project.");
      return;
    }
    await scanLocalDocsRoot(root.id);
  }

  async function refreshProjectContexts() {
    if (!id) return;
    setContextActionLoading(true);
    setContextActionStatus(null);
    try {
      const response = await api.rebindProjectContexts(id);
      setContextActionStatus(`Context refresh complete: ${response.result.repaired} repaired, ${response.result.skipped} skipped.`);
      await loadContextHealth();
      const workOrders = await api.projectWorkOrders(id);
      setData((current) => current ? { ...current, workOrders: workOrders.workOrders } : current);
    } catch (err) {
      setContextActionStatus(err instanceof Error ? err.message : "Unable to refresh context");
    } finally {
      setContextActionLoading(false);
    }
  }

  async function reconcileOldWorkOrders() {
    if (!id) return;
    setContextActionLoading(true);
    setContextActionStatus(null);
    try {
      const response = await api.reconcileContextWarnings();
      setContextActionStatus(`Reconcile complete: ${response.result.contextRepaired} refreshed, ${response.result.archived} archived, ${response.result.skipped} skipped.`);
      await loadContextHealth();
      const workOrders = await api.projectWorkOrders(id);
      setData((current) => current ? { ...current, workOrders: workOrders.workOrders } : current);
    } catch (err) {
      setContextActionStatus(err instanceof Error ? err.message : "Unable to reconcile old work orders");
    } finally {
      setContextActionLoading(false);
    }
  }

  if (!project) {
    return (
      <>
        <PageHeader eyebrow="Project Workspace" title="Project" description="Loading project workspace." />
        {loading ? <ProjectLoadingState /> : null}
        {error ? (
          <Card className="border-red-500/40 bg-red-500/10">
            <h2 className="font-display text-lg">Project unavailable</h2>
            <p className="mt-2 text-sm text-red-100">{error}</p>
            <Button className="mt-4" variant="outline" onClick={() => void load()}><RefreshCw className="h-4 w-4" />Retry</Button>
          </Card>
        ) : null}
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Project Workspace"
        title={project.name}
        description={project.description || "Linked kingdom work, artifacts, decisions, and execution context."}
      />

      <ProjectContextHealthCard
        health={contextHealth}
        localDocSnapshot={localDocSnapshot}
        localDocRoots={localDocRoots}
        repoSnapshot={repoSnapshot}
        workOrders={data?.workOrders ?? []}
        scanning={Boolean(localDocsScanningRootId)}
        canEditLocalDocs={canEditLocalDocs}
        actionLoading={contextActionLoading}
        actionStatus={contextActionStatus}
        onRunLocalDocsScan={() => void runLocalDocsScan()}
        onRefreshContext={() => void refreshProjectContexts()}
        onReconcile={() => void reconcileOldWorkOrders()}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Tasks" value={data?.overview.counts.tasks ?? 0} />
        <Metric label="Matters" value={data?.overview.counts.matters ?? 0} warn={(data?.overview.counts.criticalMatters ?? 0) > 0} />
        <Metric label="Work Orders" value={data?.overview.counts.workOrders ?? 0} />
        <Metric label="Artifacts" value={data?.overview.counts.artifacts ?? 0} />
      </div>

      <Card className="mt-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg">Overview</h2>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span className="rounded-full border border-border px-2 py-1">{project.status}</span>
              <span className="rounded-full border border-border px-2 py-1">{project.priority}</span>
              {project.activeMilestone ? <span className="rounded-full border border-border px-2 py-1">{project.activeMilestone}</span> : null}
            </div>
          </div>
          <Button variant="outline" onClick={() => void exportObsidian()}><Download className="h-4 w-4" />Obsidian Export</Button>
        </div>
        <div className="mt-4 grid gap-5 lg:grid-cols-2">
          <Section title="Goals" items={project.goals} />
          <Section title="Recent Decisions" items={decisions.map((memory) => memory.title)} />
        </div>
      </Card>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <ListCard title="Linked Tasks" items={data?.tasks.map((task) => `${task.title} (${task.status})`) ?? []} />
        <ListCard title="Open Matters" items={data?.matters.map((matter) => `${matter.title} (${matter.priority} / ${matter.status})`) ?? []} />
        <ListCard title="Active Work Orders" items={data?.workOrders.map((order) => `${order.title} (${order.status})`) ?? []} />
        <ListCard title="Recent Reports" items={data?.reports.map((report) => `${report.title} (${formatDate(report.updatedAt)})`) ?? []} />
        <ListCard title="Linked Memories" items={data?.memories.map((memory) => `${memory.title} (${memory.type})`) ?? []} />
        <ListCard title="Artifacts" items={data?.artifacts.map((artifact) => `${artifact.title} (${artifact.type})`) ?? []} />
      </div>

      {exportPayload ? (
        <Card className="mt-5">
          <h2 className="font-display text-lg">Obsidian Markdown Payload</h2>
          <div className="mt-3 grid gap-3 xl:grid-cols-[260px_1fr]">
            <div className="space-y-2">
              {Object.keys(exportPayload.files).map((name) => (
                <div key={name} className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">{name}</div>
              ))}
            </div>
            <Textarea className="min-h-96 font-mono text-xs" value={Object.entries(exportPayload.files).map(([name, content]) => `# ${name}\n\n${content}`).join("\n\n---\n\n")} readOnly />
          </div>
        </Card>
      ) : null}

      <Card className="mt-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg">Repository Intelligence</h2>
            {repoSnapshot ? (
              <p className="mt-1 text-xs text-muted-foreground">Generated: {formatDate(repoSnapshot.generatedAt)}</p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">No snapshot yet. Click Scan Repository to generate one.</p>
            )}
          </div>
          <Button variant="outline" onClick={() => void scanRepository()} disabled={scanning}>
            <ScanSearch className="h-4 w-4" />
            {scanning ? "Scanning…" : "Scan Repository"}
          </Button>
        </div>
        {scanError ? <p className="mt-3 text-sm text-red-400">{scanError}</p> : null}
        {repoSnapshot ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <RepoField label="Framework" value={repoSnapshot.framework} />
            <RepoField label="Runtime" value={repoSnapshot.language} />
            <RepoField label="Package Manager" value={repoSnapshot.packageManager} />
            <div className="sm:col-span-2 lg:col-span-3">
              <h3 className="text-sm font-semibold">Prisma Models</h3>
              {repoSnapshot.prismaModels.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {repoSnapshot.prismaModels.map((model) => (
                    <span key={model} className="rounded-full border border-border bg-muted/30 px-2 py-0.5 text-xs text-muted-foreground">{model}</span>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">None detected.</p>
              )}
            </div>
            <div>
              <h3 className="text-sm font-semibold">Modules</h3>
              <p className="mt-1 text-sm text-muted-foreground">{repoSnapshot.modules.length > 0 ? repoSnapshot.modules.join(", ") : "—"}</p>
            </div>
            <div>
              <h3 className="text-sm font-semibold">Services</h3>
              <p className="mt-1 text-sm text-muted-foreground">{repoSnapshot.services.length > 0 ? repoSnapshot.services.join(", ") : "—"}</p>
            </div>
            {repoSnapshot.summary ? (
              <div className="sm:col-span-2 lg:col-span-3">
                <h3 className="text-sm font-semibold">Repository Summary</h3>
                <p className="mt-1 text-sm text-muted-foreground">{repoSnapshot.summary}</p>
              </div>
            ) : null}
          </div>
        ) : null}
      </Card>

      <Card className="mt-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg">Local Docs</h2>
            {localDocSnapshot ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Last scanned: {formatDate(localDocSnapshot.scannedAt)} · Status: {localDocSnapshot.scanStatus}
                {localDocSnapshot.isStale ? " · STALE" : ""}
              </p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">No local docs snapshot yet.</p>
            )}
          </div>
          {canEditLocalDocs ? (
            <Button variant="outline" onClick={() => setShowAddRootForm((prev) => !prev)}>
              {showAddRootForm ? "Cancel" : "Add Local Root"}
            </Button>
          ) : null}
        </div>

        {localDocsError ? <p className="mt-3 text-sm text-red-400">{localDocsError}</p> : null}

        {showAddRootForm ? (
          <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <Input placeholder="Name (e.g. main repo)" value={newRootName} onChange={(e) => setNewRootName(e.target.value)} />
            <Input placeholder="Absolute path (e.g. /Users/me/project)" value={newRootPath} onChange={(e) => setNewRootPath(e.target.value)} />
            <Button onClick={() => void addLocalDocRoot()} disabled={addingRoot || !newRootName.trim() || !newRootPath.trim()}>
              {addingRoot ? "Adding…" : "Add Root"}
            </Button>
          </div>
        ) : null}

        <div className="mt-4 space-y-3">
          {localDocRoots.length === 0 ? (
            <p className="text-sm text-muted-foreground">No local document roots configured.</p>
          ) : (
            localDocRoots.map((root) => (
              <div key={root.id} className="rounded-md border border-border bg-muted/30 px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-sm font-semibold">{root.name}</span>
                    <span className="ml-2 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">{root.isActive ? "Active" : "Inactive"}</span>
                    {root.lastError ? <span className="ml-2 text-xs text-red-400">{root.lastError}</span> : null}
                  </div>
                  {canEditLocalDocs ? (
                    <Button variant="outline" onClick={() => void scanLocalDocsRoot(root.id)} disabled={localDocsScanningRootId === root.id}>
                      <ScanSearch className="h-4 w-4" />
                      {localDocsScanningRootId === root.id ? "Scanning…" : "Scan Now"}
                    </Button>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Last scanned: {root.lastScannedAt ? formatDate(root.lastScannedAt) : "Never"}
                </p>
              </div>
            ))
          )}
        </div>

        {localDocSnapshot ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <RepoField label="File Count" value={String(localDocSnapshot.fileCount)} />
            <RepoField label="Total Bytes" value={String(localDocSnapshot.totalBytes)} />
            <RepoField label="Scan Status" value={localDocSnapshot.scanStatus} />
            <div className="sm:col-span-2 lg:col-span-3">
              <h3 className="text-sm font-semibold">Important Docs</h3>
              {localDocSnapshot.importantFiles.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {localDocSnapshot.importantFiles.map((f) => (
                    <span key={f.relativePath} className="rounded-full border border-border bg-muted/30 px-2 py-0.5 text-xs text-muted-foreground">{f.relativePath}</span>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">None found.</p>
              )}
            </div>
            <div>
              <h3 className="text-sm font-semibold">Package Scripts</h3>
              {localDocSnapshot.packageScripts && Object.keys(localDocSnapshot.packageScripts).length > 0 ? (
                <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
                  {Object.entries(localDocSnapshot.packageScripts).map(([k, v]) => <li key={k}>- {k}: {v}</li>)}
                </ul>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">None detected.</p>
              )}
            </div>
            <div>
              <h3 className="text-sm font-semibold">Detected Stack</h3>
              <p className="mt-1 text-sm text-muted-foreground">{localDocSnapshot.detectedStack && localDocSnapshot.detectedStack.length > 0 ? localDocSnapshot.detectedStack.join(", ") : "Not detected."}</p>
            </div>
            <div>
              <h3 className="text-sm font-semibold">Risk Zones</h3>
              {localDocSnapshot.riskZones && localDocSnapshot.riskZones.length > 0 ? (
                <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
                  {localDocSnapshot.riskZones.map((z) => <li key={z.relativePath}>- {z.relativePath} ({z.riskLevel}): {z.reason}</li>)}
                </ul>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">None flagged.</p>
              )}
            </div>
            {localDocSnapshot.summary ? (
              <div className="sm:col-span-2 lg:col-span-3">
                <h3 className="text-sm font-semibold">Summary</h3>
                <p className="mt-1 text-sm text-muted-foreground">{localDocSnapshot.summary}</p>
              </div>
            ) : null}
          </div>
        ) : null}

        {isKing && localDocRoots.length > 0 ? (
          <div className="mt-5 border-t border-border pt-4">
            <h3 className="text-sm font-semibold">Preview File (King only)</h3>
            <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <select
                className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={previewRootId ?? ""}
                onChange={(e) => setPreviewRootId(e.target.value || null)}
              >
                <option value="">Select root…</option>
                {localDocRoots.map((root) => (
                  <option key={root.id} value={root.id}>{root.name}</option>
                ))}
              </select>
              <Input placeholder="Relative path (e.g. README.md)" value={previewPath} onChange={(e) => setPreviewPath(e.target.value)} />
              <Button onClick={() => void previewLocalDocFile()} disabled={previewLoading || !previewRootId || !previewPath.trim()}>
                {previewLoading ? "Loading…" : "Preview"}
              </Button>
            </div>
            {previewError ? <p className="mt-2 text-sm text-red-400">{previewError}</p> : null}
            {previewContent !== null ? (
              <Textarea className="mt-3 min-h-64 font-mono text-xs" value={previewContent} readOnly />
            ) : null}
          </div>
        ) : null}
      </Card>

      <div className="mt-5 flex flex-wrap gap-2">
        <Link to="/work-orders"><Button variant="outline">Open affected WorkOrders</Button></Link>
        <Link to="/inbox"><Button variant="outline">Kingdom Inbox</Button></Link>
        <Link to="/project-inbox"><Button variant="outline">Review Project Inbox</Button></Link>
        <Link to="/artifacts"><Button variant="outline">Create Artifact</Button></Link>
        <Link to="/royal-brief"><Button variant="outline">Royal Brief</Button></Link>
        <Link to="/projects"><Button variant="outline"><FolderKanban className="h-4 w-4" />All Projects</Button></Link>
      </div>
    </>
  );
}

function ProjectContextHealthCard({
  health,
  localDocSnapshot,
  localDocRoots,
  repoSnapshot,
  workOrders,
  scanning,
  canEditLocalDocs,
  actionLoading,
  actionStatus,
  onRunLocalDocsScan,
  onRefreshContext,
  onReconcile
}: {
  health: ProjectContextHealthDto | null;
  localDocSnapshot: LocalDocumentSnapshotDto | null;
  localDocRoots: LocalDocumentRootDto[];
  repoSnapshot: RepositorySnapshotDto | null;
  workOrders: WorkOrderDto[];
  scanning: boolean;
  canEditLocalDocs: boolean;
  actionLoading: boolean;
  actionStatus: string | null;
  onRunLocalDocsScan: () => void;
  onRefreshContext: () => void;
  onReconcile: () => void;
}) {
  const activeAffected = (health?.openWorkOrders ?? workOrders)
    .filter((order) => !["COMPLETED", "ARCHIVED", "CANCELLED"].includes(order.status))
    .filter((order) => "contextBindingStatus" in order ? order.contextBindingStatus !== "FRESH" : true);
  const status = health?.status ?? deriveContextHealth(localDocSnapshot, workOrders);
  const localDocsChanged = Boolean(health?.binding?.localDocsChanged || localDocSnapshot?.isStale);
  const shouldScanFirst = status === "STALE" && localDocsChanged;
  const latestRootScan = localDocRoots
    .map((root) => root.lastScannedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;
  const changedEvidence = health?.lines?.filter((line) => /changed|stale|missing|partial|snapshot/i.test(line)).slice(0, 4) ?? [];

  return (
    <Card className="mb-5 border-primary/30 bg-primary/5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-2xl">Project Context Health</h2>
            <StatusPill status={status} />
          </div>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            This is the source-of-truth view for local docs, repository snapshots, and active WorkOrder context binding.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEditLocalDocs ? (
            <Button onClick={onRunLocalDocsScan} disabled={scanning || localDocRoots.length === 0}>
              <ScanSearch className="h-4 w-4" />
              {scanning ? "Scanning…" : "Run Local Docs Scan"}
            </Button>
          ) : null}
          <Button variant="outline" onClick={onRefreshContext} disabled={actionLoading || shouldScanFirst}>
            <RefreshCw className="h-4 w-4" />
            Bind / Refresh Context
          </Button>
          <Link to="/work-orders"><Button variant="outline"><ArrowUpRight className="h-4 w-4" />Open affected WorkOrders</Button></Link>
          <Button variant="outline" onClick={onReconcile} disabled={actionLoading}>Reconcile Old Work Orders</Button>
        </div>
      </div>

      {status === "STALE" ? (
        <div className="mt-5 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <div className="font-semibold">Local docs changed after the latest scan.</div>
              <div className="mt-1">Run Local Docs Scan first, then refresh WorkOrder context.</div>
              <div className="mt-1 text-amber-100/80">Bind / Refresh alone cannot fix stale snapshots when local docs have changed.</div>
            </div>
          </div>
        </div>
      ) : null}

      {actionStatus ? (
        <div className="mt-4 rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">{actionStatus}</div>
      ) : null}

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <HealthFact label="Context status" value={status} />
        <HealthFact label="Last local docs scan" value={localDocSnapshot?.scannedAt ?? latestRootScan} />
        <HealthFact label="Repository snapshot" value={repoSnapshot?.generatedAt ?? null} />
        <HealthFact label="Affected active WorkOrders" value={String(activeAffected.length)} />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-lg border border-border bg-background/40 p-4">
          <h3 className="font-display text-lg">What caused this?</h3>
          <div className="mt-3 space-y-2 text-sm text-muted-foreground">
            {changedEvidence.length > 0 ? changedEvidence.map((line, index) => (
              <div key={`${line}-${index}`} className="rounded-md border border-border bg-muted/20 px-3 py-2">{line}</div>
            )) : (
              <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
                {status === "FRESH" ? "Latest known project context is fresh." : "No detailed changed-file list is available from the current context health response."}
              </div>
            )}
            {localDocsChanged ? <div>Changed files: available through Local Docs scan evidence when returned by the API.</div> : null}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-background/40 p-4">
          <h3 className="font-display text-lg">Source of Truth</h3>
          <div className="mt-3 grid gap-2">
            <SmallSourceLink to="/work-orders" label="Work Orders" />
            <SmallSourceLink to="/inbox" label="Kingdom Inbox" />
            <SmallSourceLink to="/project-inbox" label="Project Inbox" />
            <SmallSourceLink to="/artifacts" label="Artifacts / local docs" />
            <SmallSourceLink to="/royal-brief" label="Royal Brief" />
          </div>
        </div>
      </div>

      {activeAffected.length > 0 ? (
        <div className="mt-5 rounded-lg border border-border bg-background/40 p-4">
          <h3 className="font-display text-lg">Affected active WorkOrders</h3>
          <div className="mt-3 grid gap-2">
            {activeAffected.slice(0, 6).map((order) => (
              <Link key={order.id} to="/work-orders" className="flex items-start justify-between gap-3 rounded-md border border-border bg-muted/20 px-3 py-2 text-sm hover:border-primary/50">
                <span className="min-w-0 break-words">{order.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{"contextBindingStatus" in order ? order.contextBindingStatus : "Review"}</span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </Card>
  );
}

function ProjectLoadingState() {
  return (
    <div className="grid gap-4">
      {[0, 1, 2].map((item) => (
        <Card key={item}>
          <div className="h-5 w-1/3 rounded bg-muted/50" />
          <div className="mt-4 h-3 rounded bg-muted/30" />
          <div className="mt-2 h-3 w-2/3 rounded bg-muted/30" />
        </Card>
      ))}
    </div>
  );
}

function StatusPill({ status }: { status: ContextBindingStatusDto }) {
  const Icon = status === "FRESH" ? CheckCircle2 : status === "STALE" ? AlertTriangle : ShieldAlert;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold", contextStatusClass(status))}>
      <Icon className="h-3.5 w-3.5" />
      {status}
    </span>
  );
}

function HealthFact({ label, value }: { label: string; value: string | null }) {
  const displayValue = value && /^\d{4}-/.test(value) ? formatDate(value) : value ?? "Not available";
  return (
    <div className="rounded-lg border border-border bg-background/40 p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 break-words text-sm font-semibold">{displayValue}</div>
    </div>
  );
}

function SmallSourceLink({ to, label }: { to: string; label: string }) {
  const Icon = label.includes("Brief") ? FileText : label.includes("Project") ? FolderKanban : label.includes("Artifacts") ? GitBranch : ArrowUpRight;
  return (
    <Link to={to} className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/20 px-3 py-2 text-sm hover:border-primary/50">
      <span>{label}</span>
      <Icon className="h-4 w-4 text-primary" />
    </Link>
  );
}

function deriveContextHealth(snapshot: LocalDocumentSnapshotDto | null, workOrders: WorkOrderDto[]): ContextBindingStatusDto {
  if (snapshot?.isStale || snapshot?.scanStatus === "STALE") return "STALE";
  const active = workOrders.filter((order) => !["COMPLETED", "ARCHIVED", "CANCELLED"].includes(order.status));
  if (active.some((order) => order.contextBindingStatus === "MISSING")) return "MISSING";
  if (active.some((order) => order.contextBindingStatus === "STALE")) return "STALE";
  if (active.some((order) => order.contextBindingStatus === "PARTIAL")) return "PARTIAL";
  return snapshot ? "FRESH" : "MISSING";
}

function contextStatusClass(status: ContextBindingStatusDto) {
  if (status === "FRESH") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
  if (status === "MISSING") return "border-red-500/40 bg-red-500/10 text-red-200";
  if (status === "STALE") return "border-amber-500/40 bg-amber-500/10 text-amber-200";
  return "border-cyan-500/40 bg-cyan-500/10 text-cyan-200";
}

function Metric({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <Card className={warn ? "border-red-500/40 bg-red-500/10" : ""}>
      <div className={warn ? "text-3xl font-bold text-red-300" : "text-3xl font-bold"}>{value}</div>
      <div className="mt-1 text-sm text-muted-foreground">{label}</div>
    </Card>
  );
}

function Section({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
        {(items.length ? items : ["None recorded."]).map((item, index) => <li key={`${title}-${index}`}>- {item}</li>)}
      </ul>
    </div>
  );
}

function ListCard({ title, items }: { title: string; items: string[] }) {
  return (
    <Card>
      <h2 className="font-display text-lg">{title}</h2>
      <div className="mt-3 space-y-2">
        {(items.length ? items.slice(0, 8) : ["None linked."]).map((item, index) => (
          <div key={`${title}-${index}`} className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">{item}</div>
        ))}
      </div>
    </Card>
  );
}

function RepoField({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{label}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{value ?? "—"}</p>
    </div>
  );
}
