import {
  ArrowUpRight,
  FileText,
  FolderKanban,
  Network,
  ScrollText,
} from "lucide-react";
import { Link } from "react-router-dom";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { useTk } from "@/lib/i18n";
import { formatDate } from "@/lib/utils";
import type { LivingAgentRelationsDto } from "@/types/api";
import { SectionLoadError } from "./SectionLoadError";
import type { LivingAgentProfileController } from "./useLivingAgentProfileController";

export function WorkRelationsSection({
  controller,
}: {
  controller: LivingAgentProfileController;
}) {
  const tk = useTk();
  if (controller.relationsLoading)
    return <LoadingState message={tk("agentProfile.work.loading")} />;
  if (controller.relationsError)
    return (
      <SectionLoadError
        message={tk("agentProfile.work.error")}
        onRetry={() => void controller.loadRelations()}
      />
    );
  if (!controller.relations)
    return (
      <EmptyState
        icon={Network}
        title={tk("agentProfile.work.empty")}
        description={tk("agentProfile.work.emptyDescription")}
      />
    );
  const { nodes } = controller.relations;
  return (
    <section
      aria-label={tk("agentProfile.work.aria")}
      className="grid min-w-0 gap-px border border-border bg-border md:grid-cols-2"
    >
      <Group title={tk("agentProfile.work.projects")} icon={FolderKanban}>
        {nodes.projects.length ? (
          nodes.projects.map((item) => (
            <OwnerLink
              aria={tk("agentProfile.work.openProject", { name: item.name })}
              key={item.id}
              primary={item.name}
              secondary={item.status}
              to={`/projects/${item.id}`}
            />
          ))
        ) : (
          <None />
        )}
      </Group>
      <Group title={tk("agentProfile.work.tasks")} icon={ScrollText}>
        {nodes.tasks.length ? (
          nodes.tasks.map((item) => (
            <OwnerLink
              aria={tk("agentProfile.work.openTask", { title: item.title })}
              key={item.id}
              primary={item.title}
              secondary={`${item.mode} · ${item.status}`}
              to="/council"
            />
          ))
        ) : (
          <None />
        )}
      </Group>
      <Group title={tk("agentProfile.work.council")} icon={ScrollText}>
        {nodes.councilSessions.length ? (
          nodes.councilSessions.map((item) => (
            <OwnerLink
              aria={tk("agentProfile.work.openCouncil")}
              key={item.id}
              primary={tk("agentProfile.work.councilSession")}
              secondary={`${item.status} · ${formatDate(item.createdAt)}`}
              to="/council"
            />
          ))
        ) : (
          <None />
        )}
      </Group>
      <Group title={tk("agentProfile.work.reports")} icon={FileText}>
        {nodes.reports.length ? (
          nodes.reports.map((item) => (
            <OwnerLink
              aria={tk("agentProfile.work.openReport", { title: item.title })}
              key={item.id}
              primary={item.title}
              secondary={`${item.category} · ${formatDate(item.createdAt)}`}
              to="/reports"
            />
          ))
        ) : (
          <None />
        )}
      </Group>
    </section>
  );
}
function Group({
  children,
  icon: Icon,
  title,
}: {
  children: React.ReactNode;
  icon: typeof Network;
  title: string;
}) {
  return (
    <div className="min-w-0 bg-card/55 p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Icon className="h-4 w-4 text-primary" />
        {title}
      </h2>
      <div className="mt-2 divide-y divide-border">{children}</div>
    </div>
  );
}
function OwnerLink({
  aria,
  primary,
  secondary,
  to,
}: {
  aria: string;
  primary: string;
  secondary: string;
  to: string;
}) {
  return (
    <Link
      aria-label={aria}
      className="flex min-h-14 min-w-0 items-center gap-3 py-2 transition-colors hover:text-primary"
      to={to}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-foreground">
          {primary}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {secondary}
        </span>
      </span>
      <ArrowUpRight className="h-4 w-4 shrink-0" />
    </Link>
  );
}
function None() {
  const tk = useTk();
  return (
    <p className="py-4 text-sm text-muted-foreground">
      {tk("agentProfile.noneLinked")}
    </p>
  );
}
