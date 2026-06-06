import { FormEvent, useEffect, useMemo, useState } from "react";
import { FolderKanban, Save, Search } from "lucide-react";
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
import type { ProjectDto, ProjectPayload, ProjectPriority, ProjectStatus } from "@/types/api";

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

  const selected = useMemo(() => projects.find((project) => project.id === selectedId) ?? null, [projects, selectedId]);

  async function load() {
    const response = await api.projects({ q: query || undefined, status: status || undefined, priority: priority || undefined });
    setProjects(response.projects);
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
        description="Organize long-running kingdom initiatives, route work automatically, and keep project context compact."
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
          {projects.map((project) => (
            <Card key={project.id} className={cn("transition", selectedId === project.id && "border-primary/60 bg-primary/10")}>
              <button className="w-full text-left" onClick={() => select(project)}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-display text-lg">{project.name}</h2>
                    <p className="mt-1 text-xs text-muted-foreground">{project.activeMilestone || project.codename || "No milestone set"}</p>
                  </div>
                  <FolderKanban className="h-5 w-5 text-primary" />
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span className="rounded-full border border-border px-2 py-1">{project.status}</span>
                  <span className="rounded-full border border-border px-2 py-1">{project.priority}</span>
                  <span>{formatDate(project.updatedAt)}</span>
                </div>
              </button>
              <Link className="mt-4 inline-flex text-sm text-primary hover:underline" to={`/projects/${project.id}`}>Open workspace</Link>
            </Card>
          ))}
        </div>

        <Card>
          <h2 className="font-display text-2xl">{selected ? selected.name : "Project Detail"}</h2>
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
