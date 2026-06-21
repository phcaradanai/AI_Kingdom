import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { ArtifactDto, ArtifactPayload, ProjectDto, PublicUser } from "@/types/api";
import {
  blankArtifact,
  cleanArtifactPayload,
  initialArtifactFilters,
  matchesArtifactSearch,
  toArtifactPayload,
  type ArtifactFilters
} from "./artifactModels";

export function useArtifactsController(user: PublicUser | null) {
  const canCreate = user?.role === "KING" || user?.role === "CROWN_PRINCE" || user?.role === "MINISTER";
  const canEdit = user?.role === "KING" || user?.role === "CROWN_PRINCE";
  const canDelete = user?.role === "KING";
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [artifacts, setArtifacts] = useState<ArtifactDto[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filters, setFilters] = useState<ArtifactFilters>(initialArtifactFilters);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<"create" | "edit" | null>(null);
  const [draft, setDraft] = useState<ArtifactPayload>(blankArtifact);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ArtifactDto | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [projectResponse, artifactResponse] = await Promise.all([
        api.projects(),
        api.artifacts({
          projectId: filters.projectId || undefined,
          type: filters.type || undefined,
          tag: filters.tag || undefined,
          dataQuality: filters.dataQuality || undefined,
          includeTestData: filters.includeTestData
        })
      ]);
      setProjects(projectResponse.projects);
      setArtifacts(artifactResponse.artifacts);
      setSelectedId((current) => artifactResponse.artifacts.some((artifact) => artifact.id === current)
        ? current
        : artifactResponse.artifacts[0]?.id ?? null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to load artifacts");
    } finally {
      setLoading(false);
    }
  }, [filters.dataQuality, filters.includeTestData, filters.projectId, filters.tag, filters.type]);

  useEffect(() => { void load(); }, [load]);

  const visibleArtifacts = useMemo(
    () => artifacts.filter((artifact) => matchesArtifactSearch(artifact, filters.query)),
    [artifacts, filters.query]
  );
  const selected = useMemo(
    () => visibleArtifacts.find((artifact) => artifact.id === selectedId) ?? visibleArtifacts[0] ?? null,
    [selectedId, visibleArtifacts]
  );

  function updateFilters(next: ArtifactFilters) {
    setFilters(next);
    if (next.query !== filters.query) setSelectedId(null);
  }

  function openCreate() {
    setDraft(blankArtifact);
    setSaveError(null);
    setEditorMode("create");
  }

  function openEdit() {
    if (!selected || !canEdit) return;
    setDraft(toArtifactPayload(selected));
    setSaveError(null);
    setEditorMode("edit");
  }

  function closeEditor() {
    if (!saving) setEditorMode(null);
  }

  async function saveArtifact(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (editorMode === "create" ? !canCreate : !canEdit) return;
    setSaving(true);
    setSaveError(null);
    try {
      const payload = cleanArtifactPayload(draft);
      const response = editorMode === "edit" && selected
        ? await api.updateArtifact(selected.id, payload)
        : await api.createArtifact(payload);
      setEditorMode(null);
      await load();
      setSelectedId(response.artifact.id);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Unable to save artifact");
    } finally {
      setSaving(false);
    }
  }

  async function archiveDuplicate() {
    if (!selected || !canEdit) return;
    setBusyAction("archive-duplicate");
    setActionError(null);
    try {
      const response = await api.archiveDuplicateArtifact(selected.id);
      setArtifacts((items) => items.map((item) => item.id === response.artifact.id ? response.artifact : item));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to archive duplicate");
    } finally {
      setBusyAction(null);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget || !canDelete) return;
    setBusyAction("delete");
    setActionError(null);
    try {
      await api.deleteArtifact(deleteTarget.id);
      setDeleteTarget(null);
      setSelectedId(null);
      await load();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to delete artifact");
    } finally {
      setBusyAction(null);
    }
  }

  return {
    canCreate, canEdit, canDelete, projects, artifacts, visibleArtifacts,
    selected, selectedId, setSelectedId, filters, updateFilters, clearFilters: () => setFilters(initialArtifactFilters),
    loading, loadError, load, editorMode, draft, setDraft, saveError, saving,
    openCreate, openEdit, closeEditor, saveArtifact,
    deleteTarget, setDeleteTarget, confirmDelete, archiveDuplicate, actionError, busyAction
  };
}
