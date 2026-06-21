import { ArrowLeft, RefreshCw } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useTk } from "@/lib/i18n";
import { useAuthStore } from "@/stores/authStore";
import { ProjectHealthPanel } from "./project-detail/ProjectHealthPanel";
import { ProjectLocalDocsSection } from "./project-detail/ProjectLocalDocsSection";
import {
  ProjectArtifactsSection,
  ProjectExportSection,
  ProjectMetricStrip,
  ProjectOverviewSection,
  ProjectRepositorySection,
  ProjectSectionNavigation,
  ProjectWorkSection
} from "./project-detail/ProjectWorkspaceSections";
import { useProjectDetailController } from "./project-detail/useProjectDetailController";

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const user = useAuthStore((state) => state.user);
  const tk = useTk();
  const controller = useProjectDetailController(id, user);

  if (!controller.project) {
    return (
      <>
        <PageHeader eyebrow={tk("projectDetail.eyebrow")} title={tk("projectDetail.loadingTitle")} description={tk("projectDetail.loadingDescription")} />
        {controller.loading ? <ProjectLoadingState /> : null}
        {controller.error ? (
          <Card className="border-red-500/40 bg-red-500/10">
            <h2 className="text-lg font-semibold">{tk("projectDetail.loadError")}</h2>
            <p className="mt-2 text-sm text-red-100">{controller.error}</p>
            <Button className="mt-4" variant="outline" onClick={() => void controller.load()}><RefreshCw className="h-4 w-4" />{tk("projects.retry")}</Button>
          </Card>
        ) : null}
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow={tk("projectDetail.eyebrow")}
        title={controller.project.name}
        description={controller.project.description || tk("projectDetail.description")}
        action={<Link to="/projects"><Button className="min-h-11" variant="outline"><ArrowLeft className="h-4 w-4" />{tk("projectDetail.allProjects")}</Button></Link>}
      />
      <ProjectHealthPanel controller={controller} />
      <ProjectMetricStrip controller={controller} />
      <ProjectSectionNavigation />
      <div className="space-y-10">
        <ProjectOverviewSection controller={controller} />
        <ProjectWorkSection controller={controller} />
        <ProjectLocalDocsSection controller={controller} />
        <ProjectRepositorySection controller={controller} />
        <ProjectArtifactsSection controller={controller} />
        <ProjectExportSection controller={controller} />
      </div>
    </>
  );
}

function ProjectLoadingState() {
  return <div className="grid gap-4">{[0, 1, 2].map((item) => <Card key={item}><div className="h-5 w-1/3 animate-pulse rounded bg-muted/50" /><div className="mt-4 h-3 animate-pulse rounded bg-muted/30" /><div className="mt-2 h-3 w-2/3 animate-pulse rounded bg-muted/30" /></Card>)}</div>;
}
