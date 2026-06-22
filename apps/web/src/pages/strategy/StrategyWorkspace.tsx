import {
  ArrowUpRight,
  BarChart3,
  BookOpenCheck,
  BriefcaseBusiness,
  DollarSign,
  LayoutDashboard,
  RefreshCw,
  Target,
} from "lucide-react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { useTk } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { StrategySectionContent } from "./StrategyCollections";
import { StrategyOverview } from "./StrategyOverview";
import { StrategyRecordDialog } from "./StrategyRecordDialog";
import type { StrategySection } from "./strategyModels";
import type { StrategyController } from "./useStrategyController";

const sections: Array<{ id: StrategySection; icon: typeof LayoutDashboard }> = [
  { id: "overview", icon: LayoutDashboard },
  { id: "objectives", icon: Target },
  { id: "opportunities", icon: BriefcaseBusiness },
  { id: "assets", icon: BarChart3 },
  { id: "revenue", icon: DollarSign },
];

export function StrategyWorkspace({ controller }: { controller: StrategyController }) {
  const tk = useTk();
  const overview = controller.overview!;
  return (
    <>
      <PageHeader
        eyebrow={tk("strategy.eyebrow")}
        title={tk("strategy.title")}
        description={tk("strategy.description")}
        action={
          <Button
            className="min-h-11"
            variant="outline"
            disabled={controller.refreshing}
            onClick={() => void controller.load(true)}
          >
            <RefreshCw className={cn("h-4 w-4", controller.refreshing && "animate-spin")} />
            {tk("strategy.refresh")}
          </Button>
        }
      />
      {controller.error ? (
        <div className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">
          {controller.error}
        </div>
      ) : null}
      {controller.notice ? (
        <div className="mb-4 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">
          {controller.notice}
        </div>
      ) : null}
      {!controller.canEdit ? (
        <div className="mb-4 rounded-md border border-border bg-muted/20 p-3 text-sm text-muted-foreground">
          <strong className="text-foreground">{tk("strategy.readOnlyTitle")}</strong>
          <span className="ml-1">{tk("strategy.readOnlyDescription")}</span>
        </div>
      ) : null}

      <StrategyOverview overview={overview} onOpenSection={controller.changeSection} />
      <StrategyNavigation
        active={controller.activeSection}
        counts={{
          objectives: controller.objectives.length,
          opportunities: controller.opportunities.length,
          assets: controller.assets.length,
          revenue: controller.revenueStreams.length,
        }}
        onChange={controller.changeSection}
      />
      {controller.activeSection === "overview" ? (
        <OverviewDigest controller={controller} />
      ) : (
        <StrategySectionContent controller={controller} />
      )}

      {controller.editor ? (
        <StrategyRecordDialog
          assets={controller.assets}
          editor={controller.editor}
          error={controller.error}
          saving={controller.submitting === "record"}
          onClose={controller.closeEditor}
          onSave={controller.saveRecord}
        />
      ) : null}
    </>
  );
}

function StrategyNavigation({
  active,
  counts,
  onChange,
}: {
  active: StrategySection;
  counts: Record<Exclude<StrategySection, "overview">, number>;
  onChange: (section: StrategySection) => void;
}) {
  const tk = useTk();
  return (
    <nav aria-label={tk("strategy.sectionsNav")} className="mt-5 overflow-x-auto border-b border-border">
      <div className="flex min-w-max gap-1">
        {sections.map(({ id, icon: Icon }) => (
          <button
            aria-label={tk(`strategy.nav.${id}`)}
            aria-pressed={active === id}
            className={cn(
              "inline-flex min-h-11 min-w-32 items-center justify-center gap-2 border-b-2 px-3 py-2 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-inset",
              active === id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
            )}
            key={id}
            onClick={() => onChange(id)}
            type="button"
          >
            <Icon className="h-4 w-4" />
            <span>{tk(`strategy.nav.${id}`)}</span>
            {id !== "overview" ? (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] tabular-nums">{counts[id]}</span>
            ) : null}
          </button>
        ))}
      </div>
    </nav>
  );
}

function OverviewDigest({ controller }: { controller: StrategyController }) {
  const tk = useTk();
  const topOpportunity = controller.overview?.opportunities.top[0] ?? controller.opportunities[0];
  const activeObjective = controller.overview?.activeObjectives[0] ?? controller.objectives[0];
  const activeRevenue = controller.overview?.activeRevenueStreams[0] ?? controller.revenueStreams[0];
  return (
    <section aria-label={tk("strategy.overview.digest")} className="mt-5">
      <div className="flex items-end justify-between gap-4 border-b border-border pb-4">
        <div>
          <h2 className="text-xl font-semibold">{tk("strategy.overview.title")}</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{tk("strategy.overview.description")}</p>
        </div>
      </div>
      <div className="grid gap-3 py-4 lg:grid-cols-3">
        <DigestItem
          icon={Target}
          label={tk("strategy.overview.leadingObjective")}
          title={activeObjective?.title}
          empty={tk("strategy.empty.objectives")}
          onOpen={() => controller.changeSection("objectives")}
        />
        <DigestItem
          icon={BriefcaseBusiness}
          label={tk("strategy.overview.leadingOpportunity")}
          title={topOpportunity?.title}
          empty={tk("strategy.empty.opportunities")}
          onOpen={() => controller.changeSection("opportunities")}
        />
        <DigestItem
          icon={DollarSign}
          label={tk("strategy.overview.leadingRevenue")}
          title={activeRevenue?.name}
          empty={tk("strategy.empty.revenue")}
          onOpen={() => controller.changeSection("revenue")}
        />
      </div>
      <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-2 xl:grid-cols-4">
        <SourceLink
          to="/projects"
          label={tk("strategy.source.projects")}
          description={tk("strategy.source.projectsDescription")}
        />
        <SourceLink
          to="/artifacts"
          label={tk("strategy.source.artifacts")}
          description={tk("strategy.source.artifactsDescription")}
        />
        <SourceLink
          to="/reports"
          label={tk("strategy.source.reports")}
          description={tk("strategy.source.reportsDescription")}
        />
        <SourceLink
          to="/work-orders"
          label={tk("strategy.source.workOrders")}
          description={tk("strategy.source.workOrdersDescription")}
        />
      </div>
    </section>
  );
}

function DigestItem({
  icon: Icon,
  label,
  title,
  empty,
  onOpen,
}: {
  icon: typeof Target;
  label: string;
  title?: string;
  empty: string;
  onOpen: () => void;
}) {
  return (
    <button
      className="flex min-h-28 w-full items-start gap-3 rounded-lg border border-border bg-card/60 p-4 text-left transition hover:border-primary/45 hover:bg-primary/5 focus:outline-none focus:ring-2 focus:ring-primary"
      onClick={onOpen}
      type="button"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-primary/25 bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] font-semibold uppercase text-muted-foreground">{label}</span>
        <span className="mt-2 block break-words text-sm font-semibold leading-6">{title || empty}</span>
      </span>
    </button>
  );
}

function SourceLink({ to, label, description }: { to: string; label: string; description: string }) {
  return (
    <Link
      className="flex min-w-0 items-start justify-between gap-3 rounded-lg border border-border bg-muted/10 p-3 transition hover:border-primary/45 hover:bg-primary/5"
      to={to}
    >
      <span className="min-w-0">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <BookOpenCheck className="h-4 w-4 text-primary" />
          {label}
        </span>
        <span className="mt-1 block text-xs leading-5 text-muted-foreground">{description}</span>
      </span>
      <ArrowUpRight className="h-4 w-4 shrink-0 text-primary" />
    </Link>
  );
}
