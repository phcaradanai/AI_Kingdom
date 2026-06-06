import { FormEvent, useEffect, useMemo, useState } from "react";
import { Archive, Save } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { cn, formatDate } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import type { ArtifactDto, ArtifactPayload, ArtifactType, ProjectDto } from "@/types/api";

const types: ArtifactType[] = ["PROMPT", "SPEC", "DECISION", "IMPLEMENTATION_REPORT", "HANDOFF_BRIEF", "ARCHITECTURE_NOTE", "MARKET_RESEARCH", "CODE_PLAN", "ROYAL_DECREE", "GENERAL_NOTE"];

const blankArtifact: ArtifactPayload = {
  projectId: null,
  title: "",
  type: "GENERAL_NOTE",
  content: "",
  sourceType: "",
  sourceId: "",
  tags: []
};

export function ArtifactsPage() {
  const user = useAuthStore((state) => state.user);
  const canCreate = user?.role === "KING" || user?.role === "CROWN_PRINCE" || user?.role === "MINISTER";
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [artifacts, setArtifacts] = useState<ArtifactDto[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ArtifactPayload>(blankArtifact);
  const [projectFilter, setProjectFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(() => artifacts.find((artifact) => artifact.id === selectedId) ?? null, [artifacts, selectedId]);

  async function load() {
    const [projectResponse, artifactResponse] = await Promise.all([
      api.projects(),
      api.artifacts({ projectId: projectFilter || undefined, type: typeFilter || undefined, tag: tagFilter || undefined })
    ]);
    setProjects(projectResponse.projects);
    setArtifacts(artifactResponse.artifacts);
  }

  useEffect(() => {
    void load();
  }, [projectFilter, typeFilter, tagFilter]);

  function select(artifact: ArtifactDto | null) {
    setSelectedId(artifact?.id ?? null);
    setDraft(artifact ? toPayload(artifact) : blankArtifact);
    setError(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canCreate) return;
    setError(null);
    try {
      const payload = cleanArtifact(draft);
      const response = selected ? await api.updateArtifact(selected.id, payload) : await api.createArtifact(payload);
      setSelectedId(response.artifact.id);
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save artifact");
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Artifact Vault"
        title="Artifacts"
        description="Store reusable project knowledge: prompts, specs, decisions, implementation reports, handoff briefs, architecture notes, and research."
      />

      <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
        <div className="space-y-4">
          <Card>
            <h2 className="font-display text-lg">Filters</h2>
            <div className="mt-4 grid gap-3">
              <select className="h-10 rounded-md border border-border bg-input px-3 text-sm" value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
                <option value="">All projects</option>
                {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
              </select>
              <select className="h-10 rounded-md border border-border bg-input px-3 text-sm" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                <option value="">All types</option>
                {types.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
              <Input value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} placeholder="Tag filter" />
            </div>
          </Card>

          {canCreate ? <Button className="w-full" onClick={() => select(null)}>Create Artifact</Button> : null}
          {artifacts.map((artifact) => (
            <Card key={artifact.id} className={cn("transition", selectedId === artifact.id && "border-primary/60 bg-primary/10")}>
              <button className="w-full text-left" onClick={() => select(artifact)}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-display text-lg">{artifact.title}</h2>
                    <p className="mt-1 text-xs text-muted-foreground">{artifact.project?.name ?? "Unassigned"} · {formatDate(artifact.updatedAt)}</p>
                  </div>
                  <Archive className="h-5 w-5 text-primary" />
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span className="rounded-full border border-border px-2 py-1">{artifact.type}</span>
                  {artifact.tags.slice(0, 4).map((tag) => <span key={tag}>{tag}</span>)}
                </div>
              </button>
            </Card>
          ))}
        </div>

        <Card>
          <h2 className="font-display text-2xl">{selected ? selected.title : "Artifact Detail"}</h2>
          <form className="mt-5 space-y-4" onSubmit={submit}>
            <Input disabled={!canCreate} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Title" />
            <div className="grid gap-3 sm:grid-cols-2">
              <select disabled={!canCreate} className="h-10 rounded-md border border-border bg-input px-3 text-sm" value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as ArtifactType })}>
                {types.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
              <select disabled={!canCreate} className="h-10 rounded-md border border-border bg-input px-3 text-sm" value={draft.projectId ?? ""} onChange={(e) => setDraft({ ...draft, projectId: e.target.value || null })}>
                <option value="">Unassigned project</option>
                {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
              </select>
            </div>
            <Textarea disabled={!canCreate} className="min-h-96 font-mono text-xs" value={draft.content} onChange={(e) => setDraft({ ...draft, content: e.target.value })} placeholder="Markdown content" />
            <Input disabled={!canCreate} value={draft.tags?.join(", ") ?? ""} onChange={(e) => setDraft({ ...draft, tags: csv(e.target.value) })} placeholder="Tags" />
            <div className="grid gap-3 sm:grid-cols-2">
              <Input disabled={!canCreate} value={draft.sourceType ?? ""} onChange={(e) => setDraft({ ...draft, sourceType: e.target.value })} placeholder="Source type" />
              <Input disabled={!canCreate} value={draft.sourceId ?? ""} onChange={(e) => setDraft({ ...draft, sourceId: e.target.value })} placeholder="Source ID" />
            </div>
            {error ? <div className="rounded-md border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-100">{error}</div> : null}
            {canCreate ? <Button><Save className="h-4 w-4" />Save Artifact</Button> : null}
          </form>
        </Card>
      </div>
    </>
  );
}

function toPayload(artifact: ArtifactDto): ArtifactPayload {
  return {
    projectId: artifact.projectId,
    title: artifact.title,
    type: artifact.type,
    content: artifact.content,
    sourceType: artifact.sourceType,
    sourceId: artifact.sourceId,
    tags: artifact.tags
  };
}

function cleanArtifact(artifact: ArtifactPayload): ArtifactPayload {
  return {
    ...artifact,
    projectId: artifact.projectId || null,
    sourceType: artifact.sourceType || null,
    sourceId: artifact.sourceId || null,
    tags: artifact.tags ?? []
  };
}

function csv(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}
