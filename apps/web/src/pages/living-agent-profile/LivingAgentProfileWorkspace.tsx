import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { LoadingState } from "@/components/ui/LoadingState";
import { useTk } from "@/lib/i18n";
import { KnowledgeAuditSection } from "./KnowledgeAuditSection";
import { LivingAgentProfileHeader } from "./LivingAgentProfileHeader";
import { OverviewSection } from "./OverviewSection";
import { ProfileNavigation } from "./ProfileNavigation";
import { TimelineSection } from "./TimelineSection";
import { UsageTracesSection } from "./UsageTracesSection";
import { WorkRelationsSection } from "./WorkRelationsSection";
import type { LivingAgentProfileController } from "./useLivingAgentProfileController";

export function LivingAgentProfileWorkspace({
  controller,
}: {
  controller: LivingAgentProfileController;
}) {
  const tk = useTk();
  if (controller.loading)
    return <LoadingState message={tk("agentProfile.loading")} />;
  if (controller.error || !controller.profile)
    return (
      <div
        role="alert"
        className="border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive"
      >
        {controller.error ?? tk("agentProfile.notFound")}
      </div>
    );
  return (
    <div className="min-w-0 space-y-4">
      <Link
        aria-label={tk("agentProfile.backAria")}
        className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
        to="/living-agents"
      >
        <ArrowLeft className="h-4 w-4" />
        {tk("agentProfile.back")}
      </Link>
      <LivingAgentProfileHeader profile={controller.profile} />
      <ProfileNavigation
        active={controller.section}
        onChange={controller.setSection}
      />
      <div className="min-w-0">
        {controller.section === "overview" ? (
          <OverviewSection profile={controller.profile} />
        ) : controller.section === "timeline" ? (
          <TimelineSection controller={controller} />
        ) : controller.section === "work" ? (
          <WorkRelationsSection controller={controller} />
        ) : controller.section === "usage" ? (
          <UsageTracesSection profile={controller.profile} />
        ) : (
          <KnowledgeAuditSection controller={controller} />
        )}
      </div>
    </div>
  );
}
