import {
  ArrowLeft,
  ArrowUpRight,
  Banknote,
  CircleDollarSign,
  Cpu,
  Edit2,
  Gauge,
  KeyRound,
  Network,
  Power,
  Route,
  ShieldCheck,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useTk } from "@/lib/i18n";
import {
  getModelDisplayName,
  getProviderDisplayName,
  getProviderModeBadge,
} from "@/lib/providerDisplay";
import { cn, formatDate } from "@/lib/utils";
import { ProviderHealthBadge, ProviderReadinessBadge } from "./ProviderBadges";
import {
  credentialState,
  formatMoney,
  formatPercent,
  getProviderReadiness,
  isProviderPricingKnown,
  type ProviderDetailSection,
} from "./providerModels";
import type { ProvidersController } from "./useProvidersController";

const SECTIONS: Array<{ id: ProviderDetailSection; icon: typeof Cpu }> = [
  { id: "overview", icon: Gauge },
  { id: "models", icon: Cpu },
  { id: "sources", icon: Network },
];

export function ProviderDetail({
  controller,
}: {
  controller: ProvidersController;
}) {
  const tk = useTk();
  const provider = controller.selected;
  if (!provider) {
    return (
      <section className="hidden min-h-72 items-center justify-center border border-border text-sm text-muted-foreground lg:flex">
        {tk("providers.selectPrompt")}
      </section>
    );
  }
  const readiness = getProviderReadiness(provider, controller.health);
  const health = controller.providerHealth;
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
          {tk("providers.back")}
        </button>
        <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex h-10 w-10 items-center justify-center border border-primary/30 bg-primary/10 text-primary">
                <Cpu className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h2 className="break-words text-xl font-semibold text-foreground">
                  {getProviderDisplayName(provider)}
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {getProviderModeBadge(provider)} · {provider.type}
                </p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <ProviderReadinessBadge readiness={readiness} />
              <ProviderHealthBadge status={health?.healthStatus} />
              <span className="text-xs text-muted-foreground">
                {tk("providers.updated", { date: formatDate(provider.updatedAt) })}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              aria-label={
                provider.isActive
                  ? tk("providers.deactivate", {
                      name: getProviderDisplayName(provider),
                    })
                  : tk("providers.activate", {
                      name: getProviderDisplayName(provider),
                    })
              }
              className="min-h-11"
              disabled={controller.saving}
              onClick={() => void controller.toggleActive()}
              variant={provider.isActive ? "outline" : "primary"}
            >
              <Power className="h-4 w-4" />
              {provider.isActive
                ? tk("providers.active")
                : tk("providers.inactive")}
            </Button>
            <Button
              aria-label={tk("providers.edit", {
                name: getProviderDisplayName(provider),
              })}
              className="min-h-11"
              onClick={controller.openEdit}
              variant="outline"
            >
              <Edit2 className="h-4 w-4" />
              {tk("providers.editAction")}
            </Button>
          </div>
        </div>
      </div>

      <nav
        aria-label={tk("providers.sections.aria")}
        className="grid grid-cols-3 gap-px border-b border-border bg-border"
      >
        {SECTIONS.map(({ id, icon: Icon }) => (
          <button
            aria-pressed={controller.detailSection === id}
            className={cn(
              "inline-flex min-h-12 min-w-0 items-center justify-center gap-2 bg-card px-2 text-sm font-semibold transition-colors",
              controller.detailSection === id
                ? "bg-primary/12 text-primary"
                : "text-muted-foreground hover:bg-muted/45 hover:text-foreground",
            )}
            key={id}
            onClick={() => controller.setDetailSection(id)}
            type="button"
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="break-words">{tk(`providers.section.${id}`)}</span>
          </button>
        ))}
      </nav>

      {controller.detailSection === "overview" ? (
        <Overview controller={controller} />
      ) : controller.detailSection === "models" ? (
        <Models controller={controller} />
      ) : (
        <Sources />
      )}
    </section>
  );
}

function Overview({ controller }: { controller: ProvidersController }) {
  const tk = useTk();
  const provider = controller.selected!;
  const health = controller.providerHealth;
  const account = controller.providerAccount;
  const credential = credentialState(provider);
  const capabilities = [
    provider.supportsChat && "chat",
    provider.supportsTools && "tools",
    provider.supportsVision && "vision",
    provider.supportsJsonMode && "json",
  ].filter(Boolean) as string[];
  const sourceLinks = getSourceLinks(tk);
  return (
    <div className="grid min-w-0 gap-px bg-border md:grid-cols-2">
      <div className="min-w-0 bg-card/55 p-4 sm:p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck className="h-4 w-4 text-primary" />
          {tk("providers.configuration")}
        </h3>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-4">
          <Fact label={tk("providers.providerType")} value={provider.type} />
          <Fact label={tk("providers.priority")} value={String(provider.priority)} />
          <Fact label={tk("providers.costTier")} value={provider.costTier} />
          <Fact
            label={tk("providers.credentials")}
            value={tk(`providers.credentials.${credential}`)}
          />
          <Fact
            className="col-span-2"
            label={tk("providers.defaultModel")}
            value={getModelDisplayName(provider.defaultModel)}
          />
        </dl>
        <div className="mt-4 border-t border-border pt-4">
          <div className="text-xs font-semibold text-muted-foreground">
            {tk("providers.capabilities")}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {capabilities.map((item) => (
              <span
                className="inline-flex min-h-7 items-center border border-primary/25 bg-primary/8 px-2 text-xs text-primary"
                key={item}
              >
                {tk(`providers.capability.${item}`)}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="min-w-0 bg-card/55 p-4 sm:p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Gauge className="h-4 w-4 text-primary" />
          {tk("providers.telemetry")}
        </h3>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-4">
          <Fact
            label={tk("providers.failureRate")}
            value={formatPercent(health?.failureRate)}
          />
          <Fact
            label={tk("providers.responseTime")}
            value={
              health?.avgDurationMs == null
                ? "—"
                : `${Math.round(health.avgDurationMs)} ms`
            }
          />
          <Fact
            label={tk("providers.balance")}
            value={formatMoney(account?.creditsRemaining)}
          />
          <Fact
            label={tk("providers.spend")}
            value={formatMoney(account?.creditsUsed)}
          />
        </dl>
        <p className="mt-4 text-xs leading-5 text-muted-foreground">
          <KeyRound className="mr-1 inline h-3.5 w-3.5" />
          {tk("providers.secretSafety")}
        </p>
      </div>

      <div className="grid min-w-0 gap-px bg-border md:col-span-2 xl:grid-cols-2">
        {sourceLinks.map(({ to, aria, title, description, icon: Icon }) => (
          <Link
            aria-label={aria}
            className="flex min-h-20 min-w-0 items-center gap-3 bg-card/55 p-4 transition-colors hover:text-primary sm:p-5"
            key={to}
            to={to}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-primary/25 text-primary">
              <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-foreground">
                {title}
              </span>
              <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                {description}
              </span>
            </span>
            <ArrowUpRight className="h-4 w-4 shrink-0" />
          </Link>
        ))}
      </div>
    </div>
  );
}

function Models({ controller }: { controller: ProvidersController }) {
  const tk = useTk();
  const provider = controller.selected!;
  const pricingKnown = isProviderPricingKnown(provider, controller.pricing);
  return (
    <div className="min-w-0 p-4 sm:p-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Fact
          label={tk("providers.validation")}
          value={tk(
            `providers.validation.${provider.modelValidationStatus ?? "NOT_CHECKED"}`,
          )}
        />
        <Fact
          label={tk("providers.pricingCoverage")}
          value={
            pricingKnown
              ? tk("providers.pricingKnown")
              : tk("providers.pricingMissing")
          }
        />
        <Fact
          label={tk("providers.lastValidated")}
          value={
            provider.lastValidationTime
              ? formatDate(provider.lastValidationTime)
              : tk("providers.never")
          }
        />
      </div>
      <div className="mt-5 border-t border-border pt-4">
        <h3 className="text-sm font-semibold">
          {tk("providers.modelCatalog", { count: controller.models.length })}
        </h3>
        {controller.models.length ? (
          <div className="mt-2 max-h-80 divide-y divide-border overflow-y-auto border-y border-border">
            {controller.models.slice(0, 50).map((model) => (
              <div
                className="grid min-w-0 gap-1 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                key={model.id}
              >
                <span className="min-w-0 break-words font-mono text-xs text-foreground">
                  {model.modelId}
                </span>
                <span className="text-xs text-muted-foreground">
                  {model.inputPricePerMillion == null
                    ? tk("providers.priceUnknown")
                    : tk("providers.modelPrice", {
                        input: model.inputPricePerMillion,
                        output: model.outputPricePerMillion ?? 0,
                      })}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            {tk("providers.noModels")}
          </p>
        )}
      </div>
    </div>
  );
}

function Sources() {
  const tk = useTk();
  const sources = getSourceLinks(tk);
  return (
    <div className="divide-y divide-border p-4 sm:p-5">
      {sources.map(({ to, aria, title, description, icon: Icon }) => (
        <Link
          aria-label={aria}
          className="flex min-h-20 min-w-0 items-center gap-3 py-3 transition-colors hover:text-primary"
          key={to}
          to={to}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-primary/25 text-primary">
            <Icon className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-foreground">
              {title}
            </span>
            <span className="mt-1 block text-xs leading-5 text-muted-foreground">
              {description}
            </span>
          </span>
          <ArrowUpRight className="h-4 w-4 shrink-0" />
        </Link>
      ))}
      <div className="flex min-h-20 items-start gap-3 py-4 text-xs leading-5 text-muted-foreground">
        <Banknote className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        {tk("providers.ownershipNote")}
      </div>
    </div>
  );
}

function getSourceLinks(tk: ReturnType<typeof useTk>) {
  return [
    {
      to: "/routing",
      aria: tk("providers.openRouting"),
      title: tk("providers.routingSource"),
      description: tk("providers.routingSourceDescription"),
      icon: Route,
    },
    {
      to: "/treasury",
      aria: tk("providers.openTelemetry"),
      title: tk("providers.treasurySource"),
      description: tk("providers.treasurySourceDescription"),
      icon: CircleDollarSign,
    },
  ];
}

function Fact({
  className,
  label,
  value,
}: {
  className?: string;
  label: string;
  value: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-[11px] font-semibold text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-sm font-medium text-foreground">
        {value}
      </dd>
    </div>
  );
}
