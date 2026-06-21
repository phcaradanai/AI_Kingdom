import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type {
  LocalDocumentRootDto,
  LocalDocumentSnapshotDto,
  ObsidianExportDto,
  ProjectContextHealthDto,
  PublicUser,
  RepositorySnapshotDto
} from "@/types/api";
import type { ProjectWorkspaceData } from "./projectDetailModels";

export function useProjectDetailController(id: string | undefined, user: PublicUser | null) {
  const canEditLocalDocs = user?.role === "KING" || user?.role === "CROWN_PRINCE";
  const isKing = user?.role === "KING";
  const [data, setData] = useState<ProjectWorkspaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [repoSnapshot, setRepoSnapshot] = useState<RepositorySnapshotDto | null>(null);
  const [repoScanning, setRepoScanning] = useState(false);
  const [repoError, setRepoError] = useState<string | null>(null);
  const [localDocRoots, setLocalDocRoots] = useState<LocalDocumentRootDto[]>([]);
  const [localDocSnapshot, setLocalDocSnapshot] = useState<LocalDocumentSnapshotDto | null>(null);
  const [localDocsError, setLocalDocsError] = useState<string | null>(null);
  const [localDocsScanningRootId, setLocalDocsScanningRootId] = useState<string | null>(null);
  const [contextHealth, setContextHealth] = useState<ProjectContextHealthDto | null>(null);
  const [contextActionStatus, setContextActionStatus] = useState<string | null>(null);
  const [contextActionLoading, setContextActionLoading] = useState(false);
  const [showAddRootForm, setShowAddRootForm] = useState(false);
  const [newRootName, setNewRootName] = useState("");
  const [newRootPath, setNewRootPath] = useState("");
  const [addingRoot, setAddingRoot] = useState(false);
  const [previewRootId, setPreviewRootId] = useState<string | null>(null);
  const [previewPath, setPreviewPath] = useState("");
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [exportPayload, setExportPayload] = useState<ObsidianExportDto | null>(null);
  const [exportLoading, setExportLoading] = useState(false);

  const loadContextHealth = useCallback(async () => {
    if (!id) return;
    try {
      setContextHealth(await api.getProjectContextHealth(id));
    } catch {
      setContextHealth(null);
    }
  }, [id]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [overview, tasks, matters, workOrders, reports, memories, artifacts, repoResult, localDocsResult] = await Promise.all([
        api.projectOverview(id), api.projectTasks(id), api.projectMatters(id), api.projectWorkOrders(id),
        api.projectReports(id), api.projectMemories(id), api.projectArtifacts(id),
        api.getProjectRepositorySnapshot(id).catch(() => ({ snapshot: null })),
        api.getProjectLocalDocs(id).catch(() => ({ roots: [], snapshot: null }))
      ]);
      setData({
        overview, tasks: tasks.tasks, matters: matters.matters, workOrders: workOrders.workOrders,
        reports: reports.reports, memories: memories.memories, artifacts: artifacts.artifacts
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
  }, [id, loadContextHealth]);

  useEffect(() => { void load(); }, [load]);

  async function scanLocalDocsRoot(rootId: string) {
    if (!id) return;
    setLocalDocsScanningRootId(rootId);
    setLocalDocsError(null);
    try {
      const snapshot = await api.scanProjectLocalDocumentRoot(id, rootId);
      const refreshed = await api.getProjectLocalDocs(id);
      setLocalDocRoots(refreshed.roots);
      setLocalDocSnapshot(refreshed.snapshot ?? snapshot);
      await loadContextHealth();
    } catch (scanError) {
      setLocalDocsError(scanError instanceof Error ? scanError.message : "Scan failed");
    } finally {
      setLocalDocsScanningRootId(null);
    }
  }

  async function runLocalDocsScan() {
    const root = localDocRoots.find((item) => item.isActive) ?? localDocRoots[0];
    if (!root) {
      setLocalDocsError("No local document root is configured for this project.");
      return;
    }
    await scanLocalDocsRoot(root.id);
  }

  async function addLocalDocRoot() {
    if (!id || !newRootName.trim() || !newRootPath.trim()) return;
    setAddingRoot(true);
    setLocalDocsError(null);
    try {
      const root = await api.addProjectLocalDocumentRoot(id, { name: newRootName.trim(), rootPath: newRootPath.trim() });
      setLocalDocRoots((current) => [...current, root]);
      setNewRootName("");
      setNewRootPath("");
      setShowAddRootForm(false);
    } catch (addError) {
      setLocalDocsError(addError instanceof Error ? addError.message : "Failed to add local document root");
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
    } catch (readError) {
      setPreviewError(readError instanceof Error ? readError.message : "Unable to read file");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function scanRepository() {
    if (!id) return;
    setRepoScanning(true);
    setRepoError(null);
    try {
      const result = await api.scanProjectRepository(id);
      setRepoSnapshot(result.snapshot);
      await loadContextHealth();
    } catch (scanError) {
      setRepoError(scanError instanceof Error ? scanError.message : "Scan failed");
    } finally {
      setRepoScanning(false);
    }
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
    } catch (refreshError) {
      setContextActionStatus(refreshError instanceof Error ? refreshError.message : "Unable to refresh context");
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
    } catch (reconcileError) {
      setContextActionStatus(reconcileError instanceof Error ? reconcileError.message : "Unable to reconcile old work orders");
    } finally {
      setContextActionLoading(false);
    }
  }

  async function exportObsidian() {
    if (!id) return;
    setExportLoading(true);
    try {
      setExportPayload(await api.exportProjectObsidian(id));
    } finally {
      setExportLoading(false);
    }
  }

  const decisions = useMemo(
    () => data?.memories.filter((memory) => memory.type === "DECISION").slice(0, 5) ?? [],
    [data]
  );

  return {
    id, data, project: data?.overview.project ?? null, decisions, loading, error, load,
    canEditLocalDocs, isKing, repoSnapshot, repoScanning, repoError, scanRepository,
    localDocRoots, localDocSnapshot, localDocsError, localDocsScanningRootId, scanLocalDocsRoot,
    runLocalDocsScan, showAddRootForm, setShowAddRootForm, newRootName, setNewRootName,
    newRootPath, setNewRootPath, addingRoot, addLocalDocRoot, previewRootId, setPreviewRootId,
    previewPath, setPreviewPath, previewContent, previewError, previewLoading, previewLocalDocFile,
    contextHealth, contextActionStatus, contextActionLoading, refreshProjectContexts, reconcileOldWorkOrders,
    exportPayload, exportLoading, exportObsidian
  };
}

export type ProjectDetailController = ReturnType<typeof useProjectDetailController>;
