import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { ProjectDto, ProjectPayload, PublicUser, WorkOrderDto } from "@/types/api";
import {
  blankProject,
  cleanProjectPayload,
  deriveContextStatus,
  type ProjectFilters,
  type ProjectSummary,
  toProjectPayload
} from "./projectModels";

export function useProjectsController(user: PublicUser | null) {
  const canEdit = user?.role === "KING" || user?.role === "CROWN_PRINCE";
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filters, setFilters] = useState<ProjectFilters>({ query: "", status: "", priority: "" });
  const [summaries, setSummaries] = useState<Record<string, ProjectSummary>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [shortcutBusy, setShortcutBusy] = useState<"scan" | "refresh" | null>(null);
  const [shortcutStatus, setShortcutStatus] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<"create" | "edit" | null>(null);
  const [draft, setDraft] = useState<ProjectPayload>(blankProject);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const selected = useMemo(
    () => projects.find((project) => project.id === selectedId) ?? null,
    [projects, selectedId]
  );

  const loadSummaries = useCallback(async (items: ProjectDto[]) => {
    const entries = await Promise.all(items.map(async (project) => {
      try {
        const [workOrdersResult, health] = await Promise.all([
          api.projectWorkOrders(project.id).catch(() => ({ workOrders: [] as WorkOrderDto[] })),
          api.getProjectContextHealth(project.id).catch(() => null)
        ]);
        const active = workOrdersResult.workOrders.filter((order) => !["COMPLETED", "ARCHIVED", "CANCELLED"].includes(order.status));
        const affected = health?.openWorkOrders.filter((order) => !["COMPLETED", "ARCHIVED", "CANCELLED"].includes(order.status)).length
          ?? active.filter((order) => order.contextBindingStatus && order.contextBindingStatus !== "FRESH").length;
        const lastContextBoundAt = health?.openWorkOrders
          .map((order) => order.contextBoundAt)
          .filter((value): value is string => Boolean(value))
          .sort()
          .at(-1) ?? null;
        return [project.id, {
          contextStatus: health?.status ?? deriveContextStatus(active),
          activeWorkCount: active.length,
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
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await api.projects({
        q: filters.query || undefined,
        status: filters.status || undefined,
        priority: filters.priority || undefined
      });
      setProjects(response.projects);
      setSelectedId((current) => current && response.projects.some((project) => project.id === current)
        ? current
        : response.projects[0]?.id ?? null);
      void loadSummaries(response.projects);
    } catch (error) {
      setProjects([]);
      setSummaries({});
      setLoadError(error instanceof Error ? error.message : "Unable to load projects");
    } finally {
      setLoading(false);
    }
  }, [filters, loadSummaries]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 200);
    return () => window.clearTimeout(timer);
  }, [load]);

  function selectProject(project: ProjectDto) {
    setSelectedId(project.id);
    setShortcutStatus(null);
  }

  function openCreate() {
    setDraft({ ...blankProject });
    setSaveError(null);
    setEditorMode("create");
  }

  function openEdit() {
    if (!selected) return;
    setDraft(toProjectPayload(selected));
    setSaveError(null);
    setEditorMode("edit");
  }

  async function saveProject(event: FormEvent) {
    event.preventDefault();
    if (!canEdit) return;
    setSaving(true);
    setSaveError(null);
    try {
      const response = editorMode === "edit" && selected
        ? await api.updateProject(selected.id, cleanProjectPayload(draft))
        : await api.createProject(cleanProjectPayload(draft));
      setEditorMode(null);
      await load();
      setSelectedId(response.project.id);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Unable to save project");
    } finally {
      setSaving(false);
    }
  }

  async function runSelectedScan() {
    if (!selected || !canEdit) return;
    setShortcutBusy("scan");
    setShortcutStatus(null);
    try {
      const localDocs = await api.getProjectLocalDocs(selected.id);
      const root = localDocs.roots.find((item) => item.isActive) ?? localDocs.roots[0];
      if (!root) {
        setShortcutStatus("No local document root configured. Open Context Workspace to add one.");
        return;
      }
      await api.scanProjectLocalDocumentRoot(selected.id, root.id);
      setShortcutStatus("Local docs scan complete.");
      await loadSummaries(projects);
    } catch (error) {
      setShortcutStatus(error instanceof Error ? error.message : "Local docs scan failed.");
    } finally {
      setShortcutBusy(null);
    }
  }

  async function refreshSelectedContext() {
    if (!selected || !canEdit) return;
    setShortcutBusy("refresh");
    setShortcutStatus(null);
    try {
      const response = await api.rebindProjectContexts(selected.id);
      setShortcutStatus(`Context refresh complete: ${response.result.repaired} repaired, ${response.result.skipped} skipped.`);
      await loadSummaries(projects);
    } catch (error) {
      setShortcutStatus(error instanceof Error ? error.message : "Context refresh failed.");
    } finally {
      setShortcutBusy(null);
    }
  }

  return {
    canEdit, projects, selected, selectedId, filters, setFilters, summaries, loading, loadError, load,
    selectProject, openCreate, openEdit, editorMode, closeEditor: () => setEditorMode(null), draft, setDraft,
    saveError, saving, saveProject, shortcutBusy, shortcutStatus, runSelectedScan, refreshSelectedContext
  };
}
