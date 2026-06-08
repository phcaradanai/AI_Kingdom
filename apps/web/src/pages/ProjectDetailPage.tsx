import { useEffect, useMemo, useState } from "react";
import { Download, FolderKanban, ScanSearch } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import type { ArtifactDto, MatterDto, MemoryDto, ObsidianExportDto, ProjectOverviewDto, RepositorySnapshotDto, ReportDto, TaskDto, WorkOrderDto } from "@/types/api";

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
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [exportPayload, setExportPayload] = useState<ObsidianExportDto | null>(null);
  const [repoSnapshot, setRepoSnapshot] = useState<RepositorySnapshotDto | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const project = data?.overview.project ?? null;
  const decisions = useMemo(() => data?.memories.filter((memory) => memory.type === "DECISION").slice(0, 5) ?? [], [data]);

  async function load() {
    if (!id) return;
    const [overview, tasks, matters, workOrders, reports, memories, artifacts, repoResult] = await Promise.all([
      api.projectOverview(id),
      api.projectTasks(id),
      api.projectMatters(id),
      api.projectWorkOrders(id),
      api.projectReports(id),
      api.projectMemories(id),
      api.projectArtifacts(id),
      api.getProjectRepositorySnapshot(id).catch(() => ({ snapshot: null }))
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
  }

  async function scanRepository() {
    if (!id) return;
    setScanning(true);
    setScanError(null);
    try {
      const result = await api.scanProjectRepository(id);
      setRepoSnapshot(result.snapshot);
    } catch (err) {
      setScanError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  }

  useEffect(() => {
    void load().catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to load project"));
  }, [id]);

  async function exportObsidian() {
    if (!id) return;
    setExportPayload(await api.exportProjectObsidian(id));
  }

  if (!project) {
    return (
      <>
        <PageHeader eyebrow="Project Workspace" title="Project" description="Loading project workspace." />
        {error ? <Card>{error}</Card> : null}
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

      <div className="mt-5 flex flex-wrap gap-2">
        <Link to="/project-inbox"><Button variant="outline">Review Project Inbox</Button></Link>
        <Link to="/artifacts"><Button variant="outline">Create Artifact</Button></Link>
        <Link to="/projects"><Button variant="outline"><FolderKanban className="h-4 w-4" />All Projects</Button></Link>
      </div>
    </>
  );
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
