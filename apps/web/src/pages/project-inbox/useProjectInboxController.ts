import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { ProjectDto, ProjectInboxItemDto, PublicUser } from "@/types/api";
import {
  initialProjectInboxFilters,
  matchesProjectInboxSearch,
  type ProjectInboxFilters
} from "./projectInboxModels";

export function useProjectInboxController(user: PublicUser | null) {
  const canAssign = user?.role === "KING" || user?.role === "CROWN_PRINCE";
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [items, setItems] = useState<ProjectInboxItemDto[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filters, setFilters] = useState<ProjectInboxFilters>(initialProjectInboxFilters);
  const [assignmentTargets, setAssignmentTargets] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [projectResponse, inboxResponse] = await Promise.all([
        api.projects(),
        api.projectInbox({
          status: filters.status || undefined,
          dataQuality: filters.dataQuality || undefined,
          routingQuality: filters.routingQuality || undefined,
          includeTestData: filters.includeTestData,
          includeDebug: filters.includeDebug,
          sourceType: filters.sourceType || undefined,
          suggestedProjectId: filters.suggestedProjectId || undefined,
          ...(filters.confidence === "none" ? { confidenceMax: 0 } : {}),
          ...(filters.confidence === "low" ? { confidenceMin: 1, confidenceMax: 39 } : {}),
          ...(filters.confidence === "medium" ? { confidenceMin: 40, confidenceMax: 69 } : {}),
          ...(filters.confidence === "high" ? { confidenceMin: 70 } : {})
        })
      ]);
      setProjects(projectResponse.projects);
      setItems(inboxResponse.inboxItems);
      setSelectedId((current) => inboxResponse.inboxItems.some((item) => item.id === current)
        ? current
        : inboxResponse.inboxItems[0]?.id ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load project routing inbox");
    } finally {
      setLoading(false);
    }
  }, [filters.confidence, filters.dataQuality, filters.includeDebug, filters.includeTestData, filters.routingQuality, filters.sourceType, filters.status, filters.suggestedProjectId]);

  useEffect(() => { void load(); }, [load]);

  const visibleItems = useMemo(
    () => items.filter((item) => matchesProjectInboxSearch(item, filters.query)),
    [filters.query, items]
  );
  const selected = useMemo(
    () => visibleItems.find((item) => item.id === selectedId) ?? visibleItems[0] ?? null,
    [selectedId, visibleItems]
  );
  const selectedIds = useMemo(
    () => Object.entries(checked).filter(([, value]) => value).map(([id]) => id),
    [checked]
  );
  const sourceTypes = useMemo(() => [...new Set(items.map((item) => item.sourceType))].sort(), [items]);

  function updateFilters(next: ProjectInboxFilters) {
    setFilters(next);
    if (next.query !== filters.query) setSelectedId(null);
  }

  function clearFilters() {
    setFilters(initialProjectInboxFilters);
  }

  function toggleChecked(id: string, value: boolean) {
    setChecked((current) => ({ ...current, [id]: value }));
  }

  async function runAction(key: string, action: () => Promise<unknown>, clearSelection = false) {
    setBusyAction(key);
    setActionError(null);
    try {
      await action();
      if (clearSelection) setChecked({});
      await load();
    } catch (requestError) {
      setActionError(requestError instanceof Error ? requestError.message : "Unable to update routing decision");
    } finally {
      setBusyAction(null);
    }
  }

  async function assign(item: ProjectInboxItemDto) {
    const projectId = assignmentTargets[item.id] || item.candidateProjectIds[0];
    if (projectId) await runAction(`assign:${item.id}`, () => api.assignProjectInboxItem(item.id, projectId));
  }

  const dismiss = (item: ProjectInboxItemDto) => runAction(`dismiss:${item.id}`, () => api.dismissProjectInboxItem(item.id));
  const archive = (item: ProjectInboxItemDto) => runAction(`archive:${item.id}`, () => api.archiveProjectInboxItem(item.id));
  const bulkDismiss = () => runAction("bulk-dismiss", () => api.bulkDismissProjectInboxItems(selectedIds), true);
  const bulkArchive = () => runAction("bulk-archive", () => api.bulkArchiveProjectInboxItems(selectedIds), true);
  const bulkAssign = () => {
    const projectId = assignmentTargets.__bulk || filters.suggestedProjectId;
    return projectId
      ? runAction("bulk-assign", () => api.bulkAssignProjectInboxItems(selectedIds, projectId), true)
      : Promise.resolve();
  };
  const archiveLowConfidence = () => runAction("archive-low", () => api.archiveLowConfidenceProjectInboxItems(39), true);

  return {
    canAssign, projects, items, visibleItems, selected, selectedId, setSelectedId,
    filters, updateFilters, clearFilters, sourceTypes,
    assignmentTargets, setAssignmentTargets, checked, toggleChecked, selectedIds,
    loading, error, actionError, busyAction, load,
    assign, dismiss, archive, bulkAssign, bulkDismiss, bulkArchive, archiveLowConfidence
  };
}
