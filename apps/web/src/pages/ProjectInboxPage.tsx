import { PageHeader } from "@/components/PageHeader";
import { useTk } from "@/lib/i18n";
import { useAuthStore } from "@/stores/authStore";
import { ProjectInboxDetail } from "./project-inbox/ProjectInboxDetail";
import { ProjectInboxQueue } from "./project-inbox/ProjectInboxQueue";
import { ProjectInboxMetrics, ProjectInboxToolbar } from "./project-inbox/ProjectInboxToolbar";
import { useProjectInboxController } from "./project-inbox/useProjectInboxController";

export function ProjectInboxPage() {
  const tk = useTk();
  const user = useAuthStore((state) => state.user);
  const controller = useProjectInboxController(user);

  return (
    <>
      <PageHeader eyebrow={tk("projectInbox.eyebrow")} title={tk("projectInbox.title")} description={tk("projectInbox.description")} />
      <ProjectInboxMetrics items={controller.visibleItems} />
      <ProjectInboxToolbar
        filters={controller.filters}
        projects={controller.projects}
        sourceTypes={controller.sourceTypes}
        selectedCount={controller.selectedIds.length}
        assignmentTarget={controller.assignmentTargets.__bulk ?? ""}
        canAssign={controller.canAssign}
        busy={controller.busyAction !== null}
        onFiltersChange={controller.updateFilters}
        onAssignmentTargetChange={(projectId) => controller.setAssignmentTargets((current) => ({ ...current, __bulk: projectId }))}
        onClear={controller.clearFilters}
        onBulkAssign={() => void controller.bulkAssign()}
        onBulkDismiss={() => void controller.bulkDismiss()}
        onBulkArchive={() => void controller.bulkArchive()}
        onArchiveLow={() => void controller.archiveLowConfidence()}
      />
      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.72fr)]">
        <ProjectInboxQueue items={controller.visibleItems} projects={controller.projects} selectedId={controller.selected?.id ?? controller.selectedId} checked={controller.checked} canAssign={controller.canAssign} loading={controller.loading} error={controller.error} onSelect={controller.setSelectedId} onCheck={controller.toggleChecked} onRetry={() => void controller.load()} />
        <ProjectInboxDetail item={controller.selected} projects={controller.projects} assignmentTarget={controller.selected ? controller.assignmentTargets[controller.selected.id] ?? "" : ""} canAssign={controller.canAssign} busy={controller.busyAction !== null} error={controller.actionError} onAssignmentTargetChange={(projectId) => controller.selected && controller.setAssignmentTargets((current) => ({ ...current, [controller.selected!.id]: projectId }))} onAssign={() => controller.selected && void controller.assign(controller.selected)} onDismiss={() => controller.selected && void controller.dismiss(controller.selected)} onArchive={() => controller.selected && void controller.archive(controller.selected)} />
      </div>
    </>
  );
}
