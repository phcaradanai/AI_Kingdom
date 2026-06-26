import {
  ArrowLeft,
  ArrowUpRight,
  Copy,
  Database,
  Edit2,
  GitBranch,
  Power,
  Route,
  Trash2,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useTk } from "@/lib/i18n";
import { getModelDisplayName, getProviderDisplayName } from "@/lib/providerDisplay";
import { cn, formatDate } from "@/lib/utils";
import type { ProviderModelSnapshotDto, RouteChainDto } from "@/types/api";
import {
  ChainStatusBadge,
  CredentialBadge,
  HealthDot,
  HealthLabel,
} from "./RoutingBadges";
import {
  DETAIL_SECTIONS,
  getEnabledEntries,
  getProviderForEntry,
  getProviderHealthStatus,
  getUsedProviders,
  type RoutingDetailSection,
} from "./routingModels";
import type { RoutingController } from "./useRoutingController";

const SECTION_ICONS: Record<RoutingDetailSection, typeof Route> = {
  sequence: GitBranch,
  providers: Route,
  models: Database,
  sources: ArrowUpRight,
};

export function RouteChainDetail({
  controller,
}: {
  controller: RoutingController;
}) {
  const tk = useTk();
  const chain = controller.selected;
  if (!chain) {
    return (
      <section className="hidden min-h-72 items-center justify-center border border-border text-sm text-muted-foreground lg:flex">
        {tk("routing.selectPrompt")}
      </section>
    );
  }
  return (
    <section
      className={cn(
        "min-w-0 border border-border bg-card/30",
        controller.mobileView === "registry" ? "hidden lg:block" : "block",
      )}
    >
      <div className="border-b border-border p-4 sm:p-5">
        <button
          className="mb-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-muted-foreground lg:hidden"
          onClick={() => controller.setMobileView("registry")}
          type="button"
        >
          <ArrowLeft className="h-4 w-4" />
          {tk("routing.back")}
        </button>
        <div className="flex min-w-0 flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex h-10 w-10 items-center justify-center border border-primary/30 bg-primary/10 text-primary">
                <Route className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h2 className="break-words text-xl font-semibold text-foreground">
                  {chain.name}
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {scopeLabel(chain.scope, tk)} · {chain.taskMode || tk("routing.anyMode")}
                </p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <ChainStatusBadge active={chain.isActive} />
              <span className="text-xs text-muted-foreground">
                {tk("routing.entries", { count: chain.entries.length })}
              </span>
              <span className="text-xs text-muted-foreground">
                {tk("routing.enabledEntries", {
                  count: getEnabledEntries(chain).length,
                })}
              </span>
              <span className="text-xs text-muted-foreground">
                {tk("routing.updated", { date: formatDate(chain.updatedAt) })}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              className="min-h-11"
              disabled={controller.saving}
              onClick={() => void controller.toggleSelectedActive()}
              variant="outline"
            >
              <Power className="h-4 w-4" />
              {chain.isActive ? tk("routing.disable") : tk("routing.enable")}
            </Button>
            <Button className="min-h-11" onClick={controller.openEdit} variant="outline">
              <Edit2 className="h-4 w-4" />
              {tk("routing.edit")}
            </Button>
            <Button
              className="min-h-11"
              disabled={controller.saving}
              onClick={() => void controller.duplicateSelected()}
              variant="outline"
            >
              <Copy className="h-4 w-4" />
              {tk("routing.duplicate")}
            </Button>
            <Button
              className="min-h-11"
              onClick={() => controller.setDeleteTarget(chain)}
              variant="destructive"
            >
              <Trash2 className="h-4 w-4" />
              {tk("routing.delete")}
            </Button>
          </div>
        </div>
      </div>

      <nav
        aria-label={tk("routing.sections.aria")}
        className="grid grid-cols-2 gap-px border-b border-border bg-border md:grid-cols-4"
      >
        {DETAIL_SECTIONS.map((section) => {
          const Icon = SECTION_ICONS[section];
          return (
            <button
              aria-pressed={controller.detailSection === section}
              className={cn(
                "inline-flex min-h-12 min-w-0 items-center justify-center gap-2 bg-card px-2 text-sm font-semibold transition-colors",
                controller.detailSection === section
                  ? "bg-primary/12 text-primary"
                  : "text-muted-foreground hover:bg-muted/45 hover:text-foreground",
              )}
              key={section}
              onClick={() => controller.setDetailSection(section)}
              type="button"
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="break-words">{tk(`routing.section.${section}`)}</span>
            </button>
          );
        })}
      </nav>

      {controller.detailSection === "sequence" ? (
        <Sequence chain={chain} controller={controller} />
      ) : controller.detailSection === "providers" ? (
        <ProviderEvidence chain={chain} controller={controller} />
      ) : controller.detailSection === "models" ? (
        <ModelEvidence chain={chain} controller={controller} />
      ) : (
        <Sources />
      )}
    </section>
  );
}

function Sequence({
  chain,
  controller,
}: {
  chain: RouteChainDto;
  controller: RoutingController;
}) {
  const tk = useTk();
  return (
    <div className="p-4 sm:p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold">{tk("routing.sequenceTitle")}</h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {tk("routing.sequenceDescription")}
        </p>
      </div>
      {chain.entries.length === 0 ? (
        <div className="border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {tk("routing.noEntries")}
        </div>
      ) : (
        <ol className="space-y-3">
          {chain.entries.map((entry, index) => {
            const provider = getProviderForEntry(entry, controller.providers);
            const status = getProviderHealthStatus(provider);
            return (
              <li
                className={cn(
                  "grid min-w-0 gap-3 border border-border bg-background/40 p-3 sm:grid-cols-[auto_minmax(0,1fr)_auto]",
                  !entry.isEnabled && "opacity-55",
                )}
                key={entry.id}
              >
                <span className="flex h-9 w-9 items-center justify-center border border-primary/25 bg-primary/8 text-sm font-semibold text-primary tabular-nums">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <HealthDot status={status} />
                    <span className="break-words text-sm font-semibold">
                      {provider?.name ?? getProviderDisplayName(entry.providerId)}
                    </span>
                    {!entry.isEnabled ? (
                      <span className="text-xs text-muted-foreground">
                        {tk("routing.disabledStep")}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 break-all font-mono text-xs text-muted-foreground">
                    {getModelDisplayName(entry.model)}
                  </div>
                  {entry.notes ? (
                    <div className="mt-2 border-l-2 border-border pl-2 text-xs leading-5 text-muted-foreground">
                      {entry.notes}
                    </div>
                  ) : null}
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs sm:min-w-44">
                  <Fact label={tk("routing.health")} value={<HealthLabel status={status} />} />
                  <Fact label={tk("routing.costTier")} value={provider?.costTier ?? "—"} />
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function ProviderEvidence({
  chain,
  controller,
}: {
  chain: RouteChainDto;
  controller: RoutingController;
}) {
  const tk = useTk();
  const providers = getUsedProviders(chain, controller.providers);
  return (
    <div className="grid min-w-0 gap-px bg-border md:grid-cols-2">
      {providers.map((provider) => (
        <div className="min-w-0 bg-card/55 p-4 sm:p-5" key={provider.id}>
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="break-words text-sm font-semibold">
                {provider.name}
              </h3>
              <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                {provider.id}
              </p>
            </div>
            <HealthLabel status={provider.healthStatus} />
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-4">
            <Fact label={tk("routing.defaultModel")} value={getModelDisplayName(provider.defaultModel)} />
            <Fact label={tk("routing.costTier")} value={provider.costTier} />
            <Fact label={tk("routing.health")} value={provider.healthStatus} />
            <Fact label={tk("routing.credentials")} value={<CredentialBadge configured={provider.hasCredentials} />} />
          </dl>
        </div>
      ))}
    </div>
  );
}

function ModelEvidence({
  chain,
  controller,
}: {
  chain: RouteChainDto;
  controller: RoutingController;
}) {
  const tk = useTk();
  const models = matchingModels(chain, controller);
  if (models.length === 0) {
    return (
      <div className="p-4 sm:p-5">
        <div className="border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {tk("routing.noModels")}
        </div>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto p-4 sm:p-5">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th className="pb-2 pr-4 font-medium">{tk("routing.field.provider")}</th>
            <th className="pb-2 pr-4 font-medium">{tk("routing.field.model")}</th>
            <th className="pb-2 pr-4 text-right font-medium">{tk("routing.context")}</th>
            <th className="pb-2 pr-4 text-right font-medium">{tk("routing.inputPrice")}</th>
            <th className="pb-2 pr-4 text-right font-medium">{tk("routing.outputPrice")}</th>
            <th className="pb-2 text-center font-medium">{tk("routing.available")}</th>
          </tr>
        </thead>
        <tbody>
          {models.map((model) => (
            <tr
              className="border-b border-border/40 last:border-0"
              key={`${model.providerType}:${model.modelId}`}
            >
              <td className="py-2 pr-4 text-xs text-muted-foreground">
                {getProviderDisplayName(model.providerType)}
              </td>
              <td className="py-2 pr-4">
                <div className="break-all font-mono text-xs">{model.modelId}</div>
                {model.modelName && model.modelName !== model.modelId ? (
                  <div className="text-[11px] text-muted-foreground">{model.modelName}</div>
                ) : null}
              </td>
              <td className="py-2 pr-4 text-right tabular-nums text-xs text-muted-foreground">
                {model.contextWindow ? `${Math.round(model.contextWindow / 1000)}K` : "—"}
              </td>
              <td className="py-2 pr-4 text-right font-mono text-xs">
                {model.inputPricePerMillion == null ? "—" : `$${model.inputPricePerMillion}`}
              </td>
              <td className="py-2 pr-4 text-right font-mono text-xs">
                {model.outputPricePerMillion == null ? "—" : `$${model.outputPricePerMillion}`}
              </td>
              <td className="py-2 text-center text-xs">
                {model.isAvailable ? tk("routing.yes") : tk("routing.no")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Sources() {
  const tk = useTk();
  const sources = [
    {
      title: tk("routing.source.routing.title"),
      desc: tk("routing.source.routing.desc"),
      action: tk("routing.currentPage"),
      to: null,
    },
    {
      title: tk("routing.source.providers.title"),
      desc: tk("routing.source.providers.desc"),
      action: tk("routing.openProviders"),
      to: "/providers",
    },
    {
      title: tk("routing.source.treasury.title"),
      desc: tk("routing.source.treasury.desc"),
      action: tk("routing.openTreasury"),
      to: "/treasury",
    },
    {
      title: tk("routing.source.usage.title"),
      desc: tk("routing.source.usage.desc"),
      action: tk("routing.traceWhenAvailable"),
      to: null,
    },
  ];
  return (
    <div className="grid min-w-0 gap-px bg-border md:grid-cols-2">
      {sources.map((source) => {
        const content = (
          <>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-primary/25 text-primary">
              <ArrowUpRight className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block break-words text-sm font-semibold">{source.title}</span>
              <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                {source.desc}
              </span>
              <span className="mt-2 block text-xs font-semibold text-primary">
                {source.action}
              </span>
            </span>
          </>
        );
        return source.to ? (
          <Link
            className="flex min-h-28 min-w-0 gap-3 bg-card/55 p-4 transition-colors hover:text-primary sm:p-5"
            key={source.title}
            to={source.to}
          >
            {content}
          </Link>
        ) : (
          <div className="flex min-h-28 min-w-0 gap-3 bg-card/55 p-4 sm:p-5" key={source.title}>
            {content}
          </div>
        );
      })}
    </div>
  );
}

function Fact({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-sm text-foreground">{value}</dd>
    </div>
  );
}

function matchingModels(
  chain: RouteChainDto,
  controller: RoutingController,
): ProviderModelSnapshotDto[] {
  const pairs = new Set(
    chain.entries.map((entry) => {
      const provider = getProviderForEntry(entry, controller.providers);
      return `${provider?.type ?? entry.providerId}:${entry.model}`;
    }),
  );
  return controller.models.filter((model) =>
    pairs.has(`${model.providerType}:${model.modelId}`),
  );
}

function scopeLabel(scope: string, tk: (key: string) => string) {
  if (scope === "GLOBAL") return tk("routing.scope.GLOBAL");
  if (scope === "TASK_MODE") return tk("routing.scope.TASK_MODE");
  if (scope === "AGENT") return tk("routing.scope.AGENT");
  return tk("routing.scope.CUSTOM");
}
