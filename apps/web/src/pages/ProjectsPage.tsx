import { Plus } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { useTk } from "@/lib/i18n";
import { useAuthStore } from "@/stores/authStore";
import { ProjectEditorDialog } from "./projects/ProjectEditorDialog";
import { PortfolioMetrics, ProjectsPortfolio, SelectedProjectPanel } from "./projects/ProjectsPortfolio";
import { useProjectsController } from "./projects/useProjectsController";

export function ProjectsPage() {
  const tk = useTk();
  const user = useAuthStore((state) => state.user);
  const controller = useProjectsController(user);
  const selectedSummary = controller.selected ? controller.summaries[controller.selected.id] : undefined;

  return (
    <>
      <PageHeader
        eyebrow={tk("projects.eyebrow")}
        title={tk("projects.title")}
        description={tk("projects.description")}
        action={controller.canEdit ? <Button className="min-h-11" onClick={controller.openCreate}><Plus className="h-4 w-4" />{tk("projects.create")}</Button> : undefined}
      />

      <PortfolioMetrics projects={controller.projects} summaries={controller.summaries} />

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <ProjectsPortfolio
          projects={controller.projects}
          selectedId={controller.selectedId}
          summaries={controller.summaries}
          filters={controller.filters}
          loading={controller.loading}
          error={controller.loadError}
          onFiltersChange={controller.setFilters}
          onSelect={controller.selectProject}
          onRetry={() => void controller.load()}
        />
        <SelectedProjectPanel
          project={controller.selected}
          summary={selectedSummary}
          canEdit={controller.canEdit}
          busy={controller.shortcutBusy}
          statusMessage={controller.shortcutStatus}
          onEdit={controller.openEdit}
          onScan={() => void controller.runSelectedScan()}
          onRefresh={() => void controller.refreshSelectedContext()}
        />
      </div>

      {controller.editorMode ? (
        <ProjectEditorDialog
          mode={controller.editorMode}
          draft={controller.draft}
          error={controller.saveError}
          saving={controller.saving}
          onChange={controller.setDraft}
          onClose={controller.closeEditor}
          onSubmit={controller.saveProject}
        />
      ) : null}
    </>
  );
}
