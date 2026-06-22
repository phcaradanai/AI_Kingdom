import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  BriefcaseBusiness,
  DollarSign,
  FileSearch,
  Pencil,
  Plus,
  Search,
  Target,
  Workflow,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/input";
import { useTk } from "@/lib/i18n";
import type {
  ArtifactDto,
  KingdomAssetDto,
  KingdomObjectiveDto,
  KingdomOpportunityDto,
  RevenueStreamDto,
} from "@/types/api";
import { humanize, money, sourceRoute, type StrategyRecordType } from "./strategyModels";
import type { StrategyController } from "./useStrategyController";

export function StrategySectionContent({ controller }: { controller: StrategyController }) {
  if (controller.activeSection === "objectives") return <ObjectivesSection controller={controller} />;
  if (controller.activeSection === "opportunities") return <OpportunitiesSection controller={controller} />;
  if (controller.activeSection === "assets") return <AssetsSection controller={controller} />;
  if (controller.activeSection === "revenue") return <RevenueSection controller={controller} />;
  return null;
}

function ObjectivesSection({ controller }: { controller: StrategyController }) {
  const tk = useTk();
  return (
    <SectionFrame
      type="objectives"
      count={controller.filteredObjectives.length}
      statuses={["ALL", "ACTIVE", "PAUSED", "ACHIEVED", "ARCHIVED"]}
      controller={controller}
    >
      {controller.filteredObjectives.length === 0 ? (
        <EmptyState title={tk("strategy.empty.objectives")} description={tk("strategy.empty.objectivesDescription")} />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {controller.filteredObjectives.map((item) => (
            <ObjectiveRecord
              canEdit={controller.canEdit}
              item={item}
              key={item.id}
              onEdit={() => controller.openEdit("objectives", item)}
            />
          ))}
        </div>
      )}
    </SectionFrame>
  );
}

function OpportunitiesSection({ controller }: { controller: StrategyController }) {
  const tk = useTk();
  return (
    <SectionFrame
      type="opportunities"
      count={controller.filteredOpportunities.length}
      statuses={["ALL", "INBOX", "REVIEWING", "VALIDATING", "APPROVED", "REJECTED", "ARCHIVED"]}
      controller={controller}
    >
      {controller.filteredOpportunities.length === 0 ? (
        <EmptyState
          title={tk("strategy.empty.opportunities")}
          description={tk("strategy.empty.opportunitiesDescription")}
        />
      ) : (
        <div className="space-y-3">
          {controller.filteredOpportunities.map((item) => (
            <OpportunityRecord
              busy={controller.submitting === `work-order-${item.id}`}
              canEdit={controller.canEdit}
              item={item}
              key={item.id}
              onCreateWorkOrder={() => void controller.createWorkOrder(item)}
              onEdit={() => controller.openEdit("opportunities", item)}
            />
          ))}
        </div>
      )}
      <ResearchIntake
        artifacts={controller.researchArtifacts}
        canEdit={controller.canEdit}
        submitting={controller.submitting}
        onPromote={controller.promoteArtifact}
      />
    </SectionFrame>
  );
}

function AssetsSection({ controller }: { controller: StrategyController }) {
  const tk = useTk();
  return (
    <SectionFrame
      type="assets"
      count={controller.filteredAssets.length}
      statuses={["ALL", "IDEA", "BUILDING", "ACTIVE", "MONETIZING", "PAUSED", "ARCHIVED"]}
      controller={controller}
    >
      {controller.filteredAssets.length === 0 ? (
        <EmptyState title={tk("strategy.empty.assets")} description={tk("strategy.empty.assetsDescription")} />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {controller.filteredAssets.map((item) => (
            <AssetRecord
              canEdit={controller.canEdit}
              item={item}
              key={item.id}
              onEdit={() => controller.openEdit("assets", item)}
            />
          ))}
        </div>
      )}
    </SectionFrame>
  );
}

function RevenueSection({ controller }: { controller: StrategyController }) {
  const tk = useTk();
  return (
    <SectionFrame
      type="revenue"
      count={controller.filteredRevenue.length}
      statuses={["ALL", "PLANNED", "TESTING", "ACTIVE", "PAUSED", "ENDED"]}
      controller={controller}
    >
      {controller.filteredRevenue.length === 0 ? (
        <EmptyState title={tk("strategy.empty.revenue")} description={tk("strategy.empty.revenueDescription")} />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {controller.filteredRevenue.map((item) => (
            <RevenueRecord
              canEdit={controller.canEdit}
              item={item}
              key={item.id}
              onEdit={() => controller.openEdit("revenue", item)}
            />
          ))}
        </div>
      )}
    </SectionFrame>
  );
}

function SectionFrame({
  type,
  count,
  statuses,
  controller,
  children,
}: {
  type: StrategyRecordType;
  count: number;
  statuses: string[];
  controller: StrategyController;
  children: React.ReactNode;
}) {
  const tk = useTk();
  return (
    <section aria-label={tk(`strategy.section.${type}`)} className="mt-5">
      <div className="flex flex-col gap-4 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs font-semibold text-primary">{tk("strategy.recordCount", { count })}</div>
          <h2 className="mt-1 text-xl font-semibold">{tk(`strategy.section.${type}`)}</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            {tk(`strategy.section.${type}Description`)}
          </p>
        </div>
        {controller.canEdit ? (
          <Button className="min-h-11" onClick={() => controller.openCreate(type)}>
            <Plus className="h-4 w-4" />
            {tk(`strategy.new.${singular(type)}`)}
          </Button>
        ) : null}
      </div>
      <div className="my-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
        <label className="relative">
          <span className="sr-only">{tk("strategy.search")}</span>
          <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="min-h-11 pl-9"
            placeholder={tk("strategy.searchPlaceholder")}
            value={controller.query}
            onChange={(event) => controller.setQuery(event.target.value)}
          />
        </label>
        <label>
          <span className="sr-only">{tk("strategy.filterStatus")}</span>
          <select
            aria-label={tk("strategy.filterStatus")}
            className="min-h-11 w-full rounded-md border border-border bg-input px-3 text-sm"
            value={controller.status}
            onChange={(event) => controller.setStatus(event.target.value)}
          >
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status === "ALL" ? tk("strategy.allStatuses") : enumLabel(tk, status)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {children}
    </section>
  );
}

function ObjectiveRecord({
  item,
  canEdit,
  onEdit,
}: {
  item: KingdomObjectiveDto;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const tk = useTk();
  return (
    <article className="flex min-w-0 flex-col rounded-lg border border-border bg-card/60 p-4 transition-colors hover:border-primary/35">
      <RecordHeader
        icon={Target}
        title={item.title}
        status={item.status}
        canEdit={canEdit}
        editLabel={tk("strategy.edit.objective")}
        onEdit={onEdit}
      />
      <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground">
        {item.description || tk("strategy.noDescription")}
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <Datum label={tk("strategy.field.priority")} value={enumLabel(tk, item.priority)} />
        <Datum label={tk("strategy.metrics")} value={item.successMetrics?.length ?? 0} />
      </div>
      <RecordSources project={item.project} sourceId={item.sourceId} sourceType={item.sourceType} />
    </article>
  );
}

function OpportunityRecord({
  item,
  canEdit,
  busy,
  onEdit,
  onCreateWorkOrder,
}: {
  item: KingdomOpportunityDto;
  canEdit: boolean;
  busy: boolean;
  onEdit: () => void;
  onCreateWorkOrder: () => void;
}) {
  const tk = useTk();
  return (
    <article className="rounded-lg border border-border bg-card/60 p-4 transition-colors hover:border-primary/35">
      <RecordHeader
        icon={BriefcaseBusiness}
        title={item.title}
        status={item.status}
        canEdit={canEdit}
        editLabel={tk("strategy.edit.opportunity")}
        onEdit={onEdit}
      />
      <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div>
          <p className="text-sm leading-6 text-muted-foreground">
            {item.proposedValue || item.problem || tk("strategy.noSummary")}
          </p>
          {item.nextAction ? (
            <div className="mt-3 border-l-2 border-primary/60 pl-3 text-sm">
              <span className="block text-[11px] font-semibold uppercase text-muted-foreground">
                {tk("strategy.field.nextAction")}
              </span>
              <span className="mt-1 block leading-6">{item.nextAction}</span>
            </div>
          ) : null}
        </div>
        <dl className="grid grid-cols-2 gap-2">
          <Datum label={tk("strategy.field.score")} value={`${item.score}/100`} />
          <Datum label={tk("strategy.field.monthlyRevenue")} value={money(item.estimatedMonthlyRevenue)} />
          <Datum label={tk("strategy.field.priority")} value={enumLabel(tk, item.priority)} />
          <Datum label={tk("strategy.field.risk")} value={enumLabel(tk, item.riskLevel)} />
        </dl>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <RecordSources
          project={item.project}
          sourceId={item.sourceId}
          sourceType={item.sourceType}
          traceId={item.traceId}
        />
        {canEdit ? (
          <Button className="min-h-11" disabled={busy} variant="outline" onClick={onCreateWorkOrder}>
            <Workflow className="h-4 w-4" />
            {tk("strategy.createWorkOrder")}
          </Button>
        ) : null}
      </div>
    </article>
  );
}

function AssetRecord({ item, canEdit, onEdit }: { item: KingdomAssetDto; canEdit: boolean; onEdit: () => void }) {
  const tk = useTk();
  return (
    <article className="rounded-lg border border-border bg-card/60 p-4 transition-colors hover:border-primary/35">
      <RecordHeader
        icon={BarChart3}
        title={item.name}
        status={item.status}
        canEdit={canEdit}
        editLabel={tk("strategy.edit.asset")}
        onEdit={onEdit}
      />
      <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground">
        {item.valueHypothesis || item.description || tk("strategy.noHypothesis")}
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Datum label={tk("strategy.field.type")} value={enumLabel(tk, item.type)} />
        <Datum
          label={tk("strategy.estimatedNet")}
          value={money(item.monthlyRevenueEstimate - item.monthlyCostEstimate)}
        />
      </div>
      <RecordSources project={item.project} sourceId={item.sourceId} sourceType={item.sourceType} />
    </article>
  );
}

function RevenueRecord({ item, canEdit, onEdit }: { item: RevenueStreamDto; canEdit: boolean; onEdit: () => void }) {
  const tk = useTk();
  return (
    <article className="rounded-lg border border-border bg-card/60 p-4 transition-colors hover:border-primary/35">
      <RecordHeader
        icon={DollarSign}
        title={item.name}
        status={item.status}
        canEdit={canEdit}
        editLabel={tk("strategy.edit.revenue")}
        onEdit={onEdit}
      />
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Datum label={tk("strategy.monthlyNet")} value={money(item.monthlyRevenue - item.monthlyCost, item.currency)} />
        <Datum label={tk("strategy.field.model")} value={enumLabel(tk, item.model)} />
        <Datum label={tk("strategy.field.linkedAsset")} value={item.asset?.name ?? tk("strategy.noAssetLink")} />
        <Datum
          label={tk("strategy.field.confidence")}
          value={item.confidence === null ? tk("strategy.notRecorded") : `${Math.round(item.confidence * 100)}%`}
        />
      </div>
      <RecordSources project={item.project} sourceId={item.sourceId} sourceType={item.sourceType} />
    </article>
  );
}

function ResearchIntake({
  artifacts,
  canEdit,
  submitting,
  onPromote,
}: {
  artifacts: ArtifactDto[];
  canEdit: boolean;
  submitting: string | null;
  onPromote: (artifact: ArtifactDto) => void;
}) {
  const tk = useTk();
  return (
    <details className="mt-5 rounded-lg border border-border bg-muted/10">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
        <span className="flex items-center gap-2 font-semibold">
          <FileSearch className="h-4 w-4 text-primary" />
          {tk("strategy.researchIntake")}
        </span>
        <span className="text-xs text-muted-foreground">{tk("strategy.recordCount", { count: artifacts.length })}</span>
      </summary>
      <div className="space-y-3 border-t border-border p-4">
        {artifacts.length === 0 ? (
          <p className="text-sm text-muted-foreground">{tk("strategy.empty.research")}</p>
        ) : (
          artifacts.map((artifact) => (
            <div
              className="flex flex-col gap-3 border-b border-border pb-3 last:border-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between"
              key={artifact.id}
            >
              <div className="min-w-0">
                <h3 className="font-semibold">{artifact.title}</h3>
                <p className="mt-1 line-clamp-2 text-sm leading-6 text-muted-foreground">{artifact.content}</p>
                <div className="mt-2 flex flex-wrap gap-3 text-xs">
                  {artifact.sourceLink?.href ? (
                    <Link className="text-primary hover:underline" to={artifact.sourceLink.href}>
                      {artifact.sourceLink.label || tk("strategy.openSource")}
                    </Link>
                  ) : (
                    <Link className="text-primary hover:underline" to="/artifacts">
                      {tk("strategy.openArtifact")}
                    </Link>
                  )}
                  {artifact.project ? (
                    <Link className="text-primary hover:underline" to={`/projects/${artifact.project.id}`}>
                      {artifact.project.name}
                    </Link>
                  ) : null}
                </div>
              </div>
              {canEdit ? (
                <Button
                  className="min-h-11 shrink-0"
                  disabled={submitting === `artifact-${artifact.id}`}
                  variant="outline"
                  onClick={() => onPromote(artifact)}
                >
                  <ArrowRight className="h-4 w-4" />
                  {tk("strategy.promote")}
                </Button>
              ) : null}
            </div>
          ))
        )}
      </div>
    </details>
  );
}

function RecordHeader({
  icon: Icon,
  title,
  status,
  canEdit,
  editLabel,
  onEdit,
}: {
  icon: typeof Target;
  title: string;
  status: string;
  canEdit: boolean;
  editLabel: string;
  onEdit: () => void;
}) {
  const tk = useTk();
  return (
    <div className="flex min-w-0 items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-primary/25 bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h3 className="break-words font-semibold leading-6">{title}</h3>
          <span
            className="mt-1 inline-flex rounded-full border border-border bg-muted/20 px-2 py-0.5 text-[10px] font-semibold uppercase"
            title={status}
          >
            {enumLabel(tk, status)}
          </span>
        </div>
      </div>
      {canEdit ? (
        <button
          aria-label={editLabel}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:border-primary/50 hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary"
          onClick={onEdit}
          type="button"
        >
          <Pencil className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}

function RecordSources({
  project,
  sourceType,
  sourceId,
  traceId,
}: {
  project?: { id: string; name: string } | null;
  sourceType: string | null;
  sourceId: string | null;
  traceId?: string | null;
}) {
  const tk = useTk();
  const source = sourceRoute(sourceType, sourceId);
  if (!project && !source && !traceId)
    return (
      <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">{tk("strategy.ownedByLedger")}</p>
    );
  return (
    <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-border pt-3 text-xs">
      {project ? (
        <Link
          aria-label={tk("strategy.openProject")}
          className="inline-flex min-h-8 items-center gap-1 text-primary hover:underline"
          to={`/projects/${project.id}`}
        >
          {project.name}
          <ArrowUpRight className="h-3 w-3" />
        </Link>
      ) : null}
      {source ? (
        <Link
          aria-label={tk("strategy.openSourceRecord")}
          className="inline-flex min-h-8 items-center gap-1 text-primary hover:underline"
          to={source}
        >
          {sourceType ? humanize(sourceType) : tk("strategy.openSource")}
          <ArrowUpRight className="h-3 w-3" />
        </Link>
      ) : null}
      {traceId ? (
        <Link
          aria-label={tk("strategy.openUsageTrace")}
          className="inline-flex min-h-8 items-center gap-1 text-primary hover:underline"
          to={`/usage-traces/${traceId}`}
        >
          {tk("strategy.usageTrace")}
          <ArrowUpRight className="h-3 w-3" />
        </Link>
      ) : null}
    </div>
  );
}

function Datum({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0 rounded-md bg-muted/25 px-3 py-2">
      <dt className="text-[10px] font-semibold uppercase text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-sm font-medium tabular-nums">{value}</dd>
    </div>
  );
}
function singular(type: StrategyRecordType) {
  return type === "objectives"
    ? "objective"
    : type === "opportunities"
      ? "opportunity"
      : type === "assets"
        ? "asset"
        : "revenue";
}
function enumLabel(tk: ReturnType<typeof useTk>, value: string) {
  const label = tk(`strategy.enum.${value}`);
  return label === `strategy.enum.${value}` ? humanize(value) : label;
}
