import { Plus } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { useTk } from "@/lib/i18n";
import { useAuthStore } from "@/stores/authStore";
import { ArtifactArchive, ArtifactMetrics } from "./artifacts/ArtifactArchive";
import { ArtifactDetail } from "./artifacts/ArtifactDetail";
import { ArtifactDeleteDialog, ArtifactEditorDialog } from "./artifacts/ArtifactEditorDialog";
import { useArtifactsController } from "./artifacts/useArtifactsController";

export function ArtifactsPage() {
  const tk = useTk();
  const user = useAuthStore((state) => state.user);
  const controller = useArtifactsController(user);
  return (
    <>
      <PageHeader eyebrow={tk("artifacts.eyebrow")} title={tk("artifacts.title")} description={tk("artifacts.description")} action={controller.canCreate ? <Button className="min-h-11" onClick={controller.openCreate}><Plus className="h-4 w-4" />{tk("artifacts.create")}</Button> : undefined} />
      <ArtifactMetrics artifacts={controller.visibleArtifacts} />
      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(360px,0.78fr)_minmax(0,1.22fr)]">
        <ArtifactArchive artifacts={controller.visibleArtifacts} projects={controller.projects} selectedId={controller.selected?.id ?? controller.selectedId} filters={controller.filters} loading={controller.loading} error={controller.loadError} onSelect={controller.setSelectedId} onFiltersChange={controller.updateFilters} onClear={controller.clearFilters} onRetry={() => void controller.load()} />
        <ArtifactDetail artifact={controller.selected} canEdit={controller.canEdit} canDelete={controller.canDelete} busy={controller.busyAction !== null} error={controller.actionError} onEdit={controller.openEdit} onArchiveDuplicate={() => void controller.archiveDuplicate()} onDelete={() => controller.selected && controller.setDeleteTarget(controller.selected)} />
      </div>
      {controller.editorMode ? <ArtifactEditorDialog mode={controller.editorMode} projects={controller.projects} draft={controller.draft} error={controller.saveError} saving={controller.saving} onChange={controller.setDraft} onClose={controller.closeEditor} onSubmit={controller.saveArtifact} /> : null}
      {controller.deleteTarget ? <ArtifactDeleteDialog artifact={controller.deleteTarget} busy={controller.busyAction === "delete"} onClose={() => controller.setDeleteTarget(null)} onConfirm={() => void controller.confirmDelete()} /> : null}
    </>
  );
}
