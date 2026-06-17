import { FormEvent, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowUpRight, CheckCircle2, Clock3, FolderKanban, RefreshCw, Save, Search, ShieldAlert } from "lucide-react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { cn, formatDate } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import type { ContextBindingStatusDto, ProjectDto, ProjectPayload, ProjectPriority, ProjectStatus, WorkOrderDto } from "@/types/api";

const selectCls = "h-10 w-full rounded-md border border-border bg-input px-3 text-sm text-foreground outline-none transition focus:ring-2 focus:ring-primary";

const statuses: ProjectStatus[] = ["ACTIVE", "PAUSED", "COMPLETED", "ARCHIVED"];
const priorities: ProjectPriority[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

const blankProject: ProjectPayload = {
  name: "",
  codename: "",
  description: "",
  status: "ACTIVE",
  priority: "MEDIUM",
  goals: [],
  keywords: [],
  aliases: [],
  repositoryUrl: "",
  localPath: "",
  activeMilestone: ""
};

type ProjectSummary = {
  contextStatus: ContextBindingStatusDto | "UNKNOWN";
  activeWorkCount: number;
  affectedWorkCount: number;
  lastContextBoundAt: string | null;
  loadError: boolean;
};

export function ProjectsPage() {
  const user = useAuthStore((state) => state.user);
  const canEdit = user?.role === "KING" || user?.role === "CROWN_PRINCE";
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ProjectPayload>(blankProject);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [summaries, setSummaries] = useState<Record<string, ProjectSummary>>({});

  const selected = useMemo(() => projects.find((project) => project.id === selectedId) ?? null, [projects, selectedId]);
  const selectedSummary = selected ? summaries[selected.id] : null;

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await api.projects({ q: query || undefined, status: status || undefined, priority: priority || undefined });
      setProjects(response.projects);
      setSelectedId((current) => current && response.projects.some((project) => project.id === current) ? current : response.projects[0]?.id ?? null);
      void loadSummaries(response.projects);
    } catch (err) {
      setProjects([]);
      setSummaries({});
      setLoadError(err instanceof Error ? err.message : "Unable to load projects");
    } finally {
      setLoading(false);
    }
  }

  async function loadSummaries(items: ProjectDto[]) {
    const entries = await Promise.all(items.map(async (project) => {
      try {
        const [workOrdersResult, health] = await Promise.all([
          api.projectWorkOrders(project.id).catch(() => ({ workOrders: [] as WorkOrderDto[] })),
          api.getProjectContextHealth(project.id).catch(() => null)
        ]);
        const activeWorkOrders = workOrdersResult.workOrders.filter((order) => !["COMPLETED", "ARCHIVED", "CANCELLED"].includes(order.status));
        const affected = health?.openWorkOrders.filter((order) => !["COMPLETED", "ARCHIVED", "CANCELLED"].includes(order.status)).length ?? activeWorkOrders.filter((order) => order.contextBindingStatus && order.contextBindingStatus !== "FRESH").length;
        const lastContextBoundAt = health?.openWorkOrders
          .map((order) => order.contextBoundAt)
          .filter((value): value is string => Boolean(value))
          .sort()
          .at(-1) ?? null;
        return [project.id, {
          contextStatus: health?.status ?? deriveContextStatus(activeWorkOrders),
          activeWorkCount: activeWorkOrders.length,
          affectedWorkCount: affected,
          lastContextBoundAt,
          loadError: false
        } satisfies ProjectSummary] as const;
      } catch {
        return [project.id, {
          contextStatus: "UNKNOWN",
          activeWorkCount: 0,
          affectedWorkCount: 0,
          lastContextBoundAt: null,
          loadError: true
        } satisfies ProjectSummary] as const;
      }
    }));
    setSummaries(Object.fromEntries(entries));
  }

  useEffect(() => {
    void load();
  }, [query, status, priority]);

  function select(project: ProjectDto | null) {
    setSelectedId(project?.id ?? null);
    setDraft(project ? toPayload(project) : blankProject);
    setError(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canEdit) return;
    setError(null);
    try {
      const payload = cleanProject(draft);
      const response = selected ? await api.updateProject(selected.id, payload) : await api.createProject(payload);
      setSelectedId(response.project.id);
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save project");
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Project Workspace"
        title="Projects"
        description="Project source context, local docs, artifacts, and active implementation work in one command surface."
      />

      <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
        <div className="space-y-4">
          <Card>
            <h2 className="font-display text-lg">Search</h2>
            <div className="mt-4 grid gap-3">
              <FormField id="proj-search" label="Search">
                <div className="flex gap-2">
                  <Input id="proj-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Project, alias, keyword" />
                  <Button type="button" variant="outline" onClick={() => void load()}><Search className="h-4 w-4" /></Button>
                </div>
              </FormField>
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField id="proj-status-filter" label="Status">
                  <select id="proj-status-filter" className={selectCls} value={status} onChange={(e) => setStatus(e.target.value)}>
                    <option value="">All statuses</option>
                    {statuses.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </FormField>
                <FormField id="proj-priority-filter" label="Priority">
                  <select id="proj-priority-filter" className={selectCls} value={priority} onChange={(e) => setPriority(e.target.value)}>
                    <option value="">All priorities</option>
                    {priorities.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </FormField>
              </div>
            </div>
          </Card>

          {canEdit ? <Button className="w-full" onClick={() => select(null)}>Create Project</Button> : null}
          {loadError ? (
            <Card className="border-red-500/40 bg-red-500/10">
              <div className="flex items-start gap-3">
                <ShieldAlert className="mt-0.5 h-5 w-5 text-red-300" />
                <div>
                  <h2 className="font-display text-lg">Projects unavailable</h2>
                  <p className="mt-1 text-sm text-red-100">{loadError}</p>
                  <Button className="mt-3" variant="outline" onClick={() => void load()}><RefreshCw className="h-4 w-4" />Retry</Button>
                </div>
              </div>
            </Card>
          ) : null}
          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((item) => <ProjectSkeleton key={item} />)}
            </div>
          ) : null}
          {!loading && !loadError && projects.length === 0 ? (
            <Card>
              <h2 className="font-display text-lg">No projects found</h2>
              <p className="mt-1 text-sm text-muted-foreground">Create a project or clear filters to see project context health here.</p>
            </Card>
          ) : null}
          {!loading && !loadError ? projects.map((project) => (
            <ProjectListCard
              key={project.id}
              project={project}
              summary={summaries[project.id]}
              selected={selectedId === project.id}
              onSelect={() => select(project)}
            />
          )) : null}
        </div>

        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl">{selected ? selected.name : "Project Detail"}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {selected ? selected.activeMilestone || selected.codename || "Review project source context and routing fields." : "Create or select a project."}
              </p>
            </div>
            {selected ? (
              <Link className="inline-flex" to={`/projects/${selected.id}`}>
                <Button type="button"><ArrowUpRight className="h-4 w-4" />Open Context Workspace</Button>
              </Link>
            ) : null}
          </div>
          {selected ? (
            <div className="mt-5 grid gap-3 lg:grid-cols-3">
              <ProjectInfoTile label="Context Health" value={selectedSummary?.contextStatus ?? "Loading"} tone={selectedSummary?.contextStatus ?? "UNKNOWN"} />
              <ProjectInfoTile label="Active Work" value={String(selectedSummary?.activeWorkCount ?? 0)} />
              <ProjectInfoTile label="Needs Refresh" value={String(selectedSummary?.affectedWorkCount ?? 0)} tone={(selectedSummary?.affectedWorkCount ?? 0) > 0 ? "STALE" : "FRESH"} />
            </div>
          ) : null}
          {selected ? (
            <div className="mt-5 rounded-lg border border-border bg-muted/20 p-4">
              <h3 className="font-display text-lg">Source of Truth</h3>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <SourceLink to={`/projects/${selected.id}`} label="Project Context" description="Local docs, repository snapshot, context health." />
                <SourceLink to="/work-orders" label="Work Orders" description="Implementation queue and affected active work." />
                <SourceLink to="/inbox" label="Kingdom Inbox" description="Live next actions and blocking context items." />
                <SourceLink to="/project-inbox" label="Project Inbox" description="Unassigned or low-confidence project routing." />
                <SourceLink to="/artifacts" label="Artifacts / Local Docs" description="Generated source artifacts and project documents." />
                <SourceLink to="/royal-brief" label="Royal Brief" description="Daily generated context and health summary." />
              </div>
            </div>
          ) : null}
          <form className="mt-5 space-y-4" onSubmit={submit}>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField id="proj-name" label="Name" required>
                <Input id="proj-name" disabled={!canEdit} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="AI Kingdom" />
              </FormField>
              <FormField id="proj-codename" label="Codename">
                <Input id="proj-codename" disabled={!canEdit} value={draft.codename ?? ""} onChange={(e) => setDraft({ ...draft, codename: e.target.value })} placeholder="KINGDOM" />
              </FormField>
              <FormField id="proj-status" label="Status">
                <select id="proj-status" disabled={!canEdit} className={selectCls} value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as ProjectStatus })}>
                  {statuses.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </FormField>
              <FormField id="proj-priority" label="Priority">
                <select id="proj-priority" disabled={!canEdit} className={selectCls} value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value as ProjectPriority })}>
                  {priorities.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </FormField>
            </div>

            <FormField id="proj-description" label="Description">
              <Textarea id="proj-description" disabled={!canEdit} value={draft.description ?? ""} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Brief description of the project's purpose and scope." />
            </FormField>

            <FormField id="proj-milestone" label="Active Milestone">
              <Input id="proj-milestone" disabled={!canEdit} value={draft.activeMilestone ?? ""} onChange={(e) => setDraft({ ...draft, activeMilestone: e.target.value })} placeholder="M15 — Model Pricing Registry" />
            </FormField>

            <FormField id="proj-repo" label="Repository URL">
              <Input id="proj-repo" disabled={!canEdit} value={draft.repositoryUrl ?? ""} onChange={(e) => setDraft({ ...draft, repositoryUrl: e.target.value })} placeholder="https://github.com/org/repo" />
            </FormField>

            <FormField id="proj-local-path" label="Local Path" description="Local machine path for human reference only. The backend will not execute shell commands.">
              <Input id="proj-local-path" disabled={!canEdit} value={draft.localPath ?? ""} onChange={(e) => setDraft({ ...draft, localPath: e.target.value })} placeholder="/Users/you/projects/repo" />
            </FormField>

            <FormField id="proj-goals" label="Goals" description="One goal per line.">
              <Textarea id="proj-goals" disabled={!canEdit} value={draft.goals?.join("\n") ?? ""} onChange={(e) => setDraft({ ...draft, goals: lines(e.target.value) })} placeholder="Ship the MVP&#10;Reach 100 active users" />
            </FormField>

            <FormField id="proj-keywords" label="Keywords" description="Used by Royal Secretary project routing. One per line.">
              <Input id="proj-keywords" disabled={!canEdit} value={draft.keywords?.join(", ") ?? ""} onChange={(e) => setDraft({ ...draft, keywords: csv(e.target.value) })} placeholder="api, authentication, dashboard" />
            </FormField>

            <FormField id="proj-aliases" label="Aliases" description="Alternative names for this project. One per line.">
              <Input id="proj-aliases" disabled={!canEdit} value={draft.aliases?.join(", ") ?? ""} onChange={(e) => setDraft({ ...draft, aliases: csv(e.target.value) })} placeholder="kingdom, aikingdom" />
            </FormField>

            {error ? <div className="rounded-md border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-100">{error}</div> : null}
            {canEdit ? <Button><Save className="h-4 w-4" />Save Project</Button> : null}
          </form>
        </Card>
      </div>
    </>
  );
}

function ProjectListCard({ project, summary, selected, onSelect }: { project: ProjectDto; summary?: ProjectSummary; selected: boolean; onSelect: () => void }) {
  const contextStatus = summary?.contextStatus ?? "UNKNOWN";
  return (
    <Card className={cn("transition", selected && "border-primary/60 bg-primary/10")}>
      <button className="w-full text-left" onClick={onSelect}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="break-words font-display text-lg leading-tight">{project.name}</h2>
            <p className="mt-1 break-words text-xs text-muted-foreground">{project.activeMilestone || project.codename || "No milestone set"}</p>
          </div>
          <FolderKanban className="h-5 w-5 shrink-0 text-primary" />
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
          <Badge>{project.status}</Badge>
          <Badge>{project.priority}</Badge>
          <StatusBadge status={contextStatus} />
        </div>
        <div className="mt-3 grid gap-2 text-xs text-muted-foreground">
          <div className="break-words">
            <span className="text-foreground">Repo: </span>{project.repositoryUrl || project.localPath || "No repository reference"}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <span><Clock3 className="mr-1 inline h-3.5 w-3.5" />Last activity: {formatDate(project.updatedAt)}</span>
            <span>Active work: {summary?.activeWorkCount ?? "…"}</span>
            <span>Affected: {summary?.affectedWorkCount ?? "…"}</span>
          </div>
        </div>
      </button>
      <Link className="mt-4 inline-flex text-sm text-primary hover:underline" to={`/projects/${project.id}`}>Open workspace</Link>
    </Card>
  );
}

function ProjectSkeleton() {
  return (
    <Card>
      <div className="h-5 w-2/3 rounded bg-muted/50" />
      <div className="mt-3 h-3 w-1/2 rounded bg-muted/40" />
      <div className="mt-4 grid gap-2">
        <div className="h-3 rounded bg-muted/30" />
        <div className="h-3 w-4/5 rounded bg-muted/30" />
      </div>
    </Card>
  );
}

function ProjectInfoTile({ label, value, tone }: { label: string; value: string; tone?: ContextBindingStatusDto | "UNKNOWN" }) {
  return (
    <div className={cn("rounded-lg border border-border bg-muted/20 p-3", tone && tone !== "FRESH" && "border-amber-500/40 bg-amber-500/10", tone === "FRESH" && "border-emerald-500/30 bg-emerald-500/10")}>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}

function SourceLink({ to, label, description }: { to: string; label: string; description: string }) {
  return (
    <Link to={to} className="rounded-lg border border-border bg-background/40 p-3 transition hover:border-primary/50 hover:bg-primary/10">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold">{label}</div>
          <div className="mt-1 text-xs text-muted-foreground">{description}</div>
        </div>
        <ArrowUpRight className="h-4 w-4 shrink-0 text-primary" />
      </div>
    </Link>
  );
}

function StatusBadge({ status }: { status: ContextBindingStatusDto | "UNKNOWN" }) {
  const Icon = status === "FRESH" ? CheckCircle2 : status === "UNKNOWN" ? AlertTriangle : ShieldAlert;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-1", contextStatusClass(status))}>
      <Icon className="h-3.5 w-3.5" />
      Context {status}
    </span>
  );
}

function Badge({ children }: { children: string }) {
  return <span className="rounded-full border border-border px-2 py-1">{children}</span>;
}

function deriveContextStatus(workOrders: WorkOrderDto[]): ContextBindingStatusDto | "UNKNOWN" {
  const active = workOrders.filter((order) => !["COMPLETED", "ARCHIVED", "CANCELLED"].includes(order.status));
  if (active.length === 0) return "FRESH";
  if (active.some((order) => order.contextBindingStatus === "MISSING")) return "MISSING";
  if (active.some((order) => order.contextBindingStatus === "STALE")) return "STALE";
  if (active.some((order) => order.contextBindingStatus === "PARTIAL")) return "PARTIAL";
  if (active.every((order) => order.contextBindingStatus === "FRESH")) return "FRESH";
  return "UNKNOWN";
}

function contextStatusClass(status: ContextBindingStatusDto | "UNKNOWN") {
  if (status === "FRESH") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
  if (status === "MISSING") return "border-red-500/40 bg-red-500/10 text-red-200";
  if (status === "STALE") return "border-amber-500/40 bg-amber-500/10 text-amber-200";
  if (status === "PARTIAL") return "border-cyan-500/40 bg-cyan-500/10 text-cyan-200";
  return "border-border bg-muted/30 text-muted-foreground";
}

function toPayload(project: ProjectDto): ProjectPayload {
  return {
    name: project.name,
    codename: project.codename,
    description: project.description,
    status: project.status,
    priority: project.priority,
    goals: project.goals,
    keywords: project.keywords,
    aliases: project.aliases,
    repositoryUrl: project.repositoryUrl,
    localPath: project.localPath,
    activeMilestone: project.activeMilestone,
    ownerUserId: project.ownerUserId
  };
}

function cleanProject(project: ProjectPayload): ProjectPayload {
  return {
    ...project,
    codename: project.codename || null,
    repositoryUrl: project.repositoryUrl || null,
    localPath: project.localPath || null,
    activeMilestone: project.activeMilestone || null,
    goals: project.goals ?? [],
    keywords: project.keywords ?? [],
    aliases: project.aliases ?? []
  };
}

function csv(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function lines(value: string): string[] {
  return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}
